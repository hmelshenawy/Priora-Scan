import { AgentWebhookController } from '../../../src/obd/controllers/agent-webhook.controller';
import { ScanEventType } from '../../../src/obd/types/scan-event-type.enum';
import { ScanJobStatus } from '../../../src/obd/types/scan-job-status.enum';

describe('AgentWebhookController', () => {
  function createController() {
    const prisma = {
      scanJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'scan-1',
          agentId: 'agent-1',
          organizationId: 'org-1',
          userId: 'user-1',
          status: ScanJobStatus.RUNNING,
          vehicleId: null,
          diagnosticSessionId: null,
        }),
        updateMany: jest.fn(),
      },
      scanJobAuditRecord: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    const scanService = {
      processVinRead: jest.fn(),
      createSessionFromScan: jest.fn(),
      completeScan: jest.fn(),
    };

    const controller = new AgentWebhookController(
      prisma as any,
      {} as any,
      {} as any,
      scanService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { controller, prisma, scanService };
  }

  it('accepts unsupported VIN_READ events without validating the invalid VIN payload', async () => {
    const { controller, scanService } = createController();

    const result = await controller.scanEvents(
      'agent-1',
      {
        scanJobId: 'scan-1',
        event: ScanEventType.VIN_READ,
        payload: {
          vin: null,
          supported: false,
          vinStatus: 'UNSUPPORTED',
          reason: 'ALL_FF',
        },
      },
      { agent: { organizationId: 'org-1' } } as any,
    );

    expect(scanService.processVinRead).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'RUNNING',
      vin: null,
      supported: false,
      vinStatus: 'UNSUPPORTED',
      reason: 'ALL_FF',
    });
  });

  it('treats VIN_READ with null vin as unsupported for backward compatibility', async () => {
    const { controller, scanService } = createController();

    const result = await controller.scanEvents(
      'agent-1',
      {
        scanJobId: 'scan-1',
        event: ScanEventType.VIN_READ,
        payload: {
          vin: null,
        },
      },
      { agent: { organizationId: 'org-1' } } as any,
    );

    expect(scanService.processVinRead).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'RUNNING',
      vin: null,
      supported: false,
      vinStatus: 'UNSUPPORTED',
      reason: undefined,
    });
  });

  it('holds DTC_READ at vehicle confirmation when unsupported VIN left no session', async () => {
    const { controller, prisma, scanService } = createController();

    const result = await controller.scanEvents(
      'agent-1',
      {
        scanJobId: 'scan-1',
        event: ScanEventType.DTC_READ,
        payload: {
          codes: [{ code: 'P0301', status: 'ACTIVE', ecu: 'ECM' }],
        },
      },
      { agent: { organizationId: 'org-1' } } as any,
    );

    expect(scanService.completeScan).not.toHaveBeenCalled();
    expect(prisma.scanJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'scan-1', organizationId: 'org-1' },
      data: { status: ScanJobStatus.NEEDS_VEHICLE_CONFIRMATION },
    });
    expect(prisma.scanJobAuditRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DTC_READ_PENDING_VEHICLE',
          metadata: {
            faultCodes: [{ code: 'P0301', status: 'ACTIVE', ecu: 'ECM' }],
          },
        }),
      }),
    );
    expect(result).toEqual({
      status: 'NEEDS_VEHICLE_CONFIRMATION',
      reason: 'VEHICLE_REQUIRED',
    });
  });
});
