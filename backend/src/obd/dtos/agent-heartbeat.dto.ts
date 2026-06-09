import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class AgentHeartbeatDto {
  @IsString()
  @Length(1, 20)
  version: string;

  @IsBoolean()
  adapterConnected: boolean;

  @IsOptional()
  @IsString()
  adapterType?: string;

  @IsOptional()
  @IsString()
  protocol?: string;
}
