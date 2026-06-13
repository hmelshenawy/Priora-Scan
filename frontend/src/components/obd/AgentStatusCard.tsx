'use client';

import { useAgentStatus } from '../../hooks/useAgentStatus';

interface AgentStatusCardProps {
  onPairAgent: () => void;
}

function getAdapterLabel(connectionType?: string): string {
  switch (connectionType) {
    case 'MOCK':
      return 'Mock Adapter';
    case 'WIFI':
      return 'WiFi Adapter';
    case 'USB':
      return 'USB Adapter';
    default:
      return 'Adapter';
  }
}

function getAdapterColor(connectionType?: string): string {
  switch (connectionType) {
    case 'MOCK':
      return 'text-slate-600 bg-slate-50';
    case 'WIFI':
      return 'text-blue-600 bg-blue-50';
    case 'USB':
      return 'text-emerald-600 bg-emerald-50';
    default:
      return 'text-slate-600 bg-slate-50';
  }
}

export function AgentStatusCard({ onPairAgent }: AgentStatusCardProps) {
  const { data: agents, isLoading, isError } = useAgentStatus();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading agent status…</p>
      </div>
    );
  }

  if (isError || !agents || agents.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Desktop Agent</h2>
        <p className="mt-2 text-sm text-slate-500">
          No Desktop Agent is paired. Pair an agent to start OBD scans.
        </p>
        <button
          onClick={onPairAgent}
          className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Pair Agent
        </button>
      </div>
    );
  }

  const agent = agents[0];
  const statusColor =
    agent.status === 'ONLINE'
      ? 'text-emerald-600 bg-emerald-50'
      : agent.status === 'BUSY'
        ? 'text-amber-600 bg-amber-50'
        : 'text-red-600 bg-red-50';

  const adapterLabel = getAdapterLabel(agent.connectionType);
  const adapterColor = getAdapterColor(agent.connectionType);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Desktop Agent</h2>
          <p className="mt-1 text-sm text-slate-500">
            {agent.name || 'Unnamed Agent'} • v{agent.version}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusColor}`}
        >
          {agent.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Last seen</p>
          <p className="mt-1 text-sm text-slate-900">
            {agent.lastSeenAt
              ? new Date(agent.lastSeenAt).toLocaleString()
              : 'Never'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Adapter</p>
          <div className="mt-1 flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                agent.adapterConnected ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            {agent.adapterConnected ? (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${adapterColor}`}
              >
                {adapterLabel} · Connected
              </span>
            ) : (
              <span className="text-sm text-slate-900">
                {adapterLabel} · Disconnected
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}