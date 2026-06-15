'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  useDiagnosticSession,
  useUpdateDiagnosticSession,
} from '../../../hooks/use-diagnostic-sessions';
import { useVehicle } from '../../../hooks/use-vehicles';
import { useSessionFaultCodes } from '../../../hooks/useObdScan';
import { LiveDataCard } from '../../../components/live-data/LiveDataCard';
import { VehicleHealthPanel } from '../../../components/vehicle-data/VehicleHealthPanel';
import ControlUnitsPanel from '../../../components/vehicle-data/ControlUnitsPanel';
import { Breadcrumbs } from '../../../components/layout/Breadcrumbs';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LoadingState } from '../../../components/ui/LoadingState';
import { SessionHeader } from '../../../components/diagnostic-session/SessionHeader';
import { SessionLifecyclePanel } from '../../../components/diagnostic-session/SessionLifecyclePanel';
import { SessionNotesForm } from '../../../components/diagnostic-session/SessionNotesForm';
import { AuditTrail } from '../../../components/diagnostic-session/AuditTrail';
import { useVehicleData } from '../../../services/vehicle-data-api';

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
  const session = sessionQuery.data;
  const vehicleQuery = useVehicle(session?.vehicleId ?? '');
  const faultCodesQuery = useSessionFaultCodes(session?.id ?? null);
  const vehicleDataQuery = useVehicleData(session?.id ?? null);

  useEffect(() => {
    if (sessionQuery.data) {
      setTitle(sessionQuery.data.title ?? '');
      setDescription(sessionQuery.data.description ?? '');
    }
  }, [sessionQuery.data]);

  if (sessionQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <LoadingState title="Loading diagnostic session" message="Opening the session workspace." />
      </div>
    );
  }

  if (sessionQuery.isError || !session) {
    return (
      <div className="mx-auto max-w-7xl">
        <ErrorState
          title="Session unavailable"
          message="Unable to load the requested session. Please verify the session link and try again."
          actionHref="/diagnostic-sessions"
          actionLabel="Back to diagnostic sessions"
        />
      </div>
    );
  }

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
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Diagnostic Sessions', href: '/diagnostic-sessions' },
          { label: session.number },
        ]}
      />

      <SessionHeader
        session={session}
        vehicle={vehicleQuery.data}
        vehicleLoading={vehicleQuery.isLoading}
      />

      <nav className="sticky top-14 z-10 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {[
            ['#overview', 'Overview'],
            ['#vehicle-health', 'Vehicle Health'],
            ['#control-units', 'Control Units'],
            ['#live-data', 'Live Data'],
            ['#audit-trail', 'Audit Trail'],
            ['#notes', 'Notes'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <section id="overview" className="grid scroll-mt-32 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-500">Session</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{session.number}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Vehicle</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {vehicleQuery.data
                  ? `${vehicleQuery.data.year} ${vehicleQuery.data.make} ${vehicleQuery.data.model}`
                  : session.vehicleId}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Status</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{session.status}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">Fault Codes</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {faultCodesQuery.isLoading
                  ? 'Loading...'
                  : faultCodesQuery.isError
                    ? 'Unavailable'
                    : (faultCodesQuery.data?.data.length ?? 0)}
              </dd>
            </div>
          </dl>
        </div>

        <SessionLifecyclePanel
          session={session}
          isPending={updateSession.isPending}
          onTransition={handleTransition}
        />
      </section>

      <section id="vehicle-health" className="scroll-mt-32">
        <VehicleHealthPanel
          sessionId={session.id}
          isSessionOpen={session.status !== 'CLOSED'}
          vehicle={vehicleQuery.data}
        />
      </section>

      <section
        id="control-units"
        className="scroll-mt-32 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        {vehicleDataQuery.isLoading && (
          <LoadingState
            title="Loading control units"
            message="Fetching control unit discovery data."
          />
        )}

        {vehicleDataQuery.isError && (
          <ErrorState
            title="Control unit discovery unavailable"
            message="Unable to load control unit discovery data for this diagnostic session."
          />
        )}

        {vehicleDataQuery.data && (
          vehicleDataQuery.data.vehicleData?.controlUnitDiscovery ? (
            <ControlUnitsPanel
              controlUnitDiscovery={vehicleDataQuery.data.vehicleData.controlUnitDiscovery}
            />
          ) : (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Control Units</h2>
              <p className="mt-3 text-sm text-slate-500">
                No control unit discovery data yet.
              </p>
            </div>
          )
        )}
      </section>

      <section id="live-data" className="mt-6 scroll-mt-20">
        <LiveDataCard diagnosticSessionId={session.id} />
      </section>

      <section id="audit-trail" className="scroll-mt-32">
        <AuditTrail sessionId={session.id} />
      </section>

      <SessionNotesForm
        session={session}
        title={title}
        description={description}
        isPending={updateSession.isPending}
        error={updateSession.error}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onSubmit={handleSave}
      />
    </div>
  );
}
