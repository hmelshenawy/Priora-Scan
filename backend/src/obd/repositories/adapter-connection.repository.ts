import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdapterConnectionRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.AdapterConnectionCreateInput) {
    return this.prisma.adapterConnection.create({ data });
  }

  async findByAgent(agentId: string, organizationId: string) {
    return this.prisma.adapterConnection.findMany({
      where: { agentId, organizationId },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: string,
    endedAt?: Date,
    errorMessage?: string,
  ) {
    const data: Prisma.AdapterConnectionUpdateInput = { status };
    if (endedAt !== undefined) {
      data.endedAt = endedAt;
    }
    if (errorMessage !== undefined) {
      data.errorMessage = errorMessage;
    }
    return this.prisma.adapterConnection.updateMany({
      where: { id, organizationId },
      data,
    });
  }
}
