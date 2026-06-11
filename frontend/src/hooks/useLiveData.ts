'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import apiClient from '../lib/api-client';

export type LiveDataSessionStatus = 'ACTIVE' | 'STOPPED' | 'STALE';

export interface LiveDataReading {
  value: number | null;
  unit: string | null;
  name: string | null;
  rawValue: string;
  status: 'OK' | 'NO_DATA' | 'NOT_SUPPORTED' | 'ERROR';
  errorCode: string | null;
}

export interface LiveDataCurrentValues {
  [shortName: string]: LiveDataReading;
}

export interface LiveDataStartResponse {
  liveDataSessionId: string;
  status: LiveDataSessionStatus;
  cadenceMs: number;
}

export interface LiveDataCurrentResponse {
  sessionId: string;
  status: LiveDataSessionStatus;
  cadenceMs: number;
  lastActivityAt: string | null;
  values: LiveDataCurrentValues;
}

async function startLiveData(
  diagnosticSessionId: string,
  agentId: string,
  cadenceMs?: number,
): Promise<LiveDataStartResponse> {
  const response = await apiClient.post<LiveDataStartResponse>(
    `/api/v1/diagnostic-sessions/${diagnosticSessionId}/live-data/start`,
    cadenceMs === undefined ? { agentId } : { agentId, cadenceMs },
  );
  return response.data;
}

async function stopLiveData(
  diagnosticSessionId: string,
  liveDataSessionId: string,
): Promise<LiveDataCurrentResponse> {
  const response = await apiClient.post<LiveDataCurrentResponse>(
    `/api/v1/diagnostic-sessions/${diagnosticSessionId}/live-data/stop`,
    { liveDataSessionId },
  );
  return response.data;
}

async function fetchLiveDataCurrent(
  diagnosticSessionId: string,
): Promise<LiveDataCurrentResponse | null> {
  const response = await apiClient.get<LiveDataCurrentResponse | null>(
    `/api/v1/diagnostic-sessions/${diagnosticSessionId}/live-data/current`,
  );
  if (response.data === null || response.data === undefined) {
    return null;
  }
  if (
    typeof response.data === 'object' &&
    Object.keys(response.data).length === 0
  ) {
    // Backend returns an empty object when no session is active.
    return null;
  }
  return response.data;
}

export function useLiveDataCurrent(
  diagnosticSessionId: string | null,
  options: { refetchIntervalMs?: number; enabled?: boolean } = {},
) {
  const { refetchIntervalMs, enabled } = options;
  return useQuery<LiveDataCurrentResponse | null>({
    queryKey: ['live-data', 'current', diagnosticSessionId],
    queryFn: () => fetchLiveDataCurrent(diagnosticSessionId!),
    enabled: enabled !== false && diagnosticSessionId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'ACTIVE' && refetchIntervalMs) {
        return refetchIntervalMs;
      }
      return false;
    },
    staleTime: 500,
  });
}

export function useStartLiveData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      diagnosticSessionId,
      agentId,
      cadenceMs,
    }: {
      diagnosticSessionId: string;
      agentId: string;
      cadenceMs?: number;
    }) => startLiveData(diagnosticSessionId, agentId, cadenceMs),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['live-data', 'current', variables.diagnosticSessionId],
      });
    },
  });
}

export function useStopLiveData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      diagnosticSessionId,
      liveDataSessionId,
    }: {
      diagnosticSessionId: string;
      liveDataSessionId: string;
    }) => stopLiveData(diagnosticSessionId, liveDataSessionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['live-data', 'current', variables.diagnosticSessionId],
      });
    },
  });
}
