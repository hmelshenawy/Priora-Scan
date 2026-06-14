export interface BuiltInPidDefinition {
  namespace: string;
  mode: string;
  pid: string;
  name: string;
  unit: string;
  formula: string;
  min: string | null;
  max: string | null;
  source: string;
}

export const STD_OBD2_NAMESPACE = 'STD_OBD2';
export const STD_OBD2_MODE_01 = '01';
export const BUILT_IN_MVP_PID_SOURCE = 'built-in-mvp';

export const BUILT_IN_MVP_PIDS: readonly BuiltInPidDefinition[] = [
  {
    namespace: STD_OBD2_NAMESPACE,
    mode: STD_OBD2_MODE_01,
    pid: '0C',
    name: 'Engine RPM',
    unit: 'RPM',
    formula: '(A * 256 + B) / 4',
    min: '0',
    max: '16383.75',
    source: BUILT_IN_MVP_PID_SOURCE,
  },
  {
    namespace: STD_OBD2_NAMESPACE,
    mode: STD_OBD2_MODE_01,
    pid: '0D',
    name: 'Vehicle Speed',
    unit: 'km/h',
    formula: 'A',
    min: '0',
    max: '255',
    source: BUILT_IN_MVP_PID_SOURCE,
  },
  {
    namespace: STD_OBD2_NAMESPACE,
    mode: STD_OBD2_MODE_01,
    pid: '05',
    name: 'Engine Coolant Temperature',
    unit: '°C',
    formula: 'A - 40',
    min: '-40',
    max: '215',
    source: BUILT_IN_MVP_PID_SOURCE,
  },
  {
    namespace: STD_OBD2_NAMESPACE,
    mode: STD_OBD2_MODE_01,
    pid: '42',
    name: 'Control Module Voltage',
    unit: 'V',
    formula: '(A * 256 + B) / 1000',
    min: '0',
    max: '65.535',
    source: BUILT_IN_MVP_PID_SOURCE,
  },
  {
    namespace: STD_OBD2_NAMESPACE,
    mode: STD_OBD2_MODE_01,
    pid: '11',
    name: 'Throttle Position',
    unit: '%',
    formula: 'A * 100 / 255',
    min: '0',
    max: '100',
    source: BUILT_IN_MVP_PID_SOURCE,
  },
  {
    namespace: STD_OBD2_NAMESPACE,
    mode: STD_OBD2_MODE_01,
    pid: '04',
    name: 'Calculated Engine Load',
    unit: '%',
    formula: 'A * 100 / 255',
    min: '0',
    max: '100',
    source: BUILT_IN_MVP_PID_SOURCE,
  },
  {
    namespace: STD_OBD2_NAMESPACE,
    mode: STD_OBD2_MODE_01,
    pid: '06',
    name: 'Short Term Fuel Trim Bank 1',
    unit: '%',
    formula: '(A - 128) * 100 / 128',
    min: '-100',
    max: '99.22',
    source: BUILT_IN_MVP_PID_SOURCE,
  },
  {
    namespace: STD_OBD2_NAMESPACE,
    mode: STD_OBD2_MODE_01,
    pid: '07',
    name: 'Long Term Fuel Trim Bank 1',
    unit: '%',
    formula: '(A - 128) * 100 / 128',
    min: '-100',
    max: '99.22',
    source: BUILT_IN_MVP_PID_SOURCE,
  },
  {
    namespace: STD_OBD2_NAMESPACE,
    mode: STD_OBD2_MODE_01,
    pid: '10',
    name: 'MAF Air Flow',
    unit: 'g/s',
    formula: '(A * 256 + B) / 100',
    min: '0',
    max: '655.35',
    source: BUILT_IN_MVP_PID_SOURCE,
  },
  {
    namespace: STD_OBD2_NAMESPACE,
    mode: STD_OBD2_MODE_01,
    pid: '0F',
    name: 'Intake Air Temperature',
    unit: '°C',
    formula: 'A - 40',
    min: '-40',
    max: '215',
    source: BUILT_IN_MVP_PID_SOURCE,
  },
  {
    namespace: STD_OBD2_NAMESPACE,
    mode: STD_OBD2_MODE_01,
    pid: '14',
    name: 'O2 Sensor Bank 1 Sensor 1 Voltage',
    unit: 'V',
    formula: 'A / 200',
    min: '0',
    max: '1.275',
    source: BUILT_IN_MVP_PID_SOURCE,
  },
];
