import {
  IsString,
  IsInt,
  IsOptional,
  Length,
  Min,
  Max,
  Matches,
  IsNotEmpty,
} from 'class-validator';

const CURRENT_YEAR = new Date().getFullYear();

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  make: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  model: string;

  @IsInt()
  @Min(1900)
  @Max(CURRENT_YEAR + 1)
  year: number;

  @IsOptional()
  @IsString()
  @Length(3, 25)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'VIN must be alphanumeric and between 3 and 25 characters.',
  })
  vin?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  engine?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  bodyStyle?: string;
}
