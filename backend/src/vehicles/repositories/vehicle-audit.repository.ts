import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class VehicleAuditRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.VehicleAuditRecordCreateInput) {
    return this.prisma.vehicleAuditRecord.create({ data });
  }
}
