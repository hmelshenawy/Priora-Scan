/// <reference types="@testing-library/jest-dom" />
import { useVehicleData, useReadVehicleData } from '../../../services/vehicle-data-api';
import type { VehicleDataJson, ExtendedPidDataPoint, ControlUnitDiscovery } from '../../../services/vehicle-data-api';

jest.mock('../../../services/vehicle-data-api', () => ({
  useVehicleData: jest.fn(),
  useReadVehicleData: jest.fn(),
}));

const useVehicleDataMock = useVehicleData as unknown as jest.Mock;
const useReadVehicleDataMock = useReadVehicleData as unknown as jest.Mock;

import { renderWithProviders, screen } from '../../../../tests/test-utils';
import { VehicleHealthPanel } from '../VehicleHealthPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid VehicleDataJson for test construction. */
function makeBaseVehicleData(overrides: Partial<VehicleDataJson> = {}): VehicleDataJson {
  return {
    batteryVoltage: { value: 13.417, unit: 'V', supported: true },
    vin: { value: 'WDD2130041A123456', supported: true },
    readinessMonitors: { supported: true, value: {} },
    fuelSystemStatus: { value: 'Closed Loop', supported: true },
    calculatedEngineLoad: { value: 46.3, unit: '%', supported: true },
    fuelLevel: { value: 72, unit: '%', supported: true },
    mileage: { value: 12345, unit: 'km', supported: true },
    supportedPids: { '01': ['04', '05', '0C', '0D'], '09': ['02'] },
    ...overrides,
  };
}

/** Extended PID data point with all fields populated. */
function makeExtendedPid(
  overrides: Partial<ExtendedPidDataPoint> = {},
): ExtendedPidDataPoint {
  return {
    pid: '06',
    value: 0.0,
    unit: '%',
    supported: true,
    available: true,
    ...overrides,
  };
}

function setupMocks(vehicleData: VehicleDataJson | null = null) {
  useVehicleDataMock.mockReturnValue({
    data: { vehicleData, readAt: '2026-06-15T10:00:00Z' },
    isLoading: false,
    isError: false,
  });
  useReadVehicleDataMock.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  });
}

// ---------------------------------------------------------------------------
// T020: TestFuelAndAirDataRendering
// ---------------------------------------------------------------------------

describe('TestFuelAndAirDataRendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Fuel & Air Data section with all 7 extended PID values', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({ pid: '06', value: 2.3, unit: '%' }),
      ltftBank1: makeExtendedPid({ pid: '07', value: -3.12, unit: '%' }),
      stftBank2: makeExtendedPid({ pid: '08', value: null, unit: '%', supported: false, available: false }),
      ltftBank2: makeExtendedPid({ pid: '09', value: null, unit: '%', supported: false, available: false }),
      map: makeExtendedPid({ pid: '0B', value: 42, unit: 'kPa' }),
      maf: makeExtendedPid({ pid: '10', value: 1.0, unit: 'g/s' }),
      throttlePosition: makeExtendedPid({ pid: '11', value: 1.96, unit: '%' }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.getByText('Fuel & Air Data')).toBeInTheDocument();
    expect(screen.getByText('STFT Bank 1')).toBeInTheDocument();
    expect(screen.getByText('LTFT Bank 1')).toBeInTheDocument();
    expect(screen.getByText('STFT Bank 2')).toBeInTheDocument();
    expect(screen.getByText('LTFT Bank 2')).toBeInTheDocument();
    expect(screen.getByText('MAP')).toBeInTheDocument();
    expect(screen.getByText('MAF')).toBeInTheDocument();
    expect(screen.getByText('Throttle Position')).toBeInTheDocument();
  });

  it('renders supported and available PID values with unit', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({ pid: '06', value: 2.3, unit: '%' }),
      map: makeExtendedPid({ pid: '0B', value: 42, unit: 'kPa' }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    // Values should appear with units
    expect(screen.getByText('2.3 %')).toBeInTheDocument();
    expect(screen.getByText('42 kPa')).toBeInTheDocument();
  });

  it('renders integer values without decimal places', () => {
    const data = makeBaseVehicleData({
      map: makeExtendedPid({ pid: '0B', value: 101, unit: 'kPa' }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.getByText('101 kPa')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T021: TestUnsupportedExtendedPids
// ---------------------------------------------------------------------------

describe('TestUnsupportedExtendedPids', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Not Supported" for unsupported PIDs', () => {
    const data = makeBaseVehicleData({
      stftBank2: makeExtendedPid({ pid: '08', value: null, unit: '%', supported: false, available: false }),
      ltftBank2: makeExtendedPid({ pid: '09', value: null, unit: '%', supported: false, available: false }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    const notSupportedLabels = screen.getAllByText('Not Supported');
    expect(notSupportedLabels.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// T022: TestUnavailableExtendedPids
// ---------------------------------------------------------------------------

describe('TestUnavailableExtendedPids', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "No Data" for supported but unavailable PIDs', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({ pid: '06', value: null, unit: '%', supported: true, available: false }),
      maf: makeExtendedPid({ pid: '10', value: null, unit: 'g/s', supported: true, available: false }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    const noDataLabels = screen.getAllByText('No Data');
    expect(noDataLabels.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// T023: TestMissingExtendedPidsFields
// ---------------------------------------------------------------------------

describe('TestMissingExtendedPidsFields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render Fuel & Air Data section for pre-018B data without extended fields', () => {
    const data = makeBaseVehicleData();
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.queryByText('Fuel & Air Data')).not.toBeInTheDocument();
  });

  it('labels PID 31 as distance since DTC clear, not mileage', () => {
    const data = makeBaseVehicleData({
      mileage: { value: 5639, unit: 'km', supported: true },
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.getByText('Distance Since DTC Clear')).toBeInTheDocument();
    expect(screen.getByText('5639 km')).toBeInTheDocument();
    expect(screen.queryByText('Mileage')).not.toBeInTheDocument();
  });

  it('does not crash when VehicleDataJson has no extended PID fields', () => {
    const data = makeBaseVehicleData();
    setupMocks(data);
    // Should render without throwing
    expect(() => {
      renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);
    }).not.toThrow();
  });

  it('does not show "Not Supported" for data that was never collected', () => {
    const data = makeBaseVehicleData();
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    // Pre-018B data should not show any extended PID labels
    expect(screen.queryByText('STFT Bank 1')).not.toBeInTheDocument();
    expect(screen.queryByText('LTFT Bank 1')).not.toBeInTheDocument();
    expect(screen.queryByText('MAP')).not.toBeInTheDocument();
    expect(screen.queryByText('MAF')).not.toBeInTheDocument();
  });

  it('renders section when only some extended PIDs are present', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({ pid: '06', value: 2.3, unit: '%' }),
      maf: makeExtendedPid({ pid: '10', value: 1.0, unit: 'g/s' }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.getByText('Fuel & Air Data')).toBeInTheDocument();
    expect(screen.getByText('STFT Bank 1')).toBeInTheDocument();
    expect(screen.getByText('MAF')).toBeInTheDocument();
    // PIDs that don't exist in the data should not appear
    expect(screen.queryByText('LTFT Bank 1')).not.toBeInTheDocument();
    expect(screen.queryByText('MAP')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T024: TestDiscoveryFailureState
// ---------------------------------------------------------------------------

describe('TestDiscoveryFailureState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Not Available" for PIDs with PID_DISCOVERY_FAILED reason', () => {
    const discoveryFailed: ExtendedPidDataPoint = {
      pid: '06',
      value: null,
      unit: '%',
      supported: false,
      available: false,
      rawResponse: null,
      reason: 'PID_DISCOVERY_FAILED',
    };
    const data = makeBaseVehicleData({
      stftBank1: { ...discoveryFailed, pid: '06', unit: '%' },
      ltftBank1: { ...discoveryFailed, pid: '07', unit: '%' },
      stftBank2: { ...discoveryFailed, pid: '08', unit: '%' },
      ltftBank2: { ...discoveryFailed, pid: '09', unit: '%' },
      map: { ...discoveryFailed, pid: '0B', unit: 'kPa' },
      maf: { ...discoveryFailed, pid: '10', unit: 'g/s' },
      throttlePosition: { ...discoveryFailed, pid: '11', unit: '%' },
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.getByText('Fuel & Air Data')).toBeInTheDocument();
    const notAvailableLabels = screen.getAllByText('Not Available');
    // All 7 PIDs should show "Not Available"
    expect(notAvailableLabels).toHaveLength(7);
  });

  it('renders Fuel & Air section when discovery failure fields exist', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({
        pid: '06',
        value: null,
        unit: '%',
        supported: false,
        available: false,
        reason: 'PID_DISCOVERY_FAILED',
      }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    // The section IS rendered because the fields exist (even though discovery failed)
    expect(screen.getByText('Fuel & Air Data')).toBeInTheDocument();
  });

  it('does not use top-level extendedPidsDiscoveryFailed flag', () => {
    // Discovery state lives inside each PID result's reason field, not as a top-level flag.
    // This test confirms the component doesn't rely on any such flag.
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({
        pid: '06',
        value: null,
        unit: '%',
        supported: false,
        available: false,
        reason: 'PID_DISCOVERY_FAILED',
      }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    // The component should render based on field presence, not a top-level flag
    expect(screen.getByText('STFT Bank 1')).toBeInTheDocument();
    expect(screen.getByText('Not Available')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T025: TestFuelTrimHints
// ---------------------------------------------------------------------------

describe('TestFuelTrimHints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Normal" badge for fuel trim value at 0%', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({ pid: '06', value: 0.0, unit: '%' }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.getByText('Normal')).toBeInTheDocument();
  });

  it('renders "Lean Tendency" badge for fuel trim value above +10%', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({ pid: '06', value: 15.0, unit: '%' }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.getByText('Lean Tendency')).toBeInTheDocument();
  });

  it('renders "Rich Tendency" badge for fuel trim value below -10%', () => {
    const data = makeBaseVehicleData({
      ltftBank1: makeExtendedPid({ pid: '07', value: -15.0, unit: '%' }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.getByText('Rich Tendency')).toBeInTheDocument();
  });

  it('renders "Normal" badge for fuel trim value at exactly +10%', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({ pid: '06', value: 10.0, unit: '%' }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.getByText('Normal')).toBeInTheDocument();
  });

  it('renders "Normal" badge for fuel trim value at exactly -10%', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({ pid: '06', value: -10.0, unit: '%' }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.getByText('Normal')).toBeInTheDocument();
  });

  it('does not render trim hint badge when fuel trim value is null', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({ pid: '06', value: null, unit: '%', supported: true, available: false }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    // Should show "No Data" instead of a value with badge
    expect(screen.getByText('No Data')).toBeInTheDocument();
    expect(screen.queryByText('Normal')).not.toBeInTheDocument();
    expect(screen.queryByText('Lean Tendency')).not.toBeInTheDocument();
    expect(screen.queryByText('Rich Tendency')).not.toBeInTheDocument();
  });

  it('does not render trim hint badge for non-fuel-trim PIDs (MAP, MAF, Throttle)', () => {
    const data = makeBaseVehicleData({
      map: makeExtendedPid({ pid: '0B', value: 42, unit: 'kPa' }),
      maf: makeExtendedPid({ pid: '10', value: 1.0, unit: 'g/s' }),
      throttlePosition: makeExtendedPid({ pid: '11', value: 15.0, unit: '%' }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    // These PIDs should show values but no trim hint badges
    expect(screen.getByText('42 kPa')).toBeInTheDocument();
    expect(screen.getByText('1 g/s')).toBeInTheDocument();
    expect(screen.getByText('15 %')).toBeInTheDocument();
    // No trim hint badges should appear
    expect(screen.queryByText('Normal')).not.toBeInTheDocument();
    expect(screen.queryByText('Lean Tendency')).not.toBeInTheDocument();
    expect(screen.queryByText('Rich Tendency')).not.toBeInTheDocument();
  });

  it('has no diagnosis wording, repair recommendations, or AI language', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({ pid: '06', value: 20.0, unit: '%' }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    // Verify the hint text is just "Lean Tendency" — no extra wording
    expect(screen.getByText('Lean Tendency')).toBeInTheDocument();
    // Verify no diagnosis or repair language appears
    expect(screen.queryByText(/diagnos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/repair/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recommend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ai /i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T017: Control Unit Discovery rendering in VehicleHealthPanel
// ---------------------------------------------------------------------------

describe('ControlUnitDiscovery integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** Build a minimal ControlUnitDiscovery for testing. */
  function makeDiscovery(overrides: Partial<ControlUnitDiscovery> = {}): ControlUnitDiscovery {
    return {
      version: 1,
      strategy: 'GENERIC_OBD_CAN',
      scanMode: 'FUNCTIONAL_THEN_PHYSICAL',
      probeSequence: ['22F190'],
      startedAt: '2026-06-15T12:00:00.000Z',
      completedAt: '2026-06-15T12:00:03.000Z',
      summary: {
        totalProbes: 9,
        respondersFound: 1,
        functionalResponders: 1,
        physicalResponders: 1,
      },
      probes: [],
      responders: [],
      ...overrides,
    };
  }

  it('renders ControlUnitsPanel when controlUnitDiscovery exists in vehicle data', () => {
    const data = makeBaseVehicleData({
      controlUnitDiscovery: makeDiscovery({
        responders: [
          {
            responseId: '7E8',
            discoveredBy: [{ method: 'FUNCTIONAL', requestId: '7DF', probe: '22F190' }],
            firstSeenBy: 'FUNCTIONAL',
            confirmedByPhysical: true,
            confidence: 'HIGH',
            ecuName: null,
            ecuType: null,
            protocol: 'UDS_ON_CAN_11BIT',
            capabilities: { respondedToF190: true, positiveF190: false, negativeF190: true },
          },
        ],
        summary: { totalProbes: 9, respondersFound: 1, functionalResponders: 1, physicalResponders: 1 },
      }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    // The Control Units heading should appear
    expect(screen.getByText('Control Units')).toBeInTheDocument();
    // The responder should be visible
    expect(screen.getByText('7E8')).toBeInTheDocument();
    // Confidence badge should be visible
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('does not render ControlUnitsPanel when controlUnitDiscovery is absent', () => {
    const data = makeBaseVehicleData();
    // No controlUnitDiscovery field
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.queryByText('Control Units')).not.toBeInTheDocument();
  });

  it('does not render ControlUnitsPanel when controlUnitDiscovery is undefined', () => {
    const data = makeBaseVehicleData({ controlUnitDiscovery: undefined });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    expect(screen.queryByText('Control Units')).not.toBeInTheDocument();
  });

  it('renders ControlUnitsPanel alongside existing vehicle health data', () => {
    const data = makeBaseVehicleData({
      stftBank1: makeExtendedPid({ pid: '06', value: 2.3, unit: '%' }),
      controlUnitDiscovery: makeDiscovery({
        summary: { totalProbes: 9, respondersFound: 1, functionalResponders: 1, physicalResponders: 1 },
      }),
    });
    setupMocks(data);
    renderWithProviders(<VehicleHealthPanel sessionId="session-1" />);

    // Both the Fuel & Air Data section and Control Units section should appear
    expect(screen.getByText('Fuel & Air Data')).toBeInTheDocument();
    expect(screen.getByText('Control Units')).toBeInTheDocument();
  });
});
