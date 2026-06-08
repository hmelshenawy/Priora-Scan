import Link from 'next/link';

interface VehicleSessionsPageProps {
  params: {
    id: string;
  };
}

export default function VehicleSessionsPage({ params }: VehicleSessionsPageProps) {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Diagnostic Sessions</h1>
          <p className="mt-1 text-sm text-slate-600">Vehicle ID: {params.id}</p>
        </div>
        <Link
          href="/vehicles"
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Back to vehicles
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Session workspace</h2>
            <p className="mt-1 text-sm text-slate-500">
              This page will show sessions for the selected vehicle once the feature is implemented.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            disabled
          >
            Create session
          </button>
        </div>

        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
          <p className="text-slate-700">
            Diagnostic session details and vehicle-scoped session listing will appear here.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Foundational backend and frontend support for diagnostic session APIs is in progress.
          </p>
        </div>
      </div>
    </div>
  );
}
