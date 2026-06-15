'use client';

import { useState } from 'react';
import type {
  ControlUnitDiscovery,
  ProbeResult,
  Responder,
} from '../../services/vehicle-data-api';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ControlUnitsPanelProps {
  controlUnitDiscovery: ControlUnitDiscovery;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map confidence to a badge style. */
function confidenceBadge(confidence: 'LOW' | 'HIGH') {
  if (confidence === 'HIGH') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
        HIGH
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
      LOW
    </span>
  );
}

/** Map probe status to a display style. */
function statusBadge(status: ProbeResult['status'], errorCode: string | null) {
  switch (status) {
    case 'DISCOVERED':
      return <span className="text-green-700 font-medium">DISCOVERED</span>;
    case 'NOT_FOUND':
      return <span className="text-gray-500">NOT FOUND</span>;
    case 'ERROR':
      return (
        <span className="inline-flex items-center gap-1 text-red-700 font-medium">
          ERROR
          {errorCode && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
              {errorCode}
            </span>
          )}
        </span>
      );
    case 'UNKNOWN':
      return <span className="text-amber-600 font-medium">UNKNOWN</span>;
    default:
      return <span>{status}</span>;
  }
}

function rawResponsePreview(rawResponse: string) {
  if (!rawResponse) return '—';
  return rawResponse.length > 24 ? `${rawResponse.slice(0, 24)}...` : rawResponse;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ControlUnitsPanel — displays discovered control units from a
 * Control Unit Discovery scan. Shows responders by default with an
 * optional collapsible probe details section.
 */
export default function ControlUnitsPanel({ controlUnitDiscovery }: ControlUnitsPanelProps) {
  const [showProbes, setShowProbes] = useState(false);

  const { summary, responders, probes, scanMode, strategy, probeSequence, startedAt, completedAt } =
    controlUnitDiscovery;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Control Units</h3>
        <span className="text-sm text-gray-500">
          {summary.respondersFound} responder{summary.respondersFound !== 1 ? 's' : ''} found
        </span>
      </div>

      {/* Discovery metadata */}
      <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <div>
            <span className="font-medium text-gray-900">Scan Mode:</span>{' '}
            {scanMode.replace(/_/g, ' ')}
          </div>
          <div>
            <span className="font-medium text-gray-900">Strategy:</span> {strategy}
          </div>
          <div>
            <span className="font-medium text-gray-900">Probes:</span> {summary.totalProbes}
          </div>
          <div>
            <span className="font-medium text-gray-900">Probe Sequence:</span>{' '}
            {probeSequence.join(', ')}
          </div>
          {startedAt && (
            <div>
              <span className="font-medium text-gray-900">Started:</span>{' '}
              {new Date(startedAt).toLocaleTimeString()}
            </div>
          )}
          {completedAt && (
            <div>
              <span className="font-medium text-gray-900">Completed:</span>{' '}
              {new Date(completedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Responders table */}
      {responders.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
          No control units discovered.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Response ID
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Confidence
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Protocol
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {responders.map((r: Responder) => (
                <tr key={r.responseId} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-2 text-sm font-mono font-medium text-gray-900">
                    {r.responseId}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm">
                    {confidenceBadge(r.confidence)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-700">DISCOVERED</td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">{r.protocol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Collapsible probe details */}
      <details className="group" open={showProbes}>
        <summary
          className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900"
          onClick={(event) => {
            event.preventDefault();
            setShowProbes((current) => !current);
          }}
        >
          Probe Details ({probes.length} probe{probes.length !== 1 ? 's' : ''})
        </summary>
        {showProbes && (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Method
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Request ID
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Probe
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Response ID
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Response Type
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  NRC
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Raw Response
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {probes.map((p: ProbeResult, i: number) => (
                <tr key={`${p.requestId}-${p.probe}-${i}`} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-700">
                    {p.method}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm font-mono text-gray-900">
                    {p.requestId}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm font-mono text-gray-700">
                    {p.probe}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm font-mono text-gray-900">
                    {p.responseId ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm">
                    {statusBadge(p.status, p.errorCode)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-700">
                    {p.responseType}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">
                    {p.negativeResponseCode ? (
                      <span title={p.negativeResponseMeaning ?? ''} className="cursor-help underline decoration-dashed">
                        {p.negativeResponseCode}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm font-mono text-gray-500 max-w-[200px] truncate">
                    <span title={p.rawResponse}>{rawResponsePreview(p.rawResponse)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </details>
    </div>
  );
}
