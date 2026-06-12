'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Lock,
  MinusCircle,
} from 'lucide-react';
import type { ControlUnitResult, ControlUnitStatus } from '@/lib/control-units';
import {
  getControlUnitStatusLabel,
  getControlUnitStatusBadgeClass,
  getControlUnitCardBorderClass,
  getControlUnitCardBgClass,
} from '@/lib/control-units';
import { FaultCodeCard } from './FaultCodeCard';

interface ControlUnitCardProps {
  result: ControlUnitResult;
  defaultExpanded?: boolean;
}

const STATUS_ICONS: Record<ControlUnitStatus, React.ReactNode> = {
  FAULTS_FOUND: <AlertTriangle className="h-4 w-4" />,
  NO_FAULTS: <CheckCircle className="h-4 w-4" />,
  NOT_SCANNED: <MinusCircle className="h-4 w-4" />,
  OEM_DIAGNOSTICS_REQUIRED: <Lock className="h-4 w-4" />,
};

export function ControlUnitCard({
  result,
  defaultExpanded,
}: ControlUnitCardProps) {
  const isExpandedByDefault =
    defaultExpanded ?? result.status === 'FAULTS_FOUND';
  const [isExpanded, setIsExpanded] = useState(isExpandedByDefault);

  const borderClass = getControlUnitCardBorderClass(result.status);
  const bgClass = getControlUnitCardBgClass(result.status);
  const badgeClass = getControlUnitStatusBadgeClass(result.status);
  const label = getControlUnitStatusLabel(result.status);

  const toggleExpanded = () => setIsExpanded((prev) => !prev);

  return (
    <div
      className={`rounded-xl border-2 ${borderClass} ${bgClass} shadow-sm transition-shadow hover:shadow-md`}
    >
      {/* Header — always visible, clickable to expand/collapse */}
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
        aria-controls={`cu-${result.code}-content`}
      >
        <div className="flex items-center gap-3">
          {/* Module code — visually prominent */}
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-800">
            {result.code}
          </span>

          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-slate-900">
              {result.name}
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                aria-label={label}
              >
                {STATUS_ICONS[result.status]}
                {label}
              </span>
              {result.faults.length > 0 && (
                <span className="text-xs font-medium text-slate-600">
                  {result.faults.length}{' '}
                  {result.faults.length === 1 ? 'fault' : 'faults'}
                </span>
              )}
            </div>
          </div>
        </div>

        <span className="text-slate-400">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </span>
      </button>

      {/* Content — expandable */}
      {isExpanded && (
        <div
          id={`cu-${result.code}-content`}
          className="border-t border-slate-100 px-4 pb-4 pt-2"
        >
          {result.status === 'FAULTS_FOUND' && result.faults.length > 0 && (
            <div className="flex flex-col gap-2">
              {result.faults.map((fc) => (
                <FaultCodeCard key={fc.id} code={fc} />
              ))}
            </div>
          )}

          {result.status === 'NO_FAULTS' && result.faults.length === 0 && (
            <div className="flex items-center gap-2 py-2 text-sm text-emerald-700">
              <CheckCircle className="h-4 w-4" />
              No faults detected
            </div>
          )}

          {result.status === 'OEM_DIAGNOSTICS_REQUIRED' && (
            <div className="flex items-center gap-2 py-2 text-sm text-amber-700">
              <Lock className="h-4 w-4" />
              Manufacturer-specific diagnostics required
            </div>
          )}

          {result.status === 'NOT_SCANNED' && (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
              <MinusCircle className="h-4 w-4" />
              Not scanned
            </div>
          )}
        </div>
      )}
    </div>
  );
}