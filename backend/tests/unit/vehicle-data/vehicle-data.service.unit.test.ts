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
});
