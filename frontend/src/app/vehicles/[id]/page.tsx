'use client';

import Link from 'next/link';
import { useVehicle } from '../../../hooks/use-vehicles';
import { useVehicleSessions } from '../../../hooks/use-diagnostic-sessions';
import { VehicleDetailHeader } from '../../../components/vehicles/VehicleDetailHeader';
import { VehicleSessionList } from '../../../components/vehicles/VehicleSessionList';
import { Breadcrumbs } from '../../../components/layout/Breadcrumbs';
import { useParams } from 'next/navigation';

export default function VehicleDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const { data: vehicle, isLoading, isError, error } = useVehicle(id);
  const sessionsQuery = useVehicleSessions(id, 1, 5);

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
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Vehicles', href: '/vehicles' },
          { label: `${vehicle.year} ${vehicle.make} ${vehicle.model}` },
        ]}
      />

      <VehicleDetailHeader vehicle={vehicle} />
      <VehicleSessionList
        vehicleId={vehicle.id}
        sessions={sessionsQuery.data}
        isLoading={sessionsQuery.isLoading}
        isError={sessionsQuery.isError}
      />
    </div>
  );
}
