'use client';

import { useScanResults } from '../../hooks/useObdScan';
import { EnrichedFaultCodeRow } from './EnrichedFaultCodeRow';

interface FaultCodeListProps {
  scanJobId: string | null;
}

export function FaultCodeList({ scanJobId }: FaultCodeListProps) {
  const { data, isLoading, isError } = useScanResults(scanJobId);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading fault codes…</p>
      </div>
    );
  }

  if (isError || !data || data.data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Fault Codes</h2>
        <p className="mt-2 text-sm text-slate-500">No fault codes imported yet.</p>
      </div>
    );
  }

  const grouped = data.data.reduce<Record<string, typeof data.data>>(
    (acc, code) => {
      const key = code.ecu || 'Unknown ECU';
      if (!acc[key]) acc[key] = [];
      acc[key].push(code);
      return acc;
    },
    {},
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Fault Codes</h2>
      <p className="mt-1 text-sm text-slate-500">
        {data.data.length} code{data.data.length !== 1 ? 's' : ''} imported
      </p>

      <div className="mt-4 space-y-4">
        {Object.entries(grouped).map(([ecu, codes]) => (
          <div key={ecu}>
            <h3 className="text-sm font-semibold text-slate-700">{ecu}</h3>
            <ul className="mt-2 divide-y divide-slate-100">
              {codes.map((code) => (
                <EnrichedFaultCodeRow key={code.id} code={code} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
