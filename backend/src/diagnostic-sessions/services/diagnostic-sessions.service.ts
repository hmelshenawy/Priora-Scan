import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DiagnosticSessionRepository } from '../repositories/diagnostic-session.repository';
import { DiagnosticSessionAuditRepository } from '../repositories/diagnostic-session-audit.repository';
import { CreateDiagnosticSessionDto } from '../dtos/create-diagnostic-session.dto';
import { UpdateDiagnosticSessionDto } from '../dtos/update-diagnostic-session.dto';
import { DiagnosticSessionResponseDto } from '../dtos/diagnostic-session-response.dto';
import { AuditTrailResponseDto } from '../dtos/audit-trail-response.dto';
import { DiagnosticSessionStatus } from '../types/diagnostic-session-status.enum';

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
  ): Promise<DiagnosticSessionResponseDto> {
    await this.ensureVehicleExists(organizationId, vehicleId);

    const number = this.buildSessionNumber();
    const session = await this.prisma.$transaction(async (tx) => {
      const createdSession = await this.diagnosticSessionRepository.create(
        organizationId,
        vehicleId,
        number,
        userId,
        payload,
        tx,
      );

      await this.diagnosticSessionAuditRepository.createAuditRecord(
        {
          userId,
          organizationId,
          sessionId: createdSession.id,
          action: 'SESSION_CREATED',
          status: createdSession.status,
          metadata: {
            title: payload.title ?? null,
            description: payload.description ?? null,
          },
        },
        tx,
      );

      return createdSession;
    });

    return DiagnosticSessionResponseDto.fromEntity(session);
  }

  async listForVehicle(
    organizationId: string,
    vehicleId: string,
    page = 1,
    limit = 25,
  ): Promise<DiagnosticSessionResponseDto[]> {
    const sessions = await this.diagnosticSessionRepository.listForVehicle(
      organizationId,
      vehicleId,
      page,
      limit,
    );

    return sessions.map(DiagnosticSessionResponseDto.fromEntity);
  }

  async getById(
    organizationId: string,
    sessionId: string,
  ): Promise<DiagnosticSessionResponseDto> {
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

    return DiagnosticSessionResponseDto.fromEntity(session);
  }

  async update(
    organizationId: string,
    sessionId: string,
    userId: string,
    payload: UpdateDiagnosticSessionDto,
  ): Promise<DiagnosticSessionResponseDto> {
    const existing = await this.diagnosticSessionRepository.getById(
      organizationId,
      sessionId,
    );

    if (!existing) {
      throw new NotFoundException({
        code: 'DIAGNOSTIC_SESSION_NOT_FOUND',
        message:
          'The requested diagnostic session does not exist or you do not have access to it.',
      });
    }

    if (existing.status === DiagnosticSessionStatus.CLOSED) {
      throw new ConflictException({
        code: 'DIAGNOSTIC_SESSION_CLOSED',
        message: 'Closed diagnostic sessions cannot be modified.',
      });
    }

    if (
      payload.status !== undefined &&
      payload.status !== existing.status
    ) {
      this.validateStatusTransition(
        existing.status as DiagnosticSessionStatus,
        payload.status,
      );
    }

    const updatedSession = await this.prisma.$transaction(async (tx) => {
      const sessionUpdate = await this.diagnosticSessionRepository.update(
        organizationId,
        sessionId,
        payload,
        tx,
      );

      if (!sessionUpdate) {
        return null;
      }

      if (
        payload.status !== undefined &&
        payload.status !== existing.status
      ) {
        await this.diagnosticSessionAuditRepository.createAuditRecord(
          {
            userId,
            organizationId,
            sessionId,
            action: 'SESSION_STATUS_UPDATED',
            status: payload.status,
            metadata: {
              previousStatus: existing.status,
              nextStatus: payload.status,
            },
          },
          tx,
        );
      }

      return sessionUpdate;
    });

    if (!updatedSession) {
      throw new NotFoundException({
        code: 'DIAGNOSTIC_SESSION_NOT_FOUND',
        message:
          'The requested diagnostic session does not exist or you do not have access to it.',
      });
    }

    return DiagnosticSessionResponseDto.fromEntity(updatedSession);
  }

  /**
   * Return the audit trail for a diagnostic session.
   * Tenant-scoped — only returns records belonging to the organization.
   */
  async getAuditTrail(
    organizationId: string,
    sessionId: string,
  ): Promise<AuditTrailResponseDto> {
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

    const records = await this.diagnosticSessionAuditRepository.findBySession(
      sessionId,
      organizationId,
    );

    return AuditTrailResponseDto.fromEntries(sessionId, records);
  }

  private validateStatusTransition(
    currentStatus: DiagnosticSessionStatus,
    nextStatus: DiagnosticSessionStatus,
  ) {
    if (currentStatus === nextStatus) {
      return;
    }

    const allowedTransitions: Record<DiagnosticSessionStatus, DiagnosticSessionStatus[]> = {
      [DiagnosticSessionStatus.OPEN]: [DiagnosticSessionStatus.IN_PROGRESS],
      [DiagnosticSessionStatus.IN_PROGRESS]: [DiagnosticSessionStatus.CLOSED],
      [DiagnosticSessionStatus.CLOSED]: [],
    };

    if (!allowedTransitions[currentStatus].includes(nextStatus)) {
      throw new ConflictException({
        code: 'INVALID_DIAGNOSTIC_SESSION_STATUS_TRANSITION',
        message: `Cannot change session status from ${currentStatus} to ${nextStatus}.`,
      });
    }
  }

  private async ensureVehicleExists(
    organizationId: string,
    vehicleId: string,
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
    });

    if (!vehicle) {
      throw new NotFoundException({
        code: 'VEHICLE_NOT_FOUND',
        message: 'The requested vehicle does not exist or you do not have access to it.',
      });
    }
  }

  private buildSessionNumber(): string {
    const prefix = 'DS';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}-${suffix}`;
  }
}
