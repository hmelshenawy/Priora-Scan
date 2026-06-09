import { IsOptional, IsString, Length } from 'class-validator';

export class PairingTokenRequestDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  agentName?: string;
}
