import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class VehicleRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.VehicleCreateInput) {
    return this.prisma.vehicle.create({ data });
  }

  async findOne(id: string, organizationId: string) {
    return this.prisma.vehicle.findFirst({
      where: { id, organizationId },
    });
  }

  async findAll(
    organizationId: string,
    filters: {
      search?: string;
      make?: string;
      model?: string;
      year?: number;
    },
    page: number,
    limit: number,
  ) {
    const where: Prisma.VehicleWhereInput = { organizationId };

    if (filters.search) {
      where.OR = [
        { make: { contains: filters.search, mode: 'insensitive' } },
        { model: { contains: filters.search, mode: 'insensitive' } },
        { vin: { contains: filters.search, mode: 'insensitive' } },
        { plateNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.make) {
      where.make = { contains: filters.make, mode: 'insensitive' };
    }

    if (filters.model) {
      where.model = { contains: filters.model, mode: 'insensitive' };
    }

    if (filters.year !== undefined) {
      where.year = filters.year;
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return { data, total };
  }

  async findByVin(vin: string, organizationId: string) {
    return this.prisma.vehicle.findFirst({
      where: { vin, organizationId },
    });
  }

  async findByPlateNumber(plateNumber: string, organizationId: string) {
    return this.prisma.vehicle.findFirst({
      where: { plateNumber, organizationId },
    });
  }
}
