interface VehicleHistoryPlaceholderProps {
  emptyStateMessage?: string;
}

export function VehicleHistoryPlaceholder({
  emptyStateMessage = 'No diagnostic sessions yet. Diagnostic history will appear here once sessions are created.',
}: VehicleHistoryPlaceholderProps) {
  return (
    <div className="mt-8 bg-white shadow-sm rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">History</h2>
      <div className="mt-4 rounded-md bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-500">{emptyStateMessage}</p>
      </div>
    </div>
  );
}
