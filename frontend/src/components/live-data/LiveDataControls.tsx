'use client';

import type { AgentStatus } from '../../hooks/useAgentStatus';
import type { LiveDataSessionStatus } from '../../hooks/useLiveData';
import { CADENCE_OPTIONS } from './live-data-format';

interface LiveDataControlsProps {
  agents?: AgentStatus[];
  agentsLoading?: boolean;
  selectedAgentId: string | null;
  cadenceMs: number;
  status?: LiveDataSessionStatus;
  isStarting?: boolean;
  isStopping?: boolean;
  onAgentChange: (agentId: string | null) => void;
  onCadenceChange: (cadenceMs: number) => void;
  onStart: () => void;
  onStop: () => void;
}

export function LiveDataControls({
  agents,
  agentsLoading,
  selectedAgentId,
  cadenceMs,
  status,
  isStarting,
  isStopping,
  onAgentChange,
  onCadenceChange,
  onStart,
  onStop,
}: LiveDataControlsProps) {
  const isActive = status === 'ACTIVE';
  const hasAnyAgent = (agents?.length ?? 0) > 0;
  const selectedAgent = agents?.find((agent) => agent.id === selectedAgentId);

  return (
    <div className="space-y-4">
      {agentsLoading ? (
        <p className="text-sm text-slate-500">Loading agent...</p>
      ) : !hasAnyAgent ? (
        <p className="text-sm text-amber-700">
          No Desktop Agent is paired. Pair an agent before starting live data.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
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
              onChange={(event) => onAgentChange(event.target.value || null)}
              disabled={isActive || isStarting}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <option value="">Select an agent</option>
              {agents?.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name || 'Unnamed Agent'} — {agent.status}
                </option>
              ))}
            </select>
            {selectedAgent && (
              <p className="mt-1 text-xs text-slate-500">
                Running through {selectedAgent.name || 'Unnamed Agent'}.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="live-data-cadence"
              className="block text-sm font-medium text-slate-700"
            >
              Cadence
            </label>
            <select
              id="live-data-cadence"
              value={cadenceMs}
              onChange={(event) => onCadenceChange(Number(event.target.value))}
              disabled={isActive || isStarting}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {CADENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {isActive ? (
          <button
            type="button"
            onClick={onStop}
            disabled={isStopping}
            className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isStopping ? 'Stopping...' : 'Stop Live Data'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={!selectedAgentId || isStarting}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {status === 'STOPPED' || status === 'STALE'
              ? isStarting
                ? 'Restarting...'
                : 'Restart Live Data'
              : isStarting
                ? 'Starting...'
                : 'Start Live Data'}
          </button>
        )}
      </div>
    </div>
  );
}
