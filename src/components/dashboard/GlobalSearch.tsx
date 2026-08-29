"use client";

/**
 * Dashboard global search. No unified backend search endpoint exists, so this
 * multiplexes the three real list APIs (customers, sales/invoices, schemes) with
 * a debounce and small limits — never brute-forcing the whole database. Each
 * result is typed and navigates to its real existing route. No fake data.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, Receipt, Coins, Loader2 } from 'lucide-react';
import { customerService } from '@/services/customerService';
import { billingService } from '@/services/billingService';
import { schemeService } from '@/services/schemeService';
import { formatCurrency } from '@/lib/formatters';

type ResultType = 'customer' | 'invoice' | 'scheme';

interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_META: Record<ResultType, { label: string; icon: React.ElementType; color: string }> = {
  customer: { label: 'Customer', icon: User, color: 'text-blue-600 bg-blue-50' },
  invoice: { label: 'Invoice', icon: Receipt, color: 'text-emerald-600 bg-emerald-50' },
  scheme: { label: 'Scheme', icon: Coins, color: 'text-gold-dark bg-gold/10' },
};

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const [customers, sales, schemes] = await Promise.all([
          customerService.getAdminCustomers(1, 5, q).then((r) => r.customers).catch(() => []),
          billingService.listSales({ search: q, limit: 5 }).then((r) => r.sales).catch(() => []),
          schemeService.getAdminSchemes().then((r) => r).catch(() => []),
        ]);
        const out: SearchResult[] = [];
        for (const c of customers) {
          out.push({
            type: 'customer',
            id: c.id,
            title: c.name,
            subtitle: `${c.customerCode} · ${c.phone || c.email || ''}`.trim(),
            href: `/admin/customers?q=${encodeURIComponent(c.name)}`,
          });
        }
        for (const s of sales) {
          out.push({
            type: 'invoice',
            id: s.id,
            title: s.invoiceNumber,
            subtitle: `${s.customerName || 'Walk-in'} · ${formatCurrency(s.finalAmount)}`,
            href: `/admin/billing/history?q=${encodeURIComponent(s.invoiceNumber)}`,
          });
        }
        // Schemes have no server-side search — filter the (small) full list by name client-side.
        const ql = q.toLowerCase();
        for (const sc of schemes.filter((x) => x.name.toLowerCase().includes(ql)).slice(0, 5)) {
          out.push({
            type: 'scheme',
            id: sc.id,
            title: sc.name,
            subtitle: `${formatCurrency(sc.monthlyAmount)}/mo · ${sc.durationMonths} months`,
            href: `/admin/schemes`,
          });
        }
        setResults(out);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search customers, invoices, schemes..."
        className="w-full pl-9 pr-9 h-10 rounded-xl bg-[#F7F8FC] border border-slate-200 text-xs font-medium text-[#0B0E23] placeholder:text-slate-400 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}

      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden max-h-96 overflow-y-auto">
          {!loading && results.length === 0 ? (
            <div className="p-4 text-xs text-slate-400 font-medium text-center">No matches found</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.map((r) => {
                const meta = TYPE_META[r.type];
                const Icon = meta.icon;
                return (
                  <li key={`${r.type}-${r.id}`}>
                    <button
                      onClick={() => go(r.href)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-left transition-colors"
                    >
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-[#0B0E23] truncate">{r.title}</span>
                        <span className="block text-[11px] text-slate-500 font-medium truncate">{r.subtitle}</span>
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0">{meta.label}</span>
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
