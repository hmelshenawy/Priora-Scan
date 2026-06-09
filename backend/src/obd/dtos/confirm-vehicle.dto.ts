import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ConfirmVehicleDto {
  @IsString()
  @Length(1, 100)
  make: string;

  @IsString()
  @Length(1, 100)
  model: string;

  @IsInt()
  @Min(1900)
  @Max(2100)
  year: number;

  @IsString()
  @Length(17, 17)
  vin: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  plateNumber?: string;
}
