import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ScanJobStatus } from '../types/scan-job-status.enum';

@Injectable()
export class ScanJobRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.ScanJobCreateInput) {
    return this.prisma.scanJob.create({ data });
  }

  async findById(id: string, organizationId: string) {
    return this.prisma.scanJob.findFirst({
      where: { id, organizationId },
    });
  }

  async findByOrganization(
    organizationId: string,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.scanJob.findMany({
        where: { organizationId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.scanJob.count({ where: { organizationId } }),
    ]);
    return { data, total };
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: ScanJobStatus,
    extra?: { startedAt?: Date; completedAt?: Date; errorMessage?: string },
  ) {
    const data: Prisma.ScanJobUpdateInput = { status };
    if (extra?.startedAt !== undefined) {
      data.startedAt = extra.startedAt;
    }
    if (extra?.completedAt !== undefined) {
      data.completedAt = extra.completedAt;
    }
    if (extra?.errorMessage !== undefined) {
      data.errorMessage = extra.errorMessage;
    }
    return this.prisma.scanJob.updateMany({
      where: { id, organizationId },
      data,
    });
  }

  async listForAgent(agentId: string, organizationId: string) {
    return this.prisma.scanJob.findMany({
      where: { agentId, organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPendingForAgent(agentId: string, organizationId: string) {
    return this.prisma.scanJob.findFirst({
      where: {
        agentId,
        organizationId,
        status: ScanJobStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findConfirmedRunningForAgent(agentId: string, organizationId: string) {
    return this.prisma.scanJob.findFirst({
      where: {
        agentId,
        organizationId,
        status: ScanJobStatus.RUNNING,
        vehicleId: { not: null },
      },
      orderBy: { startedAt: 'asc' },
    });
  }
}
