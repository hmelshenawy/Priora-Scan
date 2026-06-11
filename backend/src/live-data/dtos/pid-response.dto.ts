import { PIDDefinition } from '@prisma/client';

export class PidResponseDto {
  id: string;
  namespace: string;
  mode: string;
  pid: string;
  name: string;
  unit: string;
  formula: string;
  min: number | null;
  max: number | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(entity: PIDDefinition): PidResponseDto {
    const dto = new PidResponseDto();
    dto.id = entity.id;
    dto.namespace = entity.namespace;
    dto.mode = entity.mode;
    dto.pid = entity.pid;
    dto.name = entity.name;
    dto.unit = entity.unit;
    dto.formula = entity.formula;
    dto.min = entity.min === null || entity.min === undefined ? null : Number(entity.min);
    dto.max = entity.max === null || entity.max === undefined ? null : Number(entity.max);
    dto.source = entity.source;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
