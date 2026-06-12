'use client';

import { Activity } from 'lucide-react';

export function ScanEmptyState() {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <Activity className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">
        Ready for a diagnostic scan
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
        Confirm the Desktop Agent is online, connect the OBD adapter, then start
        a scan. Results will appear here as a control unit overview.
      </p>
    </section>
  );
}
