import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LiveDataCommandRepository } from '../../live-data/repositories/live-data-command.repository';
import { SessionFaultCodeRepository } from '../../obd/repositories/session-fault-code.repository';
import { VehicleDataRepository } from '../../vehicle-data/repositories/vehicle-data.repository';
import { DtcClearResponseDto, DtcClearStatusResponseDto } from '../dtos/dtc-clear-response.dto';

/**
 * DtcClearService — Feature 009 Phase B.
 *
 * Orchestrates safe DTC clearing for a Diagnostic Session:
 *   - `queueClear` — validates prerequisites, writes audit record,
 *     enqueues a CLEAR_DTC command for the Desktop Agent.
 *   - `processClearResult` — handles DTC_CLEARED / DTC_CLEAR_FAILED
 *     events from the agent, writes audit records, clears pending flag.
 *   - `getClearStatus` — returns the current clear status for a session
 *     based on the in-memory pending flag and audit records.
 *
 * IMPORTANT: This service does NOT delete any SessionFaultCode records.
 * Clearing DTCs only sends Mode 04 to the ECU. Previous fault codes
 * remain as historical evidence. A re-scan after clearing creates
 * new SessionFaultCode records via the existing import flow.
 */
@Injectable()
export class DtcClearService {
  private readonly logger = new Logger(DtcClearService.name);

