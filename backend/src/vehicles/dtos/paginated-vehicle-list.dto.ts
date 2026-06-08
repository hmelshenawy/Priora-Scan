import { VehicleResponseDto } from './vehicle-response.dto';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class PaginatedVehicleListDto {
  data: VehicleResponseDto[];
  pagination: PaginationMeta;
}
