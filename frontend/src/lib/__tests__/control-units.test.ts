import {
  buildControlUnitOverview,
  computeControlUnitSummary,
  getControlUnitStatusLabel,
  getControlUnitStatusBadgeClass,
  getControlUnitName,
  CONTROL_UNIT_MODULES,
  DEFAULT_SCANNED_ECU_CODES,
} from '@/lib/control-units';
import type { FaultCode } from '@/hooks/useObdScan';

// ---------------------------------------------------------------------------
// Helpers to create FaultCode test fixtures
// ---------------------------------------------------------------------------

function makeFault(overrides: Partial<FaultCode> = {}): FaultCode {
  return {
    id: 'fc-1',
    code: 'P0301',
    status: 'ACTIVE',
    ecu: 'ECM',
    source: 'OBD_SCAN',
    importedAt: '2026-06-11T12:00:00Z',
    title: 'Cylinder 1 Misfire Detected',
    description: 'Cylinder 1 Misfire Detected',
    system: 'POWERTRAIN',
    severity: 'UNKNOWN',
    hasDescription: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildControlUnitOverview
// ---------------------------------------------------------------------------

describe('buildControlUnitOverview', () => {
  it('returns 8 known modules for an empty fault list', () => {
    const results = buildControlUnitOverview([]);

    expect(results).toHaveLength(8);

    // ECM and TCM should be NO_FAULTS (they are in the scanned set)
    const ecm = results.find((r) => r.code === 'ECM')!;
    expect(ecm.status).toBe('NO_FAULTS');
    expect(ecm.faults).toHaveLength(0);

    const tcm = results.find((r) => r.code === 'TCM')!;
    expect(tcm.status).toBe('NO_FAULTS');

    // OEM modules should be OEM_DIAGNOSTICS_REQUIRED
    const abs = results.find((r) => r.code === 'ABS')!;
    expect(abs.status).toBe('OEM_DIAGNOSTICS_REQUIRED');
    expect(abs.faults).toHaveLength(0);
  });

  it('groups ECM faults correctly', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '1', code: 'P0301', ecu: 'ECM', status: 'ACTIVE' }),
      makeFault({ id: '2', code: 'P0171', ecu: 'ECM', status: 'PENDING' }),
    ];

    const results = buildControlUnitOverview(faults);
    const ecm = results.find((r) => r.code === 'ECM')!;

    expect(ecm.status).toBe('FAULTS_FOUND');
    expect(ecm.faults).toHaveLength(2);
    expect(ecm.faults.map((f) => f.code)).toContain('P0301');
    expect(ecm.faults.map((f) => f.code)).toContain('P0171');
  });

  it('groups TCM faults correctly', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '3', code: 'U0100', ecu: 'TCM', status: 'ACTIVE' }),
    ];

    const results = buildControlUnitOverview(faults);
    const tcm = results.find((r) => r.code === 'TCM')!;

    expect(tcm.status).toBe('FAULTS_FOUND');
    expect(tcm.faults).toHaveLength(1);
    expect(tcm.faults[0].code).toBe('U0100');
  });

  it('renders ECM/TCM as NO_FAULTS when no faults exist', () => {
    const results = buildControlUnitOverview([]);

    const ecm = results.find((r) => r.code === 'ECM')!;
    expect(ecm.status).toBe('NO_FAULTS');

    const tcm = results.find((r) => r.code === 'TCM')!;
    expect(tcm.status).toBe('NO_FAULTS');
  });

  it('renders ABS/SRS/BCM/ESP/IC/HVAC as OEM_DIAGNOSTICS_REQUIRED', () => {
    const results = buildControlUnitOverview([]);

    const oemModules = ['ABS', 'SRS', 'BCM', 'ESP', 'IC', 'HVAC'];
    for (const code of oemModules) {
      const mod = results.find((r) => r.code === code)!;
      expect(mod.status).toBe('OEM_DIAGNOSTICS_REQUIRED');
      expect(mod.faults).toHaveLength(0);
    }
  });

  it('creates dynamic card for unknown ecu like RADAR', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '4', code: 'C1000', ecu: 'RADAR', status: 'ACTIVE' }),
    ];

    const results = buildControlUnitOverview(faults);
    const radar = results.find((r) => r.code === 'RADAR')!;

    expect(radar).toBeDefined();
    expect(radar.name).toBe('Unknown / Unmapped Control Unit');
    expect(radar.status).toBe('FAULTS_FOUND');
    expect(radar.isKnown).toBe(false);
    expect(radar.faults).toHaveLength(1);
  });

  it('groups missing ecu into UNKNOWN', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '5', code: 'P0300', ecu: undefined, status: 'ACTIVE' }),
    ];

    const results = buildControlUnitOverview(faults);
    const unknown = results.find((r) => r.code === 'UNKNOWN')!;

    expect(unknown).toBeDefined();
    expect(unknown.name).toBe('Unknown / Unmapped Control Unit');
    expect(unknown.status).toBe('FAULTS_FOUND');
    expect(unknown.faults).toHaveLength(1);
  });

  it('groups empty-string ecu into UNKNOWN', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '6', code: 'P0300', ecu: '', status: 'ACTIVE' }),
    ];

    const results = buildControlUnitOverview(faults);
    const unknown = results.find((r) => r.code === 'UNKNOWN')!;

    expect(unknown).toBeDefined();
    expect(unknown.faults).toHaveLength(1);
  });

  it('handles case-insensitive ecu matching', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '7', code: 'P0301', ecu: 'ecm', status: 'ACTIVE' }),
    ];

    const results = buildControlUnitOverview(faults);
    const ecm = results.find((r) => r.code === 'ECM')!;

    expect(ecm.faults).toHaveLength(1);
  });

  it('produces correct status for the canonical 3-fault example', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '1', code: 'P0301', ecu: 'ECM', status: 'ACTIVE' }),
      makeFault({ id: '2', code: 'P0171', ecu: 'ECM', status: 'PENDING' }),
      makeFault({ id: '3', code: 'U0100', ecu: 'TCM', status: 'ACTIVE' }),
    ];

    const results = buildControlUnitOverview(faults);

    const ecm = results.find((r) => r.code === 'ECM')!;
    expect(ecm.status).toBe('FAULTS_FOUND');
    expect(ecm.faults).toHaveLength(2);

    const tcm = results.find((r) => r.code === 'TCM')!;
    expect(tcm.status).toBe('FAULTS_FOUND');
    expect(tcm.faults).toHaveLength(1);

    // OEM modules should be OEM_DIAGNOSTICS_REQUIRED
    const oemModules = ['ABS', 'SRS', 'BCM', 'ESP', 'IC', 'HVAC'];
    for (const code of oemModules) {
      const mod = results.find((r) => r.code === code)!;
      expect(mod.status).toBe('OEM_DIAGNOSTICS_REQUIRED');
    }
  });

  it('returns NOT_SCANNED for ECM when it is not in the scanned set', () => {
    const results = buildControlUnitOverview([], new Set(['TCM']));

    const ecm = results.find((r) => r.code === 'ECM')!;
    expect(ecm.status).toBe('NOT_SCANNED');

    const tcm = results.find((r) => r.code === 'TCM')!;
    expect(tcm.status).toBe('NO_FAULTS');
  });

  it('handles OEM module with actual fault data as FAULTS_FOUND', () => {
    // Edge case: a fault code arrives with ecu='ABS' (somehow)
    const faults: FaultCode[] = [
      makeFault({ id: '8', code: 'C0035', ecu: 'ABS', status: 'ACTIVE' }),
    ];

    const results = buildControlUnitOverview(faults);
    const abs = results.find((r) => r.code === 'ABS')!;

    expect(abs.status).toBe('FAULTS_FOUND');
    expect(abs.faults).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// computeControlUnitSummary
// ---------------------------------------------------------------------------

describe('computeControlUnitSummary', () => {
  it('calculates summary for the canonical 3-fault example', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '1', code: 'P0301', ecu: 'ECM', status: 'ACTIVE' }),
      makeFault({ id: '2', code: 'P0171', ecu: 'ECM', status: 'PENDING' }),
      makeFault({ id: '3', code: 'U0100', ecu: 'TCM', status: 'ACTIVE' }),
    ];

    const results = buildControlUnitOverview(faults);
    const summary = computeControlUnitSummary(results);

    expect(summary.modulesWithFaults).toBe(2); // ECM + TCM
    expect(summary.totalFaultCodes).toBe(3); // P0301 + P0171 + U0100
    expect(summary.genericObdModulesChecked).toEqual(['ECM', 'TCM']);
    expect(summary.oemDiagnosticsRequired).toBe(6); // ABS, SRS, BCM, ESP, IC, HVAC
  });

  it('returns zeros for empty fault list', () => {
    const results = buildControlUnitOverview([]);
    const summary = computeControlUnitSummary(results);

    expect(summary.modulesWithFaults).toBe(0);
    expect(summary.totalFaultCodes).toBe(0);
    expect(summary.genericObdModulesChecked).toEqual(['ECM', 'TCM']);
    expect(summary.oemDiagnosticsRequired).toBe(6);
  });

  it('counts OEM_DIAGNOSTICS_REQUIRED correctly', () => {
    const results = buildControlUnitOverview([]);
    const summary = computeControlUnitSummary(results);

    // By default, 6 OEM modules with no faults → OEM_DIAGNOSTICS_REQUIRED
    expect(summary.oemDiagnosticsRequired).toBe(6);
  });

  it('includes dynamic modules in fault count', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '9', code: 'C1000', ecu: 'RADAR', status: 'ACTIVE' }),
    ];

    const results = buildControlUnitOverview(faults);
    const summary = computeControlUnitSummary(results);

    expect(summary.modulesWithFaults).toBe(1); // RADAR
    expect(summary.totalFaultCodes).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

