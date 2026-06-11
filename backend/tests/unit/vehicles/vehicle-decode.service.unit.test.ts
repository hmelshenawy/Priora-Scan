import { ServiceUnavailableException } from '@nestjs/common';
import { VehicleDecodeService } from '../../../src/vehicles/services/vehicle-decode.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { VehicleDecodeRepository } from '../../../src/vehicles/repositories/vehicle-decode.repository';
import { VpicAssetService } from '../../../src/vehicles/services/vpic-asset.service';

interface MockTx {
  vehicleDecode: { upsert: jest.Mock };
  vehicleAuditRecord: { create: jest.Mock };
}

describe('VehicleDecodeService', () => {
  let service: VehicleDecodeService;
  let prisma: jest.Mocked<PrismaService>;
  let repo: jest.Mocked<VehicleDecodeRepository>;
  let vpic: jest.Mocked<VpicAssetService>;
  let tx: MockTx;

  beforeEach(() => {
    tx = {
      vehicleDecode: { upsert: jest.fn() },
      vehicleAuditRecord: { create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    } as unknown as jest.Mocked<PrismaService>;
    repo = {
      findByVin: jest.fn(),
      upsert: jest.fn(),
    } as unknown as jest.Mocked<VehicleDecodeRepository>;
    vpic = {
      isReady: jest.fn().mockReturnValue(true),
      decode: jest.fn(),
    } as unknown as jest.Mocked<VpicAssetService>;
    service = new VehicleDecodeService(prisma, repo, vpic);
  });

  describe('validateVin', () => {
    it('accepts a 17-char alphanumeric VIN', () => {
      const r = service.validateVin('WDD2130041A123456');
      expect(r.ok).toBe(true);
    });

    it('rejects empty / short input', () => {
      const r = service.validateVin('WB');
      expect(r.ok).toBe(false);
    });

    it('rejects non-alphanumeric input', () => {
      const r = service.validateVin('WDD 213');
      expect(r.ok).toBe(false);
    });

    it('uppercases the input', () => {
      const r = service.validateVin('wdd2130041a123456');
      expect(r.ok).toBe(true);
    });
  });

  describe('decodeVin', () => {
    it('returns cached record with cacheHit=true and skips the asset', async () => {
      const cached = {
        vin: 'WDD2130041A123456',
        make: 'Mercedes-Benz',
        model: 'C-Class',
        year: 2020,
        engine: null,
        bodyStyle: 'Sedan',
        manufacturer: 'Daimler AG',
        source: 'vpic-asset',
        decodedAt: new Date(),
        updatedAt: new Date(),
      };
      repo.findByVin.mockResolvedValue(cached as any);

      const result = await service.decodeVin(
        'WDD2130041A123456',
        'org-1',
        'user-1',
      );
      expect(result.make).toBe('Mercedes-Benz');
      expect(result.cacheHit).toBe(true);
      expect(vpic.decode).not.toHaveBeenCalled();
    });

    it('queries the asset and writes a VehicleDecode + audit on miss', async () => {
      repo.findByVin.mockResolvedValue(null);
      vpic.decode.mockReturnValue({
        vin: 'WDD2130041A123456',
        make: 'Mercedes-Benz',
        model: 'C-Class',
        modelYear: 2020,
        bodyStyle: 'Sedan',
        manufacturer: 'Daimler AG',
      });
      tx.vehicleDecode.upsert.mockResolvedValue({
        vin: 'WDD2130041A123456',
        make: 'Mercedes-Benz',
        model: 'C-Class',
        year: 2020,
        engine: null,
        bodyStyle: 'Sedan',
        manufacturer: 'Daimler AG',
        source: 'vpic-asset',
        decodedAt: new Date(),
        updatedAt: new Date(),
      } as any);
      tx.vehicleAuditRecord.create.mockResolvedValue({} as any);

      const result = await service.decodeVin(
        'wdd2130041a123456',
        'org-1',
        'user-1',
      );
      expect(result.cacheHit).toBe(false);
      expect(vpic.decode).toHaveBeenCalledWith('WDD2130041A123456');
      expect(tx.vehicleDecode.upsert).toHaveBeenCalledTimes(1);
      expect(tx.vehicleAuditRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'VIN_DECODED_FROM_ASSET',
          }),
        }),
      );
    });

    it('throws ServiceUnavailableException when the asset is unavailable', async () => {
      repo.findByVin.mockResolvedValue(null);
      vpic.isReady.mockReturnValue(false);

      await expect(
        service.decodeVin('WDD2130041A123456', 'org-1', 'user-1'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('throws VehicleNotDecodedException when the asset returns nothing', async () => {
      repo.findByVin.mockResolvedValue(null);
      vpic.decode.mockReturnValue(null);

      await expect(
        service.decodeVin('XXX00000000000000', 'org-1', 'user-1'),
      ).rejects.toMatchObject({ code: 'VIN_NOT_DECODED' });
    });
  });
});
