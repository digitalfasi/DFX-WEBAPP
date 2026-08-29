"use client";

import { usePathname } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';

// The Admin Dashboard (/admin) renders its own richer header (greeting, global
// search, notifications). Every OTHER admin page keeps the shared TopBar. This
// wrapper hides the shared TopBar on the dashboard route only, so no page loses
// its top bar and the dashboard does not show a duplicate one.
export function ConditionalTopBar() {
  const pathname = usePathname();
  if (pathname === '/admin') return null;
  return <TopBar />;
}
