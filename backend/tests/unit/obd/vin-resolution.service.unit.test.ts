import { VinResolutionService } from '../../../src/obd/services/vin-resolution.service';
import { PrismaService } from '../../../src/prisma/prisma.service';

describe('VinResolutionService', () => {
  let service: VinResolutionService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    prisma = {
      vehicle: {
        findFirst: jest.fn(),
      } as any,
    } as any;
    service = new VinResolutionService(prisma);
  });

  describe('resolve', () => {
    it('should filter by both VIN and organizationId', async () => {
      await service.resolve('1HGCM82633A123456', 'org-1');

      expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
        where: {
          vin: '1HGCM82633A123456',
          organizationId: 'org-1',
        },
      });
    });

    it('should return vehicle when matched within tenant', async () => {
      const vehicle = { id: 'v-1', vin: '1HGCM82633A123456' };
      (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(vehicle);

      const result = await service.resolve('1HGCM82633A123456', 'org-1');
      expect(result).toEqual(vehicle);
    });

    it('should return null when VIN exists in another tenant', async () => {
      (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.resolve('1HGCM82633A123456', 'org-1');
      expect(result).toBeNull();
    });
  });

  describe('validateVin', () => {
    it('should accept a valid 17-char VIN', () => {
      expect(service.validateVin('1HGCM82633A123456')).toBe(true);
    });

    it('should reject a short VIN', () => {
      expect(service.validateVin('SHORT')).toBe(false);
    });

    it('should reject a VIN with invalid characters I, O, Q', () => {
      expect(service.validateVin('1HGCM82633A12345O')).toBe(false);
      expect(service.validateVin('1HGCM82633A12345I')).toBe(false);
      expect(service.validateVin('1HGCM82633A12345Q')).toBe(false);
    });
  });
});
