import { VehicleResponseDto } from './vehicle-response.dto';

export interface VehicleHistoryPlaceholder {
  sessions: never[];
  totalSessions: number;
  emptyStateMessage: string;
}

export class VehicleDetailResponseDto extends VehicleResponseDto {
  history: VehicleHistoryPlaceholder;

  static withHistory(base: VehicleResponseDto): VehicleDetailResponseDto {
    const dto = new VehicleDetailResponseDto();
    Object.assign(dto, base);
    dto.history = {
      sessions: [],
      totalSessions: 0,
      emptyStateMessage:
        'No diagnostic sessions yet. Diagnostic history will appear here once sessions are created.',
    };
    return dto;
  }
}
