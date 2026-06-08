import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DiagnosticSessionStatus } from '../types/diagnostic-session-status.enum';

export class UpdateDiagnosticSessionDto {
  @IsOptional()
  @IsEnum(DiagnosticSessionStatus)
  status?: DiagnosticSessionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;
}
