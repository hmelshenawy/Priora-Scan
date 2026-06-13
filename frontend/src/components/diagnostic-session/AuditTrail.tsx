'use client';

import { Activity } from 'lucide-react';
import { useAuditTrail, getActionLabel } from '../../services/audit-trail-api';
import type { AuditTrailEntry } from '../../services/audit-trail-api';
import { LoadingState } from '../ui/LoadingState';
import { ErrorState } from '../ui/ErrorState';

interface AuditTrailProps {
  sessionId: string;
}

/**
 * Icon/color mapping for audit actions.
 */
function getActionStyle(action: string): { color: string; bg: string } {
  if (action.startsWith('DTC_CLEAR')) {
    return { color: 'text-red-700', bg: 'bg-red-100' };
  }
  if (action.startsWith('VEHICLE_DATA')) {
    return { color: 'text-blue-700', bg: 'bg-blue-100' };
  }
  if (action === 'SESSION_CREATED') {
    return { color: 'text-emerald-700', bg: 'bg-emerald-100' };
  }
  if (action === 'SESSION_STATUS_UPDATED') {
    return { color: 'text-amber-700', bg: 'bg-amber-100' };
  }
  return { color: 'text-slate-700', bg: 'bg-slate-100' };
}

/**
 * Format an ISO timestamp to a locale-friendly date/time string.
 */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Render additional detail from audit metadata.
 */
function MetadataDetail({ entry }: { entry: AuditTrailEntry }) {
  const meta = entry.metadata;
  if (!meta) return null;

  const details: string[] = [];

  if (meta.previousStatus && meta.nextStatus) {
    details.push(`${meta.previousStatus} → ${meta.nextStatus}`);
  }
  if (meta.previousFaultCodeCount !== undefined) {
    details.push(`${meta.previousFaultCodeCount} fault code(s)`);
  }
  if (meta.failureReason) {
    details.push(`Reason: ${meta.failureReason}`);
  }

  if (details.length === 0) return null;

  return (
    <p className="mt-0.5 text-xs text-slate-500">
      {details.join(' · ')}
    </p>
  );
}

/**
 * AuditTrail — Feature 009 Phase B.
 *
 * Renders the audit trail for a diagnostic session as a
 * reverse-chronological timeline. Shows all DiagnosticSessionAuditRecord
 * entries including DTC_CLEAR_REQUESTED/COMPLETED/FAILED,
 * VEHICLE_DATA_READ_REQUESTED/COMPLETED, SESSION_CREATED, and
 * SESSION_STATUS_UPDATED.
 */
export function AuditTrail({ sessionId }: AuditTrailProps) {
  const auditQuery = useAuditTrail(sessionId);

  if (auditQuery.isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Audit Trail</h2>
        <LoadingState title="Loading audit trail" message="Fetching session history." />
      </div>
    );
  }

  if (auditQuery.isError) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Audit Trail</h2>
        <ErrorState
          title="Audit trail unavailable"
          message="Unable to load the audit trail for this session."
        />
      </div>
    );
  }

  const entries = auditQuery.data?.entries ?? [];

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Audit Trail</h2>
        <p className="mt-2 text-sm text-slate-500">
          No audit records yet for this session.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Audit Trail</h2>

      <ol className="mt-4 space-y-0 divide-y divide-slate-100">
        {entries.map((entry) => {
          const style = getActionStyle(entry.action);
          return (
            <li key={entry.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100">
                <Activity className={`h-3.5 w-3.5 ${style.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${style.bg} ${style.color}`}
                  >
                    {getActionLabel(entry.action)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatTimestamp(entry.createdAt)}
                  </span>
                </div>
                <MetadataDetail entry={entry} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}