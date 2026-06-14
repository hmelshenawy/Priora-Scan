import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class ConfirmVehicleDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  make?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  @Length(17, 17)
  vin?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  engine?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  bodyStyle?: string;
}
