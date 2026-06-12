'use client';

import { Menu } from 'lucide-react';
import { useAuth } from '../../hooks/use-auth';

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          onClick={onOpenMenu}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden text-sm text-slate-500 lg:block">
          Connected workspace
        </div>

        <div className="ml-auto flex items-center gap-3">
          {user?.email && (
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user.email}
            </span>
          )}
          <button
            type="button"
            onClick={() => logout()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
