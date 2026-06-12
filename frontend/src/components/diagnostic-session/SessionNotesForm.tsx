'use client';

import type { FormEvent } from 'react';
import type { DiagnosticSession } from '../../lib/api-client';

interface SessionNotesFormProps {
  session: DiagnosticSession;
  title: string;
  description: string;
  isPending?: boolean;
  error?: Error | null;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function SessionNotesForm({
  session,
  title,
  description,
  isPending,
  error,
  onTitleChange,
  onDescriptionChange,
  onSubmit,
}: SessionNotesFormProps) {
  const isClosed = session.status === 'CLOSED';

  return (
    <section
      id="notes"
      className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">Notes</h2>
        <p className="text-sm text-slate-500">
          Keep the session title and work notes readable for future visits.
        </p>
      </div>

      <form className="mt-5 space-y-5" onSubmit={onSubmit}>
        <div>
          <label
            htmlFor="session-title"
            className="block text-sm font-medium text-slate-700"
          >
            Title
          </label>
          <input
            id="session-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            disabled={isClosed || isPending}
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            placeholder="Session title"
          />
        </div>

        <div>
          <label
            htmlFor="session-description"
            className="block text-sm font-medium text-slate-700"
          >
            Description
          </label>
          <textarea
            id="session-description"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            disabled={isClosed || isPending}
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            rows={5}
            placeholder="Symptoms, customer notes, technician observations..."
          />
        </div>

        {!isClosed && (
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isPending ? 'Saving...' : 'Save notes'}
          </button>
        )}

        {isClosed && (
          <p className="text-sm text-slate-500">
            Closed sessions are read-only.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600">
            {error instanceof Error
              ? error.message
              : 'Unable to update session. Please try again.'}
          </p>
        )}
      </form>
    </section>
  );
}
