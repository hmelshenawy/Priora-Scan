'use client';

import Link from 'next/link';
import type { DiagnosticSession } from '../../lib/api-client';

interface VehicleSessionListProps {
  sessions?: DiagnosticSession[];
  isLoading?: boolean;
  isError?: boolean;
  vehicleId: string;
}

function statusClass(status: DiagnosticSession['status']) {
  if (status === 'OPEN') return 'bg-blue-100 text-blue-700';
  if (status === 'IN_PROGRESS') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export function VehicleSessionList({
  sessions,
  isLoading,
  isError,
  vehicleId,
}: VehicleSessionListProps) {
  const recentSessions = sessions?.slice(0, 5) ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Diagnostic History
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Recent sessions for this vehicle.
          </p>
        </div>
        <Link
          href={`/vehicles/${vehicleId}/sessions`}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          View all sessions
        </Link>
      </div>

      {isLoading && (
        <p className="mt-5 text-sm text-slate-500">Loading sessions...</p>
      )}

      {isError && (
        <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Unable to load diagnostic history.
        </div>
      )}

      {!isLoading && !isError && recentSessions.length === 0 && (
        <div className="mt-5 rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-500">
            No diagnostic sessions yet.
          </p>
          <Link
            href={`/vehicles/${vehicleId}/sessions`}
            className="mt-4 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create Diagnostic Session
          </Link>
        </div>
      )}

      {recentSessions.length > 0 && (
        <div className="mt-5 divide-y divide-slate-200">
          {recentSessions.map((session) => (
            <div
              key={session.id}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <Link
                  href={`/diagnostic-sessions/${session.id}`}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                >
                  {session.number}
                </Link>
                <p className="mt-1 text-sm text-slate-600">
                  {session.title ?? 'Untitled session'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Created {new Date(session.createdAt).toLocaleString()}
                </p>
              </div>
              <span
                className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(session.status)}`}
              >
                {session.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
