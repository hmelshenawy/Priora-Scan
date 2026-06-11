import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, LiveDataCommand, LiveDataCommandType } from '@prisma/client';

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
    data: Prisma.LiveDataCommandUncheckedCreateInput,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<LiveDataCommand> {
    return tx.liveDataCommand.create({ data });
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
