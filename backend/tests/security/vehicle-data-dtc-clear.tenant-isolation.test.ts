import { DtcClearService } from '../../src/dtc-clear/services/dtc-clear.service';
import { VehicleDataService } from '../../src/vehicle-data/services/vehicle-data.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { LiveDataCommandRepository } from '../../src/live-data/repositories/live-data-command.repository';
import { SessionFaultCodeRepository } from '../../src/obd/repositories/session-fault-code.repository';
import { VehicleDataRepository } from '../../src/vehicle-data/repositories/vehicle-data.repository';
import { NotFoundException, ConflictException } from '@nestjs/common';

/**
 * Tenant isolation tests for Feature 009 — Vehicle Health & DTC Clear.
 *
 * Verifies that a user in tenant A cannot:
 *   - Read vehicle data from tenant B's session
 *   - Clear fault codes in tenant B's session
 *   - View clear status for tenant B's session
 *
 * And that audit records are always scoped to the correct tenant.
 */
describe('Vehicle Data & DTC Clear — Tenant Isolation', () => {
  let dtcClearService: DtcClearService;
  let vehicleDataService: VehicleDataService;
  let prisma: jest.Mocked<PrismaService>;
  let commandRepo: jest.Mocked<LiveDataCommandRepository>;
  let faultCodeRepo: jest.Mocked<SessionFaultCodeRepository>;
  let vehicleDataRepo: jest.Mocked<VehicleDataRepository>;

  const tenantA = 'org-tenant-a';
  const tenantB = 'org-tenant-b';
  const userA = 'user-tenant-a';
  const sessionIdA = 'session-tenant-a';
  const sessionIdB = 'session-tenant-b';

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
      diagnosticSessionAuditRecord: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
    } as any;

    commandRepo = {
      enqueue: jest.fn(),
    } as any;

    faultCodeRepo = {
      findBySession: jest.fn(),
    } as any;

    vehicleDataRepo = {
      findSessionById: jest.fn(),
      findOnlineAgentForOrganization: jest.fn(),
      getVehicleData: jest.fn(),
      saveVehicleData: jest.fn(),
    } as any;

    dtcClearService = new DtcClearService(
      prisma,
      commandRepo,
      faultCodeRepo,
      vehicleDataRepo,
    );

    vehicleDataService = new VehicleDataService(
      prisma,
      vehicleDataRepo,
      commandRepo,
    );
  });

  describe('DTC Clear — tenant scoping', () => {
    it('should reject DTC clear when session belongs to another tenant', async () => {
      // Session belongs to tenant A — looking it up with tenant B returns null
      (vehicleDataRepo.findSessionById as jest.Mock).mockImplementation(
        (sid: string, oid: string) => {
          if (sid === sessionIdA && oid === tenantA) {
            return { id: sessionIdA, status: 'IN_PROGRESS', organizationId: tenantA };
          }
          return null; // Cross-tenant lookup returns nothing
        },
      );

      // Tenant A can clear their own session
      (faultCodeRepo.findBySession as jest.Mock).mockImplementation(
        (sid: string, oid: string) => {
          if (oid === tenantA) return [{ code: 'P0301', status: 'ACTIVE' }];
          return [];
        },
      );
      (vehicleDataRepo.findOnlineAgentForOrganization as jest.Mock).mockResolvedValue({
        id: 'agent-1',
      });

      // Tenant A succeeds
      const result = await dtcClearService.queueClear(sessionIdA, tenantA, userA);
      expect(result.status).toBe('CLEAR_PENDING');

      // Tenant B cannot clear tenant A's session
      await expect(
        dtcClearService.queueClear(sessionIdA, tenantB, 'user-tenant-b'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should write audit records scoped to the correct tenant', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionIdA,
        status: 'IN_PROGRESS',
        organizationId: tenantA,
        createdBy: userA,
      });
      (faultCodeRepo.findBySession as jest.Mock).mockResolvedValue([
        { code: 'P0301', status: 'ACTIVE' },
      ]);
      (vehicleDataRepo.findOnlineAgentForOrganization as jest.Mock).mockResolvedValue({
        id: 'agent-1',
      });

      await dtcClearService.queueClear(sessionIdA, tenantA, userA);

      // Verify the audit record is scoped to tenant A
      expect(prisma.diagnosticSessionAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: tenantA,
            sessionId: sessionIdA,
            action: 'DTC_CLEAR_REQUESTED',
          }),
        }),
      );

      // Clear the mock to test processClearResult
      (prisma.diagnosticSessionAuditRecord.create as jest.Mock).mockClear();

      // Process clear result should also be tenant-scoped
      await dtcClearService.processClearResult(sessionIdA, tenantA, true);

      expect(prisma.diagnosticSessionAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: tenantA,
          }),
        }),
      );
    });

    it('should reject getClearStatus for cross-tenant session', async () => {
      // Session exists for tenant A only
      (vehicleDataRepo.findSessionById as jest.Mock).mockImplementation(
        (sid: string, oid: string) => {
          if (oid === tenantA) return { id: sessionIdA, organizationId: tenantA };
          return null;
        },
      );

      // Tenant A can check status
      const status = await dtcClearService.getClearStatus(sessionIdA, tenantA);
      expect(status).toBeDefined();

      // Tenant B cannot check status of tenant A's session
      await expect(
        dtcClearService.getClearStatus(sessionIdA, tenantB),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Vehicle Data — tenant scoping', () => {
    it('should reject vehicle data read for cross-tenant session', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockImplementation(
        (sid: string, oid: string) => {
          if (sid === sessionIdA && oid === tenantA) {
            return { id: sessionIdA, status: 'IN_PROGRESS', organizationId: tenantA };
          }
          return null;
        },
      );
      (vehicleDataRepo.findOnlineAgentForOrganization as jest.Mock).mockResolvedValue({
        id: 'agent-1',
      });

      // Tenant A can queue a read
      const result = await vehicleDataService.queueRead(sessionIdA, tenantA, userA);
      expect(result.status).toBe('READ_PENDING');

      // Tenant B cannot queue a read for tenant A's session
      await expect(
        vehicleDataService.queueRead(sessionIdA, tenantB, 'user-tenant-b'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject getVehicleData for cross-tenant session', async () => {
      (vehicleDataRepo.getVehicleData as jest.Mock).mockImplementation(
        (sid: string, oid: string) => {
          if (oid === tenantA) return { id: sessionIdA, vehicleDataJson: {}, vehicleDataReadAt: new Date() };
          return null;
        },
      );

      // Tenant B cannot read tenant A's vehicle data
      await expect(
        vehicleDataService.getVehicleData(sessionIdA, tenantB),
      ).rejects.toThrow(NotFoundException);
    });

    it('should write VEHICLE_DATA_READ_REQUESTED audit record scoped to correct tenant', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionIdA,
        status: 'IN_PROGRESS',
        organizationId: tenantA,
      });
      (vehicleDataRepo.findOnlineAgentForOrganization as jest.Mock).mockResolvedValue({
        id: 'agent-1',
      });

      await vehicleDataService.queueRead(sessionIdA, tenantA, userA);

      expect(prisma.diagnosticSessionAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: tenantA,
            sessionId: sessionIdA,
            action: 'VEHICLE_DATA_READ_REQUESTED',
          }),
        }),
      );
    });
  });
});