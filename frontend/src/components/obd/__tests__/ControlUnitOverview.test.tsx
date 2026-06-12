/// <reference types="@testing-library/jest-dom" />
import { renderWithProviders, screen } from '../../../../tests/test-utils';
import { ControlUnitOverview } from '../ControlUnitOverview';
import type { FaultCode } from '@/hooks/useObdScan';

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

describe('ControlUnitOverview', () => {
  it('renders 8 control unit cards with sample fault codes', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '1', code: 'P0301', ecu: 'ECM', status: 'ACTIVE' }),
      makeFault({ id: '2', code: 'P0171', ecu: 'ECM', status: 'PENDING' }),
      makeFault({ id: '3', code: 'U0100', ecu: 'TCM', status: 'ACTIVE' }),
    ];

    renderWithProviders(
      <ControlUnitOverview faultCodes={faults} showNavigation={false} />,
    );

    // Title
    expect(
      screen.getByText('Control Unit Overview'),
    ).toBeInTheDocument();

    // 8 module cards should be rendered
    expect(screen.getByText('Engine Control Module')).toBeInTheDocument();
    expect(screen.getByText('Transmission Control Module')).toBeInTheDocument();
    expect(screen.getByText('Anti-lock Brake System')).toBeInTheDocument();
    expect(screen.getByText('Supplemental Restraint System')).toBeInTheDocument();
    expect(screen.getByText('Body Control Module')).toBeInTheDocument();
    expect(screen.getByText('Electronic Stability Program')).toBeInTheDocument();
    expect(screen.getByText('Instrument Cluster')).toBeInTheDocument();
    expect(screen.getByText('Climate Control Module')).toBeInTheDocument();
  });

  it('renders all 8 module cards even with empty fault list', () => {
    renderWithProviders(
      <ControlUnitOverview faultCodes={[]} showNavigation={false} />,
    );

    // All 8 known modules should be present
    expect(screen.getByText('Engine Control Module')).toBeInTheDocument();
    expect(screen.getByText('Transmission Control Module')).toBeInTheDocument();
    expect(screen.getByText('Anti-lock Brake System')).toBeInTheDocument();
    expect(screen.getByText('Supplemental Restraint System')).toBeInTheDocument();
    expect(screen.getByText('Body Control Module')).toBeInTheDocument();
    expect(screen.getByText('Electronic Stability Program')).toBeInTheDocument();
    expect(screen.getByText('Instrument Cluster')).toBeInTheDocument();
    expect(screen.getByText('Climate Control Module')).toBeInTheDocument();

    // ECM and TCM should show "No Faults Detected"
    const noFaultsLabels = screen.getAllByText('No Faults Detected');
    expect(noFaultsLabels.length).toBeGreaterThanOrEqual(2);

    // OEM modules should show "OEM Diagnostics Required" (6 in badges + 1 in summary label)
    const oemLabels = screen.getAllByText('OEM Diagnostics Required');
    expect(oemLabels.length).toBeGreaterThanOrEqual(6);
  });

  it('renders MVP notice banner text', () => {
    renderWithProviders(
      <ControlUnitOverview faultCodes={[]} showNavigation={false} />,
    );

    expect(
      screen.getByText(/Generic OBD-II provides emissions and powertrain diagnostics only/),
    ).toBeInTheDocument();
  });

  it('renders summary cards with correct values', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '1', code: 'P0301', ecu: 'ECM', status: 'ACTIVE' }),
      makeFault({ id: '2', code: 'P0171', ecu: 'ECM', status: 'PENDING' }),
      makeFault({ id: '3', code: 'U0100', ecu: 'TCM', status: 'ACTIVE' }),
    ];

    renderWithProviders(
      <ControlUnitOverview faultCodes={faults} showNavigation={false} />,
    );

    // Summary card labels should be present
    expect(screen.getByText('Modules with Faults')).toBeInTheDocument();
    expect(screen.getByText('Total Fault Codes')).toBeInTheDocument();
    expect(screen.getByText('Generic OBD Modules Checked')).toBeInTheDocument();
    // "OEM Diagnostics Required" appears both in summary card and module badges
    expect(screen.getAllByText('OEM Diagnostics Required').length).toBeGreaterThanOrEqual(1);
    // Check "ECM, TCM" for generic OBD modules checked
    expect(screen.getByText('ECM, TCM')).toBeInTheDocument();
  });

  it('does not render misleading "All systems scanned" wording', () => {
    renderWithProviders(
      <ControlUnitOverview faultCodes={[]} showNavigation={false} />,
    );

    expect(screen.queryByText(/all systems scanned/i)).not.toBeInTheDocument();
    // "No Faults Detected" should appear for ECM and TCM (badge + expanded content)
    const noFaultsElements = screen.getAllByText(/No Faults Detected/i);
    expect(noFaultsElements.length).toBeGreaterThanOrEqual(2);
  });

  it('renders navigation links when showNavigation is true', () => {
    renderWithProviders(
      <ControlUnitOverview
        faultCodes={[]}
        sessionId="session-123"
        showNavigation={true}
      />,
    );

    expect(
      screen.getByText('Back to OBD Dashboard'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('View Diagnostic Session'),
    ).toBeInTheDocument();
    expect(screen.getByText('Start Live Data')).toBeInTheDocument();
    expect(screen.getByText('Export / Report')).toBeInTheDocument();
  });

  it('hides navigation when showNavigation is false', () => {
    renderWithProviders(
      <ControlUnitOverview faultCodes={[]} showNavigation={false} />,
    );

    expect(
      screen.queryByText('Back to OBD Dashboard'),
    ).not.toBeInTheDocument();
  });

  it('renders dynamic card for unknown ECU code', () => {
    const faults: FaultCode[] = [
      makeFault({ id: '4', code: 'C1000', ecu: 'RADAR', status: 'ACTIVE' }),
    ];

    renderWithProviders(
      <ControlUnitOverview faultCodes={faults} showNavigation={false} />,
    );

    expect(screen.getByText('RADAR')).toBeInTheDocument();
    expect(
      screen.getByText('Unknown / Unmapped Control Unit'),
    ).toBeInTheDocument();
  });
});