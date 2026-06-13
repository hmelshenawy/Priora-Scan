import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, LiveDataCommand, LiveDataCommandType } from '@prisma/client';

export interface EnqueueLiveDataCommandInput {
  organizationId: string;
  agentId: string;
  liveDataSessionId?: string | null;
  commandType: LiveDataCommandType;
  payload?: Prisma.InputJsonValue | null;
}

/**
 * LiveDataCommandRepository — Feature 006 Phase B.2.
 *
 * FIFO queue of commands for the Desktop Agent's live-data poller.
 * The agent probes the queue and posts results; we mark commands as
 * consumed so a single command is delivered exactly once.
 */
@Injectable()
export class LiveDataCommandRepository {
  constructor(private prisma: PrismaService) {}

  async enqueue(
    data: EnqueueLiveDataCommandInput,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<LiveDataCommand> {
    const payloadJson =
      data.payload === undefined || data.payload === null
        ? null
        : JSON.stringify(data.payload);
    const rows = await tx.$queryRaw<LiveDataCommand[]>`
      INSERT INTO "LiveDataCommand"
        ("organizationId", "agentId", "liveDataSessionId", "commandType", "payload")
      VALUES
        (
          ${data.organizationId}::uuid,
          ${data.agentId}::uuid,
          ${data.liveDataSessionId ?? null}::uuid,
          ${data.commandType}::"LiveDataCommandType",
          ${payloadJson}::jsonb
        )
      RETURNING *
    `;
    return rows[0];
  }

  /**
   * Pop the next pending (unconsumed) command for an agent, FIFO.
   * Returns null if the queue is empty.
   */
  async findNextPendingForAgent(
    agentId: string,
    organizationId: string,
  ): Promise<LiveDataCommand | null> {
    return this.prisma.liveDataCommand.findFirst({
      where: {
        agentId,
        organizationId,
        consumedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markConsumed(id: string): Promise<void> {
    await this.prisma.liveDataCommand.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  }

  /**
   * Used by tests + cleanup: count pending commands for a session.
   */
  async countPendingForSession(liveDataSessionId: string): Promise<number> {
    return this.prisma.liveDataCommand.count({
      where: { liveDataSessionId, consumedAt: null },
    });
  }

  async findByTypeAndSession(
    liveDataSessionId: string,
    commandType: LiveDataCommandType,
  ): Promise<LiveDataCommand[]> {
    return this.prisma.liveDataCommand.findMany({
      where: { liveDataSessionId, commandType },
      orderBy: { createdAt: 'asc' },
    });
  }
}
