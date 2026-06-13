'use client';

import { useRouter } from 'next/navigation';
import type { FaultCode } from '@/hooks/useObdScan';
import {
  buildControlUnitOverview,
  computeControlUnitSummary,
  DEFAULT_SCANNED_ECU_CODES,
} from '@/lib/control-units';
import { ControlUnitSummaryCards } from './ControlUnitSummaryCards';
import { ControlUnitCard } from './ControlUnitCard';
import { MvpNoticeBanner } from './MvpNoticeBanner';
import { ClearFaultCodesButton } from '../dtc-clear/ClearFaultCodesButton';
import Link from 'next/link';

interface ControlUnitOverviewProps {
  /** Enriched fault codes from the API. */
  faultCodes: FaultCode[];
  /** ECU codes that were actually scanned. Defaults to ECM + TCM. */
  scannedEcuCodes?: Set<string>;
  /** Diagnostic session ID — used for "View Diagnostic Session" link. */
  sessionId?: string;
  /** Scan job ID — used for "Rescan" action context. */
  scanJobId?: string;
  /** Vehicle ID — used for "Start Live Data" link. */
  vehicleId?: string;
  /** Whether to show navigation actions. Default: true. */
  showNavigation?: boolean;
  /** Section title. Default: "Control Unit Overview". */
  title?: string;
  /** Whether the session is open (not closed). Default: true. */
  isSessionOpen?: boolean;
}

/**
 * Top-level component that renders the Control Unit Overview layout:
 * summary cards, MVP notice, control unit cards, and navigation actions.
 *
 * Replaces the flat fault-code list on both the Diagnostic Session detail
 * page and the OBD scan results page.
 */
export function ControlUnitOverview({
  faultCodes,
  scannedEcuCodes,
  sessionId,
  scanJobId,
  vehicleId,
  showNavigation = true,
  title = 'Control Unit Overview',
  isSessionOpen = true,
}: ControlUnitOverviewProps) {
  const router = useRouter();
  const effectiveScannedEcuCodes =
    scannedEcuCodes ?? DEFAULT_SCANNED_ECU_CODES;

  /**
   * Navigate to the OBD Dashboard where the technician can start a fresh scan.
   * After a successful DTC clear, a new scan shows the current ECU state.
   */
  const handleRescan = () => {
    router.push('/obd');
  };

  const results = buildControlUnitOverview(faultCodes, effectiveScannedEcuCodes);
  const summary = computeControlUnitSummary(results);

  return (
    <section className="space-y-6">
      {/* Section title */}
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>

      {/* Summary cards */}
      <ControlUnitSummaryCards summary={summary} />

      {/* MVP limitation notice */}
      <MvpNoticeBanner />

      {/* Clear fault codes action — Feature 009 Phase B */}
      {sessionId && faultCodes.length > 0 && (
        <ClearFaultCodesButton
          sessionId={sessionId}
          faultCodeCount={faultCodes.length}
          isSessionOpen={isSessionOpen}
          onRescan={handleRescan}
        />
      )}

      {/* Control unit cards — responsive grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {results.map((result) => (
          <ControlUnitCard key={result.code} result={result} />
        ))}
      </div>

      {/* Navigation actions */}
      {showNavigation && (
        <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
          <Link
            href="/obd"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Back to OBD Dashboard
          </Link>

          {sessionId && (
            <Link
              href={`/diagnostic-sessions/${sessionId}`}
              className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
            >
              View Diagnostic Session
            </Link>
          )}

          {sessionId ? (
            <Link
              href={`/diagnostic-sessions/${sessionId}#live-data`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Start Live Data
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400"
              title="Open a diagnostic session to start live data"
            >
              Start Live Data
            </button>
          )}

          {scanJobId && (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400"
              title="Start a new scan from the OBD Dashboard"
            >
              Rescan
            </button>
          )}

          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400"
            title="Not yet available"
          >
            Export / Report
          </button>
        </div>
      )}
    </section>
  );
}
