import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class SessionFaultCodeRepository {
  constructor(private prisma: PrismaService) {}

  async bulkCreate(
    data: Prisma.SessionFaultCodeCreateManyInput[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.sessionFaultCode.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async findBySession(
    diagnosticSessionId: string,
    organizationId: string,
  ) {
    return this.prisma.sessionFaultCode.findMany({
      where: { diagnosticSessionId, organizationId },
      orderBy: { importedAt: 'desc' },
    });
  }

  async findByScanJob(scanJobId: string, organizationId: string) {
    return this.prisma.sessionFaultCode.findMany({
      where: { scanJobId, organizationId },
      orderBy: { importedAt: 'desc' },
    });
  }
}
