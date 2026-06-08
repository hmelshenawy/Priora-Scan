'use client';

import { useVehicle } from '../../../hooks/use-vehicles';
import { VehicleHistoryPlaceholder } from '../../../components/vehicles/vehicle-history-placeholder';
import { useParams } from 'next/navigation';

export default function VehicleDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const { data: vehicle, isLoading, isError, error } = useVehicle(id);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <p className="text-gray-500">Loading vehicle details...</p>
      </div>
    );
  }

  if (isError || !vehicle) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            {error instanceof Error
              ? error.message
              : 'Vehicle not found or you do not have access.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <a
          href="/vehicles"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          ← Back to vehicles
        </a>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {vehicle.make} {vehicle.model}
            </h1>
            <p className="mt-1 text-sm text-gray-500">ID: {vehicle.id}</p>
          </div>
          <a
            href={`/vehicles/${vehicle.id}/edit`}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Edit
          </a>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Year</dt>
            <dd className="mt-1 text-sm text-gray-900">{vehicle.year}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">VIN</dt>
            <dd className="mt-1 text-sm text-gray-900">{vehicle.vin ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Plate Number</dt>
            <dd className="mt-1 text-sm text-gray-900">{vehicle.plateNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Created</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {new Date(vehicle.createdAt).toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>

      <VehicleHistoryPlaceholder />
    </div>
  );
}
