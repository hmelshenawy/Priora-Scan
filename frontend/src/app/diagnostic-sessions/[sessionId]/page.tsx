interface DiagnosticSessionDetailPageProps {
  params: {
    sessionId: string;
  };
}

export default function DiagnosticSessionDetailPage({ params }: DiagnosticSessionDetailPageProps) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Diagnostic Session Detail</h1>
      <p className="mt-2">Session ID: {params.sessionId}</p>
      <div className="mt-6 rounded border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-slate-700">Session details and lifecycle controls will appear here.</p>
      </div>
    </div>
  );
}
