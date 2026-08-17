"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_NAV_ITEMS } from '@/constants';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { useMobileNav } from './MobileNavContext';
import {
  LayoutDashboard,
  Users,
  Coins,
  Gem,
  UserPlus,
  CreditCard,
  Tag,
  Calendar,
  Megaphone,
  TrendingUp,
  BarChart3,
  Store,
  UserCheck,
  ShieldCheck,
  Settings,
  LifeBuoy,
  Bell,
  Boxes,
  Calculator,
  Receipt,
  ClipboardList,
  AlarmClock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Users,
  Coins,
  Gem,
  UserPlus,
  CreditCard,
  Tag,
  Calendar,
  Megaphone,
  TrendingUp,
  BarChart3,
  Store,
  UserCheck,
  ShieldCheck,
  Settings,
  LifeBuoy,
  Bell,
  Boxes,
  Calculator,
  Receipt,
  ClipboardList,
  AlarmClock,
};

type AdminNavItem = typeof ADMIN_NAV_ITEMS[number];
type NavRenderEntry =
  | { type: 'item'; item: AdminNavItem }
  | { type: 'group'; group: string; items: AdminNavItem[] };

// Consecutive items sharing the same `group` (e.g. Billing's Inventory /
// New Sale / Sales History) render under one collapsible section instead of
// as three flat rows — the only nesting this sidebar needs today, so a
// small grouping pass here beat introducing a generic nested-nav data shape.
function groupNavItems(items: readonly AdminNavItem[]): NavRenderEntry[] {
  const result: NavRenderEntry[] = [];
  for (const item of items) {
    if (item.group) {
      const last = result[result.length - 1];
      if (last && last.type === 'group' && last.group === item.group) {
        last.items.push(item);
      } else {
        result.push({ type: 'group', group: item.group, items: [item] });
      }
    } else {
      result.push({ type: 'item', item });
    }
  }
  return result;
}

export const AdminSidebar: React.FC = () => {
  const pathname = usePathname();
  const { branding } = useTenant();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const { isOpen, close } = useMobileNav();

  // Staff only sees modules explicitly granted to their account — Admin/
  // SuperAdmin (and the Customer role, which never reaches this sidebar)
  // always see everything, matching the backend's require_admin_or_staff_module.
  const isStaff = user?.backendRole === 'Staff';
  const visibleItems = isStaff
    ? ADMIN_NAV_ITEMS.filter((item) => item.staffModule && user!.permissions.includes(item.staffModule))
    : ADMIN_NAV_ITEMS;
  const renderEntries = groupNavItems(visibleItems);

  return (
    <>
      {/* Mobile backdrop — only rendered/interactive while the drawer is open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside className={cn(
        "shrink-0 bg-gradient-to-b from-ink to-ink-2 text-[#E8EAF6] min-h-screen flex flex-col border-r border-[#232B4A] transition-transform lg:transition-[width] duration-300",
        "fixed inset-y-0 left-0 z-50 lg:static lg:z-auto lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        collapsed ? "w-64 lg:w-20" : "w-64"
      )}>
      <div className="p-5 border-b border-[#232B4A] flex items-center justify-between lg:justify-center min-h-[60px]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-full border border-gold flex items-center justify-center font-display font-bold text-gold-light text-sm bg-radial from-ink-2 to-ink shrink-0">
            {branding.logoText || 'DF'}
          </div>
          {(!collapsed || isOpen) && (
            <div className="animate-in fade-in whitespace-nowrap lg:block">
              <div className="font-display font-bold text-sm text-white leading-none">
                {branding.brandName}
              </div>
              <div className="text-[11px] text-[#9AA3C7] mt-1">Jeweller Admin</div>
            </div>
          )}
        </div>
        <button
          onClick={close}
          className="lg:hidden p-1.5 rounded-lg text-[#9AA3C7] hover:text-white hover:bg-[#1E2A52]/50"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {(!collapsed || isOpen) && (
          <div className="px-5 text-[10px] uppercase tracking-wider text-[#9AA3C7] font-bold mb-2">
            Management
          </div>
        )}
        {renderEntries.map((entry) => {
          const showLabel = !collapsed || isOpen;

          if (entry.type === 'item') {
            const item = entry.item;
            const Icon = iconMap[item.icon] || LayoutDashboard;
            const isActive =
              item.path === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.path);

            return (
              <Link
                key={item.key}
                href={item.path}
                onClick={close}
                className={cn(
                  "w-full flex items-center justify-between px-5 py-2.5 text-xs font-semibold transition-all border-l-4",
                  isActive
                    ? "bg-[#1E2A52] text-white border-gold"
                    : "text-[#C7CDE8] border-transparent hover:bg-[#1E2A52]/50 hover:text-white"
                )}
              >
                <div className="flex items-center gap-3" title={!showLabel ? item.label : undefined}>
                  <Icon className="h-5 w-5 shrink-0" />
                  {showLabel && <span className="whitespace-nowrap">{item.label}</span>}
                </div>
                {!item.ready && showLabel && (
                  <span className="text-[9px] font-mono text-[#9AA3C7] bg-[#182142] px-1.5 py-0.5 rounded">
                    soon
                  </span>
                )}
              </Link>
            );
          }

          const isGroupActive = entry.items.some((i) => pathname.startsWith(i.path));
          const groupExpanded = collapsedGroups[entry.group] !== true;
          const GroupIcon = iconMap[entry.items[0].icon] || LayoutDashboard;

          return (
            <div key={entry.group}>
              <button
                type="button"
                onClick={() => setCollapsedGroups((g) => ({ ...g, [entry.group]: groupExpanded }))}
                className={cn(
                  "w-full flex items-center justify-between px-5 py-2.5 text-xs font-semibold transition-all border-l-4",
                  isGroupActive
                    ? "text-white border-gold"
                    : "text-[#C7CDE8] border-transparent hover:bg-[#1E2A52]/50 hover:text-white"
                )}
              >
                <div className="flex items-center gap-3" title={!showLabel ? entry.group : undefined}>
                  <GroupIcon className="h-5 w-5 shrink-0" />
                  {showLabel && <span className="whitespace-nowrap">{entry.group}</span>}
                </div>
                {showLabel && (
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", groupExpanded && "rotate-180")} />
                )}
              </button>
              {groupExpanded &&
                entry.items.map((item) => {
                  const Icon = iconMap[item.icon] || LayoutDashboard;
                  const isActive = pathname.startsWith(item.path);
                  return (
                    <Link
                      key={item.key}
                      href={item.path}
                      onClick={close}
                      className={cn(
                        "w-full flex items-center justify-between py-2.5 text-xs font-semibold transition-all border-l-4",
                        showLabel ? "pl-11 pr-5" : "px-5",
                        isActive
                          ? "bg-[#1E2A52] text-white border-gold"
                          : "text-[#C7CDE8] border-transparent hover:bg-[#1E2A52]/50 hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-3" title={!showLabel ? item.label : undefined}>
                        <Icon className="h-4 w-4 shrink-0" />
                        {showLabel && <span className="whitespace-nowrap">{item.label}</span>}
                      </div>
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#232B4A] hidden lg:block">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded-lg text-[#9AA3C7] hover:text-white hover:bg-[#1E2A52]/50 transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>
      </aside>
    </>
  );
};
