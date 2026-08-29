"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag, UserPlus, CreditCard, FilePlus2, Coins, Wallet, LayoutGrid,
  Receipt, Calendar,
  Landmark, Users, AlertTriangle, Bell, Cake, PackageSearch, ShieldAlert,
  Info, FileText, Menu, Settings, LogOut,
} from 'lucide-react';
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import { formatCurrency } from '@/lib/formatters';
import { useAuth } from '@/hooks/useAuth';
import { useMobileNav } from '@/components/layout/MobileNavContext';
import { ApiError } from '@/lib/apiClient';
import { GlobalSearch } from '@/components/dashboard/GlobalSearch';
import { NotificationBell, NotificationItem } from '@/components/dashboard/NotificationBell';
import {
  reportService, ReportPeriod, PaymentSummary, SchemeSummaryReport,
  GoldRateTrendReport, SalesTrend, SalesByCategory, InsightsResult, EnrollmentSummary,
  dashboardCardsService, DashboardCards,
} from '@/services/reportService';
import { billingService, BillingDashboardSummary, Sale } from '@/services/billingService';
import { enrollmentService, AdminEnrollment } from '@/services/enrollmentService';

const BUSINESS_BLUE = '#2C6FBD';
const SCHEME_GOLD = '#E8A33D';
const DONUT_BUSINESS = ['#2C6FBD', '#60A3E6', '#0EA5E9', '#93C5FD', '#1E3A8A', '#38BDF8'];
const DONUT_SCHEME = ['#E8A33D', '#F59E0B', '#B45309', '#FCD34D', '#92400E', '#FBBF24'];

type RangeSel = ReportPeriod | 'custom';
const PERIOD_TABS: { value: RangeSel; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom' },
];

type BizMetric = 'sales' | 'profit' | 'gold';
const BIZ_METRICS: { value: BizMetric; label: string }[] = [
  { value: 'sales', label: 'Overall Sales' },
  { value: 'profit', label: 'Profit' },
  { value: 'gold', label: 'Gold Sold' },
];
// "Today's Collection" removed as a selectable Scheme trend metric (per
// spec) — the Today's Collection KPI card is unaffected. Collections trend
// already respects the period selector.
type SchemeMetric = 'collections' | 'maturity' | 'enrollments';
const SCHEME_METRICS: { value: SchemeMetric; label: string }[] = [
  { value: 'collections', label: 'Collections' },
  { value: 'maturity', label: 'Maturity' },
  { value: 'enrollments', label: 'Enrollments' },
];

// Historical analytics charts (Top Selling Categories, Popular Schemes) are NOT
// Today/Week/Month KPI charts — they default to THIS YEAR and support Last Year
// + an arbitrary (multi-year) custom range. Kept separate from the KPI period so
// changing a KPI period never moves these, and vice-versa.
type AnalyticsPeriod = 'this_year' | 'last_year' | 'custom';
const ANALYTICS_TABS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'custom', label: 'Custom' },
];
/** Analytics range → report params. Backend has no `last_year` token, so it is
 *  sent as an explicit Jan 1–Dec 31 range; the date API accepts any range. */
function analyticsParams(sel: AnalyticsPeriod, custom: { from: string; to: string }): { period?: ReportPeriod; dateFrom?: string; dateTo?: string } | null {
  if (sel === 'this_year') return { period: 'this_year' };
  if (sel === 'last_year') {
    const y = new Date().getFullYear() - 1;
    return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
  }
  if (!custom.from || !custom.to) return null;
  return { dateFrom: custom.from, dateTo: custom.to };
}
function analyticsKey(sel: AnalyticsPeriod, custom: { from: string; to: string }): string {
  return sel === 'custom' ? `c:${custom.from}:${custom.to}` : sel;
}
/** Human label for the currently selected analytics range (shown on the card). */
function analyticsLabel(sel: AnalyticsPeriod, custom: { from: string; to: string }): string {
  if (sel === 'this_year') return String(new Date().getFullYear());
  if (sel === 'last_year') return String(new Date().getFullYear() - 1);
  return custom.from && custom.to ? `${custom.from} → ${custom.to}` : 'Custom';
}

/** Range selector → report params. Custom needs both dates applied. */
function rangeParams(sel: RangeSel, custom: { from: string; to: string }): { period?: ReportPeriod; dateFrom?: string; dateTo?: string } | null {
  if (sel === 'custom') {
    if (!custom.from || !custom.to) return null;
    return { dateFrom: custom.from, dateTo: custom.to };
  }
  return { period: sel };
}
function rangeKey(sel: RangeSel, custom: { from: string; to: string }): string {
  return sel === 'custom' ? `c:${custom.from}:${custom.to}` : sel;
}
/** Dynamic KPI title prefix for the selected period. */
function periodPrefix(sel: RangeSel): string {
  switch (sel) {
    case 'today': return "Today's";
    case 'this_week': return "This Week's";
    case 'this_month': return "This Month's";
    case 'this_year': return "This Year's";
    default: return 'Selected Period';
  }
}
/** Concrete from/to dates for the selected period (custom needs both). */
function rangeDates(sel: RangeSel, custom: { from: string; to: string }): { from: string; to: string } | null {
  const today = new Date();
  const to = isoDate(today);
  if (sel === 'today') return { from: to, to };
  if (sel === 'this_week') { const d = new Date(today); d.setDate(today.getDate() - 6); return { from: isoDate(d), to }; }
  if (sel === 'this_month') return { from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to };
  if (sel === 'this_year') return { from: isoDate(new Date(today.getFullYear(), 0, 1)), to };
  return custom.from && custom.to ? { from: custom.from, to: custom.to } : null;
}
function fmtGrams(g: number): string { return `${g.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`; }

