import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VehicleDataRepository } from '../repositories/vehicle-data.repository';
import { LiveDataCommandRepository } from '../../live-data/repositories/live-data-command.repository';
import { VehicleDataResponseDto, VehicleDataReadResponseDto } from '../dtos/vehicle-data-response.dto';

function normalizeRawDiscoveryResponse(rawResponse: unknown): string {
  if (typeof rawResponse !== 'string') return '';

  const raw = rawResponse.trim();
  const compact = raw.toUpperCase().replace(/\s/g, '');
  if (compact.length < 6 || compact.length % 2 !== 0) return raw;

  let decoded = '';
  for (let i = 0; i < compact.length; i += 2) {
    const byte = Number.parseInt(compact.slice(i, i + 2), 16);
    if (Number.isNaN(byte) || byte < 32 || byte > 126) return raw;
    decoded += String.fromCharCode(byte);
  }

  const decodedCompact = decoded.trim().toUpperCase().replace(/\s/g, '');
  if (!/^[0-9A-F]+$/.test(decodedCompact)) return raw;

  return decodedCompact.startsWith('7E') || decodedCompact.startsWith('7DF') || decodedCompact.startsWith('7F')
    ? decodedCompact
    : raw;
}

function extractHeaderPayload(rawResponse: unknown): { header: string | null; payload: string | null; raw: string } {
  const normalizedRaw = normalizeRawDiscoveryResponse(rawResponse);
  const compact = normalizedRaw.toUpperCase().replace(/\s/g, '');

  if (!compact || compact === 'NO DATA' || compact.length < 5 || !/^[0-9A-F]+$/.test(compact)) {
    return { header: null, payload: null, raw: normalizedRaw };
  }

  return {
    header: compact.slice(0, 3),
    payload: compact.slice(3),
    raw: compact,
  };
}

/**
 * VehicleDataService — Feature 009 Phase A.
 *
 * Orchestrates one-shot vehicle health data reads for a Diagnostic Session:
 *   - `queueRead` — validates session/adapter state, writes audit record,
 *     enqueues a READ_VEHICLE_DATA command for the Desktop Agent.
 *   - `processVehicleDataRead` — receives the agent's VEHICLE_DATA_READ event
 *     payload and persists it to vehicleDataJson on the Diagnostic Session.
 *   - `getVehicleData` — returns the last-read vehicle data for a session.
 */
@Injectable()
export class VehicleDataService {
  private readonly logger = new Logger(VehicleDataService.name);

