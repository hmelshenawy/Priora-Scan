import { VehicleDecodeRepository } from '../../../src/vehicles/repositories/vehicle-decode.repository';
import { PrismaService } from '../../../src/prisma/prisma.service';

describe('VehicleDecodeRepository', () => {
  let prisma: jest.Mocked<PrismaService>;
  let repo: VehicleDecodeRepository;

  beforeEach(() => {
    prisma = {
      vehicleDecode: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;
    repo = new VehicleDecodeRepository(prisma);
  });

  describe('findByVin', () => {
    it('looks up by VIN without organizationId (Correction 6)', async () => {
      await repo.findByVin('WDD2130041A123456');
      expect(prisma.vehicleDecode.findUnique).toHaveBeenCalledWith({
        where: { vin: 'WDD2130041A123456' },
      });
    });
  });

  describe('upsert', () => {
    it('uses the unique (vin) key for the upsert', async () => {
      await repo.upsert({
        vin: 'WDD2130041A123456',
        make: 'Mercedes-Benz',
        model: 'C-Class',
        year: 2020,
      } as any);
      expect(prisma.vehicleDecode.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vin: 'WDD2130041A123456' },
        }),
      );
    });
  });
});
