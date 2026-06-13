'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '../lib/api-client';

/**
 * Single audit trail entry — matches AuditTrailEntryDto from backend.
 */
export interface AuditTrailEntry {
  id: string;
  action: string;
  userId: string;
  sessionId: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Response from GET /diagnostic-sessions/:sessionId/audit
 */
export interface AuditTrailResponse {
  sessionId: string;
  entries: AuditTrailEntry[];
  total: number;
}

/**
 * Fetch audit trail for a diagnostic session.
 * GET /api/v1/diagnostic-sessions/:sessionId/audit
 */
async function getAuditTrail(sessionId: string): Promise<AuditTrailResponse> {
  const response = await apiClient.get<AuditTrailResponse>(
    `/api/v1/diagnostic-sessions/${sessionId}/audit`,
  );
  return response.data;
}

/**
 * Hook to fetch the audit trail for a diagnostic session.
 */
export function useAuditTrail(sessionId: string | null) {
  return useQuery<AuditTrailResponse>({
    queryKey: ['audit-trail', sessionId],
    queryFn: () => getAuditTrail(sessionId!),
    enabled: sessionId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Human-readable labels for audit actions.
 */
const ACTION_LABELS: Record<string, string> = {
  SESSION_CREATED: 'Session created',
  SESSION_STATUS_UPDATED: 'Status updated',
  VEHICLE_DATA_READ_REQUESTED: 'Vehicle data read requested',
  VEHICLE_DATA_READ_COMPLETED: 'Vehicle data read completed',
  DTC_CLEAR_REQUESTED: 'DTC clear requested',
  DTC_CLEAR_COMPLETED: 'Fault codes cleared',
  DTC_CLEAR_FAILED: 'DTC clear failed',
};

/**
 * Resolve an audit action code to a human-readable label.
 */
export function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}