  /** In-memory tracking of sessions with a pending read command.
   *  Key: sessionId, Value: timestamp when the read was queued.
   *  Cleared when the agent responds or on service restart. */
  private readonly pendingReads = new Map<string, Date>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: VehicleDataRepository,
    private readonly commandRepo: LiveDataCommandRepository,
  ) {}

  /**
   * Queue a READ_VEHICLE_DATA command for the Desktop Agent.
   *
   * Validations:
   *   - Session exists and belongs to tenant
   *   - Session is not CLOSED
   *   - An online Desktop Agent exists for the organization
   *   - No read already in progress for this session
   *
   * On success, creates a LiveDataCommand row (type READ_VEHICLE_DATA)
   * with the diagnosticSessionId in the payload JSONB, and writes a
   * VEHICLE_DATA_READ_REQUESTED audit record.
   */
  async queueRead(
    sessionId: string,
    organizationId: string,
    userId: string,
  ): Promise<VehicleDataReadResponseDto> {
    // 1. Verify session exists and belongs to tenant
    const session = await this.repo.findSessionById(sessionId, organizationId);
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'The diagnostic session does not exist or you do not have access to it.',
      });
    }

    // 2. Verify session is not closed
    if (session.status === 'CLOSED') {
      throw new ConflictException({
        code: 'SESSION_CLOSED',
        message: 'Cannot read vehicle data for a closed session.',
      });
    }

    // 3. Verify an online agent exists for the organization
    const agent = await this.repo.findOnlineAgentForOrganization(organizationId);
    if (!agent) {
      throw new ConflictException({
        code: 'NO_ADAPTER_CONNECTED',
        message: 'No adapter is connected. Please connect an adapter before reading vehicle data.',
      });
    }

    // 4. Prevent concurrent reads
    if (this.pendingReads.has(sessionId)) {
      throw new ConflictException({
        code: 'READ_IN_PROGRESS',
        message: 'A vehicle data read is already in progress for this session.',
      });
    }

    // 5. Enqueue command + write audit record in a transaction
    await this.prisma.$transaction(async (tx) => {
      await this.commandRepo.enqueue(
        {
          organizationId,
          agentId: agent.id,
          liveDataSessionId: null,
          commandType: 'READ_VEHICLE_DATA',
          payload: {
            diagnosticSessionId: sessionId,
          },
        },
        tx,
      );

      await tx.diagnosticSessionAuditRecord.create({
        data: {
          organizationId,
          userId,
          sessionId,
          action: 'VEHICLE_DATA_READ_REQUESTED',
          metadata: { sessionId },
        },
      });
    });

    // 6. Mark read as pending
    this.pendingReads.set(sessionId, new Date());

    this.logger.log(
      `Vehicle data read queued for session ${sessionId} (agent ${agent.id})`,
    );

    return VehicleDataReadResponseDto.queued(sessionId);
  }

  /**
   * Process the agent's VEHICLE_DATA_READ event payload.
   * Persists the vehicle data JSONB to the Diagnostic Session,
   * writes a VEHICLE_DATA_READ_COMPLETED audit record, and clears
   * the pending-read flag.
   *
   * Called by AgentWebhookController when it receives a
   * VEHICLE_DATA_READ event from the agent.
   */
  async processVehicleDataRead(
    sessionId: string,
    organizationId: string,
    vehicleData: Record<string, unknown>,
  ): Promise<void> {
    const normalizedVehicleData = this.normalizeVehicleData(vehicleData);

    // Persist vehicle data
    await this.repo.saveVehicleData(sessionId, organizationId, normalizedVehicleData as any);

    // Write audit record
    const session = await this.repo.findSessionById(sessionId, organizationId);
    await this.prisma.diagnosticSessionAuditRecord.create({
      data: {
        organizationId,
        userId: session?.createdBy ?? 'system',
        sessionId,
        action: 'VEHICLE_DATA_READ_COMPLETED',
        metadata: { sessionId },
      },
    });

    // Clear pending flag
    this.pendingReads.delete(sessionId);

    this.logger.log(
      `Vehicle data read completed for session ${sessionId}`,
    );
  }

  /**
   * Process a failed vehicle data read reported by the agent.
   * Clears the pending-read flag so the user can retry.
   */
  async processVehicleDataReadFailure(
    sessionId: string,
    organizationId: string,
    reason = 'Unknown failure',
  ): Promise<void> {
    const session = await this.repo.findSessionById(sessionId, organizationId);
    await this.prisma.diagnosticSessionAuditRecord.create({
      data: {
        organizationId,
        userId: session?.createdBy ?? 'system',
        sessionId,
        action: 'VEHICLE_DATA_READ_FAILED',
        metadata: { sessionId, reason },
      },
    });

    this.pendingReads.delete(sessionId);

    this.logger.warn(
      `Vehicle data read failed for session ${sessionId}: ${reason}`,
    );
  }

  /**
   * Return the last-read vehicle data for a session.
   */
  async getVehicleData(
    sessionId: string,
    organizationId: string,
  ): Promise<VehicleDataResponseDto> {
    const session = await this.repo.getVehicleData(sessionId, organizationId);
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'The diagnostic session does not exist or you do not have access to it.',
      });
    }

    return VehicleDataResponseDto.fromSession({
      ...session,
      vehicleDataJson: this.normalizeVehicleData(session.vehicleDataJson),
    });
  }

  /**
   * Check whether a read is currently pending for a session.
   * Used internally and for status queries.
   */
  isReadPending(sessionId: string): boolean {
    return this.pendingReads.has(sessionId);
  }

  /**
   * Clear the pending flag for a session (e.g. on timeout or failure).
   */
  clearPendingRead(sessionId: string): void {
    this.pendingReads.delete(sessionId);
  }

  /**
   * Process a CONTROL_UNIT_DISCOVERY_READ event from the agent.
   *
   * Replaces the current session's existing `controlUnitDiscovery` snapshot
   * with the latest discovery result. Preserves all other `vehicleDataJson`
   * fields unchanged. Does NOT append discovery history or merge historical
   * results.
   *
   * Applies error isolation: if discovery data is malformed or processing
   * fails, logs the error but does NOT crash the session or webhook flow.
   * The existing vehicle data is left unchanged on error.
   */
  async processControlUnitDiscovery(
    sessionId: string,
    organizationId: string,
    discovery: Record<string, unknown>,
  ): Promise<void> {
    try {
      const session = await this.repo.findSessionById(sessionId, organizationId);
      if (!session) {
        this.logger.warn(
          `Control unit discovery: session ${sessionId} not found for org ${organizationId}`,
        );
        return;
      }

      // Merge discovery data into existing vehicle data (additive, no overwrite of other keys)
      const existingData = (session.vehicleDataJson as Record<string, unknown>) ?? {};
      const updatedData = {
        ...existingData,
        controlUnitDiscovery: this.normalizeControlUnitDiscovery(discovery),
      };

      await this.repo.saveVehicleData(sessionId, organizationId, updatedData as any);

      // Write audit record
      await this.prisma.diagnosticSessionAuditRecord.create({
        data: {
          organizationId,
          userId: session.createdBy ?? 'system',
          sessionId,
          action: 'CONTROL_UNIT_DISCOVERY_READ',
          metadata: { sessionId, respondersFound: (discovery as any)?.summary?.respondersFound ?? 0 },
        },
      });

      this.logger.log(
        `Control unit discovery processed for session ${sessionId}: ${(discovery as any)?.summary?.respondersFound ?? 0} responders found`,
      );
    } catch (error) {
      // Error isolation: log but do not crash the session or webhook flow
      this.logger.error(
        `Failed to process control unit discovery for session ${sessionId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private normalizeVehicleData(vehicleData: unknown): unknown {
    if (!vehicleData || typeof vehicleData !== 'object') {
      return vehicleData;
    }

    const data = vehicleData as Record<string, unknown>;
    if (!data.controlUnitDiscovery) {
      return data;
    }

    return {
      ...data,
      controlUnitDiscovery: this.normalizeControlUnitDiscovery(
        data.controlUnitDiscovery as Record<string, unknown>,
      ),
    };
  }

  private normalizeControlUnitDiscovery(discovery: Record<string, unknown>): Record<string, unknown> {
    if (!discovery || typeof discovery !== 'object') {
      return discovery;
    }

    const responseIdMap = new Map<string, string>();
    const probes = Array.isArray(discovery.probes)
      ? discovery.probes.map((probe) => {
          if (!probe || typeof probe !== 'object') return probe;

          const p = probe as Record<string, unknown>;
          const parsed = extractHeaderPayload(p.rawResponse);
          const normalizedResponseId = parsed.header ?? p.responseId ?? null;

          for (const oldId of [p.responseId, p.rawHeader]) {
            if (typeof oldId === 'string' && parsed.header && oldId !== parsed.header) {
              responseIdMap.set(oldId, parsed.header);
            }
          }

          return {
            ...p,
            responseId: normalizedResponseId,
            rawHeader: parsed.header ?? p.rawHeader ?? null,
            rawPayload: parsed.payload ?? p.rawPayload ?? null,
            rawResponse: parsed.raw,
          };
        })
      : discovery.probes;

    const responders = Array.isArray(discovery.responders)
      ? discovery.responders.map((responder) => {
          if (!responder || typeof responder !== 'object') return responder;

          const r = responder as Record<string, unknown>;
          const responseId = typeof r.responseId === 'string' ? r.responseId : null;
          return {
            ...r,
            responseId: responseId ? responseIdMap.get(responseId) ?? responseId : responseId,
          };
        })
      : discovery.responders;

    return {
      ...discovery,
      probes,
      responders,
    };
  }
}
