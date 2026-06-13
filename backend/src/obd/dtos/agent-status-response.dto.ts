import { AgentStatus } from '../types/agent-status.enum';

export class AgentStatusResponseDto {
  id: string;
  name?: string;
  version: string;
  status: AgentStatus;
  lastSeenAt?: Date;
  adapterConnected: boolean;
  adapterType?: string;
  connectionType?: string;

  constructor(data: {
    id: string;
    name?: string;
    version: string;
    status: AgentStatus;
    lastSeenAt?: Date;
    adapterConnected: boolean;
    adapterType?: string;
    connectionType?: string;
  }) {
    this.id = data.id;
    this.name = data.name;
    this.version = data.version;
    this.status = data.status;
    this.lastSeenAt = data.lastSeenAt;
    this.adapterConnected = data.adapterConnected;
    this.adapterType = data.adapterType;
    this.connectionType = data.connectionType;
  }
}