  /** In-memory tracking of sessions with a pending clear command. */
  private readonly pendingClears = new Map<string, Date>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly commandRepo: LiveDataCommandRepository,
    private readonly faultCodeRepo: SessionFaultCodeRepository,
    private readonly vehicleDataRepo: VehicleDataRepository,
  ) {}

  /**
   * Queue a CLEAR_DTC command for the Desktop Agent.
   *
   * Validations:
   *   - Session exists and belongs to tenant
   *   - Session is not CLOSED
   *   - Session has at least one fault code
   *   - An online Desktop Agent exists for the organization
   *   - No clear already in progress for this session
   *
   * Returns DtcClearResponseDto with status CLEAR_PENDING.
   * If session contains only PERMANENT fault codes, includes a warning
   * but still queues the command (ECU may clear some based on conditions).
   */
  async queueClear(
    sessionId: string,
    organizationId: string,
    userId: string,
  ): Promise<DtcClearResponseDto> {
    // 1. Verify session exists and belongs to tenant
    const session = await this.vehicleDataRepo.findSessionById(sessionId, organizationId);
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
        message: 'Cannot clear fault codes for a closed session.',
      });
    }

    // 3. Verify session has fault codes
    const faultCodes = await this.faultCodeRepo.findBySession(sessionId, organizationId);
    if (faultCodes.length === 0) {
      throw new ConflictException({
        code: 'NO_FAULT_CODES',
        message: 'This session has no fault codes to clear.',
      });
    }

    // 4. Verify an online agent exists for the organization
    const agent = await this.vehicleDataRepo.findOnlineAgentForOrganization(organizationId);
    if (!agent) {
      throw new ConflictException({
        code: 'NO_ADAPTER_CONNECTED',
        message: 'No adapter is connected. Please connect an adapter before clearing fault codes.',
      });
    }

    // 5. Prevent concurrent clears
    if (this.pendingClears.has(sessionId)) {
      throw new ConflictException({
        code: 'CLEAR_IN_PROGRESS',
        message: 'A DTC clear command is already in progress for this session.',
      });
    }

    // 6. Check for permanent-only codes (warning, not block)
    const hasOnlyPermanent = faultCodes.every(
      (fc) => fc.status === 'PERMANENT',
    );
    const previousFaultCodeCount = faultCodes.length;

    // 7. Enqueue command + write audit record in a transaction
    await this.prisma.$transaction(async (tx) => {
      await this.commandRepo.enqueue(
        {
          organizationId,
          agentId: agent.id,
          liveDataSessionId: null,
          commandType: 'CLEAR_DTC',
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
          action: 'DTC_CLEAR_REQUESTED',
          metadata: { userId, previousFaultCodeCount },
        },
      });
    });

    // 8. Mark clear as pending
    this.pendingClears.set(sessionId, new Date());

    this.logger.log(
      `DTC clear queued for session ${sessionId} (${previousFaultCodeCount} codes, agent ${agent.id})`,
    );

    if (hasOnlyPermanent) {
      return DtcClearResponseDto.permanentWarning(sessionId, previousFaultCodeCount);
    }
    return DtcClearResponseDto.queued(sessionId, previousFaultCodeCount);
  }

  /**
   * Process a DTC_CLEARED or DTC_CLEAR_FAILED event from the agent.
   * Writes the appropriate audit record and clears the pending flag.
   *
   * IMPORTANT: Does NOT delete any SessionFaultCode records.
   * Clearing DTCs only sends Mode 04 to the ECU — previous fault codes
   * must remain as historical evidence. A re-scan after clearing creates
   * NEW SessionFaultCode records via the existing import flow, which
   * may show fewer or zero codes.
   *
   * INVARIANT: This method MUST NOT call faultCodeRepo.deleteMany(),
   * prisma.sessionFaultCode.deleteMany(), or any other deletion method
   * on SessionFaultCode records.
   */
  async processClearResult(
    sessionId: string,
    organizationId: string,
    success: boolean,
    failureReason?: string,
  ): Promise<void> {
    const session = await this.vehicleDataRepo.findSessionById(sessionId, organizationId);

    // Count fault codes before and after to verify the invariant that
    // this method does NOT delete any SessionFaultCode records.
    const faultCodesBefore = await this.faultCodeRepo.findBySession(sessionId, organizationId);

    if (success) {
      // Write DTC_CLEAR_COMPLETED audit record
      await this.prisma.diagnosticSessionAuditRecord.create({
        data: {
          organizationId,
          userId: session?.createdBy ?? 'system',
          sessionId,
          action: 'DTC_CLEAR_COMPLETED',
          metadata: { sessionId },
        },
      });

      this.logger.log(`DTC clear completed for session ${sessionId}`);
    } else {
      // Write DTC_CLEAR_FAILED audit record with failure reason
      await this.prisma.diagnosticSessionAuditRecord.create({
        data: {
          organizationId,
          userId: session?.createdBy ?? 'system',
          sessionId,
          action: 'DTC_CLEAR_FAILED',
          metadata: { sessionId, failureReason: failureReason ?? 'Unknown failure' },
        },
      });

      this.logger.warn(`DTC clear failed for session ${sessionId}: ${failureReason}`);
    }

    // Clear pending flag
    this.pendingClears.delete(sessionId);

    // Verify the invariant: no SessionFaultCode records were deleted
    // by this method. This is a development-time assertion — in production
    // the count stays the same since we never call any delete method.
    if (process.env.NODE_ENV !== 'production') {
      const faultCodesAfter = await this.faultCodeRepo.findBySession(sessionId, organizationId);
      if (faultCodesAfter.length !== faultCodesBefore.length) {
        this.logger.error(
          `INVARIANT VIOLATION: SessionFaultCode count changed from ${faultCodesBefore.length} to ${faultCodesAfter.length} during processClearResult for session ${sessionId}. ` +
          `This method must NEVER delete fault code records.`,
        );
      }
    }
  }

  /**
   * Return the current DTC clear status for a session.
   * Checks the in-memory pending flag and the most recent audit record.
   */
  async getClearStatus(
    sessionId: string,
    organizationId: string,
  ): Promise<DtcClearStatusResponseDto> {
    // Verify session exists
    const session = await this.vehicleDataRepo.findSessionById(sessionId, organizationId);
    if (!session) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'The diagnostic session does not exist or you do not have access to it.',
      });
    }

    // Check pending flag first
    if (this.pendingClears.has(sessionId)) {
      return DtcClearStatusResponseDto.fromData(sessionId, 'PENDING', null, null);
    }

    // Find the most recent DTC_CLEAR_REQUESTED/COMPLETED/FAILED audit record
    const lastAudit = await this.prisma.diagnosticSessionAuditRecord.findFirst({
      where: {
        sessionId,
        organizationId,
        action: { in: ['DTC_CLEAR_REQUESTED', 'DTC_CLEAR_COMPLETED', 'DTC_CLEAR_FAILED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastAudit) {
      return DtcClearStatusResponseDto.fromData(sessionId, 'NONE', null, null);
    }

    let clearStatus: 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED' = 'NONE';
    let lastClearAt: Date | null = null;
    let lastClearResult: 'SUCCESS' | 'FAILED' | null = null;

    if (lastAudit.action === 'DTC_CLEAR_COMPLETED') {
      clearStatus = 'SUCCESS';
      lastClearAt = lastAudit.createdAt;
      lastClearResult = 'SUCCESS';
    } else if (lastAudit.action === 'DTC_CLEAR_FAILED') {
      clearStatus = 'FAILED';
      lastClearAt = lastAudit.createdAt;
      lastClearResult = 'FAILED';
    } else if (lastAudit.action === 'DTC_CLEAR_REQUESTED') {
      // Request was written but no result yet — shouldn't happen since
      // pending flag is cleared above, but handle gracefully
      clearStatus = 'NONE';
    }

    return DtcClearStatusResponseDto.fromData(sessionId, clearStatus, lastClearAt, lastClearResult);
  }

  /**
   * Check whether a clear is currently pending for a session.
   */
  isClearPending(sessionId: string): boolean {
    return this.pendingClears.has(sessionId);
  }

  /**
   * Clear the pending flag (e.g. on timeout or service restart).
   */
  clearPendingClear(sessionId: string): void {
    this.pendingClears.delete(sessionId);
  }
}