const SALE_STATUS_BADGE: Record<string, 'success' | 'pending' | 'warn' | 'danger' | 'neutral'> = {
  PAID: 'success', PARTIAL: 'warn', PENDING: 'pending', REFUNDED: 'neutral', PARTIALLY_REFUNDED: 'neutral',
};
const ENROLL_STATUS_BADGE: Record<string, 'success' | 'pending' | 'warn' | 'danger' | 'gold' | 'neutral'> = {
  ACTIVE: 'success', COMPLETED: 'gold', CLOSED: 'neutral', CANCELLED: 'danger',
};

interface KpiSpec {
  title: string; value: string; growth: number | null; sub: string; icon: React.ElementType; href: string; danger?: boolean;
}
// Compact KPI tile matching the reference: title + value only. The whole tile
// is clickable (keeps navigation) — no visible pill / "View Details" chrome.
function KpiCard({ kpi }: { kpi: KpiSpec }) {
  const router = useRouter();
  // Whole card is the single interactive element (keyboard-focusable, focus
  // ring) — the "View →" is a visual affordance only (pointer-events-none), so
  // there is no nested-interactive / double-navigation (DFX-ENH-001).
  return (
    <button onClick={() => router.push(kpi.href)} aria-label={`${kpi.title} — view details`}
      className="group flex flex-col bg-white/80 p-3 rounded-lg border border-slate-200 text-left hover:shadow-xs hover:border-slate-300 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2C6FBD]/40 focus-visible:border-[#2C6FBD]/40">
      {/* Title wraps up to 2 lines (no ellipsis clipping "TOTAL ENROLLMEN…") — a
          fixed 2-line min-height keeps every card's value baseline aligned. */}
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-tight line-clamp-2 min-h-[1.9em]" title={kpi.title}>{kpi.title}</div>
      <div className={`text-base font-extrabold font-display mt-1 break-words ${kpi.danger ? 'text-red-600' : 'text-[#0B0E23]'}`}>{kpi.value}</div>
      <span className="mt-1.5 self-end inline-flex items-center gap-0.5 text-[10px] font-bold text-[#2C6FBD] pointer-events-none group-hover:gap-1 transition-all">
        View <span aria-hidden="true">→</span>
      </span>
    </button>
  );
}

