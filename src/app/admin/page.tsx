"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar,
  TrendingUp,
  Users,
  Coins,
  CreditCard,
  Wallet,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  UserPlus,
  ShoppingBag,
  FileSpreadsheet,
  ArrowRight,
  Scale,
  Receipt,
  Gem,
  PackageCheck
} from 'lucide-react';
import { billingService, BillingDashboardSummary, BusinessHistoryPeriod } from '@/services/billingService';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';
import { Toast } from '@/components/ui/toast';
import { useRouter } from 'next/navigation';
import {
  reportService,
  DashboardSummary,
  PaymentSummary,
  SchemeSummaryReport,
  GoldRateTrendReport,
  dashboardCardsService,
  DashboardCards,
} from '@/services/reportService';
import { enrollmentService, AdminEnrollment } from '@/services/enrollmentService';
import { paymentService, AdminPayment, PaymentStatus, PaymentMethod } from '@/services/paymentService';
import { ApiError } from '@/lib/apiClient';
import { triggerExportDownload } from '@/lib/exportDownload';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';

// JROS predates this date — used as a practical "all time" lower bound for
// report calls that need a cumulative/all-time figure (e.g. total gold
// accumulated, total pending installments), since every report endpoint
// requires an explicit range rather than having a dedicated "all time" mode.
const ALL_TIME_START = '2020-01-01';

const SCHEME_COLORS = ['#2C6FBD', '#0B0E23', '#0D9488', '#60A3E6', '#10B981', '#EF4444'];

const COUNTER_METHODS: PaymentMethod[] = ['CASH', 'CHEQUE', 'BANK_TRANSFER'];

