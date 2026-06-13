'use client';

import { CheckCircle2, XCircle, RotateCw } from 'lucide-react';

type ClearStatus = 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED';

interface ClearResultBannerProps {
  status: ClearStatus;
  failureReason?: string;
  onRescan?: () => void;
  onDismiss?: () => void;
}

/**
 * ClearResultBanner — Feature 009 Phase B.
 *
 * Shows the result of a DTC clear operation:
 *   - Success: green banner with "Fault codes cleared successfully" + "Run scan again" action
 *   - Failure: red banner with failure reason
 *   - Pending: blue banner with "Clearing in progress..."
 */
export function ClearResultBanner({
  status,
  failureReason,
  onRescan,
  onDismiss,
}: ClearResultBannerProps) {
  if (status === 'NONE') return null;

  if (status === 'PENDING') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <RotateCw className="h-4 w-4 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-blue-800">
          Clearing fault codes…
        </p>
      </div>
    );
  }

  if (status === 'SUCCESS') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-800">
              Fault codes cleared successfully.
            </p>
            {onRescan && (
              <button
                type="button"
                onClick={onRescan}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-50"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Run scan again
              </button>
            )}
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="flex-shrink-0 text-emerald-400 hover:text-emerald-600"
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === 'FAILED') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">
              Failed to clear fault codes.
            </p>
            {failureReason && (
              <p className="mt-1 text-xs text-red-600">
                Reason: {failureReason}
              </p>
            )}
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="flex-shrink-0 text-red-400 hover:text-red-600"
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}