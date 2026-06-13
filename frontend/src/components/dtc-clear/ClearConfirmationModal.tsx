'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ClearConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  faultCodeCount: number;
}

/**
 * ClearConfirmationModal — Feature 009 Phase B.
 *
 * Warning modal shown before DTC clear. Requires checkbox
 * acknowledgment before the Confirm button becomes enabled.
 * Warning text: "Clearing fault codes may erase diagnostic
 * evidence and reset readiness monitors."
 */
export function ClearConfirmationModal({
  open,
  onClose,
  onConfirm,
  faultCodeCount,
}: ClearConfirmationModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!open) return null;

  const handleConfirm = () => {
    setAcknowledged(false);
    onConfirm();
  };

  const handleClose = () => {
    setAcknowledged(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">
              Clear Fault Codes
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              You are about to clear{' '}
              <span className="font-semibold">{faultCodeCount}</span> fault
              code{faultCodeCount !== 1 ? 's' : ''} from this diagnostic
              session.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex-shrink-0 rounded-md p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Warning */}
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm font-medium text-amber-800">
            Clearing fault codes may erase diagnostic evidence and reset
            readiness monitors.
          </p>
        </div>

        {/* Acknowledgment checkbox */}
        <label className="mt-4 flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">
            I understand that clearing fault codes may erase diagnostic
            evidence and reset readiness monitors, and I wish to proceed.
          </span>
        </label>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!acknowledged}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Clear Fault Codes
          </button>
        </div>
      </div>
    </div>
  );
}