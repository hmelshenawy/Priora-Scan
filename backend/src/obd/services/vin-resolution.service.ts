import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VinResolutionService {
  constructor(private prisma: PrismaService) {}

  async resolve(vin: string, organizationId: string) {
    return this.prisma.vehicle.findFirst({
      where: {
        vin,
        organizationId,
      },
    });
  }

  validateVin(vin: string): boolean {
    if (!vin || vin.length !== 17) {
      return false;
    }
    const validChars = /^[A-HJ-NPR-Z0-9]+$/i;
    return validChars.test(vin);
  }
}
