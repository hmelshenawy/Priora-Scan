'use client';

import {
  Battery,
  Car,
  CheckCircle2,
  Gauge,
  Fuel,
  Activity,
  AlertCircle,
  RotateCw,
} from 'lucide-react';
import {
  useVehicleData,
  useReadVehicleData,
} from '../../services/vehicle-data-api';
import { VehicleDataPointRow } from './VehicleDataPointRow';
import { SupportedPidList } from './SupportedPidList';
import { LoadingState } from '../ui/LoadingState';

interface VehicleHealthPanelProps {
  sessionId: string;
  /** Whether the session is open (not closed). */
  isSessionOpen?: boolean;
  /** Whether an adapter is connected (from live data or agent status). */
  isAdapterConnected?: boolean;
}

/**
 * VehicleHealthPanel — Feature 009 Phase A.
 *
 * Displays one-shot vehicle health data for a Diagnostic Session.
 * When no data has been read yet, shows a "Read Vehicle Data" button.
 * Unsupported PIDs show "Not supported by vehicle / adapter".
 */
export function VehicleHealthPanel({
  sessionId,
  isSessionOpen = true,
  isAdapterConnected = true,
}: VehicleHealthPanelProps) {
  const vehicleDataQuery = useVehicleData(sessionId);
  const readVehicleData = useReadVehicleData();

  const vehicleData = vehicleDataQuery.data?.vehicleData ?? null;
  const readAt = vehicleDataQuery.data?.readAt ?? null;
  const isReading = readVehicleData.isPending;

  const handleRead = async () => {
    try {
      await readVehicleData.mutateAsync(sessionId);
      // The mutation invalidates the vehicle-data query, so data will refetch
    } catch {
      // Error is shown via readVehicleData.error
    }
  };

  // Loading state for initial fetch
  if (vehicleDataQuery.isLoading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <LoadingState
          title="Loading vehicle data"
          message="Fetching vehicle health information."
        />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Vehicle Health
        </h2>
        {readAt && (
          <span className="text-xs text-slate-400">
            Read at {new Date(readAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* No data yet — show read button */}
      {!vehicleData && (
        <div className="mt-4">
          {isReading ? (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <RotateCw className="h-4 w-4 animate-spin" />
              Reading vehicle data…
            </div>
          ) : !isSessionOpen ? (
            <p className="text-sm italic text-slate-400">
              Session is closed. Vehicle data cannot be read.
            </p>
          ) : !isAdapterConnected ? (
            <p className="text-sm italic text-slate-400">
              No adapter connected. Connect an adapter to read vehicle data.
            </p>
          ) : (
            <button
              type="button"
              onClick={handleRead}
              disabled={isReading}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <Activity className="h-4 w-4" />
              Read Vehicle Data
            </button>
          )}
          {readVehicleData.isError && (
            <p className="mt-2 text-sm text-red-600">
              {readVehicleData.error instanceof Error
                ? readVehicleData.error.message
                : 'Failed to start vehicle data read.'}
            </p>
          )}
        </div>
      )}

      {/* Data available — show data points */}
      {vehicleData && (
        <div className="mt-4 space-y-2">
          <VehicleDataPointRow
            label="Battery Voltage"
            data={vehicleData.batteryVoltage}
            icon={<Battery className="h-4 w-4 text-amber-500" />}
          />
          <VehicleDataPointRow
            label="VIN"
            data={vehicleData.vin}
            icon={<Car className="h-4 w-4 text-blue-500" />}
          />
          <VehicleDataPointRow
            label="Fuel System Status"
            data={vehicleData.fuelSystemStatus}
            icon={<Fuel className="h-4 w-4 text-green-500" />}
          />
          <VehicleDataPointRow
            label="Engine Load"
            data={vehicleData.calculatedEngineLoad}
            icon={<Gauge className="h-4 w-4 text-orange-500" />}
          />
          <VehicleDataPointRow
            label="Fuel Level"
            data={vehicleData.fuelLevel}
            icon={<Fuel className="h-4 w-4 text-emerald-500" />}
          />
          <VehicleDataPointRow
            label="Mileage"
            data={vehicleData.mileage}
            icon={<Gauge className="h-4 w-4 text-purple-500" />}
          />

          {/* Readiness Monitors — special rendering */}
          {vehicleData.readinessMonitors && (
            <ReadinessMonitorsRow
              data={vehicleData.readinessMonitors}
            />
          )}

          {/* Re-read button when data already exists */}
          {isSessionOpen && isAdapterConnected && (
            <div className="mt-3 flex items-center gap-3 border-t border-slate-200 pt-3">
              {isReading ? (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <RotateCw className="h-4 w-4 animate-spin" />
                  Reading vehicle data…
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleRead}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Re-read Vehicle Data
                </button>
              )}
              {readVehicleData.isError && (
                <p className="text-sm text-red-600">
                  {readVehicleData.error instanceof Error
                    ? readVehicleData.error.message
                    : 'Failed to start vehicle data read.'}
                </p>
              )}
            </div>
          )}

          {/* Supported PIDs */}
          <div className="mt-3 border-t border-slate-200 pt-3">
            <SupportedPidList pids={vehicleData.supportedPids} />
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Readiness Monitors sub-component
// ---------------------------------------------------------------------------

interface ReadinessMonitorsRowProps {
  data: {
    supported: boolean;
    value: Record<string, { supported: boolean; complete: boolean | null }>;
  };
}

function ReadinessMonitorsRow({ data }: ReadinessMonitorsRowProps) {
  if (!data.supported) {
    return (
      <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Activity className="h-4 w-4 text-cyan-500" />
          Readiness Monitors
        </span>
        <span className="text-xs italic text-slate-400">
          Not supported by vehicle / adapter
        </span>
      </div>
    );
  }

  const monitors = data.value;
  const completeCount = Object.values(monitors).filter(
    (m) => m.supported && m.complete === true,
  ).length;
  const incompleteCount = Object.values(monitors).filter(
    (m) => m.supported && m.complete === false,
  ).length;

  const MONITOR_LABELS: Record<string, string> = {
    misfire: 'Misfire',
    fuelSystem: 'Fuel System',
    components: 'Components',
    catalyst: 'Catalyst',
    heatedCatalyst: 'Heated Catalyst',
    evap: 'EVAP',
    secondaryAir: 'Secondary Air',
    acRefrigerant: 'A/C Refrigerant',
    oxygenSensor: 'O₂ Sensor',
    oxygenSensorHeater: 'O₂ Sensor Heater',
    egrVvt: 'EGR/VVT',
  };

  return (
    <div className="rounded-md bg-slate-50 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Activity className="h-4 w-4 text-cyan-500" />
          Readiness Monitors
        </span>
        <span className="text-xs text-slate-500">
          {completeCount} complete, {incompleteCount} incomplete
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {Object.entries(monitors).map(([key, monitor]) => {
          if (!monitor.supported) return null;
          return (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              {monitor.complete ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              )}
              <span className="text-slate-600">
                {MONITOR_LABELS[key] ?? key}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}