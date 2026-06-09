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
    const now = new Date();
    await this.prisma.desktopAgent.updateMany({
      where: { id: agentId },
      data: {
        version: dto.version,
        status: AgentStatus.ONLINE,
        lastSeenAt: now,
      },
    });

    const agent = await this.prisma.desktopAgent.findFirst({
      where: { id: agentId },
      select: { organizationId: true },
    });

    if (!agent) {
      return;
    }

    const activeConnection = await this.prisma.adapterConnection.findFirst({
      where: {
        agentId,
        organizationId: agent.organizationId,
        status: { in: ['CONNECTED', 'READY'] },
        endedAt: null,
      },
      orderBy: { startedAt: 'desc' },
    });

    if (dto.adapterConnected) {
      const data = {
        adapterType: dto.adapterType ?? 'ELM327',
        connectionType: dto.adapterType === 'MOCK' ? 'MOCK' : 'USB',
        protocol: dto.protocol,
        status: 'CONNECTED',
        endedAt: null,
        errorMessage: null,
      };

      if (activeConnection) {
        await this.prisma.adapterConnection.update({
          where: { id: activeConnection.id },
          data,
        });
        return;
      }

      await this.prisma.adapterConnection.create({
        data: {
          organizationId: agent.organizationId,
          agentId,
          ...data,
        },
      });
      return;
    }

    if (activeConnection) {
      await this.prisma.adapterConnection.update({
        where: { id: activeConnection.id },
        data: {
          status: 'DISCONNECTED',
          endedAt: now,
        },
      });
    }
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
