import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * VehicleDecodeRepository — Feature 006 Phase A, Correction 6.
 *
 * The VehicleDecode table is GLOBAL — there is no organizationId column.
 * A single VIN is shared across all tenants, so the cache lookup is keyed
 * by VIN alone. This is intentional and is the documented behavior.
 */
@Injectable()
export class VehicleDecodeRepository {
  constructor(private prisma: PrismaService) {}

  async findByVin(vin: string) {
    return this.prisma.vehicleDecode.findUnique({ where: { vin } });
  }

  async upsert(data: Prisma.VehicleDecodeUncheckedCreateInput) {
    return this.prisma.vehicleDecode.upsert({
      where: { vin: data.vin },
      create: data,
      update: {
        make: data.make,
        model: data.model,
        year: data.year,
        engine: data.engine,
        bodyStyle: data.bodyStyle,
        manufacturer: data.manufacturer,
        source: data.source ?? 'vpic-asset',
      },
    });
  }
}
