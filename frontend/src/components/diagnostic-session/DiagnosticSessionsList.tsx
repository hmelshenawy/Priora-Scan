'use client';

import Link from 'next/link';
import type { DiagnosticSessionListItem } from '../../hooks/use-diagnostic-sessions';

interface DiagnosticSessionsListProps {
  sessions: DiagnosticSessionListItem[];
}

function statusClass(status: DiagnosticSessionListItem['status']) {
  if (status === 'OPEN') return 'bg-blue-100 text-blue-700';
  if (status === 'IN_PROGRESS') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function DiagnosticSessionsList({
  sessions,
}: DiagnosticSessionsListProps) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <h2 className="text-base font-semibold text-slate-900">
          No diagnostic sessions yet
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Create a session from a vehicle page or complete an OBD scan to start
          building diagnostic history.
        </p>
        <Link
          href="/vehicles"
          className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Go to Vehicles
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Session #
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Vehicle
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fault Count
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Created
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sessions.map((session) => (
              <tr key={session.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-slate-900">
                  {session.number}
                </td>
                <td className="px-4 py-4 text-sm text-slate-700">
                  <Link
                    href={`/vehicles/${session.vehicleId}`}
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    {session.vehicleLabel}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {session.vehicle.plateNumber ?? session.vehicle.vin ?? session.vehicleId}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(session.status)}`}
                  >
                    {session.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-700">
                  {session.faultCount === null ? 'Unknown' : session.faultCount}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                  {formatDate(session.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                  <Link
                    href={`/diagnostic-sessions/${session.id}`}
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-200 md:hidden">
        {sessions.map((session) => (
          <article key={session.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {session.number}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {session.vehicleLabel}
                </p>
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(session.status)}`}
              >
                {session.status}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-500">Fault Count</dt>
                <dd className="mt-1 text-slate-900">
                  {session.faultCount === null ? 'Unknown' : session.faultCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Created</dt>
                <dd className="mt-1 text-slate-900">
                  {formatDate(session.createdAt)}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-3">
              <Link
                href={`/diagnostic-sessions/${session.id}`}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Open Session
              </Link>
              <Link
                href={`/vehicles/${session.vehicleId}`}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                View Vehicle
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
