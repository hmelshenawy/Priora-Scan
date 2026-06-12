import Link from 'next/link';

interface ErrorStateProps {
  title?: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  actionHref,
  actionLabel,
}: ErrorStateProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm">
      <h2 className="text-base font-semibold text-red-900">{title}</h2>
      <p className="mt-1 text-sm text-red-700">{message}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-4 inline-flex rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
