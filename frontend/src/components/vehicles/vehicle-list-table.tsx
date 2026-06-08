'use client';

import { Vehicle } from '../../hooks/use-vehicles';

interface VehicleListTableProps {
  vehicles: Vehicle[];
}

export function VehicleListTable({ vehicles }: VehicleListTableProps) {
  if (vehicles.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-8 text-center">
        <p className="text-gray-500">No vehicles found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
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
              onClick={() => (window.location.href = `/vehicles/${vehicle.id}`)}
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
  );
}
