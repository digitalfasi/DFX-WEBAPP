"use client";

/**
 * Dashboard notification bell. There is no dedicated admin notification-inbox
 * endpoint, so this renders a compact panel built ONLY from real backend data
 * the dashboard already holds (overdue collections, birthday insight, etc.),
 * passed in as `items`. Each item navigates to its real module. When the
 * backend surfaces no actionable item, the panel says so — nothing invented.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';

export interface NotificationItem {
  id: string;
  icon: React.ElementType;
  title: string;
  detail: string;
  time?: string;
  href: string;
  severity: 'info' | 'warning' | 'danger';
}

const SEV_COLOR: Record<NotificationItem['severity'], string> = {
  info: 'text-blue-600 bg-blue-50',
  warning: 'text-amber-600 bg-amber-50',
  danger: 'text-red-600 bg-red-50',
};

export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = items.length;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-[#0B0E23] hover:border-gold/50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4.5 h-4.5 w-[18px] h-[18px]" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-[#0B0E23] uppercase tracking-wider">Notifications</span>
            <span className="text-[10px] font-bold text-slate-400">{count} active</span>
          </div>
          {count === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 font-medium">You&apos;re all caught up</div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {items.map((it) => {
                const Icon = it.icon;
                return (
                  <li key={it.id}>
                    <button
                      onClick={() => go(it.href)}
                      className="w-full flex items-start gap-3 p-3 hover:bg-slate-50 text-left transition-colors"
                    >
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${SEV_COLOR[it.severity]}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-[#0B0E23]">{it.title}</span>
                        <span className="block text-[11px] text-slate-500 font-medium leading-snug">{it.detail}</span>
                      </span>
                      {it.time && <span className="text-[10px] text-slate-400 font-medium shrink-0">{it.time}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
