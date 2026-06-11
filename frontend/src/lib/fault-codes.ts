/**
 * Client-side helpers for Fault Code Intelligence.
 *
 * The backend produces enriched fault codes (MasterFaultCode joined with
 * the runtime SessionFaultCode row). For Feature 005, the existing
 * session-detail and scan-results endpoints attach the enriched payload
 * server-side; the helpers below are used by the UI to render the
 * payload and to gracefully handle the case where the backend is on an
 * older build (no enrichment fields) or where the code is not in the
 * knowledge base.
 *
 * All fields are optional on the client type because the server may
 * return either the enriched or the raw shape depending on rollout.
 */

export type FaultSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export type FaultCodeSystem =
  | 'POWERTRAIN'
  | 'BODY'
  | 'CHASSIS'
  | 'NETWORK'
  | 'UNKNOWN';

export interface EnrichedFaultCode {
  code: string;
  title: string | null;
  description: string | null;
  system?: FaultCodeSystem | string;
  severity?: FaultSeverity | string;
  commonCauses?: string[];
  recommendedChecks?: string[];
  isGeneric?: boolean;
  manufacturer?: string | null;
  source?: string | null;
  hasDescription?: boolean;
}

/** Backwards-compatible read of an enriched payload from any source. */
export function readEnrichment(input: unknown): EnrichedFaultCode | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  if (typeof row.code !== 'string') return null;
  return {
    code: row.code,
    title: typeof row.title === 'string' ? row.title : null,
    description: typeof row.description === 'string' ? row.description : null,
    system: (row.system as string | undefined) ?? 'UNKNOWN',
    severity: (row.severity as string | undefined) ?? 'UNKNOWN',
    commonCauses: Array.isArray(row.commonCauses)
      ? (row.commonCauses as string[])
      : [],
    recommendedChecks: Array.isArray(row.recommendedChecks)
      ? (row.recommendedChecks as string[])
      : [],
    isGeneric: row.isGeneric === undefined ? undefined : Boolean(row.isGeneric),
    manufacturer:
      row.manufacturer === null || row.manufacturer === undefined
        ? null
        : String(row.manufacturer),
    source:
      row.source === null || row.source === undefined
        ? null
        : String(row.source),
    hasDescription:
      typeof row.hasDescription === 'boolean'
        ? row.hasDescription
        : typeof row.title === 'string' && row.title.length > 0,
  };
}

const SEVERITY_BADGES: Record<string, string> = {
  LOW: 'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
  UNKNOWN: 'bg-slate-100 text-slate-700',
};

const SYSTEM_BADGES: Record<string, string> = {
  POWERTRAIN: 'bg-blue-100 text-blue-700',
  BODY: 'bg-purple-100 text-purple-700',
  CHASSIS: 'bg-teal-100 text-teal-700',
  NETWORK: 'bg-indigo-100 text-indigo-700',
  UNKNOWN: 'bg-slate-100 text-slate-700',
};

export function severityBadgeClass(severity: string | undefined): string {
  return SEVERITY_BADGES[severity ?? 'UNKNOWN'] ?? SEVERITY_BADGES.UNKNOWN;
}

export function systemBadgeClass(system: string | undefined): string {
  return SYSTEM_BADGES[system ?? 'UNKNOWN'] ?? SYSTEM_BADGES.UNKNOWN;
}
