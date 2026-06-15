/// <reference types="@testing-library/jest-dom" />
import { fireEvent, renderWithProviders, screen } from '../../../../tests/test-utils';
import ControlUnitsPanel from '../ControlUnitsPanel';
import type {
  ControlUnitDiscovery,
  ProbeResult,
  Responder,
} from '../../../services/vehicle-data-api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid ControlUnitDiscovery for test construction. */
function makeDiscovery(
  overrides: Partial<ControlUnitDiscovery> = {},
): ControlUnitDiscovery {
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

/** Build a minimal ProbeResult. */
function makeProbe(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    method: 'FUNCTIONAL',
    requestId: '7DF',
    probe: '22F190',
    responseId: '7E8',
    status: 'DISCOVERED',
    responseType: 'NEGATIVE',
    negativeResponseCode: '11',
    negativeResponseMeaning: 'SERVICE_NOT_SUPPORTED',
    rawHeader: '7E8',
    rawPayload: '037F2211',
    rawResponse: '7E8037F2211',
    errorCode: null,
    ...overrides,
  };
}

/** Build a minimal Responder. */
function makeResponder(overrides: Partial<Responder> = {}): Responder {
  return {
    responseId: '7E8',
    discoveredBy: [
      { method: 'FUNCTIONAL', requestId: '7DF', probe: '22F190' },
    ],
    firstSeenBy: 'FUNCTIONAL',
    confirmedByPhysical: true,
    confidence: 'HIGH',
    ecuName: null,
    ecuType: null,
    protocol: 'UDS_ON_CAN_11BIT',
    capabilities: {
      respondedToF190: true,
      positiveF190: false,
      negativeF190: true,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T016: ControlUnitsPanel tests
// ---------------------------------------------------------------------------

describe('ControlUnitsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Responders rendering
  // -------------------------------------------------------------------------

  it('renders responders from mock discovery data', () => {
    const discovery = makeDiscovery({
      responders: [
        makeResponder({ responseId: '7E8', confidence: 'HIGH' }),
        makeResponder({
          responseId: '7EA',
          confidence: 'LOW',
          firstSeenBy: 'FUNCTIONAL',
          confirmedByPhysical: false,
        }),
      ],
      summary: {
        totalProbes: 9,
        respondersFound: 2,
        functionalResponders: 2,
        physicalResponders: 1,
      },
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    expect(screen.getByText('Control Units')).toBeInTheDocument();
    expect(screen.getByText('2 responders found')).toBeInTheDocument();
    expect(screen.getByText('7E8')).toBeInTheDocument();
    expect(screen.getByText('7EA')).toBeInTheDocument();
    expect(screen.queryByText('374')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('shows empty state when zero responders found', () => {
    const discovery = makeDiscovery({
      summary: {
        totalProbes: 9,
        respondersFound: 0,
        functionalResponders: 0,
        physicalResponders: 0,
      },
      responders: [],
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    expect(screen.getByText('No control units discovered.')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Confidence badges
  // -------------------------------------------------------------------------

  it('displays HIGH confidence badge with green styling', () => {
    const discovery = makeDiscovery({
      responders: [makeResponder({ responseId: '7E8', confidence: 'HIGH' })],
      summary: { totalProbes: 9, respondersFound: 1, functionalResponders: 1, physicalResponders: 1 },
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    const badge = screen.getByText('HIGH');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('displays LOW confidence badge with amber styling', () => {
    const discovery = makeDiscovery({
      responders: [
        makeResponder({
          responseId: '7EA',
          confidence: 'LOW',
          confirmedByPhysical: false,
        }),
      ],
      summary: { totalProbes: 9, respondersFound: 1, functionalResponders: 1, physicalResponders: 0 },
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    const badge = screen.getByText('LOW');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-amber-100');
    expect(badge.className).toContain('text-amber-800');
  });

  // -------------------------------------------------------------------------
  // No ECU names
  // -------------------------------------------------------------------------

  it('does not display ECU names (shown as "—")', () => {
    const discovery = makeDiscovery({
      responders: [makeResponder({ responseId: '7E8', ecuName: null, ecuType: null })],
      summary: { totalProbes: 9, respondersFound: 1, functionalResponders: 1, physicalResponders: 1 },
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    // The responder row should not contain an ECU name column
    // ecuName is null, so it should never show an inferred name
    expect(screen.queryByText('ECM')).not.toBeInTheDocument();
    expect(screen.queryByText('TCM')).not.toBeInTheDocument();
    expect(screen.queryByText('ABS')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Discovery metadata
  // -------------------------------------------------------------------------

  it('displays scanMode in discovery metadata', () => {
    const discovery = makeDiscovery({
      scanMode: 'FUNCTIONAL_THEN_PHYSICAL',
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    expect(screen.getByText(/FUNCTIONAL THEN PHYSICAL/)).toBeInTheDocument();
  });

  it('displays strategy in discovery metadata', () => {
    const discovery = makeDiscovery({
      strategy: 'GENERIC_OBD_CAN',
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    expect(screen.getByText('GENERIC_OBD_CAN')).toBeInTheDocument();
  });

  it('displays total probes count in discovery metadata', () => {
    const discovery = makeDiscovery({
      summary: { totalProbes: 9, respondersFound: 1, functionalResponders: 1, physicalResponders: 1 },
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    expect(screen.getByText('9')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Probe details — collapsible
  // -------------------------------------------------------------------------

  it('probe details section is collapsible and not shown by default', () => {
    const longRawResponse = '7E81462F19057314B4146344742315246313234333231';
    const discovery = makeDiscovery({
      probes: [
        makeProbe({
          method: 'FUNCTIONAL',
          requestId: '7DF',
          probe: '22F190',
          responseId: '7E8',
          status: 'DISCOVERED',
          responseType: 'NEGATIVE',
          rawResponse: longRawResponse,
        }),
      ],
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    // The <details> element should exist but not be open
    const details = screen.getByText(/Probe Details/).closest('details');
    expect(details).toBeInTheDocument();
    expect(details?.open).toBeFalsy();
    expect(screen.queryByText(longRawResponse)).not.toBeInTheDocument();
  });

  it('shows only a truncated raw response preview after probe details are expanded', () => {
    const longRawResponse = '7E81462F19057314B4146344742315246313234333231';
    const discovery = makeDiscovery({
      probes: [
        makeProbe({
          method: 'FUNCTIONAL',
          requestId: '7DF',
          probe: '22F190',
          responseId: '7E8',
          status: 'DISCOVERED',
          responseType: 'POSITIVE',
          negativeResponseCode: null,
          negativeResponseMeaning: null,
          rawPayload: '1462F19057314B4146344742315246313234333231',
          rawResponse: longRawResponse,
        }),
      ],
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    fireEvent.click(screen.getByText(/Probe Details/));

    const preview = screen.getByText('7E81462F19057314B4146344...');
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute('title', longRawResponse);
    expect(screen.queryByText(longRawResponse)).not.toBeInTheDocument();
  });

  it('expanding probe details shows all probes', () => {
    const probe1 = makeProbe({
      method: 'FUNCTIONAL',
      requestId: '7DF',
      probe: '22F190',
      responseId: '7E8',
      status: 'DISCOVERED',
      responseType: 'NEGATIVE',
      rawResponse: '7E8037F2211',
    });
    const probe2 = makeProbe({
      method: 'PHYSICAL',
      requestId: '7E0',
      probe: '22F190',
      responseId: '7E8',
      status: 'DISCOVERED',
      responseType: 'NEGATIVE',
      rawResponse: '7E8037F2211',
    });

    const discovery = makeDiscovery({
      probes: [probe1, probe2],
      summary: { totalProbes: 2, respondersFound: 1, functionalResponders: 1, physicalResponders: 1 },
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    // Click to expand probe details
    const summary = screen.getByText(/Probe Details/);
    fireEvent.click(summary);

    // After expanding, probe details table should be visible
    expect(screen.getByText('FUNCTIONAL')).toBeInTheDocument();
    expect(screen.getByText('PHYSICAL')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Negative response codes
  // -------------------------------------------------------------------------

  it('negative response codes are visible in probe details', () => {
    const discovery = makeDiscovery({
      probes: [
        makeProbe({
          method: 'FUNCTIONAL',
          requestId: '7DF',
          probe: '22F190',
          responseId: '7E8',
          status: 'DISCOVERED',
          responseType: 'NEGATIVE',
          negativeResponseCode: '11',
          negativeResponseMeaning: 'SERVICE_NOT_SUPPORTED',
          rawResponse: '7E8037F2211',
        }),
      ],
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    // Expand probe details
    const summary = screen.getByText(/Probe Details/);
    fireEvent.click(summary);

    // NRC code should be visible
    expect(screen.getByText('11')).toBeInTheDocument();
  });

  it('negative response code tooltip shows meaning', () => {
    const discovery = makeDiscovery({
      probes: [
        makeProbe({
          method: 'FUNCTIONAL',
          requestId: '7DF',
          probe: '22F190',
          responseId: '7E8',
          status: 'DISCOVERED',
          responseType: 'NEGATIVE',
          negativeResponseCode: '11',
          negativeResponseMeaning: 'SERVICE_NOT_SUPPORTED',
          rawResponse: '7E8037F2211',
        }),
      ],
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    // Expand probe details
    const summary = screen.getByText(/Probe Details/);
    fireEvent.click(summary);

    // NRC element should have title attribute with meaning
    const nrcElement = screen.getByText('11');
    expect(nrcElement).toHaveAttribute('title', 'SERVICE_NOT_SUPPORTED');
  });

  // -------------------------------------------------------------------------
  // Error probes with errorCode
  // -------------------------------------------------------------------------

  it('error probes display errorCode with error indicator style', () => {
    const discovery = makeDiscovery({
      probes: [
        makeProbe({
          method: 'PHYSICAL',
          requestId: '7E1',
          probe: '22F190',
          responseId: null,
          status: 'ERROR',
          responseType: 'ERROR',
          negativeResponseCode: null,
          negativeResponseMeaning: null,
          rawResponse: '',
          errorCode: 'TIMEOUT',
        }),
      ],
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    // Expand probe details
    const summary = screen.getByText(/Probe Details/);
    fireEvent.click(summary);

    // ERROR status appears in both the status column and response type column
    const errorElements = screen.getAllByText('ERROR');
    expect(errorElements.length).toBeGreaterThanOrEqual(1);

    // ErrorCode should be visible with error indicator style
    const errorCodeElement = screen.getByText('TIMEOUT');
    expect(errorCodeElement).toBeInTheDocument();
    expect(errorCodeElement.className).toContain('bg-red-100');
    expect(errorCodeElement.className).toContain('text-red-800');
  });

  it('error probes with ADAPTER_DISCONNECT errorCode display correctly', () => {
    const discovery = makeDiscovery({
      probes: [
        makeProbe({
          method: 'PHYSICAL',
          requestId: '7E5',
          probe: '22F190',
          responseId: null,
          status: 'ERROR',
          responseType: 'ERROR',
          negativeResponseCode: null,
          negativeResponseMeaning: null,
          rawResponse: '',
          errorCode: 'ADAPTER_DISCONNECT',
        }),
      ],
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    // Expand probe details
    const summary = screen.getByText(/Probe Details/);
    fireEvent.click(summary);

    expect(screen.getByText('ADAPTER_DISCONNECT')).toBeInTheDocument();
  });

  it('error probes without errorCode show ERROR status only', () => {
    const discovery = makeDiscovery({
      probes: [
        makeProbe({
          method: 'PHYSICAL',
          requestId: '7E3',
          probe: '22F190',
          responseId: null,
          status: 'ERROR',
          responseType: 'ERROR',
          negativeResponseCode: null,
          negativeResponseMeaning: null,
          rawResponse: '',
          errorCode: null,
        }),
      ],
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    // Expand probe details
    const summary = screen.getByText(/Probe Details/);
    fireEvent.click(summary);

    // ERROR appears in status and response type columns
    const errorElements = screen.getAllByText('ERROR');
    expect(errorElements.length).toBeGreaterThanOrEqual(1);
    // No errorCode badge should appear when errorCode is null
    expect(screen.queryByText('TIMEOUT')).not.toBeInTheDocument();
    expect(screen.queryByText('ADAPTER_DISCONNECT')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Probe status display
  // -------------------------------------------------------------------------

  it('NOT_FOUND probes display correctly', () => {
    const discovery = makeDiscovery({
      probes: [
        makeProbe({
          method: 'PHYSICAL',
          requestId: '7E1',
          probe: '22F190',
          responseId: null,
          status: 'NOT_FOUND',
          responseType: 'NO_RESPONSE',
          negativeResponseCode: null,
          negativeResponseMeaning: null,
          rawResponse: 'NO DATA',
          errorCode: null,
        }),
      ],
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    // Expand probe details
    const summary = screen.getByText(/Probe Details/);
    fireEvent.click(summary);

    expect(screen.getByText('NOT FOUND')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Discovery timestamps
  // -------------------------------------------------------------------------

  it('displays startedAt and completedAt timestamps', () => {
    const discovery = makeDiscovery({
      startedAt: '2026-06-15T12:00:00.000Z',
      completedAt: '2026-06-15T12:00:03.000Z',
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    expect(screen.getByText(/Started:/)).toBeInTheDocument();
    expect(screen.getByText(/Completed:/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Protocol column
  // -------------------------------------------------------------------------

  it('displays responder protocol', () => {
    const discovery = makeDiscovery({
      responders: [makeResponder({ responseId: '7E8', protocol: 'UDS_ON_CAN_11BIT' })],
      summary: { totalProbes: 9, respondersFound: 1, functionalResponders: 1, physicalResponders: 1 },
    });

    renderWithProviders(<ControlUnitsPanel controlUnitDiscovery={discovery} />);

    expect(screen.getByText('UDS_ON_CAN_11BIT')).toBeInTheDocument();
  });
});
