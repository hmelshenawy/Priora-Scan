'use client';

interface ScanRecoveryActionsProps {
  status: 'FAILED' | 'CANCELLED';
  isStarting?: boolean;
  canStart?: boolean;
  onStartNewScan: () => void;
}

export function ScanRecoveryActions({
  status,
  isStarting,
  canStart = true,
  onStartNewScan,
}: ScanRecoveryActionsProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        {status === 'FAILED' ? 'Scan failed' : 'Scan cancelled'}
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        {status === 'FAILED'
          ? 'Check the agent, adapter, and vehicle connection before retrying.'
          : 'You can start a fresh scan when the vehicle is ready.'}
      </p>
      <button
        type="button"
        onClick={onStartNewScan}
        disabled={isStarting || !canStart}
        className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isStarting ? 'Starting...' : 'Start New Scan'}
      </button>
    </section>
  );
}
