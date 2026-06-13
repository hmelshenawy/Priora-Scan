/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { ScanProgressTimeline } from '../ScanProgressTimeline';

describe('ScanProgressTimeline', () => {
  it('shows decoded vehicle details when an OBD VIN has been enriched', () => {
    render(
      <ScanProgressTimeline
        status="NEEDS_VEHICLE_CONFIRMATION"
        vin="WDD2130041A123456"
        decodedVehicle={{
          vin: 'WDD2130041A123456',
          make: 'Mercedes-Benz',
          model: 'E-Class',
          year: 2018,
          engine: '2.0L Turbo',
          bodyStyle: 'Sedan',
          manufacturer: 'Mercedes-Benz Cars',
          source: 'vpic-asset',
          decodedAt: '2026-06-13T12:00:00Z',
          cacheHit: true,
        }}
      />,
    );

    expect(screen.getByText('WDD2130041A123456')).toBeInTheDocument();
    expect(screen.getByText('Mercedes-Benz')).toBeInTheDocument();
    expect(screen.getByText('E-Class')).toBeInTheDocument();
    expect(screen.getByText('2018')).toBeInTheDocument();
    expect(screen.getByText('2.0L Turbo')).toBeInTheDocument();
    expect(screen.getByText('Sedan')).toBeInTheDocument();
  });

  it('keeps the VIN visible when decoded details are unavailable', () => {
    render(<ScanProgressTimeline status="NEEDS_VEHICLE_CONFIRMATION" vin="WDD2130041A123456" />);

    expect(screen.getByText('WDD2130041A123456')).toBeInTheDocument();
    expect(screen.getByText('Vehicle details unavailable.')).toBeInTheDocument();
  });
});
