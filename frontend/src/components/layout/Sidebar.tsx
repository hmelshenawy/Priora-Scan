'use client';

import Link from 'next/link';
import { Activity, Car, LayoutDashboard, Stethoscope, X } from 'lucide-react';

interface SidebarProps {
  pathname: string;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

const vehicleNav: NavItem[] = [
  {
    href: '/vehicles',
    label: 'Vehicles',
    icon: <Car className="h-4 w-4" />,
  },
];

const diagnosticsNav: NavItem[] = [
  {
    href: '/obd',
    label: 'OBD Dashboard',
    icon: <LayoutDashboard className="h-4 w-4" />,
    exact: true,
  },
  {
    href: '/diagnostic-sessions',
    label: 'Diagnostic Sessions',
    icon: <Stethoscope className="h-4 w-4" />,
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({
  item,
  pathname,
  onClick,
}: {
  item: NavItem;
  pathname: string;
  onClick?: () => void;
}) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );
}

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white">
          <Activity className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-950">PrioraScan</p>
          <p className="text-xs text-slate-500">Workshop diagnostics</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <div>
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Workshop
          </p>
          <div className="mt-2 space-y-1">
            {vehicleNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                onClick={onNavigate}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Diagnostics
          </p>
          <div className="mt-2 space-y-1">
            {diagnosticsNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                onClick={onNavigate}
              />
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}

export function Sidebar({
  pathname,
  isMobileOpen,
  onCloseMobile,
}: SidebarProps) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white lg:block">
        <SidebarContent pathname={pathname} />
      </aside>

      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/40"
            onClick={onCloseMobile}
          />
          <aside className="relative h-full w-72 max-w-[85vw] border-r border-slate-200 bg-white shadow-xl">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={onCloseMobile}
              className="absolute right-3 top-3 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent pathname={pathname} onNavigate={onCloseMobile} />
          </aside>
        </div>
      )}
    </>
  );
}
