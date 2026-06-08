'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCreateDiagnosticSession,
  useVehicleSessions,
} from '../../../hooks/use-diagnostic-sessions';

interface VehicleSessionsPageProps {
  params: {
    id: string;
  };
}

export default function VehicleSessionsPage({ params }: VehicleSessionsPageProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;
  const createSession = useCreateDiagnosticSession(params.id);
  const sessionsQuery = useVehicleSessions(params.id, page, limit);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const session = await createSession.mutateAsync({
        title: title.trim() || undefined,
        description: description.trim() || undefined,
      });
      router.push(`/diagnostic-sessions/${session.id}`);
    } catch {
      // Error state is handled by the mutation object.
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Diagnostic Sessions</h1>
          <p className="mt-1 text-sm text-slate-600">Vehicle ID: {params.id}</p>
        </div>
        <Link href="/vehicles" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Back to vehicles
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Create a new session</h2>
          <p className="mt-2 text-sm text-slate-500">
            Start a diagnostic session for this vehicle. After creation, you will be redirected to the session detail page.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-slate-700">
                Session title
              </label>
              <input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="e.g. Pre-service diagnostics"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-700">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="Optional details about the diagnostic session"
                rows={4}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="submit"
                disabled={createSession.isLoading}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {createSession.isLoading ? 'Creating…' : 'Create session'}
              </button>
              {createSession.isError && (
                <p className="text-sm text-red-600">
                  {createSession.error instanceof Error
                    ? createSession.error.message
                    : 'Unable to create session. Please try again.'}
                </p>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Recent sessions</h2>
          {sessionsQuery.isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading sessions…</p>
          ) : sessionsQuery.isError ? (
            <p className="mt-4 text-sm text-red-600">Unable to load sessions.</p>
          ) : sessionsQuery.data?.length ? (
            <>
              <ul className="mt-4 space-y-3">
                {sessionsQuery.data.map((session) => (
                  <li key={session.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <Link
                      href={`/diagnostic-sessions/${session.id}`}
                      className="block text-base font-medium text-blue-600 hover:text-blue-800"
                    >
                      {session.number}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">{session.title ?? 'Untitled session'}</p>
                    <p className="mt-1 text-sm text-slate-500">Status: {session.status}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  disabled={page === 1 || sessionsQuery.isFetching}
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <p className="text-sm text-slate-500">Page {page}</p>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={sessionsQuery.data.length < limit || sessionsQuery.isFetching}
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              No sessions exist for this vehicle yet. Create a session to get started.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
