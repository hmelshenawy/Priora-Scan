import { ConflictException, NotFoundException } from '@nestjs/common';
import { ObdScanService } from '../../../src/obd/services/obd-scan.service';
import { ScanJobRepository } from '../../../src/obd/repositories/scan-job.repository';
import { DesktopAgentRepository } from '../../../src/obd/repositories/desktop-agent.repository';
import { VinResolutionService } from '../../../src/obd/services/vin-resolution.service';
import { FaultCodeImportService } from '../../../src/obd/services/fault-code-import.service';
import { VehicleDecodeService } from '../../../src/vehicles/services/vehicle-decode.service';
import { VehicleDecodeRepository } from '../../../src/vehicles/repositories/vehicle-decode.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ScanJobStatus } from '../../../src/obd/types/scan-job-status.enum';
import { AgentStatus } from '../../../src/obd/types/agent-status.enum';

describe('ObdScanService', () => {
  let service: ObdScanService;
  let prisma: jest.Mocked<PrismaService>;
  let scanJobRepository: jest.Mocked<ScanJobRepository>;
  let agentRepository: jest.Mocked<DesktopAgentRepository>;
  let vinResolutionService: jest.Mocked<VinResolutionService>;
  let faultCodeImportService: jest.Mocked<FaultCodeImportService>;
  let vehicleDecodeService: jest.Mocked<VehicleDecodeService>;
  let vehicleDecodeRepository: jest.Mocked<VehicleDecodeRepository>;

  beforeEach(() => {
    scanJobRepository = {
      findById: jest.fn(),
      findByOrganization: jest.fn(),
    } as any;

    agentRepository = {
      findById: jest.fn(),
    } as any;

    vinResolutionService = {
      resolve: jest.fn(),
      validateVin: jest.fn().mockReturnValue(true),
    } as any;

    faultCodeImportService = {
      importFaultCodes: jest.fn(),
    } as any;

    vehicleDecodeService = {
      decodeVin: jest.fn(),
    } as any;

    vehicleDecodeRepository = {
      findByVin: jest.fn().mockResolvedValue(null),
    } as any;

    prisma = {
      scanJob: {
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      } as any,
      vehicle: {
        create: jest.fn(),
        findFirst: jest.fn(),
      } as any,
      vehicleAuditRecord: {
        create: jest.fn(),
      } as any,
      scanJobAuditRecord: {
        create: jest.fn(),
      } as any,
      $transaction: jest.fn((cb: any) => cb(prisma)),
    } as any;

    service = new ObdScanService(
      prisma,
      scanJobRepository,
      agentRepository,
      vinResolutionService,
      faultCodeImportService,
      vehicleDecodeService,
      vehicleDecodeRepository,
    );
  });

  describe('createScan', () => {
    it('should block scan when agent is OFFLINE', async () => {
      (agentRepository.findById as jest.Mock).mockResolvedValue({
        id: 'agent-1',
        status: AgentStatus.OFFLINE,
      });

      await expect(
        service.createScan({ vehicleId: undefined }, 'org-1', 'user-1', 'agent-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should create a PENDING ScanJob and audit record when agent is ONLINE', async () => {
      (agentRepository.findById as jest.Mock).mockResolvedValue({
        id: 'agent-1',
        status: AgentStatus.ONLINE,
      });
      (prisma.scanJob.create as jest.Mock).mockResolvedValue({
        id: 'scan-1',
        status: ScanJobStatus.PENDING,
      });

      const result = await service.createScan({}, 'org-1', 'user-1', 'agent-1');

      expect(result.id).toBe('scan-1');
      expect(prisma.scanJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            userId: 'user-1',
            agentId: 'agent-1',
            status: ScanJobStatus.PENDING,
          }),
        }),
      );
      expect(prisma.scanJobAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SCAN_STARTED',
            status: ScanJobStatus.PENDING,
          }),
        }),
      );
    });
  });

  describe('processVinRead', () => {
    it('decodes the OBD VIN before asking for vehicle confirmation', async () => {
      (scanJobRepository.findById as jest.Mock).mockResolvedValue({
        id: 'scan-1',
        status: ScanJobStatus.RUNNING,
        organizationId: 'org-1',
        userId: 'user-1',
      });
      vinResolutionService.resolve.mockResolvedValue(null);

      const result = await service.processVinRead('scan-1', 'org-1', 'WDD2130041A123456');

      expect(vehicleDecodeService.decodeVin).toHaveBeenCalledWith(
        'WDD2130041A123456',
        'org-1',
        'user-1',
      );
      expect(prisma.scanJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'scan-1', organizationId: 'org-1' },
          data: {
            vin: 'WDD2130041A123456',
            status: ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION,
          },
        }),
      );
      expect(result.status).toBe(ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION);
    });

    it('keeps the scan workflow moving when automatic VIN decode fails', async () => {
      (scanJobRepository.findById as jest.Mock).mockResolvedValue({
        id: 'scan-1',
        status: ScanJobStatus.RUNNING,
        organizationId: 'org-1',
        userId: 'user-1',
      });
      vinResolutionService.resolve.mockResolvedValue(null);
      vehicleDecodeService.decodeVin.mockRejectedValue(new Error('asset unavailable'));

      await expect(service.processVinRead('scan-1', 'org-1', 'WDD2130041A123456')).resolves.toEqual(
        { status: ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION },
      );

      expect(prisma.scanJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            vin: 'WDD2130041A123456',
            status: ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION,
          },
        }),
      );
    });
  });

  describe('completeScan', () => {
    it('should import fault codes, transition to COMPLETED, and write audit', async () => {
      (scanJobRepository.findById as jest.Mock).mockResolvedValue({
        id: 'scan-1',
        status: ScanJobStatus.RUNNING,
        diagnosticSessionId: 'session-1',
        organizationId: 'org-1',
        userId: 'user-1',
      });

      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => {
        await cb(prisma);
      });

      const faultCodes = [{ code: 'P0301', status: 'ACTIVE', ecu: 'Engine' }];

      await service.completeScan('scan-1', 'org-1', 'user-1', faultCodes as any);

      expect(faultCodeImportService.importFaultCodes).toHaveBeenCalledWith(
        'scan-1',
        'session-1',
        'org-1',
        'user-1',
        faultCodes,
        expect.anything(),
      );
      expect(prisma.scanJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'scan-1', organizationId: 'org-1' },
          data: expect.objectContaining({
            status: ScanJobStatus.COMPLETED,
            completedAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.scanJobAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SCAN_COMPLETED',
            status: ScanJobStatus.COMPLETED,
          }),
        }),
      );
    });

    it('should throw if scan is not RUNNING', async () => {
      (scanJobRepository.findById as jest.Mock).mockResolvedValue({
        id: 'scan-1',
        status: ScanJobStatus.COMPLETED,
        diagnosticSessionId: 'session-1',
      });

      await expect(service.completeScan('scan-1', 'org-1', 'user-1', [])).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('confirmVehicle', () => {
    it('allows confirming with an existing vehicle instead of creating a duplicate', async () => {
      (scanJobRepository.findById as jest.Mock).mockResolvedValue({
        id: 'scan-1',
        status: ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION,
        organizationId: 'org-1',
        userId: 'user-1',
        vin: null,
      });
      (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({
        id: 'vehicle-1',
        organizationId: 'org-1',
      });
      (prisma.scanJob.update as jest.Mock).mockResolvedValue({
        id: 'scan-1',
        status: ScanJobStatus.RUNNING,
        vehicleId: 'vehicle-1',
        diagnosticSessionId: null,
        vin: null,
        adapterType: null,
        adapterProtocol: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
      });

      await service.confirmVehicle(
        'scan-1',
        { vehicleId: 'vehicle-1' },
        'org-1',
        'user-1',
      );

      expect(prisma.vehicle.create).not.toHaveBeenCalled();
      expect(prisma.scanJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            vehicleId: 'vehicle-1',
            status: ScanJobStatus.RUNNING,
          },
        }),
      );
      expect(prisma.scanJobAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'VEHICLE_CONFIRMED',
            metadata: {
              vehicleId: 'vehicle-1',
              source: 'existing_vehicle',
            },
          }),
        }),
      );
    });

    it('allows confirming a vehicle when VIN is unavailable', async () => {
      (scanJobRepository.findById as jest.Mock).mockResolvedValue({
        id: 'scan-1',
        status: ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION,
        organizationId: 'org-1',
        userId: 'user-1',
        vin: null,
      });
      (prisma.vehicle.create as jest.Mock).mockResolvedValue({
        id: 'vehicle-1',
        make: 'Toyota',
        model: 'Camry',
        year: 2012,
        vin: null,
        plateNumber: null,
        engine: null,
        bodyStyle: null,
      });
      (prisma.scanJob.update as jest.Mock).mockResolvedValue({
        id: 'scan-1',
        status: ScanJobStatus.RUNNING,
        vehicleId: 'vehicle-1',
        diagnosticSessionId: null,
        vin: null,
        adapterType: null,
        adapterProtocol: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
      });

      await service.confirmVehicle(
        'scan-1',
        { make: 'Toyota', model: 'Camry', year: 2012 },
        'org-1',
        'user-1',
      );

      expect(prisma.vehicle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            make: 'Toyota',
            model: 'Camry',
            year: 2012,
            vin: null,
          }),
        }),
      );
      expect(prisma.scanJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            vehicleId: 'vehicle-1',
            status: ScanJobStatus.RUNNING,
          },
        }),
      );
    });
  });

  describe('cross-tenant access', () => {
    it('should not find scan jobs from another tenant', async () => {
      (scanJobRepository.findById as jest.Mock).mockImplementation((id: string, orgId: string) => {
        if (orgId === 'org-1') {
          return { id, status: ScanJobStatus.PENDING, organizationId: 'org-1' };
        }
        return null;
      });

      const result = await service.cancelScan('scan-1', 'org-1', 'user-1');
      expect(result).toBeDefined();

      await expect(service.cancelScan('scan-1', 'org-2', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
