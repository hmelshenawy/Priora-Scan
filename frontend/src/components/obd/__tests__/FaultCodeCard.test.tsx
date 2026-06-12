/// <reference types="@testing-library/jest-dom" />
import { renderWithProviders, screen } from '../../../../tests/test-utils';
import { FaultCodeCard } from '../FaultCodeCard';
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

describe('FaultCodeCard', () => {
  it('renders enriched fault code with title and description', () => {
    renderWithProviders(
      <FaultCodeCard code={makeFault()} />,
    );

    expect(screen.getByText('P0301')).toBeInTheDocument();
    expect(screen.getByText('Cylinder 1 Misfire Detected')).toBeInTheDocument();
  });

  it('renders unknown code with "No description available"', () => {
    renderWithProviders(
      <FaultCodeCard
        code={makeFault({
          code: 'X9999',
          title: null,
          description: null,
          hasDescription: false,
        })}
      />,
    );

    expect(screen.getByText('X9999')).toBeInTheDocument();
    expect(screen.getByText('No description available')).toBeInTheDocument();
  });

  it('renders ACTIVE status badge', () => {
    renderWithProviders(
      <FaultCodeCard code={makeFault({ status: 'ACTIVE' })} />,
    );

    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('renders PENDING status badge', () => {
    renderWithProviders(
      <FaultCodeCard code={makeFault({ status: 'PENDING' })} />,
    );

    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('renders PERMANENT status as STORED', () => {
    renderWithProviders(
      <FaultCodeCard code={makeFault({ status: 'PERMANENT' })} />,
    );

    expect(screen.getByText('STORED')).toBeInTheDocument();
  });

  it('renders POWERTRAIN system badge', () => {
    renderWithProviders(
      <FaultCodeCard code={makeFault({ system: 'POWERTRAIN' })} />,
    );

    expect(screen.getByText('POWERTRAIN')).toBeInTheDocument();
  });

  it('renders UNKNOWN severity badge', () => {
    renderWithProviders(
      <FaultCodeCard code={makeFault({ severity: 'UNKNOWN' })} />,
    );

    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
  });
});