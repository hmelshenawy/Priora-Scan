import { VehicleDataService } from '../../../src/vehicle-data/services/vehicle-data.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { VehicleDataRepository } from '../../../src/vehicle-data/repositories/vehicle-data.repository';
import { LiveDataCommandRepository } from '../../../src/live-data/repositories/live-data-command.repository';

describe('VehicleDataService freeze frame visibility', () => {
  let service: VehicleDataService;
  let prisma: jest.Mocked<PrismaService>;
  let repo: jest.Mocked<VehicleDataRepository>;
  let commandRepo: jest.Mocked<LiveDataCommandRepository>;

  const sessionId = 'session-1';
  const organizationId = 'org-1';

  beforeEach(() => {
    prisma = {
      diagnosticSessionAuditRecord: {
        create: jest.fn(),
      },
    } as any;

    repo = {
      saveVehicleData: jest.fn(),
      findSessionById: jest.fn(),
      getVehicleData: jest.fn(),
    } as any;

    commandRepo = {} as any;

    service = new VehicleDataService(prisma, repo, commandRepo);
  });

  it('persists freezeFrame inside vehicleDataJson and returns it from getVehicleData', async () => {
    const vehicleData = {
      batteryVoltage: { value: 13.9, unit: 'V', supported: true },
      vin: { value: 'WDD2130041A123456', supported: true },
      readinessMonitors: { supported: true, value: {} },
      fuelSystemStatus: { value: 'Closed Loop', supported: true },
      calculatedEngineLoad: { value: 21, unit: '%', supported: true },
      fuelLevel: { value: 72, unit: '%', supported: true },
      mileage: { value: 12000, unit: 'km', supported: true },
      supportedPids: { '01': ['02', '0C'], '09': ['02'] },
      freezeFrame: {
        supported: true,
        available: true,
        value: {
          dtc: 'P0171',
          rpm: 2120,
          speed: 88,
          coolantTemperature: 91,
          engineLoad: 43,
          additionalPids: { '01': '02' },
          rawResponse: '490201',
        },
      },
    };

    (repo.findSessionById as jest.Mock).mockResolvedValue({
      id: sessionId,
      createdBy: 'user-1',
    });
    (repo.getVehicleData as jest.Mock).mockResolvedValue({
      id: sessionId,
      vehicleDataJson: vehicleData,
      vehicleDataReadAt: new Date('2026-06-15T10:00:00.000Z'),
    });

    await service.processVehicleDataRead(sessionId, organizationId, vehicleData);
    const result = await service.getVehicleData(sessionId, organizationId);

    expect(repo.saveVehicleData).toHaveBeenCalledWith(
      sessionId,
      organizationId,
      expect.objectContaining({
        freezeFrame: vehicleData.freezeFrame,
      }),
    );
    expect(result.vehicleData?.freezeFrame).toEqual(vehicleData.freezeFrame);
  });

  it('clears pending reads when a vehicle data read failure is processed', async () => {
    (repo.findSessionById as jest.Mock).mockResolvedValue({
      id: sessionId,
      createdBy: 'user-1',
    });

    (service as any).pendingReads.set(sessionId, new Date());

    await service.processVehicleDataReadFailure(sessionId, organizationId, 'No adapter connected');

    expect(service.isReadPending(sessionId)).toBe(false);
    expect(prisma.diagnosticSessionAuditRecord.create).toHaveBeenCalledWith({
      data: {
        organizationId,
        userId: 'user-1',
        sessionId,
        action: 'VEHICLE_DATA_READ_FAILED',
        metadata: { sessionId, reason: 'No adapter connected' },
      },
    });
  });
});

