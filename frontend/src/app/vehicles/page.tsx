'use client';

import { useState } from 'react';
import Link from 'next/link';
import { VehicleSearchFilters } from '../../components/vehicles/vehicle-search-filters';
import { VehicleListTable } from '../../components/vehicles/vehicle-list-table';
import { useVehicles, VehicleFilters } from '../../hooks/use-vehicles';

export default function VehiclesPage() {
  const [filters, setFilters] = useState<VehicleFilters>({ page: 1, limit: 25 });
  const { data, isLoading, isError, error } = useVehicles(filters);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vehicles</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage vehicles in your workshop.
          </p>
        </div>
        <Link
          href="/vehicles/new"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create Vehicle
        </Link>
      </div>

      <VehicleSearchFilters onSearch={(f) => setFilters({ ...f, page: 1 })} />

      {isLoading && (
        <p className="text-gray-500">Loading vehicles...</p>
      )}

      {isError && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            {error instanceof Error ? error.message : 'Failed to load vehicles.'}
          </p>
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          <VehicleListTable vehicles={data.data} />

          {data.pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Page {data.pagination.page} of {data.pagination.totalPages} (
                {data.pagination.total} total)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      page: Math.max(1, (prev.page ?? 1) - 1),
                    }))
                  }
                  disabled={data.pagination.page <= 1}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      page: Math.min(
                        data.pagination.totalPages,
                        (prev.page ?? 1) + 1,
                      ),
                    }))
                  }
                  disabled={data.pagination.page >= data.pagination.totalPages}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
