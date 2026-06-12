'use client';

import Link from 'next/link';
import { ClipboardList, Edit, PlayCircle } from 'lucide-react';
import type { Vehicle } from '../../hooks/use-vehicles';

interface VehicleDetailHeaderProps {
  vehicle: Vehicle;
}

export function VehicleDetailHeader({ vehicle }: VehicleDetailHeaderProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Vehicle Record
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {vehicle.plateNumber || 'No plate'} · {vehicle.vin || 'No VIN recorded'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/vehicles/${vehicle.id}/sessions`}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <ClipboardList className="h-4 w-4" />
            Create Session
          </Link>
          <Link
            href="/obd"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <PlayCircle className="h-4 w-4" />
            Start OBD Scan
          </Link>
          <Link
            href={`/vehicles/${vehicle.id}/edit`}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Edit className="h-4 w-4" />
            Edit
          </Link>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Year
          </dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">
            {vehicle.year}
          </dd>
        </div>
        <div className="rounded-md bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            VIN
          </dt>
          <dd className="mt-1 break-all font-mono text-sm font-medium text-slate-900">
            {vehicle.vin ?? '—'}
          </dd>
        </div>
        <div className="rounded-md bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Engine
          </dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">
            {vehicle.engine ?? '—'}
          </dd>
        </div>
        <div className="rounded-md bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Body
          </dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">
            {vehicle.bodyStyle ?? '—'}
          </dd>
        </div>
      </dl>
    </section>
  );
}
