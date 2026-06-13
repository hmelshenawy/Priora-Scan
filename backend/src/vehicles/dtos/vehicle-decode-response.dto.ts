import { VehicleDecode } from '@prisma/client';

export class VehicleDecodeResponseDto {
  vin: string;
  make: string | null;
  model: string | null;
  year: number | null;
  engine: string | null;
  bodyStyle: string | null;
  manufacturer: string | null;
  source: string;
  decodedAt: Date;
  cacheHit: boolean;

  static fromEntity(entity: VehicleDecode, origin: 'cache' | 'asset'): VehicleDecodeResponseDto {
    const dto = new VehicleDecodeResponseDto();
    dto.vin = entity.vin;
    dto.make = entity.make ?? this.makeFromManufacturer(entity.manufacturer);
    dto.model = entity.model;
    dto.year = entity.year;
    dto.engine = entity.engine;
    dto.bodyStyle = entity.bodyStyle;
    dto.manufacturer = entity.manufacturer;
    dto.source = entity.source;
    dto.decodedAt = entity.decodedAt;
    dto.cacheHit = origin === 'cache';
    return dto;
  }

  private static makeFromManufacturer(manufacturer: string | null): string | null {
    return manufacturer?.replace(/\s+Cars$/i, '').trim() ?? null;
  }
}
