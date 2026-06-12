import type { LiveDataReading } from '../../hooks/useLiveData';

export interface PidRowSpec {
  shortName: string;
  label: string;
  unit: string;
  format: (value: number) => string;
}

export const MVP_PID_ROWS: PidRowSpec[] = [
  {
    shortName: 'rpm',
    label: 'Engine RPM',
    unit: 'rpm',
    format: (value) => value.toFixed(0),
  },
  {
    shortName: 'speed',
    label: 'Vehicle Speed',
    unit: 'km/h',
    format: (value) => value.toFixed(0),
  },
  {
    shortName: 'coolantTemp',
    label: 'Coolant Temperature',
    unit: '°C',
    format: (value) => value.toFixed(0),
  },
  {
    shortName: 'batteryVoltage',
    label: 'Battery Voltage',
    unit: 'V',
    format: (value) => value.toFixed(1),
  },
  {
    shortName: 'throttlePosition',
    label: 'Throttle Position',
    unit: '%',
    format: (value) => value.toFixed(0),
  },
  {
    shortName: 'engineLoad',
    label: 'Engine Load',
    unit: '%',
    format: (value) => value.toFixed(0),
  },
];

export const CADENCE_OPTIONS = [
  { label: '200 ms', value: 200 },
  { label: '500 ms', value: 500 },
  { label: '1 s', value: 1000 },
  { label: '2 s', value: 2000 },
  { label: '5 s', value: 5000 },
];

export function formatReading(
  reading: LiveDataReading | undefined,
  spec: PidRowSpec,
): string {
  if (!reading) return '—';
  if (reading.status !== 'OK' || reading.value === null) {
    if (reading.status === 'NO_DATA') return 'No data';
    if (reading.status === 'NOT_SUPPORTED') return 'N/A';
    return 'Error';
  }
  return spec.format(reading.value);
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleTimeString();
}

export function isStaleTimestamp(value: string | null | undefined): boolean {
  if (!value) return false;
  return Date.now() - new Date(value).getTime() > 10_000;
}
