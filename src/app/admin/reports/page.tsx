"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import {
  FileSpreadsheet,
  FileText,
  Download,
  TrendingUp,
  Coins,
  Users,
  CreditCard,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';
import {
  reportService,
  PaymentSummary,
  TopCustomersReport,
  EnrollmentSummary,
  ReportRangeParams,
  TopProductMetric,
  TopProductsResult,
} from '@/services/reportService';
import { billingService } from '@/services/billingService';
import { ApiError } from '@/lib/apiClient';
import { triggerExportDownload } from '@/lib/exportDownload';

/** Single source of truth for the page-wide period selector. Every panel
 * below is driven by this one value — no panel keeps its own window.
 * `last_month` and `custom` aren't backend ReportPeriod values, so they're
 * translated into an explicit dateFrom/dateTo range instead. */
type PeriodKey = 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Returns null when a custom range is selected but not yet fully filled in,
 * signalling callers to hold off on fetching. */
function buildRangeParams(
  period: PeriodKey,
  customFrom: string,
  customTo: string,
): ReportRangeParams | null {
  if (period === 'last_month') {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { dateFrom: toIsoDate(first), dateTo: toIsoDate(last) };
  }
  if (period === 'custom') {
    if (!customFrom || !customTo) return null;
    return { dateFrom: customFrom, dateTo: customTo };
  }
  return { period };
}

const ENROLLMENT_STATUS_BADGE: Record<string, 'success' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
};

/** Growth-percent pill. `invert` flips the good/bad color (e.g. a drop in
 * outstanding dues is a good thing, unlike a drop in revenue). Renders a
 * neutral dash when the backend couldn't compute a comparison (e.g. the
 * previous period had zero base, or no comparison exists for this metric). */
function GrowthBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) {
    return (
      <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
        —
      </span>
    );
  }
  const isGood = invert ? value <= 0 : value >= 0;
  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
        isGood
          ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
          : 'text-red-600 bg-red-50 border-red-200'
      }`}
    >
      {value > 0 ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
}

export default function AdminReportsPage() {
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [topCustomers, setTopCustomers] = useState<TopCustomersReport | null>(null);
  const [enrollmentSummary, setEnrollmentSummary] = useState<EnrollmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [period, setPeriod] = useState<PeriodKey>('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const rangeParams = buildRangeParams(period, customFrom, customTo);

  const loadReports = async () => {
    // Custom range not fully specified yet — keep the last view on screen.
    if (!rangeParams) return;
    setLoading(true);
    setLoadError('');
    try {
      const [payments, customers, enrollments] = await Promise.all([
        reportService.getPaymentSummary(rangeParams),
        reportService.getTopCustomers({ ...rangeParams, limit: 10 }),
        reportService.getEnrollmentSummary(rangeParams),
      ]);
      setPaymentSummary(payments);
      setTopCustomers(customers);
      setEnrollmentSummary(enrollments);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  const handleExportExcel = async () => {
    if (!rangeParams) {
      setToastMsg('Pick both custom range dates before exporting.');
      return;
    }
    setToastMsg("Exporting ledger data to Excel...");
    try {
      const file = await reportService.exportReportsSummary({ ...rangeParams, format: 'excel' });
      triggerExportDownload(file);
      setToastMsg(`${file.filename} downloaded`);
    } catch (err) {
      setToastMsg(err instanceof ApiError ? err.message : 'Export failed. Please try again.');
    }
  };

  // There is only one revenue stream in this system (scheme payments), so
  // "Total Revenue" IS the scheme-collections figure — a second card for it
  // would just repeat the same number (see PaymentSummaryResponse).
  const kpis = paymentSummary
    ? [
        {
          label: 'Total Revenue',
          val: formatCurrency(paymentSummary.totalRevenue),
          growth: paymentSummary.totalRevenueGrowthPercent,
          invert: false,
          icon: TrendingUp,
          color: 'text-amber-600 bg-amber-50',
        },
        {
          label: 'New Enrollments',
          val: String(enrollmentSummary?.newEnrollmentsInRange ?? 0),
          growth: null as number | null,
          invert: false,
          icon: Coins,
          color: 'text-teal-600 bg-teal-50',
        },
        {
          label: 'Outstanding Dues',
          val: formatCurrency(paymentSummary.outstandingDues),
          growth: paymentSummary.outstandingDuesGrowthPercent,
          invert: true,
          icon: CreditCard,
          color: 'text-emerald-600 bg-emerald-50',
        },
        {
          label: 'Total Active Passbooks',
          val: String(enrollmentSummary?.activeCount ?? 0),
          // No period-over-period comparison is computable for a live status
          // count without a status-change history table — see handoff notes.
          growth: null as number | null,
          invert: false,
          icon: Users,
          color: 'text-blue-600 bg-blue-50',
        },
      ]
    : [];

  const monthlyChartData =
    paymentSummary?.monthlyTrend.map((t) => ({
      month: t.label,
      revenue: t.totalAmount,
    })) ?? [];

  const enrollmentChartData =
    enrollmentSummary?.dailyTrend.map((t) => ({
      label: t.label,
      newEnrollments: t.newEnrollments,
    })) ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Reports & Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Revenue, collections, enrollment analytics and top-customer reporting — all for the selected period.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleExportExcel} variant="outline" size="sm" className="h-9">
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" /> Excel
          </Button>
          <Button
            disabled
            size="sm"
            title="PDF export isn't available yet — use Excel export instead"
            className="bg-gold hover:bg-gold-dark text-white font-bold h-9"
          >
            <FileText className="w-4 h-4 mr-1.5" /> Export PDF (Soon)
          </Button>
        </div>
      </div>

      {/* PERIOD SELECTOR — single state driving every panel on this page */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Period</span>
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setPeriod(opt.key)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
              period === opt.key
                ? 'bg-[#0B0E23] text-white border-[#0B0E23]'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}

        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="text-xs font-medium border border-slate-200 rounded-lg px-2 py-1.5"
              aria-label="Custom range start date"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="text-xs font-medium border border-slate-200 rounded-lg px-2 py-1.5"
              aria-label="Custom range end date"
            />
          </div>
        )}

        {paymentSummary && (
          <Badge variant="gold" className="ml-auto">{paymentSummary.range.label}</Badge>
        )}
      </div>

      {period === 'custom' && !rangeParams && (
        <Card className="p-4 border-amber-200 bg-amber-50/60">
          <p className="text-xs font-medium text-amber-800">
            Choose both a start and end date to load the custom-range report.
          </p>
        </Card>
      )}

      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadReports}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && (
        <>
          {/* SUMMARY STATS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((st, idx) => {
              const IconComp = st.icon;
              return (
                <Card key={idx} variant="statistic" className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`p-2 rounded-xl ${st.color}`}>
                      <IconComp className="w-4 h-4" />
                    </div>
                    <GrowthBadge value={st.growth} invert={st.invert} />
                  </div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{st.label}</div>
                  <div className="text-xl font-extrabold text-[#0B0E23] font-display mt-0.5">{st.val}</div>
                </Card>
              );
            })}
          </div>

          {/* RECHARTS COMPARISON CHART */}
          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-[#0B0E23]">
                  Revenue & Scheme Collections Trend
                </CardTitle>
                <p className="text-xs text-slate-500 font-medium">Performance across the selected period</p>
              </div>
              <Badge variant="gold">{paymentSummary?.range.label ?? '—'}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `₹${v/100000}L`} />
                    <Tooltip formatter={(val: number) => [formatCurrency(val), 'Amount']} contentStyle={{ backgroundColor: '#0B0E23', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                    <Bar dataKey="revenue" fill="#0B0E23" radius={[6, 6, 0, 0]} name="Scheme Collections" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ENROLLMENT ANALYTICS (folded in from the former Analytics page) */}
          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-[#0B0E23]">Enrollment Analytics</CardTitle>
                <p className="text-xs text-slate-500 font-medium">
                  New enrollments over time, with status mix for the selected period
                </p>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Retention</div>
                  <div className="text-sm font-extrabold text-[#0B0E23] font-display">
                    {enrollmentSummary?.retentionRatePercent !== null &&
                    enrollmentSummary?.retentionRatePercent !== undefined
                      ? `${enrollmentSummary.retentionRatePercent.toFixed(1)}%`
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Completed</div>
                  <div className="text-sm font-extrabold text-[#0B0E23] font-display">
                    {enrollmentSummary?.completedCount ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cancelled</div>
                  <div className="text-sm font-extrabold text-[#0B0E23] font-display">
                    {enrollmentSummary?.cancelledCount ?? 0}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={enrollmentChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip
                      formatter={(val: number) => [String(val), 'New Enrollments']}
                      contentStyle={{ backgroundColor: '#0B0E23', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    />
                    <Bar dataKey="newEnrollments" fill="#2C6FBD" radius={[6, 6, 0, 0]} name="New Enrollments" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* TOP CUSTOMERS REPORT TABLE */}
          <Card className="p-5 bg-white border-slate-200 shadow-xs">
            <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-[#0B0E23]">
                  Top High-Value Scheme Customers
                </CardTitle>
                <p className="text-xs text-slate-500 font-medium">Highest total gold accumulated and installment consistency</p>
              </div>
              <Button onClick={handleExportExcel} variant="outline" size="sm" className="text-xs font-bold">
                <Download className="w-3.5 h-3.5 mr-1" /> Export Table
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="p-3">Rank</th>
                      <th className="p-3">Customer Name</th>
                      <th className="p-3">Primary Scheme</th>
                      <th className="p-3 text-right">Total Invested</th>
                      <th className="p-3 text-right">Accumulated Gold</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {(topCustomers?.customers ?? []).map((row, idx) => (
                      <tr key={row.enrollmentId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-gold-dark">#{idx + 1}</td>
                        <td className="p-3 font-bold text-[#0B0E23]">{row.customerName}</td>
                        <td className="p-3">{row.schemeName}</td>
                        <td className="p-3 text-right font-mono font-bold text-[#0B0E23]">
                          {formatCurrency(row.totalInvested)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-amber-700">
                          {row.goldWeightGrams.toFixed(3)} g
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant={ENROLLMENT_STATUS_BADGE[row.enrollmentStatus] ?? 'neutral'} className="text-[10px]">
                            {row.enrollmentStatus}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {(topCustomers?.customers.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400">
                          No successful payments recorded in this period yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <TopProductsCard />

      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}

const TP_METRICS: { key: TopProductMetric; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'weight', label: 'Gold Weight' },
  { key: 'profit', label: 'Profit' },
];

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function TopProductsCard() {
  const [metric, setMetric] = useState<TopProductMetric>('revenue');
  const [dateFrom, setDateFrom] = useState(todayIso(-30));
  const [dateTo, setDateTo] = useState(todayIso(0));
  const [result, setResult] = useState<TopProductsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      setResult(await reportService.getTopProducts({ dateFrom, dateTo, metric, limit: 10 }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not load top products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric]);

  const runCaExport = async () => {
    setExporting(true);
    setErr('');
    try {
      await billingService.downloadCaExport({ dateFrom, dateTo });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not export.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="bg-white border-slate-200 shadow-xs">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <CardTitle>Top Products</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1" />
          <Button size="sm" variant="outline" onClick={load} isLoading={loading}>Apply</Button>
          <Button size="sm" variant="outline" onClick={runCaExport} isLoading={exporting}>
            <Download className="w-3.5 h-3.5 mr-1" /> CA Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {TP_METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={'px-3 py-1 rounded-lg text-xs font-bold transition-colors ' +
                (metric === m.key ? 'bg-[#0B0E23] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
              {m.label}
            </button>
          ))}
        </div>
        {err && <p className="text-xs font-medium text-red-700">{err}</p>}
        {loading && <Skeleton className="h-40 w-full" />}
        {!loading && result && result.items.length === 0 && (
          <p className="text-xs text-slate-400">No sales in this period.</p>
        )}
        {!loading && result && result.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="p-3">Product</th>
                  <th className="p-3 text-right">Units</th>
                  <th className="p-3 text-right">Revenue</th>
                  <th className="p-3 text-right">Gold Wt (g)</th>
                  {result.profit_visible && <th className="p-3 text-right">Profit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {result.items.map((it) => (
                  <tr key={it.product_code} className="hover:bg-slate-50/80">
                    <td className="p-3 font-bold text-[#0B0E23]">{it.product_name}
                      <span className="block text-[10px] text-slate-400 font-mono">{it.product_code}</span></td>
                    <td className="p-3 text-right font-mono">{it.units}</td>
                    <td className="p-3 text-right font-mono">₹{it.revenue.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">{it.gold_weight_grams}</td>
                    {result.profit_visible && (
                      <td className="p-3 text-right font-mono">{it.profit != null ? `₹${it.profit.toLocaleString()}` : '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
