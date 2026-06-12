/**
 * Control Unit Overview — types, constants, and grouping helpers.
 *
 * This module is frontend-only. No backend API or database changes.
 * It converts a flat FaultCode[] into grouped ControlUnitResult[]
 * for display in the Control Unit Overview layout.
 *
 * Feature 007: Diagnostic Results UI Polish + Control Unit Overview
 */

import type { FaultCode } from '@/hooks/useObdScan';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status of a control unit in the scan results. */
export type ControlUnitStatus =
  | 'FAULTS_FOUND'
  | 'NO_FAULTS'
  | 'NOT_SCANNED'
  | 'OEM_DIAGNOSTICS_REQUIRED';

/** A known control unit module from the static catalog. */
export interface ControlUnitModule {
  /** Short code (e.g. 'ECM', 'ABS'). */
  code: string;
  /** Full display name (e.g. 'Engine Control Module'). */
  name: string;
  /** Whether generic OBD-II can read faults from this module. */
  group: 'OBD_II' | 'OEM_DIAGNOSTICS';
}

/** A single control unit in the scan results, with its faults grouped. */
export interface ControlUnitResult {
  /** Module short code ('ECM', 'ABS', 'RADAR', 'UNKNOWN', …). */
  code: string;
  /** Full display name. */
  name: string;
  /** Scan status for this module. */
  status: ControlUnitStatus;
  /** Fault codes belonging to this module. */
  faults: FaultCode[];
  /** Whether this module is in the known catalog. */
  isKnown: boolean;
  /** Inherited from the catalog or 'OBD_II' for dynamic cards. */
  group: 'OBD_II' | 'OEM_DIAGNOSTICS';
}

