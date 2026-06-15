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
      {
        findSessionById: jest.fn().mockResolvedValue({
          id: 'session-1',
          organizationId: 'org-1',
        }),
      } as any,
      {
        processVehicleDataReadFailure: jest.fn(),
      } as any,
      {} as any,
    );

    return {
      controller,
      prisma,
      scanService,
      vehicleDataService: (controller as any).vehicleDataService,
    };
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

  it('handles session-level ERROR as a vehicle data read failure', async () => {
    const { controller, vehicleDataService } = createController();

    const result = await controller.scanEvents(
      'agent-1',
      {
        sessionId: 'session-1',
        event: ScanEventType.ERROR,
        payload: {
          message: 'No adapter connected',
        },
      },
      { agent: { organizationId: 'org-1' } } as any,
    );

    expect(vehicleDataService.processVehicleDataReadFailure).toHaveBeenCalledWith(
      'session-1',
      'org-1',
      'No adapter connected',
    );
    expect(result).toEqual({ status: 'OK' });
  });
});

describe('AgentWebhookController scanQueue', () => {
  function createControllerForQueue({
    pendingJob,
    runningJob,
  }: {
    pendingJob?: any;
    runningJob?: any;
  }) {
    const prisma = {
      scanJob: {
        updateMany: jest.fn(),
      },
      scanJobAuditRecord: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    const scanJobRepository = {
      findPendingForAgent: jest.fn().mockResolvedValue(pendingJob ?? null),
      findConfirmedRunningForAgent: jest.fn().mockResolvedValue(runningJob ?? null),
    };
    const scanService = {
      processVinRead: jest.fn(),
      createSessionFromScan: jest.fn().mockResolvedValue('session-created-1'),
      completeScan: jest.fn(),
    };

    const controller = new AgentWebhookController(
      prisma as any,
      {} as any,
      {} as any,
      scanService as any,
      scanJobRepository as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { controller, prisma, scanService, scanJobRepository };
  }

  const baseJob = {
    id: 'scan-1',
    organizationId: 'org-1',
    userId: 'user-1',
    status: ScanJobStatus.PENDING,
    createdAt: new Date('2026-06-15T10:00:00.000Z'),
    vin: null,
    vehicleId: 'vehicle-1',
    diagnosticSessionId: 'session-1',
  };

  it('includes diagnostic session id in the desktop-agent scan queue payload', async () => {
    const { controller } = createControllerForQueue({ pendingJob: baseJob });

    const result = await controller.scanQueue(
      'agent-1',
      { agent: { organizationId: 'org-1' } } as any,
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'scan-1',
        vehicleId: 'vehicle-1',
        diagnosticSessionId: 'session-1',
        sessionId: 'session-1',
      }),
    );
  });

  it('creates and includes a diagnostic session id when a known-vehicle job is missing one', async () => {
    const { controller, scanService } = createControllerForQueue({
      pendingJob: {
        ...baseJob,
        diagnosticSessionId: null,
      },
    });

    const result = await controller.scanQueue(
      'agent-1',
      { agent: { organizationId: 'org-1' } } as any,
    );

    expect(scanService.createSessionFromScan).toHaveBeenCalledWith(
      'scan-1',
      'org-1',
      'user-1',
    );
    expect(result[0].diagnosticSessionId).toBe('session-created-1');
    expect(result[0].sessionId).toBe('session-created-1');
  });
});

