import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DiagnosticSessionAuditRecord, DiagnosticSessionStatus } from '@prisma/client';

@Injectable()
export class DiagnosticSessionAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createAuditRecord(data: {
    userId: string;
    organizationId: string;
    sessionId: string;
    action: string;
    status?: DiagnosticSessionStatus;
    metadata?: Record<string, unknown>;
  }): Promise<DiagnosticSessionAuditRecord> {
    return this.prisma.diagnosticSessionAuditRecord.create({
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
