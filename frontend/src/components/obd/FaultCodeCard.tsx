'use client';

import { FaultCode } from '@/hooks/useObdScan';
import {
  readEnrichment,
  severityBadgeClass,
  systemBadgeClass,
} from '@/lib/fault-codes';

interface FaultCodeCardProps {
  code: FaultCode;
}

/**
 * Renders a single fault code with enriched intelligence fields.
 * Used inside ControlUnitCard to display individual faults.
 *
 * Reuses badge helpers from fault-codes.ts for consistency with
 * EnrichedFaultCodeRow.
 */
export function FaultCodeCard({ code }: FaultCodeCardProps) {
  const enrichment = readEnrichment(code);

  const statusLabel =
    code.status === 'PERMANENT' ? 'STORED' : code.status;

  const statusClass =
    code.status === 'ACTIVE'
      ? 'bg-red-100 text-red-700'
      : code.status === 'PENDING'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-700';

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
      {/* Left: badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm font-semibold text-slate-800">
          {code.code}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
        >
          {statusLabel}
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
            {enrichment.severity ?? 'UNKNOWN'}
          </span>
        )}
      </div>

      {/* Right: title + description */}
      <div className="flex flex-col items-start gap-0.5 sm:items-end sm:text-right">
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
      </div>
    </div>
  );
}