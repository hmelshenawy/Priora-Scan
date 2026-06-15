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
  Wind,
} from 'lucide-react';
import { useVehicleData, useReadVehicleData } from '../../services/vehicle-data-api';
import type { VehicleDataJson, ExtendedPidDataPoint } from '../../services/vehicle-data-api';
import type { Vehicle } from '../../hooks/use-vehicles';
import { VehicleDataPointRow } from './VehicleDataPointRow';
import { SupportedPidList } from './SupportedPidList';
import { LoadingState } from '../ui/LoadingState';

interface VehicleHealthPanelProps {
  sessionId: string;
  /** Whether the session is open (not closed). */
  isSessionOpen?: boolean;
  /** Whether an adapter is connected (from live data or agent status). */
  isAdapterConnected?: boolean;
  vehicle?: Vehicle;
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
  vehicle,
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
        <LoadingState title="Loading vehicle data" message="Fetching vehicle health information." />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Vehicle Health</h2>
        {readAt && (
          <span className="text-xs text-slate-400">
            Read at {new Date(readAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {vehicle && (
        <dl className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
          <VehicleIdentityDetail label="VIN" value={vehicle.vin} mono />
          <VehicleIdentityDetail label="Make" value={vehicle.make} />
          <VehicleIdentityDetail label="Model" value={vehicle.model} />
          <VehicleIdentityDetail label="Year" value={vehicle.year.toString()} />
          <VehicleIdentityDetail label="Engine" value={vehicle.engine} />
          <VehicleIdentityDetail label="Body Style" value={vehicle.bodyStyle} />
        </dl>
      )}

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

          {/* Fuel & Air Data — extended PIDs (Feature 018B) */}
          <FuelAndAirDataCard vehicleData={vehicleData} />

          {/* Readiness Monitors — special rendering */}
          {vehicleData.readinessMonitors && (
            <ReadinessMonitorsRow data={vehicleData.readinessMonitors} />
          )}

          {vehicleData.freezeFrame && (
            <FreezeFrameCard freezeFrame={vehicleData.freezeFrame} />
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

function FreezeFrameCard({
  freezeFrame,
}: {
  freezeFrame: NonNullable<VehicleDataJson['freezeFrame']>;
}) {
  if (!freezeFrame.supported) {
    return (
      <div className="rounded-md bg-slate-50 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Gauge className="h-4 w-4 text-indigo-500" />
          Freeze Frame
        </span>
        <p className="mt-1 text-xs italic text-slate-400">
          Freeze frame not supported or unavailable
        </p>
      </div>
    );
  }

  if (!freezeFrame.available) {
    return (
      <div className="rounded-md bg-slate-50 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Gauge className="h-4 w-4 text-indigo-500" />
          Freeze Frame
        </span>
        <p className="mt-1 text-xs italic text-slate-400">No freeze frame stored</p>
      </div>
    );
  }

  const value = freezeFrame.value ?? {};

  return (
    <div className="rounded-md bg-slate-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Gauge className="h-4 w-4 text-indigo-500" />
          Freeze Frame
        </span>
        {value.dtc && (
          <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
            {value.dtc}
          </span>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <FreezeFrameMetric label="RPM" value={formatFreezeFrameValue(value.rpm, 'rpm')} />
        <FreezeFrameMetric label="Speed" value={formatFreezeFrameValue(value.speed, 'km/h')} />
        <FreezeFrameMetric
          label="Coolant"
          value={formatFreezeFrameValue(value.coolantTemperature, '°C')}
        />
        <FreezeFrameMetric
          label="Engine Load"
          value={formatFreezeFrameValue(value.engineLoad, '%')}
        />
      </dl>
    </div>
  );
}

function FreezeFrameMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function formatFreezeFrameValue(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined) {
    return '—';
  }
  return `${value} ${unit}`;
}

function VehicleIdentityDetail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </dd>
    </div>
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
        <span className="text-xs italic text-slate-400">Not supported by vehicle / adapter</span>
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
              <span className="text-slate-600">{MONITOR_LABELS[key] ?? key}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fuel & Air Data — Extended PID section (Feature 018B)
// ---------------------------------------------------------------------------

/**
 * getFuelTrimHint — classifies fuel trim values into deterministic categories.
 *
 * Rules:
 *   -10% to +10% → "Normal"
 *   Above +10%    → "Lean Tendency"
 *   Below -10%    → "Rich Tendency"
 *   null/undefined → null (no badge shown)
 *
 * No diagnosis, no repair recommendations, no AI language.
 */
function getFuelTrimHint(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value > 10) return 'Lean Tendency';
  if (value < -10) return 'Rich Tendency';
  return 'Normal';
}

/**
 * Badge color classes for each fuel trim hint.
 */
const TRIM_HINT_BADGE: Record<string, string> = {
  Normal: 'bg-emerald-100 text-emerald-700',
  'Lean Tendency': 'bg-amber-100 text-amber-700',
  'Rich Tendency': 'bg-red-100 text-red-700',
};

/**
 * ExtendedPidRow — renders a single extended PID data point.
 *
 * State handling:
 * 1. Discovery failure (supported=false, reason="PID_DISCOVERY_FAILED") → "Not Available"
 * 2. Unsupported (supported=false) → "Not Supported"
 * 3. Supported + Unavailable (supported=true, available=false) → "No Data"
 * 4. Supported + Available → show value + unit, optional fuel trim hint badge
 */
function ExtendedPidRow({
  label,
  data,
  icon,
  showTrimHint,
}: {
  label: string;
  data: ExtendedPidDataPoint;
  icon?: React.ReactNode;
  showTrimHint?: boolean;
}) {
  // Discovery failure — PID discovery did not succeed for this vehicle
  if (!data.supported && data.reason === 'PID_DISCOVERY_FAILED') {
    return (
      <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          {icon}
          {label}
        </span>
        <span className="text-xs italic text-slate-400">Not Available</span>
      </div>
    );
  }

  // Unsupported PID — not in the vehicle's supported PID bitmap
  if (!data.supported) {
    return (
      <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          {icon}
          {label}
        </span>
        <span className="text-xs italic text-slate-400">Not Supported</span>
      </div>
    );
  }

  // Supported but no data available
  if (!data.available) {
    return (
      <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          {icon}
          {label}
        </span>
        <span className="text-xs italic text-slate-400">No Data</span>
      </div>
    );
  }

  // Supported and available — show value with unit
  const formattedValue =
    data.value !== null && data.value !== undefined
      ? `${Number.isInteger(data.value) ? data.value : data.value.toFixed(1)} ${data.unit}`
      : '—';

  const trimHint = showTrimHint ? getFuelTrimHint(data.value) : null;

  return (
    <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{formattedValue}</span>
        {trimHint && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TRIM_HINT_BADGE[trimHint] ?? 'bg-slate-100 text-slate-600'}`}
          >
            {trimHint}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * FuelAndAirDataCard — renders the "Fuel & Air Data" section.
 *
 * Displays STFT Bank 1, LTFT Bank 1, STFT Bank 2, LTFT Bank 2,
 * MAP, MAF, and Throttle Position with fuel trim hints.
 *
 * Only renders when at least one extended PID field exists in the data.
 * For pre-018B sessions with no extended fields, the section is hidden entirely.
 */
function FuelAndAirDataCard({ vehicleData }: { vehicleData: VehicleDataJson }) {
  const EXTENDED_PID_FIELDS = [
    'stftBank1',
    'ltftBank1',
    'stftBank2',
    'ltftBank2',
    'map',
    'maf',
    'throttlePosition',
  ] as const;

  // Don't render section at all for pre-018B data
  const hasAnyExtendedField = EXTENDED_PID_FIELDS.some(
    (field) => vehicleData[field] !== undefined,
  );
  if (!hasAnyExtendedField) return null;

  return (
    <div className="rounded-md bg-slate-50 px-3 py-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Wind className="h-4 w-4 text-teal-500" />
        Fuel &amp; Air Data
      </h3>
      <div className="mt-2 space-y-1.5">
        {vehicleData.stftBank1 && (
          <ExtendedPidRow
            label="STFT Bank 1"
            data={vehicleData.stftBank1}
            icon={<Fuel className="h-4 w-4 text-green-500" />}
            showTrimHint
          />
        )}
        {vehicleData.ltftBank1 && (
          <ExtendedPidRow
            label="LTFT Bank 1"
            data={vehicleData.ltftBank1}
            icon={<Fuel className="h-4 w-4 text-green-600" />}
            showTrimHint
          />
        )}
        {vehicleData.stftBank2 && (
          <ExtendedPidRow
            label="STFT Bank 2"
            data={vehicleData.stftBank2}
            icon={<Fuel className="h-4 w-4 text-green-500" />}
            showTrimHint
          />
        )}
        {vehicleData.ltftBank2 && (
          <ExtendedPidRow
            label="LTFT Bank 2"
            data={vehicleData.ltftBank2}
            icon={<Fuel className="h-4 w-4 text-green-600" />}
            showTrimHint
          />
        )}
        {vehicleData.map && (
          <ExtendedPidRow
            label="MAP"
            data={vehicleData.map}
            icon={<Gauge className="h-4 w-4 text-sky-500" />}
          />
        )}
        {vehicleData.maf && (
          <ExtendedPidRow
            label="MAF"
            data={vehicleData.maf}
            icon={<Wind className="h-4 w-4 text-cyan-500" />}
          />
        )}
        {vehicleData.throttlePosition && (
          <ExtendedPidRow
            label="Throttle Position"
            data={vehicleData.throttlePosition}
            icon={<Gauge className="h-4 w-4 text-orange-500" />}
          />
        )}
      </div>
    </div>
  );
}
