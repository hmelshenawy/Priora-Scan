'use client';

import { useEffect, useState } from 'react';
import {
  useLiveDataCurrent,
  useStartLiveData,
  useStopLiveData,
} from '../../hooks/useLiveData';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { LiveDataControls } from './LiveDataControls';
import { LiveDataRow } from './LiveDataRow';
import { LiveDataStatusBanner } from './LiveDataStatusBanner';
import {
  formatTimestamp,
  isStaleTimestamp,
  MVP_PID_ROWS,
} from './live-data-format';

interface LiveDataCardProps {
  diagnosticSessionId: string;
}

function statusBadgeClass(status: string | undefined) {
  if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-700';
  if (status === 'STALE') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export function LiveDataCard({ diagnosticSessionId }: LiveDataCardProps) {
  const agentsQuery = useAgentStatus();
  const currentQuery = useLiveDataCurrent(diagnosticSessionId, {
    refetchIntervalMs: 1000,
  });
  const startMutation = useStartLiveData();
  const stopMutation = useStopLiveData();

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [cadenceMs, setCadenceMs] = useState(1000);

  useEffect(() => {
    if (selectedAgentId) return;
    const onlineAgent = agentsQuery.data?.find((agent) => agent.status === 'ONLINE');
    if (onlineAgent) {
      setSelectedAgentId(onlineAgent.id);
    }
  }, [agentsQuery.data, selectedAgentId]);

  const current = currentQuery.data;
  const status = current?.status;
  const isActive = status === 'ACTIVE';
  const effectiveCadenceMs = current?.cadenceMs ?? cadenceMs;
  const sampleIsStale = isActive && isStaleTimestamp(current?.lastActivityAt);
  const operationError = startMutation.error || stopMutation.error;

  const handleStart = async () => {
    if (!selectedAgentId) return;
    try {
      await startMutation.mutateAsync({
        diagnosticSessionId,
        agentId: selectedAgentId,
        cadenceMs,
      });
    } catch {
      /* surfaced via startMutation.error below */
    }
  };

  const handleStop = async () => {
    if (!current?.sessionId) return;
    try {
      await stopMutation.mutateAsync({
        diagnosticSessionId,
        liveDataSessionId: current.sessionId,
      });
    } catch {
      /* surfaced via stopMutation.error below */
    }
  };

  if (startMutation.isPending && !isActive) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Live Data</h2>
        <div className="mt-4">
          <LiveDataStatusBanner status="STARTING" />
        </div>
        <p className="mt-4 text-sm text-slate-500">Starting live data...</p>
      </section>
    );
  }

  return (
    <section
      data-testid="live-data-card"
      data-status={status ?? 'NOT_STARTED'}
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Live Data</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cadence {effectiveCadenceMs} ms · last updated{' '}
            {formatTimestamp(current?.lastActivityAt)}
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(status)}`}
        >
          {status ?? 'Not started'}
        </span>
      </header>

      <div className="mt-5">
        {currentQuery.isError ? (
          <LiveDataStatusBanner status="ERROR" />
        ) : (
          <LiveDataStatusBanner
            status={status ?? 'NOT_STARTED'}
            isFreshnessStale={sampleIsStale}
          />
        )}
      </div>

      <div className="mt-6">
        <LiveDataControls
          agents={agentsQuery.data}
          agentsLoading={agentsQuery.isLoading}
          selectedAgentId={selectedAgentId}
          cadenceMs={cadenceMs}
          status={status}
          isStarting={startMutation.isPending}
          isStopping={stopMutation.isPending}
          onAgentChange={setSelectedAgentId}
          onCadenceChange={setCadenceMs}
          onStart={handleStart}
          onStop={handleStop}
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {MVP_PID_ROWS.map((row) => (
          <LiveDataRow
            key={row.shortName}
            spec={row}
            reading={current?.values?.[row.shortName]}
          />
        ))}
      </div>

      {operationError && (
        <p className="mt-4 text-sm text-red-600">
          {operationError instanceof Error
            ? operationError.message
            : 'Live data operation failed.'}
        </p>
      )}
    </section>
  );
}
