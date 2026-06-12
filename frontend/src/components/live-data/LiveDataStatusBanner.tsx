'use client';

import type { LiveDataSessionStatus } from '../../hooks/useLiveData';

interface LiveDataStatusBannerProps {
  status: LiveDataSessionStatus | 'NOT_STARTED' | 'STARTING' | 'ERROR';
  isFreshnessStale?: boolean;
}

export function LiveDataStatusBanner({
  status,
  isFreshnessStale,
}: LiveDataStatusBannerProps) {
  if (status === 'ACTIVE' && !isFreshnessStale) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        Live data is active and refreshing automatically.
      </div>
    );
  }

  if (status === 'ACTIVE' && isFreshnessStale) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Live data is active, but the latest sample is older than expected.
      </div>
    );
  }

  if (status === 'STOPPED') {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        Live data is stopped. Restart when you need a fresh sensor read.
      </div>
    );
  }

  if (status === 'STALE') {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        This live data session is stale. Restart live data to reconnect.
      </div>
    );
  }

  if (status === 'STARTING') {
    return (
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        Starting live data through the selected Desktop Agent...
      </div>
    );
  }

  if (status === 'ERROR') {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Live data could not be loaded. Check the session and try again.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      Select an online agent and start live data when the vehicle is connected.
    </div>
  );
}
