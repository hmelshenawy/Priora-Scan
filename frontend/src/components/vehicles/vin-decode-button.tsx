'use client';

import { useEffect } from 'react';
import { useVinDecode, VehicleDecodeResult } from '../../hooks/use-vehicles';

interface VinDecodeButtonProps {
  vin: string;
  onDecoded: (result: VehicleDecodeResult) => void;
}

/**
 * Triggers the backend `/vehicles/decode` endpoint when the VIN is long
 * enough. The user must explicitly press the button — auto-decode is not
 * MVP behavior, and this keeps the user in control of the round-trip.
 */
export function VinDecodeButton({ vin, onDecoded }: VinDecodeButtonProps) {
  const enabled = !!vin && vin.length >= 3 && vin.length <= 25;
  const query = useVinDecode(enabled ? vin : null);

  useEffect(() => {
    if (query.data) {
      onDecoded(query.data);
    }
  }, [query.data, onDecoded]);

  if (!enabled) return null;

  if (query.isError) {
    return (
      <p className="mt-1 text-xs text-amber-700">
        We could not auto-fill from the VIN. Please enter the vehicle details
        manually.
      </p>
    );
  }

  if (query.isSuccess) {
    const source = query.data.cacheHit ? 'cache' : 'VPIC asset';
    return (
      <p className="mt-1 text-xs text-emerald-700">
        Auto-filled from {source}. Review the values and edit if needed.
      </p>
    );
  }

  return (
    <p className="mt-1 text-xs text-slate-500">
      Looking up VIN… (the form will auto-fill once the lookup completes)
    </p>
  );
}
