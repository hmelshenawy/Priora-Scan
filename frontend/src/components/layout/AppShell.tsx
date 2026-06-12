'use client';

import { ReactNode, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isPublicRoute } from '../../lib/public-routes';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  if (isPublicRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        pathname={pathname}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />
      <div className="min-h-screen lg:pl-72">
        <Topbar onOpenMenu={() => setIsMobileOpen(true)} />
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
