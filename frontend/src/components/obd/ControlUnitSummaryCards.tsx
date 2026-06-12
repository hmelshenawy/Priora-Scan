'use client';

import type { ControlUnitSummary } from '@/lib/control-units';
import { AlertTriangle, CheckCircle, Gauge, Lock } from 'lucide-react';

interface ControlUnitSummaryCardsProps {
  summary: ControlUnitSummary;
}

interface SummaryCardData {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accentClass: string;
}

export function ControlUnitSummaryCards({
  summary,
}: ControlUnitSummaryCardsProps) {
  const cards: SummaryCardData[] = [
    {
      label: 'Modules with Faults',
      value: summary.modulesWithFaults,
      icon: <AlertTriangle className="h-5 w-5" />,
      accentClass: summary.modulesWithFaults > 0
        ? 'text-red-600'
        : 'text-emerald-600',
    },
    {
      label: 'Total Fault Codes',
      value: summary.totalFaultCodes,
      icon: <Gauge className="h-5 w-5" />,
      accentClass: summary.totalFaultCodes > 0
        ? 'text-amber-600'
        : 'text-emerald-600',
    },
    {
      label: 'Generic OBD Modules Checked',
      value: summary.genericObdModulesChecked.join(', '),
      icon: <CheckCircle className="h-5 w-5" />,
      accentClass: 'text-blue-600',
    },
    {
      label: 'OEM Diagnostics Required',
      value: summary.oemDiagnosticsRequired,
      icon: <Lock className="h-5 w-5" />,
      accentClass: 'text-amber-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 text-slate-500">
            {card.icon}
            <span className="text-xs font-medium">{card.label}</span>
          </div>
          <div className={`mt-2 text-2xl font-bold ${card.accentClass}`}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}