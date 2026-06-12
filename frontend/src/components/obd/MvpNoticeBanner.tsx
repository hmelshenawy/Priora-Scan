'use client';

import { Info } from 'lucide-react';

/**
 * Renders a notice explaining the scope limitations of generic OBD-II
 * diagnostics. This banner must always be visible on the Control Unit
 * Overview page to set honest expectations.
 *
 * The wording is deliberately specific: it does NOT say "All systems scanned"
 * or "No faults" for modules that were not actually scanned.
 */
export function MvpNoticeBanner() {
  return (
    <div
      className="rounded-lg border border-blue-200 bg-blue-50 p-4"
      role="note"
      aria-label="OBD-II scope limitation notice"
    >
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
        <p className="text-sm text-blue-800">
          Generic OBD-II provides emissions and powertrain diagnostics only.
          ABS, SRS, BCM, ESP, HVAC and other body/chassis modules require
          manufacturer-specific diagnostics.
        </p>
      </div>
    </div>
  );
}