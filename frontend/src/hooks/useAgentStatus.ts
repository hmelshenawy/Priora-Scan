'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '../lib/api-client';

export interface AgentStatus {
  id: string;
  name?: string;
  version: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  lastSeenAt?: string;
  adapterConnected: boolean;
  adapterType?: string;
  connectionType?: string;
}

async function fetchAgents(): Promise<AgentStatus[]> {
  const response = await apiClient.get<AgentStatus[]>('/obd/agents');
  return response.data;
}

export function useAgentStatus() {
  return useQuery<AgentStatus[]>({
    queryKey: ['obd', 'agents'],
    queryFn: fetchAgents,
    refetchInterval: 5000,
    staleTime: 3000,
  });
}