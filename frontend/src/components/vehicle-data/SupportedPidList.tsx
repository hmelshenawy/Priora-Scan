'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Cpu } from 'lucide-react';

interface SupportedPidListProps {
  pids: {
    '01': string[];
    '09': string[];
  } | undefined;
}

const MODE_LABELS: Record<string, string> = {
  '01': 'Mode 01 — Standard Data',
  '09': 'Mode 09 — Vehicle Information',
};

// Local PID name map keyed by "mode:pid" to avoid cross-mode collisions.
// Falls back to "PID $hex" for unknown PIDs.
const PID_NAMES: Record<string, string> = {
  // Mode 01 — Standard Data PIDs
  '01:00': 'Supported PIDs [01-20]',
  '01:01': 'DTC & Readiness Monitors',
  '01:03': 'Fuel System Status',
  '01:04': 'Calculated Engine Load',
  '01:05': 'Engine Coolant Temperature',
  '01:06': 'Short Term Fuel Trim (B1)',
  '01:07': 'Long Term Fuel Trim (B1)',
  '01:0A': 'Fuel Pressure',
  '01:0B': 'Intake Manifold Pressure',
  '01:0C': 'Engine RPM',
  '01:0D': 'Vehicle Speed',
  '01:0E': 'Timing Advance',
  '01:0F': 'Intake Air Temperature',
  '01:10': 'MAF Air Flow Rate',
  '01:11': 'Throttle Position',
  '01:13': 'Oxygen Sensors Present',
  '01:14': 'Oxygen Sensor 1',
  '01:15': 'Oxygen Sensor 2',
  '01:1C': 'OBD Standards Conformance',
  '01:1F': 'Engine Run Time',
  '01:20': 'Supported PIDs [21-40]',
  '01:21': 'Distance Traveled with MIL On',
  '01:22': 'Fuel Rail Pressure (Relative)',
  '01:23': 'Fuel Rail Pressure (Diesel)',
  '01:2C': 'Warm-Ups Since DTC Clear',
  '01:2D': 'Distance Since DTC Clear',
  '01:2F': 'Fuel Level Input',
  '01:30': 'Warm-Ups Since DTC Clear',
  '01:31': 'Distance Since DTC Clear',
  '01:33': 'Barometric Pressure',
  '01:3C': 'Monitor Status (OBD Requirements)',
  '01:3D': 'Engine Control Module Voltage',
  '01:3E': 'Absolute Load Value',
  '01:3F': 'Command Equivalence Ratio',
  '01:40': 'Supported PIDs [41-60]',
  '01:42': 'Control Module Voltage',
  '01:43': 'Absolute Load Value',
  '01:44': 'Command Equivalence Ratio',
  '01:45': 'Relative Throttle Position',
  '01:46': 'Ambient Air Temperature',
  '01:4D': 'Time Run with MIL On',
  '01:4E': 'Time Since DTC Clear',
  // Mode 09 — Vehicle Information PIDs
  '09:00': 'Supported PIDs',
  '09:01': 'VIN Message Count',
  '09:02': 'VIN',
  '09:03': 'Calibration ID',
  '09:04': 'Calibration Verification Number',
  '09:06': 'In-Use Performance Tracking (A)',
  '09:07': 'In-Use Performance Tracking (B)',
  '09:0A': 'ECU Name',
};

function getPidName(mode: string, pid: string): string | null {
  return PID_NAMES[`${mode}:${pid}`] ?? null;
}

/**
 * Expandable section listing supported PIDs grouped by mode.
 * Each PID shows its hex code and a human-readable name resolved
 * from a local map (matching Feature 006's PIDDefinition names).
 */
export function SupportedPidList({ pids }: SupportedPidListProps) {
  const [expanded, setExpanded] = useState(false);

  if (!pids) return null;

  const totalPids = Object.values(pids).reduce(
    (sum, list) => sum + list.length,
    0,
  );

  if (totalPids === 0) return null;

  return (
    <div className="rounded-md border border-slate-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-slate-500" />
          Supported PIDs
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {totalPids}
          </span>
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-3 py-3">
          {Object.entries(pids).map(([mode, pidList]) =>
            pidList.length === 0 ? null : (
              <div key={mode} className="mb-3 last:mb-0">
                <div className="mb-1.5 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {MODE_LABELS[mode] ?? `Mode ${mode}`}
                  </h4>
                  <span className="text-xs text-slate-400">
                    {pidList.length} PID{pidList.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pidList.map((pid) => {
                    const name = getPidName(mode, pid);
                    return (
                      <span
                        key={`${mode}-${pid}`}
                        className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
                        title={name ?? `PID ${pid}`}
                      >
                        <code className="mr-1 font-mono">{pid}</code>
                        {name && (
                          <span className="text-blue-500">• {name}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}