import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { FaultCodeStatus } from '../types/fault-code-status.enum';

export class FaultCodeImportDto {
  @IsString()
  @Length(5, 10)
  code: string;

  @IsEnum(FaultCodeStatus)
  status: FaultCodeStatus;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  ecu?: string;
}
