'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AgentStatusCard } from '../../components/obd/AgentStatusCard';
import { ScanControlPanel } from '../../components/obd/ScanControlPanel';
import { ScanProgressTimeline } from '../../components/obd/ScanProgressTimeline';
import { ControlUnitOverview } from '../../components/obd/ControlUnitOverview';
import { VehicleConfirmModal } from '../../components/obd/VehicleConfirmModal';
import { PairAgentModal } from '../../components/obd/PairAgentModal';
import { useScanJob, useCancelScan, useScanResults } from '../../hooks/useObdScan';

export default function ObdDashboardPage() {
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [showPairModal, setShowPairModal] = useState(false);

  const scanQuery = useScanJob(activeScanId);
  const cancelScan = useCancelScan();
  const scanResultsQuery = useScanResults(
    scanQuery.data?.status === 'COMPLETED' ? activeScanId : null,
  );

  const scan = scanQuery.data;
  const needsConfirmation = scan?.status === 'NEEDS_VEHICLE_CONFIRMATION';
  const faultCodes = scanResultsQuery.data?.data ?? [];

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

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">OBD Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage Desktop Agent, start scans, and view results.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Back to home
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <AgentStatusCard onPairAgent={() => setShowPairModal(true)} />
          <ScanControlPanel onScanStarted={handleScanStarted} />

          {activeScanId && scan && scan.status !== 'COMPLETED' && scan.status !== 'FAILED' && scan.status !== 'CANCELLED' && (
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
          {scan && (
            <ScanProgressTimeline
              status={scan.status}
              vin={scan.vin}
              errorMessage={scan.errorMessage}
            />
          )}

          {scan?.status === 'COMPLETED' && (
            <ControlUnitOverview
              faultCodes={faultCodes}
              scanJobId={activeScanId ?? undefined}
              sessionId={scan.diagnosticSessionId ?? undefined}
              showNavigation={true}
            />
          )}

          {scan?.status === 'COMPLETED' && scan.diagnosticSessionId && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-600">
                Scan complete. View the full diagnostic session for detailed analysis.
              </p>
              <Link
                href={`/diagnostic-sessions/${scan.diagnosticSessionId}`}
                className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Open Session →
              </Link>
            </div>
          )}
        </div>
      </div>

      {showPairModal && (
        <PairAgentModal onClose={() => setShowPairModal(false)} />
      )}

      {needsConfirmation && scan?.vin && (
        <VehicleConfirmModal
          scanJobId={scan.id}
          vin={scan.vin}
          onClose={() => {
            /* Modal closes automatically on success; scan query will refetch */
          }}
        />
      )}
    </div>
  );
}
