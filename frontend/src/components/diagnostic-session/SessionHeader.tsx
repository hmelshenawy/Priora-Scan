'use client';

import Link from 'next/link';
import { CalendarClock, Car, ClipboardList } from 'lucide-react';
import type { DiagnosticSession } from '../../lib/api-client';
import type { Vehicle } from '../../hooks/use-vehicles';
import { StatusBadge } from '../ui/StatusBadge';

interface SessionHeaderProps {
  session: DiagnosticSession;
  vehicle?: Vehicle;
  vehicleLoading?: boolean;
}

function sessionTone(status: DiagnosticSession['status']) {
  if (status === 'OPEN') return 'blue';
  if (status === 'IN_PROGRESS') return 'amber';
  return 'slate';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function SessionHeader({
  session,
  vehicle,
  vehicleLoading,
}: SessionHeaderProps) {
  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : vehicleLoading
      ? 'Loading vehicle...'
      : 'Vehicle details unavailable';

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-950">
              {session.number}
            </h1>
            <StatusBadge status={session.status} tone={sessionTone(session.status)} />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            {session.title || 'Untitled diagnostic session'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/vehicles/${session.vehicleId}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            View Vehicle
          </Link>
          <Link
            href="#live-data"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Live Data
          </Link>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-md bg-slate-50 p-4">
          <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Car className="h-4 w-4" />
            Vehicle
          </dt>
          <dd className="mt-2 text-sm font-medium text-slate-900">
            {vehicle ? (
              <Link
                href={`/vehicles/${session.vehicleId}`}
                className="text-blue-600 hover:text-blue-800"
              >
                {vehicleLabel}
              </Link>
            ) : (
              vehicleLabel
            )}
          </dd>
          {vehicle?.vin && (
            <dd className="mt-1 font-mono text-xs text-slate-500">
              {vehicle.vin}
            </dd>
          )}
        </div>

        <div className="rounded-md bg-slate-50 p-4">
          <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <CalendarClock className="h-4 w-4" />
            Created
          </dt>
          <dd className="mt-2 text-sm font-medium text-slate-900">
            {formatDate(session.createdAt)}
          </dd>
        </div>

        <div className="rounded-md bg-slate-50 p-4">
          <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <ClipboardList className="h-4 w-4" />
            Session Notes
          </dt>
          <dd className="mt-2 text-sm font-medium text-slate-900">
            {session.description ? 'Notes saved' : 'No notes yet'}
          </dd>
        </div>
      </dl>
    </section>
  );
}
