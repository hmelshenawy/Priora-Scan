'use client';

import { useState } from 'react';
import { AgentStatusCard } from '../../components/obd/AgentStatusCard';
import { ScanControlPanel } from '../../components/obd/ScanControlPanel';
import { ScanProgressTimeline } from '../../components/obd/ScanProgressTimeline';
import { ControlUnitOverview } from '../../components/obd/ControlUnitOverview';
import { VehicleConfirmModal } from '../../components/obd/VehicleConfirmModal';
import { PairAgentModal } from '../../components/obd/PairAgentModal';
import { ObdReadinessPanel } from '../../components/obd/ObdReadinessPanel';
import { ScanEmptyState } from '../../components/obd/ScanEmptyState';
import { ScanRecoveryActions } from '../../components/obd/ScanRecoveryActions';
import { ScanResultActions } from '../../components/obd/ScanResultActions';
import { useScanJob, useCancelScan, useScanResults, useStartScan } from '../../hooks/useObdScan';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { Breadcrumbs } from '../../components/layout/Breadcrumbs';
import { PageHeader } from '../../components/layout/PageHeader';

export default function ObdDashboardPage() {
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [showPairModal, setShowPairModal] = useState(false);

  const agentsQuery = useAgentStatus();
  const scanQuery = useScanJob(activeScanId);
  const cancelScan = useCancelScan();
  const startScan = useStartScan();
  const scanResultsQuery = useScanResults(
    scanQuery.data?.status === 'COMPLETED' ? activeScanId : null,
  );

  const scan = scanQuery.data;
  const needsConfirmation = scan?.status === 'NEEDS_VEHICLE_CONFIRMATION';
  const faultCodes = scanResultsQuery.data?.data ?? [];
  const isActiveScan =
    scan && scan.status !== 'COMPLETED' && scan.status !== 'FAILED' && scan.status !== 'CANCELLED';
  const canStartNewScan = !!agentsQuery.data?.find(
    (agent) => agent.status === 'ONLINE' && agent.adapterConnected,
  );

  const handleScanStarted = (id: string) => {
    setActiveScanId(id);
  };

  const handleCancel = async () => {
    if (!activeScanId) return;
    try {
      await cancelScan.mutateAsync(activeScanId);
    } catch {
      /* ignore */
    }
  };

  const handleStartNewScan = async () => {
    const agent = agentsQuery.data?.find(
      (candidate) => candidate.status === 'ONLINE' && candidate.adapterConnected,
    );
    if (!agent) return;
    const nextScan = await startScan.mutateAsync(agent.id);
    setActiveScanId(nextScan.id);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <Breadcrumbs items={[{ label: 'Diagnostics' }, { label: 'OBD Dashboard' }]} />
      <PageHeader
        eyebrow="Diagnostics"
        title="OBD Dashboard"
        description="Check scan readiness, run OBD scans, and continue into diagnostic sessions."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <ObdReadinessPanel agents={agentsQuery.data} isLoading={agentsQuery.isLoading} />
          <AgentStatusCard onPairAgent={() => setShowPairModal(true)} />
          <ScanControlPanel onScanStarted={handleScanStarted} />

          {activeScanId && isActiveScan && (
            <button
              onClick={handleCancel}
              disabled={cancelScan.isPending}
              className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelScan.isPending ? 'Cancelling…' : 'Cancel Scan'}
            </button>
          )}
        </div>

        <div className="space-y-6">
          {!scan && <ScanEmptyState />}

          {scan && (
            <ScanProgressTimeline
              status={scan.status}
              vin={scan.vin}
              decodedVehicle={scan.decodedVehicle}
              errorMessage={scan.errorMessage}
            />
          )}

          {(scan?.status === 'FAILED' || scan?.status === 'CANCELLED') && (
            <ScanRecoveryActions
              status={scan.status}
              isStarting={startScan.isPending}
              canStart={canStartNewScan}
              onStartNewScan={handleStartNewScan}
            />
          )}

          {scan?.status === 'COMPLETED' && (
            <>
              <ScanResultActions
                sessionId={scan.diagnosticSessionId}
                faultCount={faultCodes.length}
              />
              {scanResultsQuery.isLoading && (
                <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                  Loading scan results...
                </div>
              )}
              {scanResultsQuery.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
                  Unable to load scan results.
                </div>
              )}
              {scanResultsQuery.data && (
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                  <ControlUnitOverview
                    faultCodes={faultCodes}
                    scanJobId={activeScanId ?? undefined}
                    sessionId={scan.diagnosticSessionId ?? undefined}
                    showNavigation={false}
                  />
                </div>
              )}
            </>
          )}

          {(scan?.status === 'FAILED' || scan?.status === 'CANCELLED') && !canStartNewScan && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Start New Scan is available after an online agent with a connected adapter is
              detected.
            </div>
          )}
        </div>
      </div>

      {showPairModal && <PairAgentModal onClose={() => setShowPairModal(false)} />}

      {needsConfirmation && scan?.vin && (
        <VehicleConfirmModal
          scanJobId={scan.id}
          vin={scan.vin}
          decodedVehicle={scan.decodedVehicle}
          onClose={() => {
            /* Modal closes automatically on success; scan query will refetch */
          }}
        />
      )}
    </div>
  );
}
