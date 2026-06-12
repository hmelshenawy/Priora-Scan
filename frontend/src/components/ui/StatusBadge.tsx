interface StatusBadgeProps {
  status: string;
  tone?: 'blue' | 'amber' | 'emerald' | 'red' | 'slate';
}

const toneClasses: Record<NonNullable<StatusBadgeProps['tone']>, string> = {
  blue: 'bg-blue-100 text-blue-700',
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-slate-100 text-slate-700',
};

export function StatusBadge({ status, tone = 'slate' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClasses[tone]}`}
    >
      {status}
    </span>
  );
}
