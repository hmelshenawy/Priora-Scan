import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VehicleListQueryDto {
  @IsOptional()
  @IsString()
  @Length(0, 100)
  search?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  make?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