/** Summary statistics for the Control Unit Overview header. */
export interface ControlUnitSummary {
  /** Number of modules with status FAULTS_FOUND. */
  modulesWithFaults: number;
  /** Total fault code count across all modules. */
  totalFaultCodes: number;
  /** ECU codes that generic OBD-II actually checks. */
  genericObdModulesChecked: string[];
  /** Number of modules requiring OEM diagnostics. */
  oemDiagnosticsRequired: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Static catalog of the 8 known vehicle control unit modules.
 *
 * - group 'OBD_II': Generic OBD-II can read faults from these modules.
 * - group 'OEM_DIAGNOSTICS': Manufacturer-specific diagnostics are required.
 */
export const CONTROL_UNIT_MODULES: ControlUnitModule[] = [
  { code: 'ECM', name: 'Engine Control Module', group: 'OBD_II' },
  { code: 'TCM', name: 'Transmission Control Module', group: 'OBD_II' },
  { code: 'ABS', name: 'Anti-lock Brake System', group: 'OEM_DIAGNOSTICS' },
  { code: 'SRS', name: 'Supplemental Restraint System', group: 'OEM_DIAGNOSTICS' },
  { code: 'BCM', name: 'Body Control Module', group: 'OEM_DIAGNOSTICS' },
  { code: 'ESP', name: 'Electronic Stability Program', group: 'OEM_DIAGNOSTICS' },
  { code: 'IC', name: 'Instrument Cluster', group: 'OEM_DIAGNOSTICS' },
  { code: 'HVAC', name: 'Climate Control Module', group: 'OEM_DIAGNOSTICS' },
];

/** Default set of ECU codes that generic OBD-II can scan. */
export const DEFAULT_SCANNED_ECU_CODES = new Set(['ECM', 'TCM']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a ControlUnitStatus to a human-readable label.
 */
export function getControlUnitStatusLabel(
  status: ControlUnitStatus,
): string {
  const labels: Record<ControlUnitStatus, string> = {
    FAULTS_FOUND: 'Faults Found',
    NO_FAULTS: 'No Faults Detected',
    NOT_SCANNED: 'Not Scanned',
    OEM_DIAGNOSTICS_REQUIRED: 'OEM Diagnostics Required',
  };
  return labels[status] ?? status;
}

/**
 * Map a ControlUnitStatus to Tailwind CSS badge classes.
 */
export function getControlUnitStatusBadgeClass(
  status: ControlUnitStatus,
): string {
  const classes: Record<ControlUnitStatus, string> = {
    FAULTS_FOUND: 'bg-red-100 text-red-700',
    NO_FAULTS: 'bg-emerald-100 text-emerald-700',
    NOT_SCANNED: 'bg-slate-100 text-slate-500',
    OEM_DIAGNOSTICS_REQUIRED: 'bg-amber-100 text-amber-700',
  };
  return classes[status] ?? 'bg-slate-100 text-slate-500';
}

/**
 * Map a ControlUnitStatus to a Tailwind border class for the card.
 */
export function getControlUnitCardBorderClass(
  status: ControlUnitStatus,
): string {
  const classes: Record<ControlUnitStatus, string> = {
    FAULTS_FOUND: 'border-red-200',
    NO_FAULTS: 'border-emerald-200',
    NOT_SCANNED: 'border-slate-200',
    OEM_DIAGNOSTICS_REQUIRED: 'border-amber-200',
  };
  return classes[status] ?? 'border-slate-200';
}

/**
 * Map a ControlUnitStatus to a background class for the card body.
 */
export function getControlUnitCardBgClass(
  status: ControlUnitStatus,
): string {
  const classes: Record<ControlUnitStatus, string> = {
    FAULTS_FOUND: 'bg-white',
    NO_FAULTS: 'bg-white',
    NOT_SCANNED: 'bg-slate-50',
    OEM_DIAGNOSTICS_REQUIRED: 'bg-amber-50/30',
  };
  return classes[status] ?? 'bg-white';
}

/**
 * Return the full module name for a known ECU code, or
 * 'Unknown / Unmapped Control Unit' for unrecognized codes.
 */
export function getControlUnitName(ecuCode: string): string {
  const module_ = CONTROL_UNIT_MODULES.find(
    (m) => m.code === ecuCode.toUpperCase(),
  );
  return module_?.name ?? 'Unknown / Unmapped Control Unit';
}

/**
 * Group a flat list of enriched fault codes into ControlUnitResult[]
 * organised for the Control Unit Overview layout.
 *
 * Algorithm:
 * 1. Group fault codes by their ecu field (case-insensitive, fallback 'UNKNOWN').
 * 2. For each known module in CONTROL_UNIT_MODULES:
 *    - OBD_II modules: FAULTS_FOUND if faults exist, else NO_FAULTS if
 *      the module was scanned, else NOT_SCANNED.
 *    - OEM_DIAGNOSTICS modules: FAULTS_FOUND if faults exist, else
 *      OEM_DIAGNOSTICS_REQUIRED.
 * 3. For remaining unmatched ECU codes: create dynamic cards.
 *
 * @param faultCodes  Enriched fault codes from the API.
 * @param scannedEcuCodes  ECU codes that were actually scanned.
 *   Defaults to DEFAULT_SCANNED_ECU_CODES (ECM, TCM).
 */
export function buildControlUnitOverview(
  faultCodes: FaultCode[],
  scannedEcuCodes: Set<string> = DEFAULT_SCANNED_ECU_CODES,
): ControlUnitResult[] {
  // Step 1: group by ecu (case-insensitive), fallback UNKNOWN
  const grouped = new Map<string, FaultCode[]>();

  for (const fc of faultCodes) {
    const key = fc.ecu?.trim().toUpperCase() || 'UNKNOWN';
    const existing = grouped.get(key) ?? [];
    existing.push(fc);
    grouped.set(key, existing);
  }

  const results: ControlUnitResult[] = [];
  const consumed = new Set<string>();

  // Step 2a: OBD_II modules (ECM, TCM)
  const obdModules = CONTROL_UNIT_MODULES.filter(
    (m) => m.group === 'OBD_II',
  );
  for (const mod of obdModules) {
    const faults = grouped.get(mod.code) ?? [];
    let status: ControlUnitStatus;

    if (faults.length > 0) {
      status = 'FAULTS_FOUND';
    } else if (scannedEcuCodes.has(mod.code)) {
      status = 'NO_FAULTS';
    } else {
      status = 'NOT_SCANNED';
    }

    results.push({
      code: mod.code,
      name: mod.name,
      status,
      faults,
      isKnown: true,
      group: mod.group,
    });
    consumed.add(mod.code);
  }

  // Step 2b: OEM_DIAGNOSTICS modules (ABS, SRS, …)
  const oemModules = CONTROL_UNIT_MODULES.filter(
    (m) => m.group === 'OEM_DIAGNOSTICS',
  );
  for (const mod of oemModules) {
    const faults = grouped.get(mod.code) ?? [];
    const status: ControlUnitStatus =
      faults.length > 0 ? 'FAULTS_FOUND' : 'OEM_DIAGNOSTICS_REQUIRED';

    results.push({
      code: mod.code,
      name: mod.name,
      status,
      faults,
      isKnown: true,
      group: mod.group,
    });
    consumed.add(mod.code);
  }

  // Step 3: dynamic cards for unmatched ECU codes
  for (const [ecuCode, faults] of Array.from(grouped.entries())) {
    if (consumed.has(ecuCode)) continue;

    results.push({
      code: ecuCode,
      name: 'Unknown / Unmapped Control Unit',
      status: faults.length > 0 ? 'FAULTS_FOUND' : 'NO_FAULTS',
      faults,
      isKnown: false,
      group: 'OBD_II',
    });
  }

  return results;
}

/**
 * Compute summary statistics from an array of ControlUnitResult.
 */
export function computeControlUnitSummary(
  results: ControlUnitResult[],
): ControlUnitSummary {
  return {
    modulesWithFaults: results.filter((r) => r.status === 'FAULTS_FOUND')
      .length,
    totalFaultCodes: results.reduce((sum, r) => sum + r.faults.length, 0),
    genericObdModulesChecked: Array.from(DEFAULT_SCANNED_ECU_CODES),
    oemDiagnosticsRequired: results.filter(
      (r) => r.status === 'OEM_DIAGNOSTICS_REQUIRED',
    ).length,
  };
}