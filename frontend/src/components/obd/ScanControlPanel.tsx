'use client';

import { useState } from 'react';
import { useAdapterStatus } from '../../hooks/useAdapterStatus';
import { useStartScan } from '../../hooks/useObdScan';

interface ScanControlPanelProps {
  onScanStarted: (scanJobId: string) => void;
}

export function ScanControlPanel({ onScanStarted }: ScanControlPanelProps) {
  const { adapterConnected, isLoading, agent } = useAdapterStatus();
  const startScan = useStartScan();
  const [error, setError] = useState<string | null>(null);

  const canStart = agent?.status === 'ONLINE' && adapterConnected;

  const handleStart = async () => {
    if (!agent) return;
    setError(null);
    try {
      const scan = await startScan.mutateAsync(agent.id);
      onScanStarted(scan.id);
    } catch (err: any) {
      setError(err.message || 'Failed to start scan.');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Scan Control</h2>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              adapterConnected ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
          <p className="text-sm text-slate-700">
            {adapterConnected ? 'Adapter connected' : 'No adapter connected'}
          </p>
        </div>
      </div>

      <button
        onClick={handleStart}
        disabled={!canStart || startScan.isPending || isLoading}
        className="mt-4 w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {startScan.isPending ? 'Starting scan…' : 'Start Scan'}
      </button>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {!canStart && !isLoading && (
        <p className="mt-2 text-xs text-slate-500">
          {agent?.status !== 'ONLINE'
            ? 'Agent must be online to start a scan.'
            : 'Connect an adapter to start a scan.'}
        </p>
      )}
    </div>
  );
}
