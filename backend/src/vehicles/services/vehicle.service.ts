import { Injectable, NotFoundException } from '@nestjs/common';
import { VehicleRepository } from '../repositories/vehicle.repository';
import { VehicleAuditRepository } from '../repositories/vehicle-audit.repository';
import { CreateVehicleDto } from '../dtos/create-vehicle.dto';
import { UpdateVehicleDto } from '../dtos/update-vehicle.dto';
import { VehicleResponseDto } from '../dtos/vehicle-response.dto';
import { VehicleDetailResponseDto } from '../dtos/vehicle-detail-response.dto';
import { VehicleListQueryDto } from '../dtos/vehicle-list-query.dto';
import { PaginatedVehicleListDto } from '../dtos/paginated-vehicle-list.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VehicleService {
  constructor(
    private vehicleRepository: VehicleRepository,
    private auditRepository: VehicleAuditRepository,
    private prisma: PrismaService,
  ) {}

  async create(
    dto: CreateVehicleDto,
    organizationId: string,
    userId: string,
  ): Promise<VehicleResponseDto> {
    const vehicle = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vehicle.create({
        data: {
          organizationId,
          make: dto.make,
          model: dto.model,
          year: dto.year,
          vin: dto.vin ?? null,
          plateNumber: dto.plateNumber ?? null,
          engine: dto.engine ?? null,
          bodyStyle: dto.bodyStyle ?? null,
        },
      });

      await tx.vehicleAuditRecord.create({
        data: {
          organizationId,
          userId,
          entityId: created.id,
          action: 'vehicle:created',
          metadata: {
            make: created.make,
            model: created.model,
            year: created.year,
            vin: created.vin,
            plateNumber: created.plateNumber,
            engine: created.engine,
            bodyStyle: created.bodyStyle,
          },
        },
      });

      return created;
    });

    return VehicleResponseDto.fromEntity(vehicle);
  }

  async findAll(
    query: VehicleListQueryDto,
    organizationId: string,
  ): Promise<PaginatedVehicleListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const { data, total } = await this.vehicleRepository.findAll(
      organizationId,
      {
        search: query.search,
        make: query.make,
        model: query.model,
        year: query.year,
      },
      page,
      limit,
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data: data.map(VehicleResponseDto.fromEntity),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<VehicleDetailResponseDto> {
    const vehicle = await this.vehicleRepository.findOne(id, organizationId);

    if (!vehicle) {
      throw new NotFoundException({
        code: 'VEHICLE_NOT_FOUND',
        message:
          'The requested vehicle does not exist or you do not have access to it.',
      });
    }

    const base = VehicleResponseDto.fromEntity(vehicle);
    return VehicleDetailResponseDto.withHistory(base);
  }

  async update(
    id: string,
    dto: UpdateVehicleDto,
    organizationId: string,
    userId: string,
  ): Promise<VehicleResponseDto> {
    const existing = await this.vehicleRepository.findOne(id, organizationId);

    if (!existing) {
      throw new NotFoundException({
        code: 'VEHICLE_NOT_FOUND',
        message:
          'The requested vehicle does not exist or you do not have access to it.',
      });
    }

    const updateData: Record<string, unknown> = {};
    if (dto.make !== undefined) updateData.make = dto.make;
    if (dto.model !== undefined) updateData.model = dto.model;
    if (dto.year !== undefined) updateData.year = dto.year;
    if (dto.vin !== undefined) updateData.vin = dto.vin;
    if (dto.plateNumber !== undefined) updateData.plateNumber = dto.plateNumber;
    if (dto.engine !== undefined) updateData.engine = dto.engine;
    if (dto.bodyStyle !== undefined) updateData.bodyStyle = dto.bodyStyle;

    const vehicle = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({
        where: { id },
        data: updateData,
      });

      await tx.vehicleAuditRecord.create({
        data: {
          organizationId,
          userId,
          entityId: updated.id,
          action: 'vehicle:updated',
          metadata: {
            previous: {
              make: existing.make,
              model: existing.model,
              year: existing.year,
              vin: existing.vin,
              plateNumber: existing.plateNumber,
              engine: existing.engine,
              bodyStyle: existing.bodyStyle,
            },
            current: {
              make: updated.make,
              model: updated.model,
              year: updated.year,
              vin: updated.vin,
              plateNumber: updated.plateNumber,
              engine: updated.engine,
              bodyStyle: updated.bodyStyle,
            },
          },
        },
      });

      return updated;
    });

    return VehicleResponseDto.fromEntity(vehicle);
  }
}
