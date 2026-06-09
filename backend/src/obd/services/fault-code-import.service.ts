import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionFaultCodeRepository } from '../repositories/session-fault-code.repository';
import { FaultCodeImportDto } from '../dtos/fault-code-import.dto';
import { ScanJobStatus } from '../types/scan-job-status.enum';
import { Prisma } from '@prisma/client';

@Injectable()
export class FaultCodeImportService {
  constructor(
    private prisma: PrismaService,
    private faultCodeRepository: SessionFaultCodeRepository,
  ) {}

  async importFaultCodes(
    scanJobId: string,
    diagnosticSessionId: string,
    organizationId: string,
    codes: FaultCodeImportDto[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    const data = codes.map((code) => ({
      organizationId,
      diagnosticSessionId,
      scanJobId,
      code: code.code.toUpperCase(),
      status: code.status,
      ecu: code.ecu ?? null,
      source: 'OBD_SCAN',
    }));

    await this.faultCodeRepository.bulkCreate(data, client);

    await client.scanJobAuditRecord.create({
      data: {
        organizationId,
        userId: '',
        scanJobId,
        action: 'FAULT_CODES_IMPORTED',
        status: ScanJobStatus.RUNNING,
        metadata: {
          count: codes.length,
        },
      },
    });
  }
}
