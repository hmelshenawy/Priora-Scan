'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { VehicleForm } from '../../../../components/vehicles/vehicle-form';
import { useVehicle, useUpdateVehicle } from '../../../../hooks/use-vehicles';
import { UpdateVehicleInput } from '../../../../lib/validators/vehicle.schema';

export default function EditVehiclePage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';

  const { data: vehicle, isLoading: isLoadingVehicle } = useVehicle(id);
  const updateVehicle = useUpdateVehicle(id);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: UpdateVehicleInput | any) => {
    setError(null);
    try {
      await updateVehicle.mutateAsync(data);
      router.push(`/vehicles/${id}`);
    } catch (err: any) {
      const message =
        err.response?.data?.message || 'Failed to update vehicle. Please try again.';
      setError(message);
    }
  };

  if (isLoadingVehicle) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <p className="text-gray-500">Loading vehicle...</p>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Vehicle not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <a
          href={`/vehicles/${id}`}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          ← Back to vehicle
        </a>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Edit Vehicle</h1>
        <p className="mt-1 text-sm text-gray-500">
          {vehicle.make} {vehicle.model} ({vehicle.year})
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
        <VehicleForm
          mode="edit"
          vehicle={vehicle}
          onSubmit={handleSubmit}
          isSubmitting={updateVehicle.isPending}
        />
      </div>
    </div>
  );
}
