'use client';

import { useScanResults } from '../../hooks/useObdScan';

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
                <li
                  key={code.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm font-medium text-slate-700">
                      {code.code}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        code.status === 'ACTIVE'
                          ? 'bg-red-100 text-red-700'
                          : code.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {code.status}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(code.importedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
