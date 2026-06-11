'use client';

import { useEffect, useState } from 'react';
import {
  useLiveDataCurrent,
  useStartLiveData,
  useStopLiveData,
  LiveDataReading,
} from '../../hooks/useLiveData';
import { useAgentStatus } from '../../hooks/useAgentStatus';

interface LiveDataCardProps {
  diagnosticSessionId: string;
}

interface PidRowSpec {
  shortName: string;
  label: string;
  unit: string;
  format: (value: number) => string;
}

const MVP_PID_ROWS: PidRowSpec[] = [
  {
    shortName: 'rpm',
    label: 'Engine RPM',
    unit: 'rpm',
    format: (v) => v.toFixed(0),
  },
  {
    shortName: 'speed',
    label: 'Vehicle Speed',
    unit: 'km/h',
    format: (v) => v.toFixed(0),
  },
  {
    shortName: 'coolantTemp',
    label: 'Coolant Temperature',
    unit: '°C',
    format: (v) => v.toFixed(0),
  },
  {
    shortName: 'batteryVoltage',
    label: 'Battery Voltage',
    unit: 'V',
    format: (v) => v.toFixed(1),
  },
  {
    shortName: 'throttlePosition',
    label: 'Throttle Position',
    unit: '%',
    format: (v) => v.toFixed(0),
  },
  {
    shortName: 'engineLoad',
    label: 'Engine Load',
    unit: '%',
    format: (v) => v.toFixed(0),
  },
];

function formatRow(reading: LiveDataReading | undefined, spec: PidRowSpec): string {
  if (!reading) return '—';
  if (reading.status !== 'OK' || reading.value === null) {
    return reading.status === 'NO_DATA'
      ? 'No data'
      : reading.status === 'NOT_SUPPORTED'
        ? 'N/A'
        : 'Error';
  }
  return spec.format(reading.value);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return date.toLocaleTimeString();
}

export function LiveDataCard({ diagnosticSessionId }: LiveDataCardProps) {
  const agentsQuery = useAgentStatus();
  const currentQuery = useLiveDataCurrent(diagnosticSessionId, {
    refetchIntervalMs: 1000,
  });
  const startMutation = useStartLiveData();
  const stopMutation = useStopLiveData();

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Auto-pick the first ONLINE agent once agents have loaded.
  useEffect(() => {
    if (selectedAgentId) return;
    const onlineAgent = agentsQuery.data?.find((a) => a.status === 'ONLINE');
    if (onlineAgent) {
      setSelectedAgentId(onlineAgent.id);
    }
  }, [agentsQuery.data, selectedAgentId]);

  const current = currentQuery.data;
  const isActive = current?.status === 'ACTIVE';
  const hasAnyAgent = (agentsQuery.data?.length ?? 0) > 0;

  const handleStart = async () => {
    if (!selectedAgentId) return;
    try {
      await startMutation.mutateAsync({
        diagnosticSessionId,
        agentId: selectedAgentId,
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

  // ---- Render: not started (initial) -----------------------------------
  if (!isActive && !current && !startMutation.isPending) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Live Data</h2>
            <p className="mt-1 text-sm text-slate-500">
              Read real-time sensor values from the vehicle through your paired Desktop Agent.
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Not started
          </span>
        </header>

        <div className="mt-6 space-y-4">
          {agentsQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading agent…</p>
          ) : !hasAnyAgent ? (
            <p className="text-sm text-amber-700">
              No Desktop Agent is paired. Pair an agent before starting live data.
            </p>
          ) : (
            <div>
              <label
                htmlFor="live-data-agent"
                className="block text-sm font-medium text-slate-700"
              >
                Agent
              </label>
              <select
                id="live-data-agent"
                value={selectedAgentId ?? ''}
                onChange={(event) => setSelectedAgentId(event.target.value || null)}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select an agent</option>
                {agentsQuery.data?.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name || 'Unnamed Agent'} — {agent.status}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleStart}
            disabled={!selectedAgentId || startMutation.isPending}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Start Live Data
          </button>

          {startMutation.error && (
            <p className="text-sm text-red-600">
              {startMutation.error instanceof Error
                ? startMutation.error.message
                : 'Unable to start live data.'}
            </p>
          )}
        </div>
      </section>
    );
  }

  // ---- Render: starting -------------------------------------------------
  if (startMutation.isPending && !isActive) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Live Data</h2>
        <p className="mt-4 text-sm text-slate-500">Starting live data…</p>
      </section>
    );
  }

  // ---- Render: active / stopped ----------------------------------------
  return (
    <section
      data-testid="live-data-card"
      data-status={current?.status ?? 'UNKNOWN'}
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Live Data</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cadence {current?.cadenceMs ?? 1000} ms · last updated{' '}
            {formatTimestamp(current?.lastActivityAt)}
          </p>
        </div>
        <span
          className={
            isActive
              ? 'inline-flex w-fit items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700'
              : 'inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700'
          }
        >
          {current?.status ?? 'UNKNOWN'}
        </span>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {MVP_PID_ROWS.map((row) => {
          const reading = current?.values?.[row.shortName];
          return (
            <div
              key={row.shortName}
              data-testid={`live-pid-${row.shortName}`}
              className="rounded-lg border border-slate-100 bg-slate-50 p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {row.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {formatRow(reading, row)}
                {reading?.status === 'OK' && reading.value !== null && (
                  <span className="ml-1 text-sm font-normal text-slate-500">
                    {row.unit}
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        {isActive ? (
          <button
            type="button"
            onClick={handleStop}
            disabled={stopMutation.isPending}
            className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {stopMutation.isPending ? 'Stopping…' : 'Stop Live Data'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            disabled={!selectedAgentId || startMutation.isPending}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Start Live Data
          </button>
        )}

        {(startMutation.error || stopMutation.error) && (
          <p className="text-sm text-red-600">
            {(startMutation.error || stopMutation.error) instanceof Error
              ? ((startMutation.error || stopMutation.error) as Error).message
              : 'Live data operation failed.'}
          </p>
        )}
      </div>
    </section>
  );
}