describe('getControlUnitStatusLabel', () => {
  it('returns correct labels for each status', () => {
    expect(getControlUnitStatusLabel('FAULTS_FOUND')).toBe('Faults Found');
    expect(getControlUnitStatusLabel('NO_FAULTS')).toBe('No Faults Detected');
    expect(getControlUnitStatusLabel('NOT_SCANNED')).toBe('Not Scanned');
    expect(getControlUnitStatusLabel('OEM_DIAGNOSTICS_REQUIRED')).toBe(
      'OEM Diagnostics Required',
    );
  });
});

describe('getControlUnitStatusBadgeClass', () => {
  it('returns Tailwind classes for each status', () => {
    expect(getControlUnitStatusBadgeClass('FAULTS_FOUND')).toContain('red');
    expect(getControlUnitStatusBadgeClass('NO_FAULTS')).toContain('emerald');
    expect(getControlUnitStatusBadgeClass('NOT_SCANNED')).toContain('slate');
    expect(getControlUnitStatusBadgeClass('OEM_DIAGNOSTICS_REQUIRED')).toContain('amber');
  });
});

describe('getControlUnitName', () => {
  it('returns full names for known modules', () => {
    expect(getControlUnitName('ECM')).toBe('Engine Control Module');
    expect(getControlUnitName('TCM')).toBe('Transmission Control Module');
    expect(getControlUnitName('ABS')).toBe('Anti-lock Brake System');
    expect(getControlUnitName('SRS')).toBe('Supplemental Restraint System');
    expect(getControlUnitName('BCM')).toBe('Body Control Module');
    expect(getControlUnitName('ESP')).toBe('Electronic Stability Program');
    expect(getControlUnitName('IC')).toBe('Instrument Cluster');
    expect(getControlUnitName('HVAC')).toBe('Climate Control Module');
  });

  it('returns "Unknown / Unmapped Control Unit" for unknown codes', () => {
    expect(getControlUnitName('RADAR')).toBe('Unknown / Unmapped Control Unit');
    expect(getControlUnitName('SAM-F')).toBe('Unknown / Unmapped Control Unit');
    expect(getControlUnitName('UNKNOWN')).toBe('Unknown / Unmapped Control Unit');
  });

  it('is case-insensitive', () => {
    expect(getControlUnitName('ecm')).toBe('Engine Control Module');
    expect(getControlUnitName('abs')).toBe('Anti-lock Brake System');
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('CONTROL_UNIT_MODULES', () => {
  it('contains exactly 8 modules', () => {
    expect(CONTROL_UNIT_MODULES).toHaveLength(8);
  });

  it('has 2 OBD_II modules', () => {
    const obd = CONTROL_UNIT_MODULES.filter((m) => m.group === 'OBD_II');
    expect(obd).toHaveLength(2);
    expect(obd.map((m) => m.code)).toEqual(['ECM', 'TCM']);
  });

  it('has 6 OEM_DIAGNOSTICS modules', () => {
    const oem = CONTROL_UNIT_MODULES.filter(
      (m) => m.group === 'OEM_DIAGNOSTICS',
    );
    expect(oem).toHaveLength(6);
  });
});

describe('DEFAULT_SCANNED_ECU_CODES', () => {
  it('contains ECM and TCM', () => {
    expect(DEFAULT_SCANNED_ECU_CODES.has('ECM')).toBe(true);
    expect(DEFAULT_SCANNED_ECU_CODES.has('TCM')).toBe(true);
    expect(DEFAULT_SCANNED_ECU_CODES.size).toBe(2);
  });
});