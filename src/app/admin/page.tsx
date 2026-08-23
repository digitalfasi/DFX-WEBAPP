"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag, UserPlus, CreditCard, FilePlus2, Coins, Wallet, LayoutGrid,
  Receipt, TrendingUp, ArrowUpRight, ArrowDownRight, ArrowRight, Calendar,
  Package, Landmark, Users, AlertTriangle, Bell, Cake, PackageSearch, ShieldAlert,
  Info, FileText, ChevronDown, Menu, Settings, LogOut,
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
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
  reportService, ReportPeriod, DashboardSummary, PaymentSummary, SchemeSummaryReport,
  GoldRateTrendReport, SalesTrend, SalesByCategory, InsightsResult,
  dashboardCardsService, DashboardCards, collectionsService, CollectionItem,
} from '@/services/reportService';
import { billingService, BillingDashboardSummary, Sale, SalePaymentStatus } from '@/services/billingService';
import { enrollmentService, AdminEnrollment, EnrollmentStatus } from '@/services/enrollmentService';

const BUSINESS_BLUE = '#2C6FBD';
const SCHEME_GOLD = '#E8A33D';
const DONUT_BUSINESS = ['#2C6FBD', '#60A3E6', '#0EA5E9', '#93C5FD', '#1E3A8A', '#38BDF8'];
const DONUT_SCHEME = ['#E8A33D', '#F59E0B', '#B45309', '#FCD34D', '#92400E', '#FBBF24'];

const PERIOD_TABS: { value: ReportPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year', label: 'This Year' },
];

const SALE_STATUS_BADGE: Record<string, 'success' | 'pending' | 'warn' | 'danger' | 'neutral'> = {
  PAID: 'success', PARTIAL: 'warn', PENDING: 'pending', REFUNDED: 'neutral', PARTIALLY_REFUNDED: 'neutral',
};
const ENROLL_STATUS_BADGE: Record<string, 'success' | 'pending' | 'warn' | 'danger' | 'gold' | 'neutral'> = {
  ACTIVE: 'success', COMPLETED: 'gold', CLOSED: 'neutral', CANCELLED: 'danger',
};

