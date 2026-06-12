'use client';

import { Breadcrumbs } from '../../components/layout/Breadcrumbs';
import { PageHeader } from '../../components/layout/PageHeader';
import { DiagnosticSessionsList } from '../../components/diagnostic-session/DiagnosticSessionsList';
import { useDiagnosticSessionList } from '../../hooks/use-diagnostic-sessions';

export default function DiagnosticSessionsPage() {
  const sessionsQuery = useDiagnosticSessionList();

  return (
    <div className="mx-auto max-w-7xl">
      <Breadcrumbs items={[{ label: 'Diagnostics' }, { label: 'Sessions' }]} />
      <PageHeader
        eyebrow="Diagnostics"
        title="Diagnostic Sessions"
        description="Find prior diagnostic work without first opening a vehicle record."
      />

      {sessionsQuery.isLoading && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Loading diagnostic sessions...
        </div>
      )}

      {sessionsQuery.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Unable to load diagnostic sessions. Please try again.
        </div>
      )}

      {sessionsQuery.data && (
        <DiagnosticSessionsList sessions={sessionsQuery.data} />
      )}
    </div>
  );
}
