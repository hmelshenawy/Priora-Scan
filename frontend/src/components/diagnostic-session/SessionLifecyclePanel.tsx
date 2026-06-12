'use client';

import type { DiagnosticSession } from '../../lib/api-client';

interface SessionLifecyclePanelProps {
  session: DiagnosticSession;
  isPending?: boolean;
  onTransition: (status: 'IN_PROGRESS' | 'CLOSED') => void;
}

export function SessionLifecyclePanel({
  session,
  isPending,
  onTransition,
}: SessionLifecyclePanelProps) {
  const isClosed = session.status === 'CLOSED';
  const canStart = session.status === 'OPEN';
  const canClose = session.status === 'IN_PROGRESS';

  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        Lifecycle
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Sessions move from open to in progress, then closed when work is done.
      </p>

      <div className="mt-5 space-y-3">
        {isClosed && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            This session is closed and is read-only.
          </div>
        )}

        {canStart && (
          <button
            type="button"
            onClick={() => onTransition('IN_PROGRESS')}
            disabled={isPending}
            className="w-full rounded-md bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isPending ? 'Updating...' : 'Start session'}
          </button>
        )}

        {canClose && (
          <button
            type="button"
            onClick={() => onTransition('CLOSED')}
            disabled={isPending}
            className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isPending ? 'Updating...' : 'Close session'}
          </button>
        )}
      </div>
    </aside>
  );
}