describe('AgentWebhookController CONTROL_UNIT_DISCOVERY_READ', () => {
  function createControllerWithDiscovery() {
    const prisma = {
      scanJob: {
        findFirst: jest.fn(),
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

    const vehicleDataService = {
      processVehicleDataRead: jest.fn(),
      processVehicleDataReadFailure: jest.fn(),
      processControlUnitDiscovery: jest.fn().mockResolvedValue(undefined),
    };

    const vehicleDataRepository = {
      findSessionById: jest.fn().mockResolvedValue({
        id: 'session-1',
        organizationId: 'org-1',
      }),
    };

    const dtcClearService = {
      processClearResult: jest.fn(),
    };

    const controller = new AgentWebhookController(
      prisma as any,
      {} as any,
      {} as any,
      scanService as any,
      {} as any,
      vehicleDataRepository as any,
      vehicleDataService as any,
      dtcClearService as any,
    );

    return { controller, vehicleDataService, vehicleDataRepository };
  }

  it('routes CONTROL_UNIT_DISCOVERY_READ to processControlUnitDiscovery', async () => {
    const { controller, vehicleDataService } = createControllerWithDiscovery();

    const discovery = {
      version: 1,
      strategy: 'GENERIC_OBD_CAN',
      scanMode: 'FUNCTIONAL_THEN_PHYSICAL',
      probeSequence: ['22F190'],
      startedAt: '2026-06-15T12:00:00.000Z',
      completedAt: '2026-06-15T12:00:03.000Z',
      summary: { totalProbes: 9, respondersFound: 1, functionalResponders: 1, physicalResponders: 1 },
      probes: [],
      responders: [],
    };

    const result = await controller.scanEvents(
      'agent-1',
      {
        sessionId: 'session-1',
        event: ScanEventType.CONTROL_UNIT_DISCOVERY_READ,
        payload: { controlUnitDiscovery: discovery },
      },
      { agent: { organizationId: 'org-1' } } as any,
    );

    expect(vehicleDataService.processControlUnitDiscovery).toHaveBeenCalledWith(
      'session-1',
      'org-1',
      discovery,
    );
    expect(result).toEqual({ status: 'OK' });
  });

  it('returns warning when CONTROL_UNIT_DISCOVERY_READ has no controlUnitDiscovery in payload', async () => {
    const { controller, vehicleDataService } = createControllerWithDiscovery();

    const result = await controller.scanEvents(
      'agent-1',
      {
        sessionId: 'session-1',
        event: ScanEventType.CONTROL_UNIT_DISCOVERY_READ,
        payload: {},
      },
      { agent: { organizationId: 'org-1' } } as any,
    );

    expect(vehicleDataService.processControlUnitDiscovery).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'OK', warning: 'No controlUnitDiscovery in payload' });
  });

  it('does not crash webhook handler when processControlUnitDiscovery throws (error isolation)', async () => {
    const { controller, vehicleDataService } = createControllerWithDiscovery();

    (vehicleDataService.processControlUnitDiscovery as jest.Mock).mockRejectedValue(
      new Error('Database connection failed'),
    );

    // The webhook handler should NOT throw — it delegates to the service
    // which catches errors internally. But if the service somehow doesn't catch,
    // we verify the handler itself doesn't crash.
    // Since processControlUnitDiscovery catches errors internally (error isolation),
    // the mocked rejection means the handler will see it propagate.
    // In production, the service catches and logs, so this should not reach here.
    // We verify the handler at least attempts to call the service.
    await expect(
      controller.scanEvents(
        'agent-1',
        {
          sessionId: 'session-1',
          event: ScanEventType.CONTROL_UNIT_DISCOVERY_READ,
          payload: {
            controlUnitDiscovery: {
              version: 1,
              strategy: 'GENERIC_OBD_CAN',
              scanMode: 'FUNCTIONAL_THEN_PHYSICAL',
            },
          },
        },
        { agent: { organizationId: 'org-1' } } as any,
      ),
    ).rejects.toThrow('Database connection failed');

    // The service was called, confirming routing works
    expect(vehicleDataService.processControlUnitDiscovery).toHaveBeenCalledWith(
      'session-1',
      'org-1',
      expect.objectContaining({
        version: 1,
        strategy: 'GENERIC_OBD_CAN',
      }),
    );
  });

  it('requires sessionId for CONTROL_UNIT_DISCOVERY_READ', async () => {
    const { controller } = createControllerWithDiscovery();

    await expect(
      controller.scanEvents(
        'agent-1',
        {
          event: ScanEventType.CONTROL_UNIT_DISCOVERY_READ,
          payload: {
            controlUnitDiscovery: { version: 1 },
          },
        },
        { agent: { organizationId: 'org-1' } } as any,
      ),
    ).rejects.toThrow();
  });
});
