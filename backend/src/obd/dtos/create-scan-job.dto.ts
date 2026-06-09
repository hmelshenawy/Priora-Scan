import { IsOptional, IsUUID } from 'class-validator';

export class CreateScanJobDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}
