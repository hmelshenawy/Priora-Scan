'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  useDiagnosticSession,
  useUpdateDiagnosticSession,
} from '../../../hooks/use-diagnostic-sessions';

interface DiagnosticSessionDetailPageProps {
  params: {
    sessionId: string;
  };
}

export default function DiagnosticSessionDetailPage({ params }: DiagnosticSessionDetailPageProps) {
  const sessionQuery = useDiagnosticSession(params.sessionId);
  const updateSession = useUpdateDiagnosticSession(params.sessionId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (sessionQuery.data) {
      setTitle(sessionQuery.data.title ?? '');
      setDescription(sessionQuery.data.description ?? '');
    }
  }, [sessionQuery.data]);

  if (sessionQuery.isLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">Loading diagnostic session…</p>
      </div>
    );
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/vehicles" className="text-sm font-medium text-blue-600 hover:text-blue-800">
            ← Back to vehicles
          </Link>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Unable to load the requested session. Please verify the session link and try again.
        </div>
      </div>
    );
  }

  const session = sessionQuery.data;
  const isClosed = session.status === 'CLOSED';
  const canStart = session.status === 'OPEN';
  const canClose = session.status === 'IN_PROGRESS';

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await updateSession.mutateAsync({
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  const handleTransition = async (status: 'IN_PROGRESS' | 'CLOSED') => {
    await updateSession.mutateAsync({ status });
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Diagnostic Session</h1>
          <p className="mt-1 text-sm text-slate-600">{session.number}</p>
        </div>
        <Link href="/vehicles" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Back to vehicles
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-500">Session status</p>
              <p className="mt-2 text-lg font-medium text-slate-900">{session.status}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Vehicle ID</p>
              <p className="mt-2 text-lg font-medium text-slate-900">{session.vehicleId}</p>
            </div>
          </div>

          <form className="mt-6 space-y-6" onSubmit={handleSave}>
            <div>
              <label htmlFor="session-title" className="block text-sm font-medium text-slate-700">
                Title
              </label>
              <input
                id="session-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={isClosed || updateSession.isLoading}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                placeholder="Session title"
              />
            </div>

            <div>
              <label htmlFor="session-description" className="block text-sm font-medium text-slate-700">
                Description
              </label>
              <textarea
                id="session-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isClosed || updateSession.isLoading}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                rows={4}
              />
            </div>

            {!isClosed && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="submit"
                  disabled={updateSession.isLoading}
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {updateSession.isLoading ? 'Saving…' : 'Save changes'}
                </button>
                <p className="text-sm text-slate-500">
                  {session.status === 'OPEN'
                    ? 'Start the session when work begins.'
                    : 'Close the session when work is complete.'}
                </p>
              </div>
            )}

            {updateSession.error && (
              <p className="text-sm text-red-600">
                {updateSession.error instanceof Error
                  ? updateSession.error.message
                  : 'Unable to update session. Please try again.'}
              </p>
            )}
          </form>
        </section>

        <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Lifecycle actions</h2>
          <p className="mt-2 text-sm text-slate-500">
            Use the buttons below to progress the diagnostic session through the approved lifecycle.
          </p>

          <div className="mt-6 space-y-4">
            {isClosed ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                This session is closed and cannot be modified.
              </div>
            ) : (
              <>
                {canStart && (
                  <button
                    type="button"
                    onClick={() => handleTransition('IN_PROGRESS')}
                    disabled={updateSession.isLoading}
                    className="w-full rounded-md bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {updateSession.isLoading ? 'Updating…' : 'Start session'}
                  </button>
                )}
                {canClose && (
                  <button
                    type="button"
                    onClick={() => handleTransition('CLOSED')}
                    disabled={updateSession.isLoading}
                    className="w-full rounded-md bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {updateSession.isLoading ? 'Updating…' : 'Close session'}
                  </button>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          Sessions must progress through the lifecycle in the order: OPEN → IN_PROGRESS → CLOSED.
        </p>
      </section>
    </div>
  );
}