describe('VehicleDataService processControlUnitDiscovery', () => {
  let service: VehicleDataService;
  let prisma: jest.Mocked<PrismaService>;
  let repo: jest.Mocked<VehicleDataRepository>;
  let commandRepo: jest.Mocked<LiveDataCommandRepository>;

  const sessionId = 'session-discovery-1';
  const organizationId = 'org-1';

  function makeDiscovery(overrides: Record<string, unknown> = {}) {
    return {
      version: 1,
      strategy: 'GENERIC_OBD_CAN',
      scanMode: 'FUNCTIONAL_THEN_PHYSICAL',
      probeSequence: ['22F190'],
      startedAt: '2026-06-15T12:00:00.000Z',
      completedAt: '2026-06-15T12:00:03.000Z',
      summary: {
        totalProbes: 9,
        respondersFound: 1,
        functionalResponders: 1,
        physicalResponders: 1,
      },
      probes: [],
      responders: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      diagnosticSessionAuditRecord: {
        create: jest.fn(),
      },
    } as any;

    repo = {
      saveVehicleData: jest.fn().mockResolvedValue({ id: sessionId }),
      findSessionById: jest.fn().mockResolvedValue({
        id: sessionId,
        organizationId,
        createdBy: 'user-1',
        vehicleDataJson: {
          batteryVoltage: { value: 13.9, unit: 'V', supported: true },
          vin: { value: 'WDD2130041A123456', supported: true },
          readinessMonitors: { supported: true, value: {} },
          fuelSystemStatus: { value: 'Closed Loop', supported: true },
          calculatedEngineLoad: { value: 21, unit: '%', supported: true },
          fuelLevel: { value: 72, unit: '%', supported: true },
          mileage: { value: 12000, unit: 'km', supported: true },
          supportedPids: { '01': ['02', '0C'], '09': ['02'] },
        },
      }),
      getVehicleData: jest.fn(),
    } as any;

    commandRepo = {} as any;

    service = new VehicleDataService(prisma, repo, commandRepo);
  });

  it('persists controlUnitDiscovery in vehicleDataJson', async () => {
    const discovery = makeDiscovery();

    await service.processControlUnitDiscovery(sessionId, organizationId, discovery);

    expect(repo.saveVehicleData).toHaveBeenCalledWith(
      sessionId,
      organizationId,
      expect.objectContaining({
        controlUnitDiscovery: expect.objectContaining({
          version: 1,
          strategy: 'GENERIC_OBD_CAN',
          scanMode: 'FUNCTIONAL_THEN_PHYSICAL',
        }),
      }),
    );
  });

  it('normalizes double-encoded discovery data before persisting it', async () => {
    const discovery = makeDiscovery({
      probes: [
        {
          method: 'FUNCTIONAL',
          requestId: '7DF',
          probe: '22F190',
          responseId: '374',
          status: 'DISCOVERED',
          responseType: 'POSITIVE',
          negativeResponseCode: null,
          negativeResponseMeaning: null,
          rawHeader: '374',
          rawPayload: '53831343632463139303537',
          rawResponse: '374538313436324631393035373331344234313436333434373432333135323436333133323334333333323331',
          errorCode: null,
        },
        {
          method: 'PHYSICAL',
          requestId: '7E0',
          probe: '22F190',
          responseId: '374',
          status: 'DISCOVERED',
          responseType: 'POSITIVE',
          negativeResponseCode: null,
          negativeResponseMeaning: null,
          rawHeader: '374',
          rawPayload: '53831343632463139303537',
          rawResponse: '374538313436324631393035373331344234313436333434373432333135323436333133323334333333323331',
          errorCode: null,
        },
      ],
      responders: [
        {
          responseId: '374',
          discoveredBy: [
            { method: 'FUNCTIONAL', requestId: '7DF', probe: '22F190' },
            { method: 'PHYSICAL', requestId: '7E0', probe: '22F190' },
          ],
          firstSeenBy: 'FUNCTIONAL',
          confirmedByPhysical: true,
          confidence: 'HIGH',
          ecuName: null,
          ecuType: null,
          protocol: 'UDS_ON_CAN_11BIT',
          capabilities: {
            respondedToF190: true,
            positiveF190: true,
            negativeF190: false,
          },
        },
      ],
    });

    await service.processControlUnitDiscovery(sessionId, organizationId, discovery);

    const savedData = (repo.saveVehicleData as jest.Mock).mock.calls[0][2] as any;
    const savedDiscovery = savedData.controlUnitDiscovery;

    expect(savedDiscovery.responders[0].responseId).toBe('7E8');
    expect(savedDiscovery.probes[0].responseId).toBe('7E8');
    expect(savedDiscovery.probes[0].rawHeader).toBe('7E8');
    expect(savedDiscovery.probes[0].rawPayload).toBe('1462F19057314B4146344742315246313234333231');
    expect(savedDiscovery.probes[0].rawResponse).toBe(
      '7E81462F19057314B4146344742315246313234333231',
    );
  });

  it('normalizes old persisted double-encoded discovery data when returning vehicle data', async () => {
    const persistedVehicleData = {
      batteryVoltage: { value: 13.9, unit: 'V', supported: true },
      controlUnitDiscovery: makeDiscovery({
        probes: [
          {
            method: 'FUNCTIONAL',
            requestId: '7DF',
            probe: '22F190',
            responseId: '374',
            status: 'DISCOVERED',
            responseType: 'POSITIVE',
            negativeResponseCode: null,
            negativeResponseMeaning: null,
            rawHeader: '374',
            rawPayload: '53831343632463139303537',
            rawResponse: '374538313436324631393035373331344234313436333434373432333135323436333133323334333333323331',
            errorCode: null,
          },
        ],
        responders: [
          {
            responseId: '374',
            discoveredBy: [{ method: 'FUNCTIONAL', requestId: '7DF', probe: '22F190' }],
            firstSeenBy: 'FUNCTIONAL',
            confirmedByPhysical: true,
            confidence: 'HIGH',
            ecuName: null,
            ecuType: null,
            protocol: 'UDS_ON_CAN_11BIT',
            capabilities: {
              respondedToF190: true,
              positiveF190: true,
              negativeF190: false,
            },
          },
        ],
      }),
    };

    (repo.getVehicleData as jest.Mock).mockResolvedValue({
      id: sessionId,
      vehicleDataJson: persistedVehicleData,
      vehicleDataReadAt: new Date('2026-06-15T10:00:00.000Z'),
    });

    const result = await service.getVehicleData(sessionId, organizationId);
    const discovery = result.vehicleData?.controlUnitDiscovery as any;

    expect(discovery.responders[0].responseId).toBe('7E8');
    expect(discovery.probes[0].responseId).toBe('7E8');
    expect(discovery.probes[0].rawResponse).toBe(
      '7E81462F19057314B4146344742315246313234333231',
    );
  });

  it('preserves existing vehicleDataJson fields when adding controlUnitDiscovery', async () => {
    const discovery = makeDiscovery();

    await service.processControlUnitDiscovery(sessionId, organizationId, discovery);

    const savedData = (repo.saveVehicleData as jest.Mock).mock.calls[0][2] as Record<string, unknown>;
    // Existing fields should be preserved
    expect(savedData.batteryVoltage).toBeDefined();
    expect(savedData.vin).toBeDefined();
    expect(savedData.supportedPids).toBeDefined();
    // New field should be added
    expect(savedData.controlUnitDiscovery).toBeDefined();
  });

  it('replaces existing controlUnitDiscovery with latest result (snapshot, not append)', async () => {
    // First discovery
    const discovery1 = makeDiscovery({ summary: { totalProbes: 9, respondersFound: 1, functionalResponders: 1, physicalResponders: 1 } });
    await service.processControlUnitDiscovery(sessionId, organizationId, discovery1);

    // Second discovery (e.g., re-scan)
    const discovery2 = makeDiscovery({ summary: { totalProbes: 9, respondersFound: 2, functionalResponders: 1, physicalResponders: 2 } });
    await service.processControlUnitDiscovery(sessionId, organizationId, discovery2);

    // Only the second save call matters — it has the latest discovery
    const lastSavedData = (repo.saveVehicleData as jest.Mock).mock.calls[1][2] as Record<string, unknown>;
    expect((lastSavedData.controlUnitDiscovery as any).summary.respondersFound).toBe(2);
  });

  it('is backward compatible when vehicleDataJson has no existing data', async () => {
    (repo.findSessionById as jest.Mock).mockResolvedValue({
      id: sessionId,
      organizationId,
      createdBy: 'user-1',
      vehicleDataJson: null,
    });

    const discovery = makeDiscovery();
    await service.processControlUnitDiscovery(sessionId, organizationId, discovery);

    expect(repo.saveVehicleData).toHaveBeenCalledWith(
      sessionId,
      organizationId,
      expect.objectContaining({
        controlUnitDiscovery: expect.any(Object),
      }),
    );
  });

  it('does not crash when processing malformed discovery data (error isolation)', async () => {
    // Malformed data — should log error but not throw
    const malformed = { not: 'a valid discovery object' } as any;

    // Should not throw
    await service.processControlUnitDiscovery(sessionId, organizationId, malformed);

    // Should still attempt to persist (error isolation means we save what we can)
    expect(repo.saveVehicleData).toHaveBeenCalled();
  });

  it('does not crash the session when repository save fails (error isolation)', async () => {
    (repo.saveVehicleData as jest.Mock).mockRejectedValue(new Error('Database error'));

    const discovery = makeDiscovery();

    // Should not throw — error isolation catches and logs
    await service.processControlUnitDiscovery(sessionId, organizationId, discovery);

    // No audit record written because the save failed before we got there
    // But the function should not have thrown
    expect(true).toBe(true);
  });

  it('writes audit record with CONTROL_UNIT_DISCOVERY_READ action', async () => {
    const discovery = makeDiscovery();

    await service.processControlUnitDiscovery(sessionId, organizationId, discovery);

    expect(prisma.diagnosticSessionAuditRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CONTROL_UNIT_DISCOVERY_READ',
          sessionId,
          organizationId,
        }),
      }),
    );
  });

  it('logs warning and returns early when session not found', async () => {
    (repo.findSessionById as jest.Mock).mockResolvedValue(null);

    const discovery = makeDiscovery();
    await service.processControlUnitDiscovery(sessionId, organizationId, discovery);

    // Should NOT save data when session not found
    expect(repo.saveVehicleData).not.toHaveBeenCalled();
  });
});
