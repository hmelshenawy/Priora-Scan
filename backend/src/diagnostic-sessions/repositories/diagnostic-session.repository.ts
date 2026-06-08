import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, DiagnosticSession } from '@prisma/client';
import { CreateDiagnosticSessionDto } from '../dtos/create-diagnostic-session.dto';
import { UpdateDiagnosticSessionDto } from '../dtos/update-diagnostic-session.dto';

@Injectable()
export class DiagnosticSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    vehicleId: string,
    number: string,
    createdBy: string,
    payload: CreateDiagnosticSessionDto,
  ): Promise<DiagnosticSession> {
    return this.prisma.diagnosticSession.create({
      data: {
        organizationId,
        vehicleId,
        number,
        status: 'OPEN',
        title: payload.title ?? null,
        description: payload.description ?? null,
        createdBy,
      },
    });
  }

  async listForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<DiagnosticSession[]> {
    return this.prisma.diagnosticSession.findMany({
      where: { organizationId, vehicleId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(
    organizationId: string,
    sessionId: string,
  ): Promise<DiagnosticSession | null> {
    return this.prisma.diagnosticSession.findFirst({
      where: { id: sessionId, organizationId },
    });
  }

  async update(
    organizationId: string,
    sessionId: string,
    payload: UpdateDiagnosticSessionDto,
  ): Promise<DiagnosticSession | null> {
    const existing = await this.getById(organizationId, sessionId);
    if (!existing) {
      return null;
    }

    const data: Prisma.DiagnosticSessionUpdateInput = {};

    if (payload.status !== undefined) {
      data.status = payload.status;
    }
    if (payload.title !== undefined) {
      data.title = payload.title;
    }
    if (payload.description !== undefined) {
      data.description = payload.description;
    }

    return this.prisma.diagnosticSession.update({
      where: { id: sessionId },
      data,
    });
  }
}
