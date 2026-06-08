import { Injectable, NotFoundException } from '@nestjs/common';
import { DiagnosticSession } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DiagnosticSessionRepository } from '../repositories/diagnostic-session.repository';
import { DiagnosticSessionAuditRepository } from '../repositories/diagnostic-session-audit.repository';
import { CreateDiagnosticSessionDto } from '../dtos/create-diagnostic-session.dto';
import { UpdateDiagnosticSessionDto } from '../dtos/update-diagnostic-session.dto';

@Injectable()
export class DiagnosticSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diagnosticSessionRepository: DiagnosticSessionRepository,
    private readonly diagnosticSessionAuditRepository: DiagnosticSessionAuditRepository,
  ) {}

  async create(
    organizationId: string,
    vehicleId: string,
    userId: string,
    payload: CreateDiagnosticSessionDto,
  ): Promise<DiagnosticSession> {
    const number = this.buildSessionNumber();

    return this.diagnosticSessionRepository.create(
      organizationId,
      vehicleId,
      number,
      userId,
      payload,
    );
  }

  async listForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<DiagnosticSession[]> {
    return this.diagnosticSessionRepository.listForVehicle(
      organizationId,
      vehicleId,
    );
  }

  async getById(
    organizationId: string,
    sessionId: string,
  ): Promise<DiagnosticSession> {
    const session = await this.diagnosticSessionRepository.getById(
      organizationId,
      sessionId,
    );

    if (!session) {
      throw new NotFoundException({
        code: 'DIAGNOSTIC_SESSION_NOT_FOUND',
        message:
          'The requested diagnostic session does not exist or you do not have access to it.',
      });
    }

    return session;
  }

  async update(
    organizationId: string,
    sessionId: string,
    payload: UpdateDiagnosticSessionDto,
  ): Promise<DiagnosticSession> {
    const session = await this.diagnosticSessionRepository.update(
      organizationId,
      sessionId,
      payload,
    );

    if (!session) {
      throw new NotFoundException({
        code: 'DIAGNOSTIC_SESSION_NOT_FOUND',
        message:
          'The requested diagnostic session does not exist or you do not have access to it.',
      });
    }

    return session;
  }

  private buildSessionNumber(): string {
    return `DS-${Date.now()}`;
  }
}
