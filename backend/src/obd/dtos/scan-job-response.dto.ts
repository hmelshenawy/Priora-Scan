import { ScanJobStatus } from '../types/scan-job-status.enum';
import { VehicleDecodeResponseDto } from '../../vehicles/dtos/vehicle-decode-response.dto';

export class ScanJobResponseDto {
  id: string;
  status: ScanJobStatus;
  vehicleId?: string;
  diagnosticSessionId?: string;
  vin?: string;
  adapterType?: string;
  adapterProtocol?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  decodedVehicle?: VehicleDecodeResponseDto;

  static fromEntity(
    entity: {
      id: string;
      status: ScanJobStatus | string;
      vehicleId: string | null;
      diagnosticSessionId: string | null;
      vin: string | null;
      adapterType: string | null;
      adapterProtocol: string | null;
      errorMessage: string | null;
      startedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
    },
    decodedVehicle?: VehicleDecodeResponseDto | null,
  ): ScanJobResponseDto {
    const dto = new ScanJobResponseDto();
    dto.id = entity.id;
    dto.status = entity.status as ScanJobStatus;
    dto.vehicleId = entity.vehicleId ?? undefined;
    dto.diagnosticSessionId = entity.diagnosticSessionId ?? undefined;
    dto.vin = entity.vin ?? undefined;
    dto.adapterType = entity.adapterType ?? undefined;
    dto.adapterProtocol = entity.adapterProtocol ?? undefined;
    dto.errorMessage = entity.errorMessage ?? undefined;
    dto.startedAt = entity.startedAt ?? undefined;
    dto.completedAt = entity.completedAt ?? undefined;
    dto.createdAt = entity.createdAt;
    dto.decodedVehicle = decodedVehicle ?? undefined;
    return dto;
  }
}
