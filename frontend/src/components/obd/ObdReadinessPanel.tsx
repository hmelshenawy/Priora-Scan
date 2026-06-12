'use client';

import { CheckCircle, Circle, Radio, Usb } from 'lucide-react';
import type { AgentStatus } from '../../hooks/useAgentStatus';

interface ObdReadinessPanelProps {
  agents?: AgentStatus[];
  isLoading?: boolean;
}

function ReadinessRow({
  ready,
  label,
  detail,
}: {
  ready: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      {ready ? (
        <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-600" />
      ) : (
        <Circle className="mt-0.5 h-5 w-5 text-slate-400" />
      )}
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

export function ObdReadinessPanel({
  agents,
  isLoading,
}: ObdReadinessPanelProps) {
  const hasAgent = (agents?.length ?? 0) > 0;
  const onlineAgent = agents?.find((agent) => agent.status === 'ONLINE');
  const adapterConnected = onlineAgent?.adapterConnected ?? false;

  if (isLoading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Scan Readiness</h2>
        <p className="mt-2 text-sm text-slate-500">Checking agent status...</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-blue-600" />
        <h2 className="text-base font-semibold text-slate-900">
          Scan Readiness
        </h2>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Complete these checks before starting an OBD scan.
      </p>

      <div className="mt-4 space-y-3">
        <ReadinessRow
          ready={hasAgent}
          label="Desktop Agent paired"
          detail={
            hasAgent
              ? `${agents?.[0]?.name || 'Agent'} is registered.`
              : 'Pair a Desktop Agent from this dashboard.'
          }
        />
        <ReadinessRow
          ready={!!onlineAgent}
          label="Agent online"
          detail={
            onlineAgent
              ? `${onlineAgent.name || 'Agent'} is online.`
              : 'Start the Desktop Agent and wait for heartbeat.'
          }
        />
        <ReadinessRow
          ready={adapterConnected}
          label="Adapter connected"
          detail={
            adapterConnected
              ? 'The OBD adapter is connected.'
              : 'Connect the OBD adapter before scanning.'
          }
        />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-800">
        <Usb className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          Generic OBD scans read emissions and powertrain data through the
          paired agent.
        </p>
      </div>
    </section>
  );
}