const PAYMENT_STATUS_BADGE: Record<PaymentStatus, 'success' | 'pending' | 'danger' | 'gold' | 'neutral'> = {
  SUCCESS: 'success',
  PENDING: 'pending',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'gold',
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Growth-percent pill. Renders a neutral dash when no comparison is
 * computable (e.g. a live snapshot / all-time cumulative figure has no
 * natural single "previous period" to compare against). */
function GrowthPill({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <div className="flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
        <span>—</span>
      </div>
    );
  }
  const isUp = value >= 0;
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-xl border ${
      isUp ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'
    }`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{isUp ? '+' : ''}{value.toFixed(1)}%</span>
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { branding } = useTenant();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // Computed client-side only (not during render) to avoid a hydration
  // mismatch: the server-rendered pass and the browser can be in different
  // timezones, so `new Date()` evaluated during render can legitimately
  // disagree between server HTML and client hydration.
  const [todayLabel, setTodayLabel] = useState('');
  useEffect(() => {
    setTodayLabel(
      new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [dashToday, setDashToday] = useState<DashboardSummary | null>(null);
  const [dashAllTime, setDashAllTime] = useState<DashboardSummary | null>(null);
  const [paymentAllTime, setPaymentAllTime] = useState<PaymentSummary | null>(null);
  const [paymentWeek, setPaymentWeek] = useState<PaymentSummary | null>(null);
  const [schemeSummary, setSchemeSummary] = useState<SchemeSummaryReport | null>(null);
  const [goldRateTrend, setGoldRateTrend] = useState<GoldRateTrendReport | null>(null);
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);

  // Separate from the main dashboard load — a Staff account without the
  // "billing" module gets a 403 here, which must not break the rest of the
  // dashboard (see billing_service.py's require_admin_or_staff_module).
  const [billingSummary, setBillingSummary] = useState<BillingDashboardSummary | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [historyPeriod, setHistoryPeriod] = useState<BusinessHistoryPeriod>('today');

  useEffect(() => {
    setBillingLoading(true);
    billingService.getDashboardSummary(historyPeriod)
      .then(setBillingSummary)
      .catch(() => setBillingSummary(null))
      .finally(() => setBillingLoading(false));
  }, [historyPeriod]);

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const today = new Date();
      const todayStr = isoDate(today);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 6);
      const sevenDaysAgoStr = isoDate(sevenDaysAgo);

      const [
        todaySummary,
        allTimeSummary,
        pendingAllTime,
        weekPayments,
        schemes,
        rateTrend,
        recentEnrollments,
        recentPayments,
      ] = await Promise.all([
        reportService.getDashboardSummary({ period: 'today' }),
        reportService.getDashboardSummary({ dateFrom: ALL_TIME_START, dateTo: todayStr }),
        reportService.getPaymentSummary({ dateFrom: ALL_TIME_START, dateTo: todayStr }),
        reportService.getPaymentSummary({ dateFrom: sevenDaysAgoStr, dateTo: todayStr }),
        reportService.getSchemeSummary({ period: 'this_year' }),
        reportService.getGoldRateTrend({ dateFrom: sevenDaysAgoStr, dateTo: todayStr }),
        enrollmentService.getAdminEnrollments(),
        paymentService.getAdminPayments(),
      ]);

      setDashToday(todaySummary);
      setDashAllTime(allTimeSummary);
      setPaymentAllTime(pendingAllTime);
      setPaymentWeek(weekPayments);
      setSchemeSummary(schemes);
      setGoldRateTrend(rateTrend);
      setEnrollments(recentEnrollments);
      setPayments(recentPayments);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleExport = async () => {
    setToastMsg("Exporting dashboard summary to Excel...");
    try {
      const file = await reportService.exportDashboardSummary('excel');
      triggerExportDownload(file);
      setToastMsg(`${file.filename} downloaded`);
    } catch (err) {
      setToastMsg(err instanceof ApiError ? err.message : 'Export failed. Please try again.');
    }
  };

  const latestGoldRate = goldRateTrend?.trend.length ? goldRateTrend.trend[goldRateTrend.trend.length - 1].rate24k : null;
  const goldRateChange = goldRateTrend?.latestChangePercent ?? null;

  const kpis = [
    {
      title: 'Total Customers',
      val: dashToday ? dashToday.totalCustomers.toLocaleString('en-IN') : '—',
      growth: dashToday?.totalCustomersGrowthPercent ?? null,
      desc: 'Compared to last month',
      icon: Users,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
    },
    {
      title: 'Active Savings Schemes',
      val: dashToday ? dashToday.activeEnrollments.toLocaleString('en-IN') : '—',
      // A live snapshot count has no natural single "previous period" to
      // compare against without a status-change history table — see
      // SESSION_HANDOFF.md Module 12 for the same reasoning applied to
      // the Reports page's Total Active Passbooks KPI.
      growth: null as number | null,
      desc: 'Currently active enrollments',
      icon: Coins,
      color: 'text-teal-600 bg-teal-50 border-teal-200',
    },
    {
      title: 'Today Total Collections',
      val: dashToday ? formatCurrency(dashToday.totalRevenue) : '—',
      growth: dashToday?.totalRevenueGrowthPercent ?? null,
      desc: 'All successful payments today',
      icon: CreditCard,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    },
    {
      title: 'Gold Accumulated (Vault)',
      val: dashAllTime ? `${dashAllTime.totalGoldAccumulatedGrams.toFixed(2)} g` : '—',
      // All-time cumulative balance — same "no natural comparison" reasoning
      // as Active Savings Schemes above.
      growth: null as number | null,
      desc: 'Total Customer Reserves (All-Time)',
      icon: Scale,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
    },
  ];

  const collectionsChartData = (paymentWeek?.monthlyTrend ?? []).map((t) => ({
    date: t.label,
    collections: t.totalAmount,
  }));

  const schemeDistribution = (schemeSummary?.schemes ?? [])
    .filter((s) => s.activeEnrollments > 0)
    .map((s, idx) => ({ name: s.schemeName, value: s.activeEnrollments, color: SCHEME_COLORS[idx % SCHEME_COLORS.length] }));

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      <OperationalCards />

      {/* 1. WORKSPACE HEADER WITH INLINE BULLION RATES & GREETING */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
                Good Morning, {user?.name || 'Admin'} 👋
              </h1>
              <Badge variant="gold">Admin</Badge>
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1 flex items-center gap-2 flex-wrap">
              <span>Welcome back to <strong>{branding.brandName}</strong>.</span>
              <span className="text-slate-300">|</span>
              <span className="text-gold-dark font-bold">Today is {todayLabel}</span>
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2.5">
            <Button onClick={handleExport} size="sm" className="bg-gold hover:bg-gold-dark text-white font-bold h-9">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              <span>Export Report</span>
            </Button>
          </div>
        </div>

        {/* INLINE BULLION MARKET RATES TICKER */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs bg-[#F7F8FC] p-3 rounded-2xl border border-gold/20">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="font-bold text-[#0B0E23]">Today&apos;s Live Bullion Rate (IBJA):</span>
          </div>

          <div className="flex items-center gap-4 flex-wrap font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-bold">24K Gold:</span>
              <span className="font-extrabold text-[#0B0E23]">
                {latestGoldRate !== null ? `₹${latestGoldRate.toLocaleString('en-IN')} / g` : '— / g'}
              </span>
              {goldRateChange !== null && (
                <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${goldRateChange >= 0 ? 'text-emerald-600 bg-emerald-100' : 'text-red-600 bg-red-100'}`}>
                  {goldRateChange >= 0 ? '+' : ''}{goldRateChange.toFixed(2)}% {goldRateChange >= 0 ? '▲' : '▼'}
                </span>
              )}
            </div>

            {/* 22K Gold and Silver are not tracked anywhere in the backend
               (Gold Rate module is 24K-only, per Module 6 scope) — shown as
               an honest "not tracked" placeholder rather than a fabricated
               rate, matching this codebase's established convention. */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-bold">22K Gold:</span>
              <span className="font-extrabold text-slate-400">Not tracked</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-bold">Silver 999:</span>
              <span className="font-extrabold text-slate-400">Not tracked</span>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadDashboard}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && (
        <>
      {/* 2. ENTERPRISE KPI CARDS WITH SPARKLINE INDICATOR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => {
          const IconComp = kpi.icon;
          return (
            <Card key={idx} variant="statistic" className="p-5 hover:border-gold/50 transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-3 rounded-2xl ${kpi.color} border shadow-2xs`}>
                  <IconComp className="w-6 h-6" />
                </div>
                <GrowthPill value={kpi.growth} />
              </div>

              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{kpi.title}</div>
                <div className="text-2xl font-extrabold text-[#0B0E23] font-display mt-0.5">{kpi.val}</div>
                <div className="text-[11px] text-slate-400 font-medium mt-1">{kpi.desc}</div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 3. BILLING BUSINESS SUMMARY — replaces the old insights-placeholder row */}
      <BillingSummarySection
        loading={billingLoading}
        summary={billingSummary}
        historyPeriod={historyPeriod}
        onHistoryPeriodChange={setHistoryPeriod}
      />

      {/* 4. QUICK ACTIONS WITH DESCRIPTION */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { title: 'View Customers', desc: 'Search customer directory', icon: UserPlus, path: '/admin/customers' },
          { title: 'Record Payment', desc: 'Collect installment', icon: CreditCard, path: '/admin/payments' },
          { title: 'Create Scheme', desc: 'Launch new plan', icon: Coins, path: '/admin/schemes' },
          { title: 'New Sale', desc: 'Bill a customer', icon: Calendar, path: '/admin/billing/sell' },
          { title: 'Add Jewellery', desc: 'Upload inventory item', icon: ShoppingBag, path: '/admin/catalogue' },
          { title: 'Generate Report', desc: 'Download business PDF', icon: FileSpreadsheet, path: '/admin/reports' },
        ].map((qa, idx) => {
          const IconComp = qa.icon;
          return (
            <button
              key={idx}
              onClick={() => router.push(qa.path)}
              className="bg-white border border-slate-200 hover:border-gold p-3.5 rounded-2xl flex flex-col justify-between transition-all hover:-translate-y-0.5 hover:shadow-xs text-left group"
            >
              <div className="w-8 h-8 rounded-xl bg-gold/10 text-gold-dark flex items-center justify-center group-hover:bg-gold group-hover:text-white transition-colors mb-2">
                <IconComp className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#0B0E23] group-hover:text-gold-dark transition-colors">{qa.title}</div>
                <div className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">{qa.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 5. CHARTS ROW WITH SUMMARIES & LEGENDS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Daily Collections Trend (2 Cols) */}
        <Card className="lg:col-span-2 p-5 border-slate-200 bg-white shadow-xs">
          <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-[#0B0E23]">
                Daily Collections Trend
              </CardTitle>
              <p className="text-xs text-slate-500 font-medium">
                Scheme installment collections, last 7 days.
              </p>
            </div>
            <Badge variant="gold">{paymentWeek?.range.label ?? 'Last 7 Days'}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {collectionsChartData.every((d) => !d.collections) ? (
              <div className="h-64 w-full flex flex-col items-center justify-center text-center gap-1">
                <p className="text-sm font-bold text-slate-500">No collections in the last 7 days</p>
                <p className="text-xs text-slate-400 font-medium">Scheme installment payments will appear here as they are recorded.</p>
              </div>
            ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={collectionsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2C6FBD" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#2C6FBD" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `₹${v/1000}k`} />
                  <Tooltip
                    formatter={(val: number) => [formatCurrency(val), 'Amount']}
                    contentStyle={{ backgroundColor: '#0B0E23', border: '1px solid rgba(44,111,189,0.3)', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="collections" stroke="#2C6FBD" strokeWidth={3} fillOpacity={1} fill="url(#colGrad)" name="Collections" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            )}

            {/* Summary Note Beneath Chart */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium mt-2">
              <span>Total Collections This Week: <strong className="text-[#0B0E23]">{formatCurrency(paymentWeek?.totalRevenue ?? 0)}</strong></span>
              {paymentWeek?.totalRevenueGrowthPercent !== null && paymentWeek?.totalRevenueGrowthPercent !== undefined ? (
                <span className={`font-bold ${paymentWeek.totalRevenueGrowthPercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {paymentWeek.totalRevenueGrowthPercent >= 0 ? '+' : ''}{paymentWeek.totalRevenueGrowthPercent.toFixed(1)}% vs previous 7 days
                </span>
              ) : (
                <span className="text-slate-400">No prior-period comparison available</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Scheme Distribution Donut Chart (1 Col) */}
        <Card className="p-5 border-slate-200 bg-white shadow-xs">
          <CardHeader className="p-0 mb-4">
            <CardTitle className="text-base font-bold text-[#0B0E23]">
              Active Scheme Distribution
            </CardTitle>
            <p className="text-xs text-slate-500 font-medium">Breakdown of customer enrolments</p>
          </CardHeader>
          <CardContent className="p-0">
            {schemeDistribution.length === 0 ? (
              <div className="h-44 w-full flex items-center justify-center text-xs text-slate-400 font-medium">
                No active scheme enrollments yet
              </div>
            ) : (
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={schemeDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {schemeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number) => [`${val} Members`, 'Enroled']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="space-y-2 pt-3 border-t border-slate-100">
              {schemeDistribution.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-700">{item.name}</span>
                  </div>
                  <span className="font-mono font-bold text-[#0B0E23]">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 7. LIVE STORE ACTIVITY & RECENT TRANSACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent Sales (1 Col) — real Billing sales, replaces the old
            enrollments/payments activity mirror which just repeated the
            Recent Payments table beside it. */}
        <Card className="p-5 border-slate-200 bg-white shadow-xs">
          <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold text-[#0B0E23]">
              Recent Sales
            </CardTitle>
            <Receipt className="w-4 h-4 text-slate-400" />
          </CardHeader>
          <CardContent className="p-0">
            {!billingSummary || billingSummary.recentSales.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium py-4 text-center">No sales yet</p>
            ) : (
              <div className="space-y-3.5">
                {billingSummary.recentSales.map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#0B0E23] truncate">{s.productName}</div>
                      <div className="text-[11px] text-slate-500 font-medium">{s.customerName || 'Walk-in'} · {s.invoiceNumber}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-[#0B0E23]">{formatCurrency(s.finalAmount)}</div>
                      {s.profitOrLoss !== null && (
                        <div className={`text-[10px] font-bold ${s.profitOrLoss >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {s.profitOrLoss >= 0 ? '🟢' : '🔴'} {formatCurrency(Math.abs(s.profitOrLoss))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Payments Table (2 Cols) */}
        <Card className="lg:col-span-2 p-5 border-slate-200 bg-white shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <CardTitle className="text-base font-bold text-[#0B0E23]">
                  Recent Scheme Passbook Collections
                </CardTitle>
                <p className="text-xs text-slate-500 font-medium">Latest recorded payments across all methods</p>
              </div>
              <Button onClick={() => router.push('/admin/payments')} variant="outline" size="sm" className="text-xs font-bold">
                View All Ledger <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>

            {payments.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium py-6 text-center">No payments recorded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Ref ID</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Source</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {payments.slice(0, 8).map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-[#0B0E23]">{p.paymentReference}</td>
                        <td className="p-3 text-slate-600">{new Date(p.paymentDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                        <td className="p-3 text-slate-600">{p.paymentMethod.replace('_', ' ')}</td>
                        <td className="p-3">
                          <Badge variant={COUNTER_METHODS.includes(p.paymentMethod) ? 'warn' : 'gold'} className="text-[10px]">
                            {COUNTER_METHODS.includes(p.paymentMethod) ? 'Counter Cash' : 'Online App'}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-[#0B0E23]">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant={PAYMENT_STATUS_BADGE[p.paymentStatus]} className="text-[10px]">{p.paymentStatus}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

      </div>
        </>
      )}

      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}

/**
 * Real Billing data only — no fake numbers, no mock records. If the Admin
 * simply has no billing access (Staff without the "billing" module) the
 * fetch 403s and `summary` stays null; that's shown as nothing rather than
 * an error, since it's expected, not a failure.
 */
const HISTORY_PERIOD_OPTIONS: { value: BusinessHistoryPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'last_12_months', label: 'Last 12 Months' },
];

function BillingSummarySection({
  loading, summary, historyPeriod, onHistoryPeriodChange,
}: {
  loading: boolean;
  summary: BillingDashboardSummary | null;
  historyPeriod: BusinessHistoryPeriod;
  onHistoryPeriodChange: (p: BusinessHistoryPeriod) => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }
  if (!summary) return null;

  const { today, thisMonth, todayGoldRate24k, recentSales, selectedPeriod, selectedPeriodLabel } = summary;
  const hasToday = today.billCount > 0;

  // Every figure is backend-authoritative (Phase F/G). Sales is what was sold;
  // Cash is money actually collected; Scheme is credit settlement (never cash);
  // Outstanding is still receivable. Kept as distinct cards on purpose.
  const cards = [
    { label: "Today's Sales", val: formatCurrency(today.totalSales), icon: Receipt, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { label: 'Cash Collected', val: formatCurrency(today.cashCollected), icon: CreditCard, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { label: 'Scheme Redemption', val: formatCurrency(today.schemeRedemption), icon: Gem, color: 'text-violet-600 bg-violet-50 border-violet-200' },
    { label: 'Outstanding', val: formatCurrency(today.totalOutstanding), icon: Wallet, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { label: 'Refunds Paid', val: formatCurrency(today.refundsPaid), icon: TrendingUp, color: 'text-red-600 bg-red-50 border-red-200' },
    { label: "Today's Gold Rate", val: todayGoldRate24k !== null ? `${formatCurrency(todayGoldRate24k)}/g` : 'Not set', icon: Gem, color: 'text-gold bg-gold/10 border-gold/30' },
  ];

  // Payment-status counts + historical-cost profit, backend-derived.
  const statusChips = [
    { label: 'Paid', count: today.paidCount, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { label: 'Partial', count: today.partialCount, color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { label: 'Pending', count: today.pendingCount, color: 'text-slate-700 bg-slate-50 border-slate-200' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-base text-[#0B0E23]">Today&apos;s Business</h2>
        {!hasToday && <p className="text-xs text-slate-400 font-medium mt-0.5">No sales today.</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c, idx) => {
          const IconComp = c.icon;
          return (
            <div key={idx} className={`p-3.5 rounded-2xl border ${c.color} flex flex-col justify-between space-y-2`}>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
                <span className="truncate">{c.label}</span>
                <IconComp className="w-3.5 h-3.5 shrink-0" />
              </div>
              <div className="text-base font-extrabold text-[#0B0E23] font-display">{c.val}</div>
            </div>
          );
        })}
      </div>

      {/* Payment-status counts + historical-cost profit. Current gold-value
        * profit is NOT shown at period level: the backend has no aggregate for
        * it (Phase A is per-line only), so it is not invented here. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs sm:col-span-2">
          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-2">Today&apos;s Bills by Payment Status</p>
          <div className="flex flex-wrap gap-2">
            {statusChips.map((c) => (
              <div key={c.label} className={`px-3 py-1.5 rounded-xl border ${c.color} flex items-center gap-2`}>
                <span className="text-[11px] font-bold uppercase">{c.label}</span>
                <span className="text-sm font-extrabold font-mono">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Historical Cost Profit</p>
          <p className="text-base font-extrabold font-display mt-1">
            {today.totalProfit !== null && today.totalProfit > 0
              ? <span className="text-emerald-600">{formatCurrency(today.totalProfit)}</span>
              : today.totalLoss !== null && today.totalLoss > 0
                ? <span className="text-red-600">-{formatCurrency(today.totalLoss)}</span>
                : <span className="text-slate-400">—</span>}
          </p>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">vs vendor acquisition cost</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Returns Today</p>
          <p className="text-base font-extrabold font-display mt-1 text-[#0B0E23]">
            {formatCurrency(today.salesReturns)}
            <span className="text-[11px] font-semibold text-slate-500 ml-1">({today.returnCount})</span>
          </p>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">refunds {formatCurrency(today.refundsPaid)}</p>
        </div>
      </div>

      {thisMonth.billCount > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">This Month</span>
          <span className="font-mono font-bold text-[#0B0E23]">Sales {formatCurrency(thisMonth.totalSales)}</span>
          <span className="font-mono font-bold text-emerald-600">Cash {formatCurrency(thisMonth.cashCollected)}</span>
          <span className="font-mono font-bold text-violet-600">Scheme {formatCurrency(thisMonth.schemeRedemption)}</span>
          <span className="font-mono font-bold text-amber-600">Outstanding {formatCurrency(thisMonth.totalOutstanding)}</span>
          {thisMonth.totalProfit !== null && <span className="font-mono font-bold text-emerald-600">🟢 Profit {formatCurrency(thisMonth.totalProfit)}</span>}
          {thisMonth.totalLoss !== null && thisMonth.totalLoss > 0 && <span className="font-mono font-bold text-red-600">🔴 Loss {formatCurrency(thisMonth.totalLoss)}</span>}
          <span className="font-mono font-bold text-slate-600">{thisMonth.itemsSold} items sold</span>
          <span className="font-mono font-bold text-slate-600">{thisMonth.billCount} bills</span>
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Business History — {selectedPeriodLabel}</span>
          <select
            value={historyPeriod}
            onChange={(e) => onHistoryPeriodChange(e.target.value as BusinessHistoryPeriod)}
            className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-white"
          >
            {HISTORY_PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {selectedPeriod.billCount === 0 ? (
          <p className="text-xs text-slate-400 font-medium">No sales in this period.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <span className="font-mono font-bold text-[#0B0E23]">Sales {formatCurrency(selectedPeriod.totalSales)}</span>
            <span className="font-mono font-bold text-emerald-600">Cash {formatCurrency(selectedPeriod.cashCollected)}</span>
            <span className="font-mono font-bold text-violet-600">Scheme {formatCurrency(selectedPeriod.schemeRedemption)}</span>
            <span className="font-mono font-bold text-amber-600">Outstanding {formatCurrency(selectedPeriod.totalOutstanding)}</span>
            {selectedPeriod.salesReturns > 0 && <span className="font-mono font-bold text-red-600">Returns {formatCurrency(selectedPeriod.salesReturns)} ({selectedPeriod.returnCount})</span>}
            {selectedPeriod.totalProfit !== null && <span className="font-mono font-bold text-emerald-600">🟢 Profit {formatCurrency(selectedPeriod.totalProfit)}</span>}
            {selectedPeriod.totalLoss !== null && selectedPeriod.totalLoss > 0 && <span className="font-mono font-bold text-red-600">🔴 Loss {formatCurrency(selectedPeriod.totalLoss)}</span>}
            <span className="font-mono font-bold text-slate-600">{selectedPeriod.billCount} bills</span>
            <span className="font-mono font-bold text-slate-600">{selectedPeriod.itemsSold} items sold</span>
            <span className="font-mono font-bold text-slate-600">Tax {formatCurrency(selectedPeriod.totalTax)}</span>
            <span className="font-mono font-bold text-slate-600">Avg Bill {formatCurrency(selectedPeriod.avgBillValue)}</span>
          </div>
        )}
      </div>

      {recentSales.length === 0 && hasToday === false && thisMonth.billCount === 0 && (
        <p className="text-xs text-slate-400 font-medium text-center py-2">No sales recorded yet.</p>
      )}
    </div>
  );
}

function OperationalCards() {
  const router = useRouter();
  const [cards, setCards] = useState<DashboardCards | null>(null);
  useEffect(() => {
    dashboardCardsService.getDashboardCards().then(setCards).catch(() => setCards(null));
  }, []);
  if (!cards) return null;
  const items = [
    { label: 'Overdue', value: cards.overdue_enrollments, href: '/admin/enrollments' },
    { label: 'Pending KYC', value: cards.pending_kyc, href: '/admin/kyc' },
    { label: 'Pending Inspection', value: cards.pending_inspection, href: '/admin/billing/inventory' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {items.map((it) => (
        <button
          key={it.label}
          onClick={() => router.push(it.href)}
          className="text-left bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-gold/50 transition-colors"
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{it.label}</div>
          <div className={'text-2xl font-extrabold font-display mt-0.5 ' + (it.value > 0 ? 'text-red-600' : 'text-[#0B0E23]')}>
            {it.value}
          </div>
        </button>
      ))}
    </div>
  );
}
