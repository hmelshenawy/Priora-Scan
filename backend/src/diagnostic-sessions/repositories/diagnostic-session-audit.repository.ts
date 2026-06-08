import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DiagnosticSessionAuditRecord, DiagnosticSessionStatus, Prisma } from '@prisma/client';

@Injectable()
export class DiagnosticSessionAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createAuditRecord(
    data: {
      userId: string;
      organizationId: string;
      sessionId: string;
      action: string;
      status?: DiagnosticSessionStatus;
      metadata?: Prisma.InputJsonValue | null;
    },
    prisma: Prisma.TransactionClient = this.prisma,
  ): Promise<DiagnosticSessionAuditRecord> {
    return prisma.diagnosticSessionAuditRecord.create({
      data: {
        userId: data.userId,
        organizationId: data.organizationId,
        sessionId: data.sessionId,
        action: data.action,
        status: data.status,
        metadata: data.metadata,
      },
    });
  }
}
