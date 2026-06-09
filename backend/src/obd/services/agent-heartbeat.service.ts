import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DesktopAgentRepository } from '../repositories/desktop-agent.repository';
import { AgentHeartbeatDto } from '../dtos/agent-heartbeat.dto';
import { AgentStatus } from '../types/agent-status.enum';

@Injectable()
export class AgentHeartbeatService {
  private readonly OFFLINE_THRESHOLD_MS = 60 * 1000; // 60 seconds

  constructor(
    private prisma: PrismaService,
    private agentRepository: DesktopAgentRepository,
  ) {}

  async processHeartbeat(
    agentId: string,
    dto: AgentHeartbeatDto,
  ): Promise<void> {
    await this.prisma.desktopAgent.updateMany({
      where: { id: agentId },
      data: {
        version: dto.version,
        status: AgentStatus.ONLINE,
        lastSeenAt: new Date(),
      },
    });
  }

  @Interval(30000)
  async markOfflineAgents(): Promise<void> {
    const offlineAgents = await this.agentRepository.findOfflineAgents(
      this.OFFLINE_THRESHOLD_MS,
    );

    for (const agent of offlineAgents) {
      await this.agentRepository.updateStatus(
        agent.id,
        agent.organizationId,
        AgentStatus.OFFLINE,
      );
    }
  }
}
