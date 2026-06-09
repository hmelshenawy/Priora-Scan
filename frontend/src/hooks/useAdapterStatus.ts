'use client';

import { useAgentStatus } from './useAgentStatus';

export function useAdapterStatus() {
  const { data: agents, isLoading, isError, error } = useAgentStatus();

  const onlineAgent = agents?.find((a) => a.status === 'ONLINE');
  const adapterConnected = onlineAgent?.adapterConnected ?? false;

  return {
    adapterConnected,
    isLoading,
    isError,
    error,
    agent: onlineAgent || agents?.[0] || null,
    hasAgent: !!agents && agents.length > 0,
  };
}
