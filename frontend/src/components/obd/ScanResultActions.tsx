'use client';

import Link from 'next/link';

interface ScanResultActionsProps {
  sessionId?: string;
  faultCount: number;
}

export function ScanResultActions({
  sessionId,
  faultCount,
}: ScanResultActionsProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Scan Complete
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {faultCount} {faultCount === 1 ? 'fault code' : 'fault codes'} found.
            Continue in the diagnostic session for notes and live data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sessionId && (
            <>
              <Link
                href={`/diagnostic-sessions/${sessionId}`}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Open Session
              </Link>
              <Link
                href={`/diagnostic-sessions/${sessionId}#live-data`}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Live Data
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