function PeriodTabs({ value, onChange, accent }: { value: RangeSel; onChange: (p: RangeSel) => void; accent: string }) {
  return (
    <div className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-lg border border-slate-200 flex-wrap">
      {PERIOD_TABS.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors ${
            value === t.value ? 'text-white' : 'text-slate-500 hover:text-slate-700'}`}
          style={value === t.value ? { backgroundColor: accent } : undefined}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Period tabs for the historical analytics charts (This Year / Last Year /
// Custom) — visually identical to PeriodTabs, different option set.
function AnalyticsPeriodTabs({ value, onChange, accent }: { value: AnalyticsPeriod; onChange: (p: AnalyticsPeriod) => void; accent: string }) {
  return (
    <div className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-lg border border-slate-200 flex-wrap">
      {ANALYTICS_TABS.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors ${
            value === t.value ? 'text-white' : 'text-slate-500 hover:text-slate-700'}`}
          style={value === t.value ? { backgroundColor: accent } : undefined}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Native <select> styled to the DFX card language for a chart metric switch.
function MetricSelect<T extends string>({ value, onChange, options, accent }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; accent: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}
      className="text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-white text-[#0B0E23] outline-none focus:border-slate-300"
      style={{ borderLeft: `3px solid ${accent}` }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// Custom range picker: From / To / Apply. Labeled inputs, no bare placeholders.
function CustomRange({ value, onApply, accent }: { value: { from: string; to: string }; onApply: (r: { from: string; to: string }) => void; accent: string }) {
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
      <div className="flex items-center gap-1.5 h-8 px-2 rounded-lg border border-slate-200 bg-white">
        <span className="text-[9px] font-bold uppercase text-slate-400">From</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-[11px] text-slate-600 bg-transparent outline-none w-[7rem]" />
      </div>
      <div className="flex items-center gap-1.5 h-8 px-2 rounded-lg border border-slate-200 bg-white">
        <span className="text-[9px] font-bold uppercase text-slate-400">To</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-[11px] text-slate-600 bg-transparent outline-none w-[7rem]" />
      </div>
      <button onClick={() => from && to && onApply({ from, to })} disabled={!from || !to}
        className="h-8 px-3 rounded-lg text-[11px] font-bold text-white disabled:opacity-40" style={{ backgroundColor: accent }}>
        Apply
      </button>
    </div>
  );
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { toggle } = useMobileNav();
  const handleLogout = async () => { await logout(); router.push('/auth/login'); };
  const [toast, setToast] = useState<string | null>(null);

  const [todayLabel, setTodayLabel] = useState('');
  // Greeting resolves client-side (hour-based) to avoid an SSR/client mismatch.
  const [greeting, setGreeting] = useState('Welcome');
  useEffect(() => {
    const now = new Date();
    setTodayLabel(now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
    const h = now.getHours();
    setGreeting(h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening');
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [payAllTime, setPayAllTime] = useState<PaymentSummary | null>(null);
  const [schemeSummary, setSchemeSummary] = useState<SchemeSummaryReport | null>(null);
  const [goldTrend, setGoldTrend] = useState<GoldRateTrendReport | null>(null);
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [invoices, setInvoices] = useState<Sale[]>([]);
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [insights, setInsights] = useState<InsightsResult | null>(null);

  const [salesTrend, setSalesTrend] = useState<SalesTrend | null>(null);
  const [salesCats, setSalesCats] = useState<SalesByCategory | null>(null);
  const [bizPeriod, setBizPeriod] = useState<RangeSel>('this_week');
  const [bizMetric, setBizMetric] = useState<BizMetric>('sales');
  const [bizCustom, setBizCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  // Period-scoped Business KPI figures — follow bizPeriod so the KPI cards
  // never stay stuck on "Today" while the chart moves. Real backend
  // aggregates (billing dashboard summary + gold from the sales list).
  const [bizSummary, setBizSummary] = useState<BillingDashboardSummary | null>(null);
  const [bizGold, setBizGold] = useState<number | null>(null);
  const [collTrend, setCollTrend] = useState<PaymentSummary | null>(null);
  const [schemeEnroll, setSchemeEnroll] = useState<EnrollmentSummary | null>(null);
  const [schemePeriod, setSchemePeriod] = useState<RangeSel>('this_week');
  const [schemeMetric, setSchemeMetric] = useState<SchemeMetric>('collections');
  const [schemeCustom, setSchemeCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });

  // Historical analytics charts — independent period, default THIS YEAR.
  const [catPeriod, setCatPeriod] = useState<AnalyticsPeriod>('this_year');
  const [catCustom, setCatCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [popPeriod, setPopPeriod] = useState<AnalyticsPeriod>('this_year');
  const [popCustom, setPopCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });

  // Per-range caches keyed by a range string — switching back to an already
  // fetched range is instant and issues no duplicate request. Fetching flags
  // drive a chart-only skeleton (never a full-page loader). Stale responses are
  // dropped by comparing the resolved key against the latest requested one.
  const salesTrendCache = useRef<Record<string, SalesTrend>>({});
  const salesCatsCache = useRef<Record<string, SalesByCategory>>({});
  const collTrendCache = useRef<Record<string, PaymentSummary>>({});
  const schemeEnrollCache = useRef<Record<string, EnrollmentSummary>>({});
  const bizReqRef = useRef<string>('this_week');
  const bizKpiReqRef = useRef<string>('this_week');
  const schemeReqRef = useRef<string>('this_week');
  const [bizFetching, setBizFetching] = useState(false);
  const [schemeFetching, setSchemeFetching] = useState(false);

  const [bizOutstanding, setBizOutstanding] = useState<number | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const today = new Date();
      const todayStr = isoDate(today);
      const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);
      // Fetched in small sequential batches, not one 9-wide burst, to stay well
      // under the DB connection pool ceiling (each report call opens a session).
      const pAll = await reportService.getPaymentSummary({ dateFrom: '2020-01-01', dateTo: todayStr });
      setPayAllTime(pAll);

      const [gt, enr] = await Promise.all([
        reportService.getGoldRateTrend({ dateFrom: isoDate(weekAgo), dateTo: todayStr }),
        enrollmentService.getAdminEnrollments(),
      ]);
      setGoldTrend(gt); setEnrollments(enr);

      const [cds, ins] = await Promise.all([
        dashboardCardsService.getDashboardCards().catch(() => null),
        reportService.getBusinessInsights({ period: 'this_month' }).catch(() => null),
      ]);
      setCards(cds); setInsights(ins);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load dashboard data.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Recent invoices + all-time business outstanding (aggregate). Separate:
  // Staff without the billing module 403s here. Period-scoped Business KPIs
  // are handled by the bizSummary effect above.
  useEffect(() => {
    billingService.listSales({ limit: 5 }).then((r) => { setInvoices(r.sales); setBizOutstanding(r.totalOutstanding); }).catch(() => { setInvoices([]); setBizOutstanding(null); });
  }, []);

  // Business chart: one fetch per range yields all three metrics (sales/profit/
  // gold), so switching metric never refetches. Category donut is a separate
  // historical chart (own THIS-YEAR-default period), fetched by its own effect.
  useEffect(() => {
    const key = rangeKey(bizPeriod, bizCustom);
    const params = rangeParams(bizPeriod, bizCustom);
    bizReqRef.current = key;
    if (!params) { setBizFetching(false); return; } // custom awaiting Apply
    const cachedT = salesTrendCache.current[key];
    if (cachedT) { setSalesTrend(cachedT); setBizFetching(false); return; }
    setBizFetching(true);
    reportService.getSalesTrend(params).catch(() => null).then((t) => {
      if (bizReqRef.current !== key) return; // stale — a newer range won
      if (t) { salesTrendCache.current[key] = t; setSalesTrend(t); } else setSalesTrend(null);
      setBizFetching(false);
    });
  }, [bizPeriod, bizCustom]);

  // Top Selling Categories — historical, defaults THIS YEAR. Own period so it
  // never moves when the KPI/Sales-Trend period changes.
  const catReqRef = useRef<string>('this_year');
  const [catFetching, setCatFetching] = useState(false);
  useEffect(() => {
    const key = analyticsKey(catPeriod, catCustom);
    const params = analyticsParams(catPeriod, catCustom);
    catReqRef.current = key;
    if (!params) { setCatFetching(false); return; } // custom awaiting Apply
    const cached = salesCatsCache.current[key];
    if (cached) { setSalesCats(cached); setCatFetching(false); return; }
    setCatFetching(true);
    reportService.getSalesByCategory(params).catch(() => null).then((c) => {
      if (catReqRef.current !== key) return;
      if (c) { salesCatsCache.current[key] = c; setSalesCats(c); } else setSalesCats(null);
      setCatFetching(false);
    });
  }, [catPeriod, catCustom]);

  // Popular Schemes — historical, defaults THIS YEAR. Own period control.
  const popReqRef = useRef<string>('this_year');
  const schemeSummaryCache = useRef<Record<string, SchemeSummaryReport>>({});
  const [popFetching, setPopFetching] = useState(false);
  useEffect(() => {
    const key = analyticsKey(popPeriod, popCustom);
    const params = analyticsParams(popPeriod, popCustom);
    popReqRef.current = key;
    if (!params) { setPopFetching(false); return; }
    const cached = schemeSummaryCache.current[key];
    if (cached) { setSchemeSummary(cached); setPopFetching(false); return; }
    setPopFetching(true);
    reportService.getSchemeSummary(params).catch(() => null).then((s) => {
      if (popReqRef.current !== key) return;
      if (s) { schemeSummaryCache.current[key] = s; setSchemeSummary(s); } else setSchemeSummary(null);
      setPopFetching(false);
    });
  }, [popPeriod, popCustom]);

  // Business KPI figures follow the SAME period as the Business chart, so the
  // four cards never stay on "Today" while the chart moves. Reuses the real
  // billing dashboard summary (sales/profit) + the sales list (gold grams).
  useEffect(() => {
    const key = rangeKey(bizPeriod, bizCustom);
    bizKpiReqRef.current = key;
    const dates = rangeDates(bizPeriod, bizCustom);
    if (!dates) return; // custom awaiting Apply — keep last figures on screen
    const arg = (bizPeriod === 'today' || bizPeriod === 'this_week' || bizPeriod === 'this_month')
      ? { period: bizPeriod as 'today' | 'this_week' | 'this_month' }
      : { dateFrom: dates.from, dateTo: dates.to };
    billingService.getDashboardSummary(arg)
      .then((s) => { if (bizKpiReqRef.current === key) setBizSummary(s); })
      .catch(() => { if (bizKpiReqRef.current === key) setBizSummary(null); });
    billingService.listSales({ dateFrom: dates.from, dateTo: dates.to, limit: 1 })
      .then((r) => { if (bizKpiReqRef.current === key) setBizGold(r.totalGoldWeightGrams); })
      .catch(() => { if (bizKpiReqRef.current === key) setBizGold(null); });
  }, [bizPeriod, bizCustom]);

  // Scheme chart: fetch payment-summary (collections ₹) + enrollment-summary
  // (maturity ₹ + enrollments count) per range; metric switch just remaps.
  useEffect(() => {
    const key = rangeKey(schemePeriod, schemeCustom);
    const params = rangeParams(schemePeriod, schemeCustom);
    schemeReqRef.current = key;
    if (!params) { setSchemeFetching(false); return; }
    const cachedP = collTrendCache.current[key];
    const cachedE = schemeEnrollCache.current[key];
    if (cachedP && cachedE) { setCollTrend(cachedP); setSchemeEnroll(cachedE); setSchemeFetching(false); return; }
    setSchemeFetching(true);
    Promise.all([
      reportService.getPaymentSummary(params).catch(() => null),
      reportService.getEnrollmentSummary(params).catch(() => null),
    ]).then(([p, e]) => {
      if (schemeReqRef.current !== key) return; // stale
      if (p) { collTrendCache.current[key] = p; setCollTrend(p); } else setCollTrend(null);
      if (e) { schemeEnrollCache.current[key] = e; setSchemeEnroll(e); } else setSchemeEnroll(null);
      setSchemeFetching(false);
    });
  }, [schemePeriod, schemeCustom]);

  const latestGold = goldTrend?.trend.length ? goldTrend.trend[goldTrend.trend.length - 1].rate24k : null;
  const goldChange = goldTrend?.latestChangePercent ?? null;


  // Business KPIs — follow bizPeriod (labels + values). billing is the source
  // of truth (real aggregates); Outstanding is an all-time balance, not
  // period-scoped, so its label stays fixed.
  const bizPfx = periodPrefix(bizPeriod);
  // KPI cards read the period-scoped block (selectedPeriod), not `today`, so
  // the values track the selected Business period like the chart does.
  const bizProfitStr = bizSummary?.selectedPeriod.totalProfit != null
    ? formatCurrency(bizSummary.selectedPeriod.totalProfit)
    : (bizSummary?.selectedPeriod.totalLoss ? '-' + formatCurrency(bizSummary.selectedPeriod.totalLoss) : '—');
  const bizKpis: KpiSpec[] = [
    { title: `${bizPfx} Sales`, value: bizSummary ? formatCurrency(bizSummary.selectedPeriod.totalSales) : '—', growth: null, sub: 'Finalized sales', icon: Receipt, href: '/admin/billing/history' },
    { title: `${bizPfx} Gold Sold`, value: bizGold != null ? fmtGrams(bizGold) : '—', growth: null, sub: 'Net weight sold', icon: Coins, href: '/admin/billing/history' },
    { title: `${bizPfx} Profit`, value: bizSummary ? bizProfitStr : '—', growth: null, sub: 'Historical-cost basis', icon: Landmark, href: '/admin/billing/history' },
    { title: 'Outstanding Amount', value: bizOutstanding != null ? formatCurrency(bizOutstanding) : '—', growth: null, sub: 'Unpaid product dues (all-time)', icon: AlertTriangle, href: '/admin/billing/history', danger: true },
  ];

  // Collection follows schemePeriod (label + value, from the same period
  // payment-summary the Scheme chart uses). Enrollments/Maturity/Overdue are
  // point-in-time balances, not period-scoped, so their labels stay fixed.
  const schemePfx = periodPrefix(schemePeriod);
  // New-in-period scheme figures — real backend aggregates from the same
  // enrollment-summary the Scheme chart uses (follows schemePeriod). New
  // Enrollments = enrollments started in range; New Maturity = projected
  // maturity value of those new enrollments (sum of the period trend).
  const periodNewEnroll = schemeEnroll ? schemeEnroll.newEnrollmentsInRange : null;
  const periodMaturity = schemeEnroll ? schemeEnroll.dailyTrend.reduce((s, p) => s + (p.maturityAmount || 0), 0) : null;
  const schemeKpis: KpiSpec[] = [
    { title: `${schemePfx} Collection`, value: collTrend ? formatCurrency(collTrend.totalRevenue) : '—', growth: collTrend?.totalRevenueGrowthPercent ?? null, sub: 'Successful payments', icon: Wallet, href: '/admin/collections' },
    { title: `${schemePfx} New Enrollments`, value: periodNewEnroll != null ? periodNewEnroll.toLocaleString('en-IN') : '—', growth: null, sub: 'Enrollments started in period', icon: Users, href: '/admin/enrollments' },
    { title: `${schemePfx} New Maturity (Est.)`, value: periodMaturity != null ? formatCurrency(periodMaturity) : '—', growth: null, sub: 'Projected maturity of new enrollments', icon: Coins, href: '/admin/enrollments' },
    { title: 'Overdue Amount', value: payAllTime ? formatCurrency(payAllTime.outstandingDues) : '—', growth: null, sub: 'Pending installments (all-time)', icon: AlertTriangle, href: '/admin/collections', danger: true },
  ];

  const quickActions = [
    { title: 'New Sale', icon: ShoppingBag, href: '/admin/billing/sell', color: '#2563EB', tint: '#EFF6FF' },
    { title: 'Add Customer', icon: UserPlus, href: '/admin/customers', color: '#16A34A', tint: '#ECFDF5' },
    { title: 'Record Payment', icon: CreditCard, href: '/admin/payments', color: '#7C3AED', tint: '#F5F3FF' },
    { title: 'New Enrollment', icon: FilePlus2, href: '/admin/enrollments', color: '#EA580C', tint: '#FFF7ED' },
    { title: 'Add Scheme', icon: Coins, href: '/admin/schemes', color: '#D97706', tint: '#FFFBEB' },
    { title: 'Add Catalogue', icon: LayoutGrid, href: '/admin/catalogue', color: '#0EA5E9', tint: '#F0F9FF' },
    { title: 'Generate Report', icon: FileText, href: '/admin/reports', color: '#DC2626', tint: '#FEF2F2' },
  ];

  // Business chart series/unit by metric (all three come from the one salesTrend fetch).
  const bizSeries = (salesTrend?.trend ?? []).map((p) => ({
    x: p.label,
    y: bizMetric === 'sales' ? p.totalAmount : bizMetric === 'profit' ? p.profit : p.goldWeightGrams,
  }));
  const bizUnit = bizMetric === 'gold' ? 'grams' : 'inr';
  const bizMetricLabel = BIZ_METRICS.find((m) => m.value === bizMetric)!.label;

  // Scheme chart series/unit by metric.
  const schemeSource =
    schemeMetric === 'collections'
      ? (collTrend?.monthlyTrend ?? []).map((p) => ({ x: p.label, y: p.totalAmount }))
      : schemeMetric === 'maturity'
      ? (schemeEnroll?.dailyTrend ?? []).map((p) => ({ x: p.label, y: p.maturityAmount }))
      : (schemeEnroll?.dailyTrend ?? []).map((p) => ({ x: p.label, y: p.newEnrollments }));
  const schemeUnit = schemeMetric === 'enrollments' ? 'count' : 'inr';
  const schemeMetricLabel = SCHEME_METRICS.find((m) => m.value === schemeMetric)!.label;
  const collChart = schemeSource;
  const catDonut = (salesCats?.categories ?? []).map((c, i) => ({ name: c.category, value: c.totalSales, pct: c.percentage, color: DONUT_BUSINESS[i % DONUT_BUSINESS.length] }));
  // Popular Schemes ranks by collections in the selected range — the only
  // per-scheme metric the backend scopes by date (active_enrollments is an
  // all-time count, so plotting it would ignore the period). Sorted desc = "top".
  const schemeDonut = (schemeSummary?.schemes ?? []).filter((s) => s.totalCollected > 0)
    .sort((a, b) => b.totalCollected - a.totalCollected)
    .map((s, i) => ({ name: s.schemeName, value: s.totalCollected, color: DONUT_SCHEME[i % DONUT_SCHEME.length] }));
  const schemeDonutTotal = schemeDonut.reduce((a, b) => a + b.value, 0);

  // Reminders + Alerts + Bell — all from real backend data only.
  const birthdayInsight = insights?.insights.find((i) => i.category === 'birthday') ?? null;
  // Uncapped, backend-derived: enrollment-level count for the reminder, unique
  // customer count for the alert (a customer with 2 overdue enrollments = 1).
  const overdueEnrollments = cards?.overdue_enrollments ?? 0;
  const overdueCustomers = cards?.overdue_customers ?? 0;

  const reminders: NotificationItem[] = [];
  if (overdueEnrollments > 0) reminders.push({ id: 'overdue-rem', icon: Bell, severity: 'warning', title: 'Overdue reminders due', detail: `${overdueEnrollments} enrollment(s) overdue — send reminders`, href: '/admin/collections' });
  if (birthdayInsight) reminders.push({ id: 'bday', icon: Cake, severity: 'info', title: birthdayInsight.title, detail: birthdayInsight.detail, href: '/admin/customers' });

  const alerts: NotificationItem[] = [];
  if (overdueCustomers > 0) alerts.push({ id: 'overdue-al', icon: ShieldAlert, severity: 'danger', title: `${overdueCustomers} customer(s) with overdue payments`, detail: 'Review collections', href: '/admin/collections' });
  if (cards?.pending_inspection) alerts.push({ id: 'inspect', icon: PackageSearch, severity: 'warning', title: `${cards.pending_inspection} item(s) pending inspection`, detail: 'Inspect returned inventory', href: '/admin/billing/inventory' });
  if (cards?.pending_kyc) alerts.push({ id: 'kyc', icon: Users, severity: 'warning', title: `${cards.pending_kyc} pending KYC`, detail: 'Verify customers', href: '/admin/kyc' });

  const bellItems = [...reminders, ...alerts];

  return (
    <div className="space-y-4 animate-in fade-in duration-300 font-body pb-6">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={toggle} aria-label="Open menu"
            className="lg:hidden p-2 -ml-1 rounded-xl text-slate-500 hover:text-[#0B0E23] hover:bg-slate-100 transition-colors shrink-0">
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display font-extrabold text-xl sm:text-2xl text-[#0B0E23]">{greeting}, {user?.name || 'Admin'} 👋</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Here&apos;s what&apos;s happening in your business today.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <div className="flex-1 lg:w-72"><GlobalSearch /></div>
          <NotificationBell items={bellItems} />
          {/* Static current-date indicator — no dropdown affordance (DFX-DASH-002). */}
          <div className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#0B0E23] shrink-0">
            <Calendar className="w-4 h-4 text-gold-dark" />
            <span className="whitespace-nowrap hidden sm:inline">Today, {todayLabel}</span>
          </div>
          <Button onClick={() => router.push('/admin/settings')} variant="outline" size="sm"
            className="h-8 px-2.5 border-slate-200 text-slate-600 hover:text-[#0B0E23] hidden lg:flex gap-1.5 text-xs font-bold">
            <Settings className="w-3.5 h-3.5" /><span>Settings</span>
          </Button>
          <Button onClick={handleLogout} variant="outline" size="sm"
            className="h-8 px-2 sm:px-2.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 flex gap-1.5 text-xs font-bold">
            <LogOut className="w-3.5 h-3.5" /><span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>

      {/* GOLD RATE STRIP */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-xs">
        <span className="flex items-center gap-2 font-bold text-[#0B0E23]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Today&apos;s Live Bullion Rate (IBJA):
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-slate-500 font-bold">24K Gold:</span>
          <span className="font-extrabold text-[#0B0E23]">{latestGold !== null ? `₹${latestGold.toLocaleString('en-IN')} / g` : '— / g'}</span>
          {goldChange !== null && (
            <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${goldChange >= 0 ? 'text-emerald-600 bg-emerald-100' : 'text-red-600 bg-red-100'}`}>
              {goldChange >= 0 ? '+' : ''}{goldChange.toFixed(2)}%
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5"><span className="text-slate-500 font-bold">22K Gold:</span><span className="font-bold text-slate-400">Not tracked</span></span>
        <span className="flex items-center gap-1.5"><span className="text-slate-500 font-bold">Silver 999:</span><span className="font-bold text-slate-400">Not tracked</span></span>
      </div>

      {/* QUICK ACTIONS — top of dashboard */}
      {!error && <QuickActionsBar actions={quickActions} />}

      {error && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{error}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <div className="grid grid-cols-2 gap-3">{[...Array(4)].map((_, j) => <Skeleton key={j} className="h-28 w-full" />)}</div>
              <Skeleton className="h-56 w-full" /><Skeleton className="h-64 w-full" />
            </div>
          ))}
        </div>
      ) : !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ================= BUSINESS (blue) ================= */}
          <section className="rounded-2xl border border-blue-200 bg-blue-50/30 p-3 space-y-3">
            <div className="flex items-center gap-2.5 bg-gradient-to-r from-blue-100 to-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
              <span className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center"><ShoppingBag className="w-4.5 h-4.5 w-[18px] h-[18px]" /></span>
              <div>
                <h2 className="font-display font-extrabold text-sm text-blue-700">Store Business</h2>
                <p className="text-[10px] text-slate-500 font-medium">Product sales, inventory &amp; billing overview</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {bizKpis.map((k) => <KpiCard key={k.title} kpi={k} />)}
            </div>

            {/* Sales Trend */}
            <Card className="p-3 bg-white border-slate-200 shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <CardTitle className="text-xs font-bold text-[#0B0E23]">Sales Trend</CardTitle>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <MetricSelect value={bizMetric} onChange={setBizMetric} options={BIZ_METRICS} accent={BUSINESS_BLUE} />
                  <PeriodTabs value={bizPeriod} onChange={setBizPeriod} accent={BUSINESS_BLUE} />
                </div>
              </div>
              {bizPeriod === 'custom' && <CustomRange value={bizCustom} onApply={setBizCustom} accent={BUSINESS_BLUE} />}
              {bizPeriod === 'custom' && (!bizCustom.from || !bizCustom.to) ? (
                <EmptyChart text="Pick a date range and Apply" />
              ) : bizFetching && bizSeries.length === 0 ? (
                <ChartSkeleton />
              ) : bizSeries.length === 0 ? (
                <EmptyChart text="No data in this period" />
              ) : (
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={bizSeries} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                      <defs><linearGradient id="areaSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={BUSINESS_BLUE} stopOpacity={0.3} /><stop offset="95%" stopColor={BUSINESS_BLUE} stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="x" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#64748B' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#64748B' }} tickFormatter={(v) => bizUnit === 'grams' ? `${Math.round(v)}g` : `₹${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v: number) => [bizUnit === 'grams' ? fmtGrams(v) : formatCurrency(v), bizMetricLabel]} contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #E2E8F0' }} />
                      <Area type="monotone" dataKey="y" stroke={BUSINESS_BLUE} strokeWidth={2.5} fill="url(#areaSales)" dot={{ r: 2.5, fill: BUSINESS_BLUE }} activeDot={{ r: 4 }} name={bizMetricLabel} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Top Categories — historical analytics, defaults THIS YEAR */}
            <Card className="p-3 bg-white border-slate-200 shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="flex items-baseline gap-2 min-w-0">
                  <CardTitle className="text-xs font-bold text-[#0B0E23]">Top Selling Categories</CardTitle>
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">{analyticsLabel(catPeriod, catCustom)}</span>
                </div>
                <AnalyticsPeriodTabs value={catPeriod} onChange={setCatPeriod} accent={BUSINESS_BLUE} />
              </div>
              {catPeriod === 'custom' && <CustomRange value={catCustom} onApply={setCatCustom} accent={BUSINESS_BLUE} />}
              {catPeriod === 'custom' && (!catCustom.from || !catCustom.to) ? (
                <EmptyChart text="Pick a date range and Apply" />
              ) : catFetching && catDonut.length === 0 ? (
                <ChartSkeleton />
              ) : catDonut.length === 0 ? (
                <EmptyChart text="No category sales in this period" />
              ) : (
                <div className="flex items-center gap-4">
                  <div className="h-32 w-32 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={catDonut} cx="50%" cy="50%" innerRadius={36} outerRadius={56} paddingAngle={3} dataKey="value">
                          {catDonut.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number, _n, p) => [`${formatCurrency(v)} (${(p as any).payload.pct}%)`, (p as any).payload.name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1 min-w-0">
                    {catDonut.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} /><span className="text-slate-700 font-medium truncate">{c.name}</span></span>
                        <span className="font-bold text-[#0B0E23] shrink-0">{c.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Recent Invoices */}
            <Card className="p-3 bg-white border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-xs font-bold text-[#0B0E23]">Recent Business Invoices</CardTitle>
                <button onClick={() => router.push('/admin/billing/history')} className="text-[10px] font-bold text-blue-600 hover:underline">View All</button>
              </div>
              {invoices.length === 0 ? (
                <p className="text-xs text-slate-400 font-medium py-5 text-center">No invoices yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead><tr className="text-slate-500 font-bold uppercase text-[9px] border-b border-slate-200">
                      <th className="py-1.5 pr-2">Invoice</th><th className="py-1.5 pr-2">Customer</th><th className="py-1.5 pr-2 text-right">Amount</th><th className="py-1.5 pr-2">Time</th><th className="py-1.5 text-center">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/70">
                          <td className="py-1.5 pr-2 font-mono font-bold text-blue-600">{s.invoiceNumber}</td>
                          <td className="py-1.5 pr-2 text-slate-700 truncate max-w-[80px]">{s.customerName || 'Walk-in'}</td>
                          <td className="py-1.5 pr-2 text-right font-mono font-bold text-[#0B0E23]">{formatCurrency(s.finalAmount)}</td>
                          <td className="py-1.5 pr-2 text-slate-500">{new Date(s.saleTimestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="py-1.5 text-center"><Badge variant={SALE_STATUS_BADGE[s.paymentStatus as string] ?? 'neutral'} className="text-[9px]">{s.paymentStatus}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Button onClick={() => router.push('/admin/billing/sell')} variant="outline" className="w-full mt-2.5 border-blue-200 text-blue-700 hover:bg-blue-50 font-bold text-xs">
                + New Sale (Billing)
              </Button>
            </Card>
          </section>

          {/* ================= SCHEMES (gold) ================= */}
          <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3 space-y-3">
            <div className="flex items-center gap-2.5 bg-gradient-to-r from-amber-100 to-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: SCHEME_GOLD }}><Coins className="w-4.5 h-4.5 w-[18px] h-[18px]" /></span>
              <div>
                <h2 className="font-display font-extrabold text-sm" style={{ color: '#B45309' }}>Schemes</h2>
                <p className="text-[10px] text-slate-500 font-medium">Scheme collections, enrollments &amp; performance</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {schemeKpis.map((k) => <KpiCard key={k.title} kpi={k} />)}
            </div>

            {/* Collections Trend */}
            <Card className="p-3 bg-white border-slate-200 shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <CardTitle className="text-xs font-bold text-[#0B0E23]">Collections Trend</CardTitle>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <MetricSelect value={schemeMetric} onChange={setSchemeMetric} options={SCHEME_METRICS} accent={SCHEME_GOLD} />
                  <PeriodTabs value={schemePeriod} onChange={setSchemePeriod} accent={SCHEME_GOLD} />
                </div>
              </div>
              {schemePeriod === 'custom' && <CustomRange value={schemeCustom} onApply={setSchemeCustom} accent={SCHEME_GOLD} />}
              {schemePeriod === 'custom' && (!schemeCustom.from || !schemeCustom.to) ? (
                <EmptyChart text="Pick a date range and Apply" />
              ) : schemeFetching && collChart.length === 0 ? (
                <ChartSkeleton />
              ) : collChart.length === 0 || collChart.every((d) => !d.y) ? (
                <EmptyChart text="No data in this period" />
              ) : (
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={collChart} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                      <defs><linearGradient id="areaColl" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={SCHEME_GOLD} stopOpacity={0.3} /><stop offset="95%" stopColor={SCHEME_GOLD} stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="x" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#64748B' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#64748B' }} tickFormatter={(v) => schemeUnit === 'count' ? String(Math.round(v)) : `₹${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v: number) => [schemeUnit === 'count' ? String(v) : formatCurrency(v), schemeMetricLabel]} contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #E2E8F0' }} />
                      <Area type="monotone" dataKey="y" stroke={SCHEME_GOLD} strokeWidth={2.5} fill="url(#areaColl)" dot={{ r: 2.5, fill: SCHEME_GOLD }} activeDot={{ r: 4 }} name={schemeMetricLabel} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Popular Schemes — historical analytics, defaults THIS YEAR */}
            <Card className="p-3 bg-white border-slate-200 shadow-xs">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="flex items-baseline gap-2 min-w-0">
                  <CardTitle className="text-xs font-bold text-[#0B0E23]">Popular Schemes</CardTitle>
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">{analyticsLabel(popPeriod, popCustom)}</span>
                </div>
                <AnalyticsPeriodTabs value={popPeriod} onChange={setPopPeriod} accent={SCHEME_GOLD} />
              </div>
              {popPeriod === 'custom' && <CustomRange value={popCustom} onApply={setPopCustom} accent={SCHEME_GOLD} />}
              {popPeriod === 'custom' && (!popCustom.from || !popCustom.to) ? (
                <EmptyChart text="Pick a date range and Apply" />
              ) : popFetching && schemeDonut.length === 0 ? (
                <ChartSkeleton />
              ) : schemeDonut.length === 0 ? (
                <EmptyChart text="No scheme collections in this period" />
              ) : (
                <div className="flex items-center gap-4">
                  <div className="h-32 w-32 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={schemeDonut} cx="50%" cy="50%" innerRadius={36} outerRadius={56} paddingAngle={3} dataKey="value">
                          {schemeDonut.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => [formatCurrency(v), 'Collected']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1 min-w-0">
                    {schemeDonut.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} /><span className="text-slate-700 font-medium truncate">{c.name}</span></span>
                        <span className="font-bold text-[#0B0E23] shrink-0">{schemeDonutTotal ? Math.round((c.value / schemeDonutTotal) * 100) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Recent Enrollments */}
            <Card className="p-3 bg-white border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-xs font-bold text-[#0B0E23]">Recent Scheme Enrollments</CardTitle>
                <button onClick={() => router.push('/admin/enrollments')} className="text-[10px] font-bold text-gold-dark hover:underline">View All</button>
              </div>
              {enrollments.length === 0 ? (
                <p className="text-xs text-slate-400 font-medium py-5 text-center">No enrollments yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead><tr className="text-slate-500 font-bold uppercase text-[9px] border-b border-slate-200">
                      <th className="py-1.5 pr-2">Customer</th><th className="py-1.5 pr-2">Scheme</th><th className="py-1.5 pr-2 text-right">Amt/Mo</th><th className="py-1.5 pr-2 text-center">Duration</th><th className="py-1.5 pr-2">Start</th><th className="py-1.5 text-center">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {enrollments.slice(0, 5).map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/70">
                          <td className="py-1.5 pr-2 text-slate-700 truncate max-w-[70px]">{e.customerName}</td>
                          <td className="py-1.5 pr-2 text-slate-700 truncate max-w-[80px]">{e.schemeName}</td>
                          <td className="py-1.5 pr-2 text-right font-mono font-bold text-[#0B0E23]">{e.monthlyAmount ? formatCurrency(e.monthlyAmount) : '—'}</td>
                          <td className="py-1.5 pr-2 text-center text-slate-600">{e.durationMonths ? `${e.durationMonths} mo` : '—'}</td>
                          <td className="py-1.5 pr-2 text-slate-500">{new Date(e.joinedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                          <td className="py-1.5 text-center"><Badge variant={ENROLL_STATUS_BADGE[e.status] ?? 'neutral'} className="text-[9px]">{e.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Button onClick={() => router.push('/admin/enrollments')} variant="outline" className="w-full mt-2.5 border-gold/40 text-gold-dark hover:bg-gold/10 font-bold text-xs">
                + New Enrollment
              </Button>
            </Card>
          </section>
        </div>
      )}

      {/* REMINDERS + ALERTS */}
      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PanelList title="Today's Reminders" items={reminders} emptyText="No reminders today" viewAllHref="/admin/notifications" />
          <PanelList title="Alerts & Notifications" items={alerts} emptyText="No active alerts" viewAllHref="/admin/notifications" />
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function QuickActionsBar({ actions }: { actions: { title: string; icon: React.ElementType; href: string; color: string; tint: string }[] }) {
  const router = useRouter();
  return (
    <Card className="p-3 bg-white border-slate-200 shadow-xs">
      <CardTitle className="text-xs font-bold text-[#0B0E23] mb-2">Quick Actions</CardTitle>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {actions.map((qa) => {
          const Icon = qa.icon;
          return (
            <button key={qa.title} onClick={() => router.push(qa.href)}
              className="border border-slate-200 hover:shadow-xs p-2.5 rounded-xl flex flex-col items-center gap-1.5 transition-all hover:-translate-y-0.5">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: qa.tint, color: qa.color }}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-bold text-slate-600 text-center leading-tight">{qa.title}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="h-28 w-full flex items-center justify-center text-xs text-slate-400 font-medium">{text}</div>;
}

// Chart-only skeleton — shown while a period's data is fetching, so switching
// periods never blanks the whole dashboard or flashes a false "no data" state.
function ChartSkeleton() {
  return (
    <div className="h-40 w-full flex items-end gap-1.5 px-1 animate-pulse" aria-hidden>
      {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
        <div key={i} className="flex-1 bg-slate-100 rounded-t" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function PanelList({ title, items, emptyText, viewAllHref }: { title: string; items: NotificationItem[]; emptyText: string; viewAllHref: string }) {
  const router = useRouter();
  return (
    <Card className="p-3 bg-white border-slate-200 shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <CardTitle className="text-xs font-bold text-[#0B0E23]">{title}</CardTitle>
        <button onClick={() => router.push(viewAllHref)} className="text-[10px] font-bold text-slate-500 hover:text-[#0B0E23] hover:underline">View All</button>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 py-6 justify-center text-xs text-slate-400 font-medium"><Info className="w-4 h-4" />{emptyText}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const Icon = it.icon;
            const color = it.severity === 'danger' ? 'text-red-600 bg-red-50' : it.severity === 'warning' ? 'text-amber-600 bg-amber-50' : 'text-blue-600 bg-blue-50';
            return (
              <li key={it.id}>
                <button onClick={() => router.push(it.href)} className="w-full flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${color}`}><Icon className="w-4 h-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-[#0B0E23]">{it.title}</span>
                    <span className="block text-[11px] text-slate-500 font-medium leading-snug">{it.detail}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
