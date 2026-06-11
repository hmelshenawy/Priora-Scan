import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, LiveDataSession, LiveDataSessionStatus } from '@prisma/client';

/**
 * LiveDataSessionRepository — Feature 006 Phase B.2.
 *
 * Tenant-scoped CRUD over the `LiveDataSession` table. The
 * `organizationId` is denormalized on the row so that
 * tenant-isolation queries can filter on a single column instead of
 * joining through `DiagnosticSession`. (The relation is still present;
 * this is the same pattern as `ScanJob` and `SessionFaultCode`.)
 */
@Injectable()
export class LiveDataSessionRepository {
  constructor(private prisma: PrismaService) {}

  async create(
    data: Prisma.LiveDataSessionUncheckedCreateInput,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<LiveDataSession> {
    return tx.liveDataSession.create({ data });
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<LiveDataSession | null> {
    return this.prisma.liveDataSession.findFirst({
      where: { id, organizationId },
    });
  }

  async findActiveByDiagnosticSession(
    diagnosticSessionId: string,
    organizationId: string,
  ): Promise<LiveDataSession | null> {
    return this.prisma.liveDataSession.findFirst({
      where: {
        diagnosticSessionId,
        organizationId,
        status: LiveDataSessionStatus.ACTIVE,
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async listByDiagnosticSession(
    diagnosticSessionId: string,
    organizationId: string,
  ): Promise<LiveDataSession[]> {
    return this.prisma.liveDataSession.findMany({
      where: { diagnosticSessionId, organizationId },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Stop the most-recent ACTIVE session for a diagnostic session
   * (used at the start of a new session lifecycle). Returns the
   * count of sessions marked STOPPED.
   */
  async stopActiveForDiagnosticSession(
    diagnosticSessionId: string,
    organizationId: string,
  ): Promise<number> {
    const result = await this.prisma.liveDataSession.updateMany({
      where: {
        diagnosticSessionId,
        organizationId,
        status: LiveDataSessionStatus.ACTIVE,
      },
      data: {
        status: LiveDataSessionStatus.STOPPED,
        stoppedAt: new Date(),
      },
    });
    return result.count;
  }

  async stop(
    id: string,
    organizationId: string,
  ): Promise<LiveDataSession | null> {
    // Look up first to return the entity
    const existing = await this.findById(id, organizationId);
    if (!existing) {
      return null;
    }
    await this.prisma.liveDataSession.updateMany({
      where: { id, organizationId },
      data: {
        status: LiveDataSessionStatus.STOPPED,
        stoppedAt: new Date(),
      },
    });
    return this.findById(id, organizationId);
  }

  /**
   * Update the latest poll cycle — `lastActivityAt` + the decoded
   * `latestValues` JSONB. Used by the agent's poll-result endpoint.
   */
  async recordPollResult(
    id: string,
    organizationId: string,
    values: Prisma.InputJsonValue,
  ): Promise<LiveDataSession | null> {
    await this.prisma.liveDataSession.updateMany({
      where: { id, organizationId },
      data: {
        lastActivityAt: new Date(),
        latestValues: values,
      },
    });
    return this.findById(id, organizationId);
  }
}
