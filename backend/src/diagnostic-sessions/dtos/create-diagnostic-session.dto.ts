import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDiagnosticSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;
}
