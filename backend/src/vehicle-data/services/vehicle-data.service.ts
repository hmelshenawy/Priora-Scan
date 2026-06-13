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
    // Persist vehicle data
    await this.repo.saveVehicleData(sessionId, organizationId, vehicleData as any);

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
    return VehicleDataResponseDto.fromSession(session);
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
}
