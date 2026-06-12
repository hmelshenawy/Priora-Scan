'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Vehicle } from '../../hooks/use-vehicles';

interface VehicleListTableProps {
  vehicles: Vehicle[];
}

export function VehicleListTable({ vehicles }: VehicleListTableProps) {
  const router = useRouter();

  if (vehicles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <h2 className="text-base font-semibold text-slate-900">
          No vehicles found
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Add a vehicle to start creating sessions and scan history.
        </p>
        <Link
          href="/vehicles/new"
          className="mt-4 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create Vehicle
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm md:block">
        <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Make
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Model
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Year
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              VIN
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Plate
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {vehicles.map((vehicle) => (
            <tr
              key={vehicle.id}
              className="hover:bg-gray-50 cursor-pointer"
              onClick={() => router.push(`/vehicles/${vehicle.id}`)}
            >
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                {vehicle.make}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                {vehicle.model}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                {vehicle.year}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                {vehicle.vin ?? '—'}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                {vehicle.plateNumber ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {vehicles.map((vehicle) => (
          <article
            key={vehicle.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {vehicle.plateNumber ?? vehicle.vin ?? 'No plate or VIN'}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/vehicles/${vehicle.id}`}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                View
              </Link>
              <Link
                href={`/vehicles/${vehicle.id}/sessions`}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Sessions
              </Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
