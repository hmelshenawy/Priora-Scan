import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AgentStatus } from '../types/agent-status.enum';

@Injectable()
export class DesktopAgentRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.DesktopAgentCreateInput) {
    return this.prisma.desktopAgent.create({ data });
  }

  async findById(id: string, organizationId: string) {
    return this.prisma.desktopAgent.findFirst({
      where: { id, organizationId },
    });
  }

  async findByOrganization(organizationId: string) {
    return this.prisma.desktopAgent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: AgentStatus,
    lastSeenAt?: Date,
  ) {
    const data: Prisma.DesktopAgentUpdateInput = { status };
    if (lastSeenAt !== undefined) {
      data.lastSeenAt = lastSeenAt;
    }
    return this.prisma.desktopAgent.updateMany({
      where: { id, organizationId },
      data,
    });
  }

  async delete(id: string, organizationId: string) {
    return this.prisma.desktopAgent.deleteMany({
      where: { id, organizationId },
    });
  }

  async findByAccessTokenHash(accessTokenHash: string) {
    return this.prisma.desktopAgent.findFirst({
      where: { accessTokenHash },
    });
  }

  async findOfflineAgents(thresholdMs: number) {
    const cutoff = new Date(Date.now() - thresholdMs);
    return this.prisma.desktopAgent.findMany({
      where: {
        status: { not: AgentStatus.OFFLINE },
        OR: [
          { lastSeenAt: { lt: cutoff } },
          { lastSeenAt: null },
        ],
      },
    });
  }
}
