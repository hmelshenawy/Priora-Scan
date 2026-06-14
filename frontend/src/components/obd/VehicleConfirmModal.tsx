'use client';

import { useEffect, useState } from 'react';
import { useConfirmVehicle } from '../../hooks/useObdScan';
import type { DecodedVehicle } from '../../hooks/useObdScan';
import { useVehicles } from '../../hooks/use-vehicles';

interface VehicleConfirmModalProps {
  scanJobId: string;
  vin?: string | null;
  decodedVehicle?: DecodedVehicle;
  onClose: () => void;
}

export function VehicleConfirmModal({
  scanJobId,
  vin,
  decodedVehicle,
  onClose,
}: VehicleConfirmModalProps) {
  const confirm = useConfirmVehicle();
  const [mode, setMode] = useState<'existing' | 'new'>(vin ? 'new' : 'existing');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [make, setMake] = useState(decodedVehicle?.make ?? '');
  const [model, setModel] = useState(decodedVehicle?.model ?? '');
  const [year, setYear] = useState(decodedVehicle?.year?.toString() ?? '');
  const [engine, setEngine] = useState(decodedVehicle?.engine ?? '');
  const [bodyStyle, setBodyStyle] = useState(decodedVehicle?.bodyStyle ?? '');
  const [plateNumber, setPlateNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const vehiclesQuery = useVehicles({
    search: vehicleSearch || undefined,
    limit: 8,
  });
  const hasDecodedDetails = !!(
    decodedVehicle?.make ||
    decodedVehicle?.model ||
    decodedVehicle?.year ||
    decodedVehicle?.engine ||
    decodedVehicle?.bodyStyle
  );

  useEffect(() => {
    if (!decodedVehicle) return;
    if (decodedVehicle.make) setMake(decodedVehicle.make);
    if (decodedVehicle.model) setModel(decodedVehicle.model);
    if (decodedVehicle.year) setYear(decodedVehicle.year.toString());
    if (decodedVehicle.engine) setEngine(decodedVehicle.engine);
    if (decodedVehicle.bodyStyle) setBodyStyle(decodedVehicle.bodyStyle);
  }, [decodedVehicle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'existing') {
      if (!selectedVehicleId) {
        setError('Select a vehicle to continue.');
        return;
      }

      try {
        await confirm.mutateAsync({
          id: scanJobId,
          input: {
            vehicleId: selectedVehicleId,
          },
        });
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to confirm vehicle.');
      }
      return;
    }

    const yearNum = parseInt(year, 10);
    if (!make || !model || !year || isNaN(yearNum)) {
      setError('Make, model, and year are required.');
      return;
    }

    try {
      await confirm.mutateAsync({
        id: scanJobId,
        input: {
          make,
          model,
          year: yearNum,
          vin: vin || undefined,
          plateNumber: plateNumber || undefined,
          engine: engine || undefined,
          bodyStyle: bodyStyle || undefined,
        },
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to confirm vehicle.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-slate-900">Confirm Vehicle</h2>
        <p className="mt-2 text-sm text-slate-500">
          {vin ? (
            <>
              The VIN <span className="font-mono font-medium">{vin}</span> does not match any
              vehicle in your workshop. Please provide vehicle details to continue.
            </>
          ) : (
            <>No VIN was reported by the vehicle. Please provide vehicle details to continue.</>
          )}
        </p>
        {!hasDecodedDetails && (
          <p className="mt-2 text-sm text-amber-700">Vehicle details unavailable.</p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 rounded-md border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`rounded px-3 py-2 text-sm font-medium ${
                mode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Existing
            </button>
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`rounded px-3 py-2 text-sm font-medium ${
                mode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              New
            </button>
          </div>

          {mode === 'existing' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Vehicle</label>
                <input
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Search make, model, VIN, or plate"
                />
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto">
                {vehiclesQuery.isLoading && (
                  <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                    Loading vehicles...
                  </p>
                )}
                {vehiclesQuery.data?.data.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => setSelectedVehicleId(vehicle.id)}
                    className={`w-full rounded-md border p-3 text-left text-sm ${
                      selectedVehicleId === vehicle.id
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-medium text-slate-900">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {vehicle.plateNumber || 'No plate'} · {vehicle.vin || 'No VIN'}
                    </span>
                  </button>
                ))}
                {!vehiclesQuery.isLoading && vehiclesQuery.data?.data.length === 0 && (
                  <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                    No matching vehicles.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700">Make</label>
                <input
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="e.g., Honda"
                  required={mode === 'new'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Model</label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="e.g., Accord"
                  required={mode === 'new'}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Year</label>
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="e.g., 2020"
                type="number"
                required={mode === 'new'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Plate</label>
              <input
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="Optional"
              />
            </div>
          </div>

              <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Engine</label>
              <input
                value={engine}
                onChange={(e) => setEngine(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Body Style</label>
              <input
                value={bodyStyle}
                onChange={(e) => setBodyStyle(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="Optional"
              />
            </div>
          </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={confirm.isPending}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {confirm.isPending ? 'Confirming…' : 'Confirm & Resume'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