function GrowthPill({ value, accent }: { value: number | null; accent: string }) {
  if (value === null || value === undefined) {
    return <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">—</span>;
  }
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
      up ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
      <Icon className="w-3 h-3" style={{ color: accent }} />{up ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

interface KpiSpec {
  title: string; value: string; growth: number | null; sub: string; icon: React.ElementType; href: string; danger?: boolean;
}
// Compact KPI tile matching the reference: title + value only. The whole tile
// is clickable (keeps navigation) — no visible pill / "View Details" chrome.
function KpiCard({ kpi }: { kpi: KpiSpec }) {
  const router = useRouter();
  return (
    <button onClick={() => router.push(kpi.href)}
      className="bg-white/80 p-3 rounded-lg border border-slate-200 text-left hover:shadow-xs hover:border-slate-300 transition-all">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">{kpi.title}</div>
      <div className={`text-base font-extrabold font-display mt-1 truncate ${kpi.danger ? 'text-red-600' : 'text-[#0B0E23]'}`}>{kpi.value}</div>
    </button>
  );
}

function PeriodTabs({ value, onChange, accent }: { value: ReportPeriod; onChange: (p: ReportPeriod) => void; accent: string }) {
  return (
    <div className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-lg border border-slate-200">
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

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { toggle } = useMobileNav();
  const [toast, setToast] = useState<string | null>(null);
  const handleLogout = async () => { await logout(); router.push('/auth/login'); };

  const [todayLabel, setTodayLabel] = useState('');
  useEffect(() => {
    setTodayLabel(new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dash, setDash] = useState<DashboardSummary | null>(null);
  const [payToday, setPayToday] = useState<PaymentSummary | null>(null);
  const [payAllTime, setPayAllTime] = useState<PaymentSummary | null>(null);
  const [schemeSummary, setSchemeSummary] = useState<SchemeSummaryReport | null>(null);
  const [goldTrend, setGoldTrend] = useState<GoldRateTrendReport | null>(null);
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [invoices, setInvoices] = useState<Sale[]>([]);
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [billing, setBilling] = useState<BillingDashboardSummary | null>(null);

  const [salesTrend, setSalesTrend] = useState<SalesTrend | null>(null);
  const [salesCats, setSalesCats] = useState<SalesByCategory | null>(null);
  const [bizPeriod, setBizPeriod] = useState<ReportPeriod>('this_week');
  const [collTrend, setCollTrend] = useState<PaymentSummary | null>(null);
  const [schemePeriod, setSchemePeriod] = useState<ReportPeriod>('this_week');

  // Per-period caches — switching back to an already-fetched period is instant
  // and issues no duplicate request. Fetching flags drive a small chart-only
  // skeleton (never a full-page loader). Stale responses are dropped by
  // comparing the resolved period against the latest requested one.
  const salesTrendCache = useRef<Partial<Record<ReportPeriod, SalesTrend>>>({});
  const salesCatsCache = useRef<Partial<Record<ReportPeriod, SalesByCategory>>>({});
  const collTrendCache = useRef<Partial<Record<ReportPeriod, PaymentSummary>>>({});
  const bizReqRef = useRef<ReportPeriod>('this_week');
  const schemeReqRef = useRef<ReportPeriod>('this_week');
  const [bizFetching, setBizFetching] = useState(false);
  const [schemeFetching, setSchemeFetching] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const today = new Date();
      const todayStr = isoDate(today);
      const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);
      // Fetched in small sequential batches, not one 9-wide burst, to stay well
      // under the DB connection pool ceiling (each report call opens a session).
      const [d, pT, pAll] = await Promise.all([
        reportService.getDashboardSummary({ period: 'today' }),
        reportService.getPaymentSummary({ period: 'today' }),
        reportService.getPaymentSummary({ dateFrom: '2020-01-01', dateTo: todayStr }),
      ]);
      setDash(d); setPayToday(pT); setPayAllTime(pAll);

      const [ss, gt, enr] = await Promise.all([
        reportService.getSchemeSummary({ period: 'this_year' }),
        reportService.getGoldRateTrend({ dateFrom: isoDate(weekAgo), dateTo: todayStr }),
        enrollmentService.getAdminEnrollments(),
      ]);
      setSchemeSummary(ss); setGoldTrend(gt); setEnrollments(enr);

      const [cds, col, ins] = await Promise.all([
        dashboardCardsService.getDashboardCards().catch(() => null),
        collectionsService.getCollections().catch(() => []),
        reportService.getBusinessInsights({ period: 'this_month' }).catch(() => null),
      ]);
      setCards(cds); setCollections(col); setInsights(ins);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load dashboard data.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Billing summary + recent invoices — separate: Staff without billing module 403s here.
  useEffect(() => {
    billingService.getDashboardSummary('today').then(setBilling).catch(() => setBilling(null));
    billingService.listSales({ limit: 5 }).then((r) => setInvoices(r.sales)).catch(() => setInvoices([]));
  }, []);

  useEffect(() => {
    bizReqRef.current = bizPeriod;
    const cachedT = salesTrendCache.current[bizPeriod];
    const cachedC = salesCatsCache.current[bizPeriod];
    if (cachedT && cachedC) { setSalesTrend(cachedT); setSalesCats(cachedC); setBizFetching(false); return; }
    setBizFetching(true);
    Promise.all([
      reportService.getSalesTrend({ period: bizPeriod }).catch(() => null),
      reportService.getSalesByCategory({ period: bizPeriod }).catch(() => null),
    ]).then(([t, c]) => {
      if (bizReqRef.current !== bizPeriod) return; // stale — a newer period won
      if (t) { salesTrendCache.current[bizPeriod] = t; setSalesTrend(t); } else setSalesTrend(null);
      if (c) { salesCatsCache.current[bizPeriod] = c; setSalesCats(c); } else setSalesCats(null);
      setBizFetching(false);
    });
  }, [bizPeriod]);

  useEffect(() => {
    schemeReqRef.current = schemePeriod;
    const cached = collTrendCache.current[schemePeriod];
    if (cached) { setCollTrend(cached); setSchemeFetching(false); return; }
    setSchemeFetching(true);
    reportService.getPaymentSummary({ period: schemePeriod }).catch(() => null).then((r) => {
      if (schemeReqRef.current !== schemePeriod) return; // stale
      if (r) { collTrendCache.current[schemePeriod] = r; setCollTrend(r); } else setCollTrend(null);
      setSchemeFetching(false);
    });
  }, [schemePeriod]);

  const latestGold = goldTrend?.trend.length ? goldTrend.trend[goldTrend.trend.length - 1].rate24k : null;
  const goldChange = goldTrend?.latestChangePercent ?? null;

  const activeEnrollments = enrollments.filter((e) => e.status === 'ACTIVE');
  const totalMaturity = activeEnrollments.reduce((s, e) => s + (e.maturityAmount || 0), 0);

  // Business KPIs — billing is source of truth (real, no growth series for sales).
  const bizKpis: KpiSpec[] = [
    { title: "Today's Sales", value: billing ? formatCurrency(billing.today.totalSales) : '—', growth: null, sub: 'Finalized sales today', icon: Receipt, href: '/admin/billing/history' },
    { title: 'This Month Sales', value: billing ? formatCurrency(billing.thisMonth.totalSales) : '—', growth: null, sub: 'Month to date', icon: TrendingUp, href: '/admin/billing/history' },
    { title: 'Total Profit (MTD)', value: billing?.thisMonth.totalProfit != null ? formatCurrency(billing.thisMonth.totalProfit) : (billing?.thisMonth.totalLoss ? '-' + formatCurrency(billing.thisMonth.totalLoss) : '—'), growth: null, sub: 'Historical-cost basis', icon: Landmark, href: '/admin/reports' },
    { title: 'Items In Stock', value: cards?.items_in_stock != null ? String(cards.items_in_stock) : '—', growth: null, sub: 'Sellable inventory', icon: Package, href: '/admin/billing/inventory' },
  ];

  const schemeKpis: KpiSpec[] = [
    { title: "Today's Collections", value: payToday ? formatCurrency(payToday.totalRevenue) : '—', growth: payToday?.totalRevenueGrowthPercent ?? null, sub: 'Successful payments today', icon: Wallet, href: '/admin/collections' },
    { title: 'Active Enrollments', value: dash ? dash.activeEnrollments.toLocaleString('en-IN') : '—', growth: null, sub: 'Currently active', icon: Users, href: '/admin/enrollments' },
    { title: 'Total Maturity (Est.)', value: formatCurrency(totalMaturity), growth: null, sub: 'Active enrollments maturity', icon: Coins, href: '/admin/reports' },
    { title: 'Outstanding Dues', value: payAllTime ? formatCurrency(payAllTime.outstandingDues) : '—', growth: null, sub: 'Pending installments', icon: AlertTriangle, href: '/admin/collections', danger: true },
  ];

  const quickActions = [
    { title: 'Add Customer', icon: UserPlus, href: '/admin/customers', color: '#2563EB', tint: '#EFF6FF' },
    { title: 'New Sale (Billing)', icon: ShoppingBag, href: '/admin/billing/sell', color: '#16A34A', tint: '#ECFDF5' },
    { title: 'New Enrollment', icon: FilePlus2, href: '/admin/enrollments', color: '#EA580C', tint: '#FFF7ED' },
    { title: 'Record Collection', icon: Wallet, href: '/admin/collections', color: '#7C3AED', tint: '#F5F3FF' },
    { title: 'Send Reminder', icon: Bell, href: '/admin/notifications', color: '#DC2626', tint: '#FEF2F2' },
  ];

  const salesChart = (salesTrend?.trend ?? []).map((p) => ({ x: p.label, y: p.totalAmount }));
  const invoiceChart = (salesTrend?.trend ?? []).map((p) => ({ x: p.label, y: p.saleCount }));
  const collChart = (collTrend?.monthlyTrend ?? []).map((p) => ({ x: p.label, y: p.totalAmount }));
  const catDonut = (salesCats?.categories ?? []).map((c, i) => ({ name: c.category, value: c.totalSales, pct: c.percentage, color: DONUT_BUSINESS[i % DONUT_BUSINESS.length] }));
  const schemeDonut = (schemeSummary?.schemes ?? []).filter((s) => s.activeEnrollments > 0)
    .map((s, i) => ({ name: s.schemeName, value: s.activeEnrollments, color: DONUT_SCHEME[i % DONUT_SCHEME.length] }));
  const schemeDonutTotal = schemeDonut.reduce((a, b) => a + b.value, 0);

  // Reminders + Alerts + Bell — all from real backend data only.
  const birthdayInsight = insights?.insights.find((i) => i.category === 'birthday') ?? null;
  const overdueCount = collections.length;

  const reminders: NotificationItem[] = [];
  if (overdueCount > 0) reminders.push({ id: 'overdue-rem', icon: Bell, severity: 'warning', title: 'Overdue reminders due', detail: `${overdueCount} enrollment(s) overdue — send reminders`, href: '/admin/collections' });
  if (birthdayInsight) reminders.push({ id: 'bday', icon: Cake, severity: 'info', title: birthdayInsight.title, detail: birthdayInsight.detail, href: '/admin/customers' });

  const alerts: NotificationItem[] = [];
  if (overdueCount > 0) alerts.push({ id: 'overdue-al', icon: ShieldAlert, severity: 'danger', title: `${overdueCount} customer(s) with overdue payments`, detail: 'Review collections', href: '/admin/collections' });
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
            <h1 className="font-display font-extrabold text-xl sm:text-2xl text-[#0B0E23]">Good Morning, {user?.name || 'Admin'} 👋</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Here&apos;s what&apos;s happening in your business today.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <div className="flex-1 lg:w-72"><GlobalSearch /></div>
          <NotificationBell items={bellItems} />
          <div className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#0B0E23] shrink-0">
            <Calendar className="w-4 h-4 text-gold-dark" />
            <span className="whitespace-nowrap hidden sm:inline">Today, {todayLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <button onClick={() => router.push('/admin/settings')} aria-label="Settings"
            className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-[#0B0E23] hover:border-gold/50 transition-colors shrink-0 hidden sm:flex items-center gap-1.5 text-xs font-bold">
            <Settings className="w-4 h-4" /><span className="hidden lg:inline">Settings</span>
          </button>
          <button onClick={handleLogout} aria-label="Logout"
            className="h-10 px-3 rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors shrink-0 flex items-center gap-1.5 text-xs font-bold">
            <LogOut className="w-4 h-4" /><span className="hidden lg:inline">Logout</span>
          </button>
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

      {/* TOP KPI ROW — business + scheme highlights with sparklines */}
      {!error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <TopKpi title="Today's Sales (Business)" value={billing ? formatCurrency(billing.today.totalSales) : '—'} growth={null} icon={ShoppingBag} accent="#2563EB" tint="#EFF6FF" spark={salesChart} sparkId="spkSales" onClick={() => router.push('/admin/billing/history')} />
          <TopKpi title="Today's Collections (Scheme)" value={payToday ? formatCurrency(payToday.totalRevenue) : '—'} growth={payToday?.totalRevenueGrowthPercent ?? null} icon={Wallet} accent="#16A34A" tint="#ECFDF5" spark={collChart} sparkId="spkColl" onClick={() => router.push('/admin/collections')} />
          <TopKpi title="Total Customers" value={dash ? dash.totalCustomers.toLocaleString('en-IN') : '—'} growth={dash?.totalCustomersGrowthPercent ?? null} icon={Users} accent="#EA580C" tint="#FFF7ED" onClick={() => router.push('/admin/customers')} />
          <TopKpi title="Today's Invoices" value={billing ? String(billing.today.billCount) : '—'} growth={null} icon={FileText} accent="#7C3AED" tint="#F5F3FF" spark={invoiceChart} sparkId="spkInv" onClick={() => router.push('/admin/billing/history')} />
          <TopKpi title="Overdue Customers" value={String(collections.length)} growth={null} icon={Bell} accent="#DC2626" tint="#FEF2F2" onClick={() => router.push('/admin/collections')} />
        </div>
      )}

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
                <h2 className="font-display font-extrabold text-sm text-blue-700">Business (Products)</h2>
                <p className="text-[10px] text-slate-500 font-medium">Product sales, inventory &amp; billing overview</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {bizKpis.map((k) => <KpiCard key={k.title} kpi={k} />)}
            </div>

            {/* Sales Trend */}
            <Card className="p-3 bg-white border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-xs font-bold text-[#0B0E23]">Sales Trend</CardTitle>
                <PeriodTabs value={bizPeriod} onChange={setBizPeriod} accent={BUSINESS_BLUE} />
              </div>
              {bizFetching && salesChart.length === 0 ? (
                <ChartSkeleton />
              ) : salesChart.length === 0 ? (
                <EmptyChart text="No sales in this period" />
              ) : (
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesChart} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                      <defs><linearGradient id="areaSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={BUSINESS_BLUE} stopOpacity={0.3} /><stop offset="95%" stopColor={BUSINESS_BLUE} stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="x" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#64748B' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#64748B' }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v: number) => [formatCurrency(v), 'Sales']} contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #E2E8F0' }} />
                      <Area type="monotone" dataKey="y" stroke={BUSINESS_BLUE} strokeWidth={2.5} fill="url(#areaSales)" dot={{ r: 2.5, fill: BUSINESS_BLUE }} activeDot={{ r: 4 }} name="Sales" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Top Categories */}
            <Card className="p-3 bg-white border-slate-200 shadow-xs">
              <CardTitle className="text-xs font-bold text-[#0B0E23] mb-2">Top Selling Categories</CardTitle>
              {bizFetching && catDonut.length === 0 ? (
                <ChartSkeleton />
              ) : catDonut.length === 0 ? (
                <EmptyChart text="No category sales yet" />
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {schemeKpis.map((k) => <KpiCard key={k.title} kpi={k} />)}
            </div>

            {/* Collections Trend */}
            <Card className="p-3 bg-white border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-xs font-bold text-[#0B0E23]">Collections Trend</CardTitle>
                <PeriodTabs value={schemePeriod} onChange={setSchemePeriod} accent={SCHEME_GOLD} />
              </div>
              {schemeFetching && collChart.length === 0 ? (
                <ChartSkeleton />
              ) : collChart.length === 0 || collChart.every((d) => !d.y) ? (
                <EmptyChart text="No collections in this period" />
              ) : (
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={collChart} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                      <defs><linearGradient id="areaColl" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={SCHEME_GOLD} stopOpacity={0.3} /><stop offset="95%" stopColor={SCHEME_GOLD} stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="x" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#64748B' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#64748B' }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v: number) => [formatCurrency(v), 'Collections']} contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid #E2E8F0' }} />
                      <Area type="monotone" dataKey="y" stroke={SCHEME_GOLD} strokeWidth={2.5} fill="url(#areaColl)" dot={{ r: 2.5, fill: SCHEME_GOLD }} activeDot={{ r: 4 }} name="Collections" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Popular Schemes */}
            <Card className="p-3 bg-white border-slate-200 shadow-xs">
              <CardTitle className="text-xs font-bold text-[#0B0E23] mb-2">Popular Schemes</CardTitle>
              {schemeDonut.length === 0 ? (
                <EmptyChart text="No active scheme enrollments yet" />
              ) : (
                <div className="flex items-center gap-4">
                  <div className="h-32 w-32 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={schemeDonut} cx="50%" cy="50%" innerRadius={36} outerRadius={56} paddingAngle={3} dataKey="value">
                          {schemeDonut.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => [`${v} members`, 'Enrolled']} />
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
                      <th className="py-1.5 pr-2">Customer</th><th className="py-1.5 pr-2">Scheme</th><th className="py-1.5 pr-2 text-right">Amt/Mo</th><th className="py-1.5 pr-2">Start</th><th className="py-1.5 text-center">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {enrollments.slice(0, 5).map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/70">
                          <td className="py-1.5 pr-2 text-slate-700 truncate max-w-[70px]">{e.customerName}</td>
                          <td className="py-1.5 pr-2 text-slate-700 truncate max-w-[80px]">{e.schemeName}</td>
                          <td className="py-1.5 pr-2 text-right font-mono font-bold text-[#0B0E23]">{e.monthlyAmount ? formatCurrency(e.monthlyAmount) : '—'}</td>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <PanelList title="Today's Reminders" items={reminders} emptyText="No reminders today" viewAllHref="/admin/notifications" />
          <QuickActionsPanel actions={quickActions} />
          <PanelList title="Alerts & Notifications" items={alerts} emptyText="No active alerts" viewAllHref="/admin/notifications" />
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function Sparkline({ data, color, id }: { data: { x: string; y: number }[]; color: string; id: string }) {
  // Need >=2 real points for a line; a single point renders a stray floating dot.
  const valid = data.filter((d) => typeof d.y === 'number');
  if (valid.length < 2 || valid.every((d) => !d.y)) return null;
  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={valid} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="y" stroke={color} strokeWidth={1.75} fill={`url(#${id})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopKpi({ title, tag, value, growth, icon, accent, tint, spark, sparkId, onClick }: {
  title: string; tag?: string; value: string; growth: number | null; icon: React.ElementType;
  accent: string; tint: string; spark?: { x: string; y: number }[]; sparkId?: string; onClick: () => void;
}) {
  const Icon = icon;
  const up = growth !== null && growth >= 0;
  const TrendIcon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <button onClick={onClick} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-left hover:shadow-sm transition-all flex flex-col min-h-[132px]">
      <div className="flex items-start gap-2.5">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: tint, color: accent }}>
          <Icon className="w-5 h-5" />
        </span>
        <span className="text-[11px] font-semibold text-slate-500 leading-snug pt-0.5">{title}{tag ? ` (${tag})` : ''}</span>
      </div>
      <div className="text-xl font-extrabold text-[#0B0E23] font-display mt-2 truncate">{value}</div>
      <div className="h-4 mt-0.5">
        {growth !== null && (
          <div className="flex items-center gap-1 text-[11px]">
            <TrendIcon className={`w-3.5 h-3.5 ${up ? 'text-emerald-600' : 'text-red-600'}`} />
            <span className={`font-bold ${up ? 'text-emerald-600' : 'text-red-600'}`}>{up ? '+' : ''}{growth.toFixed(1)}%</span>
            <span className="text-slate-400 font-medium">vs yesterday</span>
          </div>
        )}
      </div>
      {/* Fixed sparkline slot — keeps all cards equal height whether or not a real series exists. */}
      <div className="h-8 mt-auto pt-1">
        {spark && sparkId && <Sparkline data={spark} color={accent} id={sparkId} />}
      </div>
    </button>
  );
}

function QuickActionsPanel({ actions }: { actions: { title: string; icon: React.ElementType; href: string; color: string; tint: string }[] }) {
  const router = useRouter();
  return (
    <Card className="p-3 bg-white border-slate-200 shadow-xs">
      <CardTitle className="text-xs font-bold text-[#0B0E23] mb-2">Quick Actions</CardTitle>
      <div className="grid grid-cols-5 gap-2">
        {actions.map((qa) => {
          const Icon = qa.icon;
          return (
            <button key={qa.title} onClick={() => router.push(qa.href)}
              className="border border-slate-200 hover:shadow-xs p-2 rounded-xl flex flex-col items-center gap-1.5 transition-all hover:-translate-y-0.5">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: qa.tint, color: qa.color }}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-[9px] font-bold text-slate-600 text-center leading-tight">{qa.title}</span>
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
