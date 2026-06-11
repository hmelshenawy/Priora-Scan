'use client';

import { FaultCode } from '../../hooks/useObdScan';
import {
  readEnrichment,
  severityBadgeClass,
  systemBadgeClass,
} from '../../lib/fault-codes';

interface EnrichedFaultCodeRowProps {
  code: FaultCode;
}

/**
 * Renders a single SessionFaultCode row with the enriched fault-code
 * intelligence fields. Falls back to the raw code/status/ECU view when
 * the backend has not attached enrichment (older build) or when the
 * code is not in the knowledge base.
 */
export function EnrichedFaultCodeRow({ code }: EnrichedFaultCodeRowProps) {
  const enrichment = readEnrichment(code);
  const statusClass =
    code.status === 'ACTIVE'
      ? 'bg-red-100 text-red-700'
      : code.status === 'PENDING'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-700';

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm font-medium text-slate-700">
          {code.code}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
        >
          {code.status}
        </span>
        {enrichment && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${systemBadgeClass(enrichment.system as string | undefined)}`}
          >
            {enrichment.system ?? 'UNKNOWN'}
          </span>
        )}
        {enrichment && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityBadgeClass(enrichment.severity as string | undefined)}`}
          >
            Severity: {enrichment.severity ?? 'UNKNOWN'}
          </span>
        )}
        {code.ecu && (
          <span className="text-xs text-slate-500">ECU: {code.ecu}</span>
        )}
      </div>

      <div className="flex flex-col items-start gap-1 sm:items-end">
        {enrichment && enrichment.hasDescription ? (
          <>
            <span className="text-sm font-medium text-slate-900">
              {enrichment.title}
            </span>
            {enrichment.description &&
              enrichment.description !== enrichment.title && (
                <span className="max-w-md text-xs text-slate-600">
                  {enrichment.description}
                </span>
              )}
          </>
        ) : (
          <span className="text-xs italic text-slate-400">
            No description available
          </span>
        )}
        <span className="text-xs text-slate-400">
          {new Date(code.importedAt).toLocaleString()}
        </span>
      </div>
    </li>
  );
}
