'use client';

import type { DecodedVehicle, ScanJobStatus } from '../../hooks/useObdScan';

interface ScanProgressTimelineProps {
  status: ScanJobStatus;
  vin?: string;
  decodedVehicle?: DecodedVehicle;
  errorMessage?: string;
}

const stages: { key: ScanJobStatus; label: string }[] = [
  { key: 'PENDING', label: 'Connect Adapter' },
  { key: 'RUNNING', label: 'Read VIN & DTCs' },
  { key: 'NEEDS_VEHICLE_CONFIRMATION', label: 'Confirm Vehicle' },
  { key: 'COMPLETED', label: 'Import Results' },
];

export function ScanProgressTimeline({
  status,
  vin,
  decodedVehicle,
  errorMessage,
}: ScanProgressTimelineProps) {
  const isFailed = status === 'FAILED';
  const isCancelled = status === 'CANCELLED';

  const getStageState = (stageKey: ScanJobStatus) => {
    if (isFailed || isCancelled) {
      return 'failed';
    }

    const order: ScanJobStatus[] = [
      'PENDING',
      'RUNNING',
      'NEEDS_VEHICLE_CONFIRMATION',
      'COMPLETED',
    ];
    const currentIndex = order.indexOf(status);
    const stageIndex = order.indexOf(stageKey);

    if (stageIndex < currentIndex) return 'completed';
    if (stageIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Scan Progress</h2>

      <div className="mt-4 space-y-3">
        {stages.map((stage) => {
          const state = getStageState(stage.key);
          const isActive = state === 'active';
          const isCompleted = state === 'completed';
          const isFailedState = state === 'failed';

          return (
            <div
              key={stage.key}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                isActive
                  ? 'border-blue-200 bg-blue-50'
                  : isCompleted
                    ? 'border-emerald-200 bg-emerald-50'
                    : isFailedState
                      ? 'border-red-200 bg-red-50'
                      : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : isFailedState
                        ? 'bg-red-500 text-white'
                        : 'bg-slate-300 text-slate-600'
                }`}
              >
                {isCompleted ? '✓' : isFailedState ? '✕' : stages.indexOf(stage) + 1}
              </div>
              <p
                className={`text-sm font-medium ${
                  isActive
                    ? 'text-blue-800'
                    : isCompleted
                      ? 'text-emerald-800'
                      : isFailedState
                        ? 'text-red-800'
                        : 'text-slate-500'
                }`}
              >
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>

      {vin && (
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          <p>
            VIN detected: <span className="font-mono font-medium">{vin}</span>
          </p>
          {decodedVehicle ? (
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <VehicleDetail label="Make" value={decodedVehicle.make} />
              <VehicleDetail label="Model" value={decodedVehicle.model} />
              <VehicleDetail label="Year" value={decodedVehicle.year?.toString() ?? null} />
              <VehicleDetail label="Engine" value={decodedVehicle.engine} />
              <VehicleDetail label="Body Style" value={decodedVehicle.bodyStyle} />
            </dl>
          ) : (
            <p className="mt-2 text-amber-700">Vehicle details unavailable.</p>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>
      )}

      {isCancelled && (
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          Scan was cancelled.
        </div>
      )}
    </div>
  );
}

function VehicleDetail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value || '—'}</dd>
    </div>
  );
}
