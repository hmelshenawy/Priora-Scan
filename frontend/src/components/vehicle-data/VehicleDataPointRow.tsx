'use client';

import { VehicleDataPoint } from '../../services/vehicle-data-api';

interface VehicleDataPointRowProps {
  label: string;
  data: VehicleDataPoint | undefined;
  icon?: React.ReactNode;
}

/**
 * Renders a single vehicle data point row.
 * Shows the decoded value + unit when supported,
 * or "Not supported by vehicle / adapter" when unsupported.
 */
export function VehicleDataPointRow({ label, data, icon }: VehicleDataPointRowProps) {
  if (!data) {
    return (
      <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          {icon}
          {label}
        </span>
        <span className="text-sm text-slate-400">—</span>
      </div>
    );
  }

  const isSupported = data.supported;
  const displayValue = isSupported
    ? formatValue(data.value, data.unit)
    : null;

  return (
    <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
        {icon}
        {label}
      </span>
      {isSupported ? (
        <span className="text-sm font-semibold text-slate-900">
          {displayValue}
        </span>
      ) : (
        <span className="text-xs italic text-slate-400">
          Not supported by vehicle / adapter
        </span>
      )}
    </div>
  );
}

function formatValue(
  value: string | number | Record<string, unknown> | unknown[] | null,
  unit?: string,
): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(1);
    return unit ? `${formatted} ${unit}` : formatted;
  }
  if (typeof value === 'string') {
    return unit ? `${value} ${unit}` : value;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}