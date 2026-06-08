import { Vehicle } from '@prisma/client';

export class VehicleResponseDto {
  id: string;
  organizationId: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  plateNumber: string | null;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(entity: Vehicle): VehicleResponseDto {
    const dto = new VehicleResponseDto();
    dto.id = entity.id;
    dto.organizationId = entity.organizationId;
    dto.make = entity.make;
    dto.model = entity.model;
    dto.year = entity.year;
    dto.vin = entity.vin ?? null;
    dto.plateNumber = entity.plateNumber ?? null;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
