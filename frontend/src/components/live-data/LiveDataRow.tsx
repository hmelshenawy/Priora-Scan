'use client';

import type { LiveDataReading } from '../../hooks/useLiveData';
import type { PidRowSpec } from './live-data-format';
import { formatReading } from './live-data-format';

interface LiveDataRowProps {
  spec: PidRowSpec;
  reading?: LiveDataReading;
}

export function LiveDataRow({ spec, reading }: LiveDataRowProps) {
  const hasValue = reading?.status === 'OK' && reading.value !== null;

  return (
    <div
      data-testid={`live-pid-${spec.shortName}`}
      className="rounded-lg border border-slate-100 bg-slate-50 p-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {spec.label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">
        {formatReading(reading, spec)}
        {hasValue && (
          <span className="ml-1 text-sm font-normal text-slate-500">
            {spec.unit}
          </span>
        )}
      </p>
      {reading?.status === 'ERROR' && reading.errorCode && (
        <p className="mt-1 text-xs text-red-600">{reading.errorCode}</p>
      )}
    </div>
  );
}
