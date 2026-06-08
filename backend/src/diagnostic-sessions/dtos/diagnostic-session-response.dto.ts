import { DiagnosticSession } from '@prisma/client';

export class DiagnosticSessionResponseDto {
  id: string;
  organizationId: string;
  vehicleId: string;
  number: string;
  status: string;
  title?: string | null;
  description?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(entity: DiagnosticSession): DiagnosticSessionResponseDto {
    const dto = new DiagnosticSessionResponseDto();
    dto.id = entity.id;
    dto.organizationId = entity.organizationId;
    dto.vehicleId = entity.vehicleId;
    dto.number = entity.number;
    dto.status = entity.status;
    dto.title = entity.title;
    dto.description = entity.description;
    dto.createdBy = entity.createdBy;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
