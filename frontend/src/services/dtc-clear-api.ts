'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import apiClient from '../lib/api-client';

/**
 * Response from POST /fault-codes/clear
 */
export interface DtcClearResponse {
  sessionId: string;
  status: string;
  previousFaultCodeCount?: number;
  message: string;
}

/**
 * Clear status values
 */
export type ClearStatus = 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED';

/**
 * Response from GET /fault-codes/clear-status
 */
export interface DtcClearStatusResponse {
  sessionId: string;
  clearStatus: ClearStatus;
  lastClearAt: string | null;
  lastClearResult: 'SUCCESS' | 'FAILED' | null;
}

/**
 * Clear fault codes for a session.
 * POST /api/v1/diagnostic-sessions/:sessionId/fault-codes/clear
 */
async function clearFaultCodes(sessionId: string): Promise<DtcClearResponse> {
  const response = await apiClient.post<DtcClearResponse>(
    `/api/v1/diagnostic-sessions/${sessionId}/fault-codes/clear`,
    {},
  );
  return response.data;
}

/**
 * Get clear status for a session (optional polling).
 * GET /api/v1/diagnostic-sessions/:sessionId/fault-codes/clear-status
 */
async function getClearStatus(sessionId: string): Promise<DtcClearStatusResponse> {
  const response = await apiClient.get<DtcClearStatusResponse>(
    `/api/v1/diagnostic-sessions/${sessionId}/fault-codes/clear-status`,
  );
  return response.data;
}

/**
 * Hook to poll DTC clear status.
 * Refetches every 2 seconds while status is PENDING.
 */
export function useDtcClearStatus(sessionId: string | null) {
  return useQuery<DtcClearStatusResponse>({
    queryKey: ['dtc-clear-status', sessionId],
    queryFn: () => getClearStatus(sessionId!),
    enabled: sessionId !== null,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.clearStatus;
      if (status === 'PENDING') {
        return 2000;
      }
      return false;
    },
  });
}

/**
 * Hook to clear fault codes for a session.
 * After mutation, invalidates related queries.
 */
export function useClearFaultCodes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearFaultCodes,
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({
        queryKey: ['dtc-clear-status', sessionId],
      });
      queryClient.invalidateQueries({
        queryKey: ['obd', 'session', sessionId, 'fault-codes'],
      });
    },
  });
}