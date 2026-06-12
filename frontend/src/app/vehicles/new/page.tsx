'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { VehicleForm } from '../../../components/vehicles/vehicle-form';
import { useCreateVehicle } from '../../../hooks/use-vehicles';
import { CreateVehicleInput } from '../../../lib/validators/vehicle.schema';

export default function NewVehiclePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const createVehicle = useCreateVehicle();

  const handleSubmit = async (data: CreateVehicleInput | any) => {
    setError(null);
    try {
      await createVehicle.mutateAsync(data);
      router.push('/vehicles');
    } catch (err: any) {
      const message =
        err.response?.data?.message || 'Failed to create vehicle. Please try again.';
      setError(message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          href="/vehicles"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          ← Back to vehicles
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create Vehicle</h1>
        <p className="mt-1 text-sm text-gray-500">
          Register a new vehicle into your workshop.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
        <VehicleForm
          mode="create"
          onSubmit={handleSubmit}
          isSubmitting={createVehicle.isPending}
        />
        <Link
          href="/vehicles"
          className="mt-4 inline-flex text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
