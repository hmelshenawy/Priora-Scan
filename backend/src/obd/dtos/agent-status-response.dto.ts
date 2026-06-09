import { AgentStatus } from '../types/agent-status.enum';

export class AgentStatusResponseDto {
  id: string;
  name?: string;
  version: string;
  status: AgentStatus;
  lastSeenAt?: Date;
  adapterConnected: boolean;

  constructor(data: {
    id: string;
    name?: string;
    version: string;
    status: AgentStatus;
    lastSeenAt?: Date;
    adapterConnected: boolean;
  }) {
    this.id = data.id;
    this.name = data.name;
    this.version = data.version;
    this.status = data.status;
    this.lastSeenAt = data.lastSeenAt;
    this.adapterConnected = data.adapterConnected;
  }
}
