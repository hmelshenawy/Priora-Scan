import { ConflictException, NotFoundException } from '@nestjs/common';
import { DtcClearService } from '../../../src/dtc-clear/services/dtc-clear.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { LiveDataCommandRepository } from '../../../src/live-data/repositories/live-data-command.repository';
import { SessionFaultCodeRepository } from '../../../src/obd/repositories/session-fault-code.repository';
import { VehicleDataRepository } from '../../../src/vehicle-data/repositories/vehicle-data.repository';

describe('DtcClearService', () => {
  let service: DtcClearService;
  let prisma: jest.Mocked<PrismaService>;
  let commandRepo: jest.Mocked<LiveDataCommandRepository>;
  let faultCodeRepo: jest.Mocked<SessionFaultCodeRepository>;
  let vehicleDataRepo: jest.Mocked<VehicleDataRepository>;

  const sessionId = 'session-1';
  const organizationId = 'org-1';
  const userId = 'user-1';

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
    } as any;

    service = new DtcClearService(
      prisma,
      commandRepo,
      faultCodeRepo,
      vehicleDataRepo,
    );
  });

  describe('queueClear — audit record generation', () => {
    it('should write DTC_CLEAR_REQUESTED audit record with correct metadata', async () => {
      // Arrange: session exists, is open, has fault codes, has agent
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        status: 'IN_PROGRESS',
        organizationId,
      });
      (faultCodeRepo.findBySession as jest.Mock).mockResolvedValue([
        { code: 'P0301', status: 'ACTIVE' },
        { code: 'P0302', status: 'ACTIVE' },
      ]);
      (vehicleDataRepo.findOnlineAgentForOrganization as jest.Mock).mockResolvedValue({
        id: 'agent-1',
      });

      // Act
      const result = await service.queueClear(sessionId, organizationId, userId);

      // Assert: audit record was created
      expect(prisma.diagnosticSessionAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId,
            userId,
            sessionId,
            action: 'DTC_CLEAR_REQUESTED',
            metadata: expect.objectContaining({
              userId,
              previousFaultCodeCount: 2,
            }),
          }),
        }),
      );
      expect(result.status).toBe('CLEAR_PENDING');
      expect(result.previousFaultCodeCount).toBe(2);
    });

    it('should include previousFaultCodeCount in audit metadata', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        status: 'IN_PROGRESS',
        organizationId,
      });
      (faultCodeRepo.findBySession as jest.Mock).mockResolvedValue([
        { code: 'P0301', status: 'ACTIVE' },
        { code: 'P0420', status: 'PERMANENT' },
        { code: 'P0171', status: 'ACTIVE' },
      ]);
      (vehicleDataRepo.findOnlineAgentForOrganization as jest.Mock).mockResolvedValue({
        id: 'agent-1',
      });

      await service.queueClear(sessionId, organizationId, userId);

      const auditCall = (prisma.diagnosticSessionAuditRecord.create as jest.Mock).mock.calls[0][0];
      expect(auditCall.data.metadata.previousFaultCodeCount).toBe(3);
      expect(auditCall.data.metadata.userId).toBe(userId);
    });
  });

  describe('processClearResult — audit record generation', () => {
    beforeEach(() => {
      // processClearResult reads session to get userId and counts fault codes
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        createdBy: userId,
        organizationId,
      });
      // Fault code count before and after must match (invariant check)
      (faultCodeRepo.findBySession as jest.Mock).mockResolvedValue([
        { code: 'P0301', status: 'ACTIVE' },
      ]);
    });

    it('should write DTC_CLEAR_COMPLETED audit record on success', async () => {
      await service.processClearResult(sessionId, organizationId, true);

      expect(prisma.diagnosticSessionAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId,
            sessionId,
            action: 'DTC_CLEAR_COMPLETED',
            metadata: expect.objectContaining({ sessionId }),
          }),
        }),
      );
    });

    it('should write DTC_CLEAR_FAILED audit record with failure reason on failure', async () => {
      await service.processClearResult(
        sessionId,
        organizationId,
        false,
        'ECU rejected clear command (7F 04 31)',
      );

      expect(prisma.diagnosticSessionAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId,
            sessionId,
            action: 'DTC_CLEAR_FAILED',
            metadata: expect.objectContaining({
              sessionId,
              failureReason: 'ECU rejected clear command (7F 04 31)',
            }),
          }),
        }),
      );
    });

    it('should write DTC_CLEAR_FAILED with "Unknown failure" when no reason provided', async () => {
      await service.processClearResult(sessionId, organizationId, false);

      expect(prisma.diagnosticSessionAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'DTC_CLEAR_FAILED',
            metadata: expect.objectContaining({
              failureReason: 'Unknown failure',
            }),
          }),
        }),
      );
    });

    it('should use session createdBy as userId in audit record, or "system" fallback', async () => {
      // When session has createdBy
      await service.processClearResult(sessionId, organizationId, true);
      expect(prisma.diagnosticSessionAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId }),
        }),
      );

      // Reset
      (prisma.diagnosticSessionAuditRecord.create as jest.Mock).mockClear();

      // When session is null (edge case)
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue(null);
      await service.processClearResult(sessionId, organizationId, true);
      expect(prisma.diagnosticSessionAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'system' }),
        }),
      );
    });
  });

  describe('queueClear — validation', () => {
    it('should throw NotFoundException when session does not exist', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.queueClear(sessionId, organizationId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when session is CLOSED', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        status: 'CLOSED',
        organizationId,
      });

      await expect(
        service.queueClear(sessionId, organizationId, userId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when session has no fault codes', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        status: 'IN_PROGRESS',
        organizationId,
      });
      (faultCodeRepo.findBySession as jest.Mock).mockResolvedValue([]);

      await expect(
        service.queueClear(sessionId, organizationId, userId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when no adapter is connected', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        status: 'IN_PROGRESS',
        organizationId,
      });
      (faultCodeRepo.findBySession as jest.Mock).mockResolvedValue([
        { code: 'P0301', status: 'ACTIVE' },
      ]);
      (vehicleDataRepo.findOnlineAgentForOrganization as jest.Mock).mockResolvedValue(null);

      await expect(
        service.queueClear(sessionId, organizationId, userId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when a clear is already in progress', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        status: 'IN_PROGRESS',
        organizationId,
      });
      (faultCodeRepo.findBySession as jest.Mock).mockResolvedValue([
        { code: 'P0301', status: 'ACTIVE' },
      ]);
      (vehicleDataRepo.findOnlineAgentForOrganization as jest.Mock).mockResolvedValue({
        id: 'agent-1',
      });

      // First clear should succeed
      await service.queueClear(sessionId, organizationId, userId);

      // Second clear should fail (pending flag set)
      await expect(
        service.queueClear(sessionId, organizationId, userId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('processClearResult — fault code preservation', () => {
    it('should NOT delete any SessionFaultCode records on success', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        createdBy: userId,
        organizationId,
      });
      const faultCodes = [
        { code: 'P0301', status: 'ACTIVE' },
        { code: 'P0420', status: 'PERMANENT' },
      ];
      (faultCodeRepo.findBySession as jest.Mock).mockResolvedValue(faultCodes);

      // The service only calls faultCodeRepo.findBySession (read), never delete
      await service.processClearResult(sessionId, organizationId, true);

      // Verify only read operations on fault code repo
      expect(faultCodeRepo.findBySession).toHaveBeenCalledWith(sessionId, organizationId);
      // No delete method should exist or be called
      expect((faultCodeRepo as any).deleteMany).toBeUndefined();
      expect((faultCodeRepo as any).delete).toBeUndefined();
    });
  });

  describe('getClearStatus', () => {
    it('should return PENDING when clear is in progress', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        organizationId,
      });

      // Set pending flag by queuing a clear
      (faultCodeRepo.findBySession as jest.Mock).mockResolvedValue([
        { code: 'P0301', status: 'ACTIVE' },
      ]);
      (vehicleDataRepo.findOnlineAgentForOrganization as jest.Mock).mockResolvedValue({
        id: 'agent-1',
      });
      await service.queueClear(sessionId, organizationId, userId);

      // Now check status
      const status = await service.getClearStatus(sessionId, organizationId);
      expect(status.clearStatus).toBe('PENDING');
    });

    it('should return NONE when no clear has been attempted', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        organizationId,
      });
      (prisma.diagnosticSessionAuditRecord.findFirst as jest.Mock).mockResolvedValue(null);

      const status = await service.getClearStatus(sessionId, organizationId);
      expect(status.clearStatus).toBe('NONE');
    });

    it('should return SUCCESS when DTC_CLEAR_COMPLETED is the latest audit record', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        organizationId,
      });
      (prisma.diagnosticSessionAuditRecord.findFirst as jest.Mock).mockResolvedValue({
        action: 'DTC_CLEAR_COMPLETED',
        createdAt: new Date(),
      });

      const status = await service.getClearStatus(sessionId, organizationId);
      expect(status.clearStatus).toBe('SUCCESS');
    });

    it('should return FAILED when DTC_CLEAR_FAILED is the latest audit record', async () => {
      (vehicleDataRepo.findSessionById as jest.Mock).mockResolvedValue({
        id: sessionId,
        organizationId,
      });
      (prisma.diagnosticSessionAuditRecord.findFirst as jest.Mock).mockResolvedValue({
        action: 'DTC_CLEAR_FAILED',
        createdAt: new Date(),
      });

      const status = await service.getClearStatus(sessionId, organizationId);
      expect(status.clearStatus).toBe('FAILED');
    });
  });
});