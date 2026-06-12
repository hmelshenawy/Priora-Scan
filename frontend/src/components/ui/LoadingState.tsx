interface LoadingStateProps {
  title?: string;
  message?: string;
}

export function LoadingState({
  title = 'Loading',
  message = 'Please wait while the latest data is loaded.',
}: LoadingStateProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="h-2 w-28 animate-pulse rounded-full bg-slate-200" />
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
    </div>
  );
}
