import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, DiagnosticSession } from '@prisma/client';

/**
 * VehicleDataRepository — Feature 009 Phase A.
 *
 * Tenant-scoped read/write of `vehicleDataJson` and `vehicleDataReadAt`
 * on the `DiagnosticSession` model. Follows the same repository pattern
 * as `LiveDataSessionRepository` (Feature 006).
 */
@Injectable()
export class VehicleDataRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * Read vehicle data JSON and timestamp for a session.
   * Returns null fields if no vehicle data has been read.
   */
  async getVehicleData(
    sessionId: string,
    organizationId: string,
  ): Promise<Pick<DiagnosticSession, 'id' | 'vehicleDataJson' | 'vehicleDataReadAt'> | null> {
    return this.prisma.diagnosticSession.findFirst({
      where: { id: sessionId, organizationId },
      select: {
        id: true,
        vehicleDataJson: true,
        vehicleDataReadAt: true,
      },
    });
  }

  /**
   * Write the vehicle data JSONB snapshot and read timestamp.
   * Called when the agent pushes a VEHICLE_DATA_READ event.
   */
  async saveVehicleData(
    sessionId: string,
    organizationId: string,
    vehicleDataJson: Prisma.InputJsonValue,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<DiagnosticSession | null> {
    const result = await tx.diagnosticSession.updateMany({
      where: { id: sessionId, organizationId },
      data: {
        vehicleDataJson,
        vehicleDataReadAt: new Date(),
      },
    });
    if (result.count === 0) {
      return null;
    }
    return tx.diagnosticSession.findFirst({
      where: { id: sessionId, organizationId },
    });
  }

  /**
   * Find a session by ID with tenant scoping. Used by the service
   * layer to validate session existence and status before queuing
   * a vehicle data read command.
   */
  async findSessionById(
    sessionId: string,
    organizationId: string,
  ): Promise<DiagnosticSession | null> {
    return this.prisma.diagnosticSession.findFirst({
      where: { id: sessionId, organizationId },
    });
  }

  /**
   * Find an active (online) DesktopAgent for the given organization.
   * Used to verify an adapter is connected before queuing a read command.
   */
  async findOnlineAgentForOrganization(
    organizationId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.desktopAgent.findFirst({
      where: { organizationId, status: 'ONLINE' },
      select: { id: true },
    });
  }
}