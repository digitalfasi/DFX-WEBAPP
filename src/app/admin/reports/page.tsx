"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import {
  FileSpreadsheet,
  TrendingUp,
  Coins,
  Users,
  CreditCard,
  Layers,
  ShoppingBag,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  Target,
  ClipboardList,
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
  ReportRangeParams,
  SalesTrend,
  SalesByCategory,
  TopCustomersBySalesReport,
  InsightsResult,
  InsightItem,
  PaymentSummary,
  EnrollmentSummary,
  TopCustomersReport,
  SchemeSummaryReport,
  TopProductMetric,
  TopProductsResult,
  AiAnalysis,
  AiPriority,
} from '@/services/reportService';
import { billingService } from '@/services/billingService';
import { ApiError } from '@/lib/apiClient';
import { triggerExportDownload } from '@/lib/exportDownload';

/* ================================================================== */
/* Shared period + domain primitives                                   */
/* ================================================================== */

type Domain = 'business' | 'scheme';

/** `last_month` and `custom` aren't backend ReportPeriod values, so they're
 *  translated into an explicit dateFrom/dateTo range instead. */
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

/** Range for endpoints that accept `period` — presets stay server-resolved
 *  (IST-correct); last_month/custom become an explicit range. Returns null
 *  when a custom range isn't fully filled in yet. */
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

/** Explicit dates for endpoints that ONLY accept date_from/date_to
 *  (top-products). Presets resolved client-side. Null when custom incomplete. */
function resolveExplicitRange(
  period: PeriodKey,
  customFrom: string,
  customTo: string,
): { dateFrom: string; dateTo: string } | null {
  const now = new Date();
  const today = toIsoDate(now);
  switch (period) {
    case 'today':
      return { dateFrom: today, dateTo: today };
    case 'this_week': {
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      return { dateFrom: toIsoDate(from), dateTo: today };
    }
    case 'this_month':
      return { dateFrom: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: today };
    case 'last_month':
      return {
        dateFrom: toIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        dateTo: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'this_year':
      return { dateFrom: toIsoDate(new Date(now.getFullYear(), 0, 1)), dateTo: today };
    case 'custom':
      return customFrom && customTo ? { dateFrom: customFrom, dateTo: customTo } : null;
  }
}

const formatGrams = (g: number) => `${g.toFixed(3)} g`;
const formatCount = (n: number) => n.toLocaleString('en-IN');

/* ================================================================== */
/* Small shared UI pieces                                              */
/* ================================================================== */

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  growth = null,
  invert = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  growth?: number | null;
  invert?: boolean;
}) {
  return (
    <Card variant="statistic" className="p-4 flex flex-col justify-between min-h-[104px]">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-xl ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        {growth !== null && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
              (invert ? growth <= 0 : growth >= 0)
                ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                : 'text-red-600 bg-red-50 border-red-200'
            }`}
          >
            {growth > 0 ? '+' : ''}
            {growth.toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
        <div className="text-xl font-extrabold text-[#0B0E23] font-display mt-0.5 truncate">{value}</div>
      </div>
    </Card>
  );
}

/** Wraps a chart/panel body with consistent loading / error / empty states. */
function Panel({
  title,
  subtitle,
  badge,
  children,
  loading,
  error,
  empty,
  emptyMsg = 'No data available for this period.',
  onRetry,
  action,
  bodyClass = '',
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  loading?: boolean;
  error?: string;
  empty?: boolean;
  emptyMsg?: string;
  onRetry?: () => void;
  action?: React.ReactNode;
  bodyClass?: string;
}) {
  return (
    <Card className="p-5 bg-white border-slate-200 shadow-xs">
      <CardHeader className="p-0 mb-4 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base font-bold text-[#0B0E23]">{title}</CardTitle>
          {subtitle && <p className="text-xs text-slate-500 font-medium mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          {badge}
        </div>
      </CardHeader>
      <CardContent className={`p-0 ${bodyClass}`}>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : error ? (
          <div className="flex flex-col items-start gap-3 py-6">
            <p className="text-xs font-medium text-red-700">{error}</p>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                Retry
              </Button>
            )}
          </div>
        ) : empty ? (
          <div className="flex items-center justify-center h-40 text-xs font-medium text-slate-400">
            {emptyMsg}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

const SEVERITY_STYLE: Record<InsightItem['severity'], string> = {
  positive: 'border-emerald-200 bg-emerald-50/60',
  warning: 'border-amber-200 bg-amber-50/60',
  info: 'border-slate-200 bg-slate-50/60',
};
const SEVERITY_DOT: Record<InsightItem['severity'], string> = {
  positive: 'bg-emerald-500',
  warning: 'bg-amber-500',
  info: 'bg-[#2C6FBD]',
};

function InsightsPanel({
  title,
  data,
  loading,
  error,
  onRetry,
}: {
  title: string;
  data: InsightsResult | null;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const empty = !!data && (!data.dataAvailable || data.insights.length === 0);
  return (
    <Panel
      title={title}
      subtitle="Data-grounded observations from your records for this period"
      loading={loading}
      error={error}
      empty={empty}
      emptyMsg={data?.note ?? 'No insights available for this period yet.'}
      onRetry={onRetry}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data?.insights.map((ins) => (
          <div key={ins.id} className={`rounded-xl border p-3.5 ${SEVERITY_STYLE[ins.severity]}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[ins.severity]}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {ins.category}
              </span>
            </div>
            <div className="text-sm font-bold text-[#0B0E23]">{ins.title}</div>
            <p className="text-xs text-slate-600 font-medium mt-0.5 leading-relaxed">{ins.detail}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const chartTooltipStyle = {
  backgroundColor: '#0B0E23',
  borderRadius: '12px',
  color: '#fff',
  fontSize: '12px',
  border: 'none',
};

/* ================================================================== */
/* AI Analyst panel — explicit "Analyze with AI", never auto-runs      */
/* ================================================================== */

const PRIORITY_STYLE: Record<AiPriority, { box: string; badge: string; label: string }> = {
  HIGH: { box: 'border-red-200 bg-red-50/60', badge: 'bg-red-600 text-white', label: 'HIGH PRIORITY' },
  MEDIUM: { box: 'border-amber-200 bg-amber-50/60', badge: 'bg-amber-500 text-white', label: 'MEDIUM PRIORITY' },
  LOW: { box: 'border-slate-200 bg-slate-50/70', badge: 'bg-slate-400 text-white', label: 'LOW PRIORITY' },
};
const PRIORITY_RANK: Record<AiPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function AiList({ title, icon: Icon, items, tone }: { title: string; icon: React.ComponentType<{ className?: string }>; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-4 h-4 ${tone}`} />
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-xs text-slate-700 font-medium leading-relaxed">
            <span className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${tone.replace('text-', 'bg-')}`} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiAnalystPanel({
  domain,
  rangeParams,
  title,
}: {
  domain: 'BUSINESS' | 'SCHEME';
  rangeParams: ReportRangeParams;
  title: string;
}) {
  const [data, setData] = useState<AiAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const key = JSON.stringify(rangeParams);

  // Period changed → previous analysis is stale; clear it (never auto-refetch).
  useEffect(() => {
    setData(null);
    setError('');
  }, [key]);

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      setData(
        await reportService.analyzeWithAi({
          domain,
          period: rangeParams.period,
          dateFrom: rangeParams.dateFrom,
          dateTo: rangeParams.dateTo,
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'AI analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const actions = [...(data?.recommendedActions ?? [])].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );

  return (
    <Card className="bg-white border-slate-200 shadow-xs overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-slate-100 bg-gradient-to-r from-[#2C6FBD]/[0.06] to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#2C6FBD] text-white shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-base font-bold text-[#0B0E23]">{title}</div>
            <p className="text-xs text-slate-500 font-medium">
              Automatic insights from your real report figures for this period.
            </p>
          </div>
        </div>
        <Button onClick={run} size="sm" isLoading={loading} className="bg-[#2C6FBD] hover:bg-[#255ea3] text-white font-bold h-9 shrink-0">
          <Sparkles className="w-4 h-4 mr-1.5" />
          {data || error ? 'Refresh' : 'Generate Insights'}
        </Button>
      </div>

      <div className="p-5">
        {loading && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-400">Analyzing your {domain === 'BUSINESS' ? 'business' : 'scheme'} data…</p>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-xs font-medium text-red-700">{error}</p>
            <Button size="sm" variant="outline" onClick={run}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && !data && (
          <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <Sparkles className="w-5 h-5 text-[#2C6FBD]" />
            </div>
            <p className="text-sm font-bold text-[#0B0E23]">Get an insight read on this period</p>
            <p className="text-xs text-slate-500 font-medium max-w-md">
              Summarises the metrics above into prioritised, data-backed findings and recommendations. Click “Generate Insights”.
            </p>
          </div>
        )}

        {!loading && !error && data && !data.available && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-xs font-medium text-amber-800">{data.note ?? 'AI analysis is unavailable.'}</p>
          </div>
        )}

        {!loading && !error && data && data.available && (
          <div className="space-y-5">
            {data.executiveSummary && (
              <div className="rounded-xl border border-[#2C6FBD]/20 bg-[#2C6FBD]/[0.04] p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#2C6FBD] mb-1">Executive Summary</div>
                <p className="text-sm text-[#0B0E23] font-medium leading-relaxed">{data.executiveSummary}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <AiList title="Key Findings" icon={ClipboardList} items={data.keyFindings} tone="text-[#2C6FBD]" />
              <AiList title="Opportunities" icon={Lightbulb} items={data.opportunities} tone="text-emerald-600" />
              <AiList title="Risks" icon={AlertTriangle} items={data.risks} tone="text-red-600" />
            </div>

            {actions.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Target className="w-4 h-4 text-[#0B0E23]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Recommended Actions</span>
                </div>
                <div className="space-y-2.5">
                  {actions.map((a, i) => {
                    const st = PRIORITY_STYLE[a.priority];
                    return (
                      <div key={i} className={`rounded-xl border p-3.5 ${st.box}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md tracking-wider ${st.badge}`}>{st.label}</span>
                          {a.metric && <span className="text-[10px] font-mono font-bold text-slate-500">{a.metric}</span>}
                        </div>
                        <div className="text-sm font-bold text-[#0B0E23]">{a.title}</div>
                        {a.explanation && <p className="text-xs text-slate-600 font-medium mt-0.5 leading-relaxed">{a.explanation}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 text-[10px] font-medium text-slate-400 border-t border-slate-100">
              <span>{data.model ? `Analyzed by ${data.model}` : 'AI analysis'}</span>
              <span>{data.range.label}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ================================================================== */
/* BUSINESS ANALYTICS                                                  */
/* ================================================================== */

const TP_METRICS: { key: TopProductMetric; label: string }[] = [
  { key: 'quantity', label: 'Units Sold' },
  { key: 'weight', label: 'Gold Weight' },
  { key: 'revenue', label: 'Revenue' },
];

function BusinessAnalytics({
  rangeParams,
  explicitRange,
  periodLabel,
}: {
  rangeParams: ReportRangeParams;
  explicitRange: { dateFrom: string; dateTo: string } | null;
  periodLabel: string;
}) {
  const [salesTrend, setSalesTrend] = useState<SalesTrend | null>(null);
  const [category, setCategory] = useState<SalesByCategory | null>(null);
  const [topCust, setTopCust] = useState<TopCustomersBySalesReport | null>(null);
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const key = JSON.stringify(rangeParams);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [st, cat, tc, ins] = await Promise.all([
        reportService.getSalesTrend(rangeParams),
        reportService.getSalesByCategory(rangeParams),
        reportService.getTopCustomersBusiness({ ...rangeParams, limit: 10 }),
        reportService.getBusinessInsights(rangeParams),
      ]);
      setSalesTrend(st);
      setCategory(cat);
      setTopCust(tc);
      setInsights(ins);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load business analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const totals = useMemo(() => {
    const t = salesTrend?.trend ?? [];
    return {
      revenue: t.reduce((s, p) => s + p.totalAmount, 0),
      profit: t.reduce((s, p) => s + p.profit, 0),
      gold: t.reduce((s, p) => s + p.goldWeightGrams, 0),
      count: t.reduce((s, p) => s + p.saleCount, 0),
      hasProfit: t.some((p) => p.profit > 0),
    };
  }, [salesTrend]);

  const trendData = (salesTrend?.trend ?? []).map((p) => ({ label: p.label, revenue: p.totalAmount }));

  if (loading) return <DomainSkeleton />;
  if (error)
    return (
      <Card className="p-4 border-red-200 bg-red-50/60">
        <p className="text-xs font-medium text-red-700">{error}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={load}>
          Retry
        </Button>
      </Card>
    );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Sales Revenue" value={formatCurrency(totals.revenue)} icon={TrendingUp} color="text-amber-600 bg-amber-50" />
        <KpiCard
          label="Profit"
          value={totals.hasProfit ? formatCurrency(totals.profit) : '—'}
          icon={CreditCard}
          color="text-emerald-600 bg-emerald-50"
        />
        <KpiCard label="Gold Sold" value={formatGrams(totals.gold)} icon={Coins} color="text-yellow-600 bg-yellow-50" />
        <KpiCard label="Sales / Bills" value={formatCount(totals.count)} icon={ShoppingBag} color="text-blue-600 bg-blue-50" />
      </div>

      {/* Primary trend */}
      <Panel
        title="Sales Revenue Trend"
        subtitle="Completed-sale revenue (₹) across the selected period"
        badge={<Badge variant="gold">{periodLabel}</Badge>}
        empty={trendData.length < 2}
        emptyMsg={trendData.length === 1 ? 'Only one data point in this range — widen the period to see a trend.' : 'No sales recorded in this period.'}
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
              <Tooltip formatter={(val: number) => [formatCurrency(val), 'Revenue']} contentStyle={chartTooltipStyle} />
              <Bar dataKey="revenue" fill="#0B0E23" radius={[6, 6, 0, 0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* Secondary: category */}
      <Panel
        title="Sales by Category"
        subtitle="Share of completed-sale value by product category"
        empty={(category?.categories.length ?? 0) === 0}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5">
          {(category?.categories ?? []).map((c) => (
            <div key={c.category}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-[#0B0E23] capitalize">{c.category || 'Uncategorised'}</span>
                <span className="font-mono font-bold text-slate-600">
                  {formatCurrency(c.totalSales)} · {c.percentage.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-[#2C6FBD]" style={{ width: `${Math.min(c.percentage, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Rankings */}
      <TopProductsCard explicitRange={explicitRange} periodLabel={periodLabel} />

      <Panel
        title="Top Customers by Spend"
        subtitle="Registered customers ranked by completed-sale spend"
        badge={<Badge variant="gold">{periodLabel}</Badge>}
        empty={(topCust?.customers.length ?? 0) === 0}
        emptyMsg="No completed sales attributed to registered customers in this period."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <th className="p-3">Rank</th>
                <th className="p-3">Customer</th>
                <th className="p-3 text-right">Total Spent</th>
                <th className="p-3 text-right">Bills</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {(topCust?.customers ?? []).map((c, idx) => (
                <tr key={c.customerId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3 font-mono font-bold text-gold-dark">#{idx + 1}</td>
                  <td className="p-3 font-bold text-[#0B0E23]">{c.customerName ?? '—'}</td>
                  <td className="p-3 text-right font-mono font-bold text-[#0B0E23]">{formatCurrency(c.totalSpent)}</td>
                  <td className="p-3 text-right font-mono">{formatCount(c.billCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <AiAnalystPanel domain="BUSINESS" rangeParams={rangeParams} title="AI Business Analyst" />

      <InsightsPanel title="Business Insights" data={insights} onRetry={load} />
    </div>
  );
}

function TopProductsCard({
  explicitRange,
  periodLabel,
}: {
  explicitRange: { dateFrom: string; dateTo: string } | null;
  periodLabel: string;
}) {
  const [metric, setMetric] = useState<TopProductMetric>('revenue');
  const [result, setResult] = useState<TopProductsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const key = explicitRange ? `${explicitRange.dateFrom}|${explicitRange.dateTo}|${metric}` : `none|${metric}`;

  const load = async () => {
    if (!explicitRange) return;
    setLoading(true);
    setErr('');
    try {
      setResult(await reportService.getTopProducts({ ...explicitRange, metric, limit: 10 }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not load top products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <Panel
      title="Top Selling Products"
      subtitle="Ranked by the selected metric over completed sales"
      badge={<Badge variant="gold">{periodLabel}</Badge>}
      action={
        <div className="flex flex-wrap gap-1.5">
          {TP_METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={
                'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ' +
                (metric === m.key ? 'bg-[#0B0E23] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      }
      loading={loading}
      error={err}
      empty={!!result && result.items.length === 0}
      emptyMsg="No sales in this period."
      onRetry={load}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
              <th className="p-3">Product</th>
              <th className="p-3 text-right">Units</th>
              <th className="p-3 text-right">Revenue</th>
              <th className="p-3 text-right">Gold Wt</th>
              {result?.profit_visible && <th className="p-3 text-right">Profit</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {(result?.items ?? []).map((it) => (
              <tr key={it.product_code} className="hover:bg-slate-50/80">
                <td className="p-3 font-bold text-[#0B0E23]">
                  {it.product_name}
                  <span className="block text-[10px] text-slate-400 font-mono">{it.product_code}</span>
                </td>
                <td className="p-3 text-right font-mono">{formatCount(it.units)}</td>
                <td className="p-3 text-right font-mono">{formatCurrency(it.revenue)}</td>
                <td className="p-3 text-right font-mono">{formatGrams(it.gold_weight_grams)}</td>
                {result?.profit_visible && (
                  <td className="p-3 text-right font-mono">{it.profit != null ? formatCurrency(it.profit) : '—'}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ================================================================== */
/* SCHEME ANALYTICS                                                    */
/* ================================================================== */

const ENROLLMENT_STATUS_BADGE: Record<string, 'success' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
};

function SchemeAnalytics({
  rangeParams,
  periodLabel,
}: {
  rangeParams: ReportRangeParams;
  periodLabel: string;
}) {
  const [payments, setPayments] = useState<PaymentSummary | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentSummary | null>(null);
  const [topCust, setTopCust] = useState<TopCustomersReport | null>(null);
  const [schemeSummary, setSchemeSummary] = useState<SchemeSummaryReport | null>(null);
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const key = JSON.stringify(rangeParams);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [pay, enr, tc, ss, ins] = await Promise.all([
        reportService.getPaymentSummary(rangeParams),
        reportService.getEnrollmentSummary(rangeParams),
        reportService.getTopCustomers({ ...rangeParams, limit: 10 }),
        reportService.getSchemeSummary(rangeParams),
        reportService.getSchemeInsights(rangeParams),
      ]);
      setPayments(pay);
      setEnrollments(enr);
      setTopCust(tc);
      setSchemeSummary(ss);
      setInsights(ins);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load scheme analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const collectionsData = (payments?.monthlyTrend ?? []).map((t) => ({ label: t.label, amount: t.totalAmount }));
  const enrollmentData = (enrollments?.dailyTrend ?? []).map((t) => ({ label: t.label, count: t.newEnrollments }));

  if (loading) return <DomainSkeleton />;
  if (error)
    return (
      <Card className="p-4 border-red-200 bg-red-50/60">
        <p className="text-xs font-medium text-red-700">{error}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={load}>
          Retry
        </Button>
      </Card>
    );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Scheme Collections"
          value={formatCurrency(payments?.totalRevenue ?? 0)}
          icon={TrendingUp}
          color="text-amber-600 bg-amber-50"
          growth={payments?.totalRevenueGrowthPercent ?? null}
        />
        <KpiCard
          label="Outstanding Dues"
          value={formatCurrency(payments?.outstandingDues ?? 0)}
          icon={CreditCard}
          color="text-emerald-600 bg-emerald-50"
          growth={payments?.outstandingDuesGrowthPercent ?? null}
          invert
        />
        <KpiCard label="New Enrollments" value={formatCount(enrollments?.newEnrollmentsInRange ?? 0)} icon={Coins} color="text-teal-600 bg-teal-50" />
        <KpiCard label="Active Passbooks" value={formatCount(enrollments?.activeCount ?? 0)} icon={Users} color="text-blue-600 bg-blue-50" />
      </div>

      {/* Primary: collections trend */}
      <Panel
        title="Scheme Collections Trend"
        subtitle="Successful installment collections (₹) across the period"
        badge={<Badge variant="gold">{periodLabel}</Badge>}
        empty={collectionsData.length < 2}
        emptyMsg={collectionsData.length === 1 ? 'Only one data point — widen the period to see a trend.' : 'No collections in this period.'}
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={collectionsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
              <Tooltip formatter={(val: number) => [formatCurrency(val), 'Collections']} contentStyle={chartTooltipStyle} />
              <Bar dataKey="amount" fill="#0B0E23" radius={[6, 6, 0, 0]} name="Collections" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* Secondary: enrollment trend + status mix */}
      <Panel
        title="Enrollment Analytics"
        subtitle="New enrollments over time, with status mix for the period"
        action={
          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Retention</div>
              <div className="text-sm font-extrabold text-[#0B0E23] font-display">
                {enrollments?.retentionRatePercent != null ? `${enrollments.retentionRatePercent.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Completed</div>
              <div className="text-sm font-extrabold text-[#0B0E23] font-display">{formatCount(enrollments?.completedCount ?? 0)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cancelled</div>
              <div className="text-sm font-extrabold text-[#0B0E23] font-display">{formatCount(enrollments?.cancelledCount ?? 0)}</div>
            </div>
          </div>
        }
        empty={enrollmentData.length < 2}
        emptyMsg={enrollmentData.length === 1 ? 'Only one data point — widen the period to see a trend.' : 'No enrollments in this period.'}
      >
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={enrollmentData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
              <Tooltip formatter={(val: number) => [String(val), 'New Enrollments']} contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" fill="#2C6FBD" radius={[6, 6, 0, 0]} name="New Enrollments" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* Scheme performance table */}
      <Panel
        title="Scheme Performance"
        subtitle="Active enrollments and collections per scheme"
        badge={<Badge variant="gold">{periodLabel}</Badge>}
        empty={(schemeSummary?.schemes.length ?? 0) === 0}
        emptyMsg="No schemes with activity in this period."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <th className="p-3">Scheme</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Active Enrollments</th>
                <th className="p-3 text-right">Total Collected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {(schemeSummary?.schemes ?? []).map((s) => (
                <tr key={s.schemeId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3 font-bold text-[#0B0E23]">{s.schemeName}</td>
                  <td className="p-3 text-center">
                    <Badge variant={s.isActive ? 'success' : 'neutral'} className="text-[10px]">
                      {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  </td>
                  <td className="p-3 text-right font-mono">{formatCount(s.activeEnrollments)}</td>
                  <td className="p-3 text-right font-mono font-bold text-[#0B0E23]">{formatCurrency(s.totalCollected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Top scheme customers */}
      <Panel
        title="Top High-Value Scheme Customers"
        subtitle="Highest total gold accumulated and installment consistency"
        badge={<Badge variant="gold">{periodLabel}</Badge>}
        empty={(topCust?.customers.length ?? 0) === 0}
        emptyMsg="No scheme customers with recorded payments in this period."
      >
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
              {(topCust?.customers ?? []).map((row, idx) => (
                <tr key={row.enrollmentId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3 font-mono font-bold text-gold-dark">#{idx + 1}</td>
                  <td className="p-3 font-bold text-[#0B0E23]">{row.customerName}</td>
                  <td className="p-3">{row.schemeName}</td>
                  <td className="p-3 text-right font-mono font-bold text-[#0B0E23]">{formatCurrency(row.totalInvested)}</td>
                  <td className="p-3 text-right font-mono font-bold text-amber-700">{formatGrams(row.goldWeightGrams)}</td>
                  <td className="p-3 text-center">
                    <Badge variant={ENROLLMENT_STATUS_BADGE[row.enrollmentStatus] ?? 'neutral'} className="text-[10px]">
                      {row.enrollmentStatus}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <AiAnalystPanel domain="SCHEME" rangeParams={rangeParams} title="AI Scheme Analyst" />

      <InsightsPanel title="Scheme Insights" data={insights} onRetry={load} />
    </div>
  );
}

/* ================================================================== */
/* Shared loading skeleton                                             */
/* ================================================================== */

function DomainSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/* ================================================================== */
/* PAGE                                                                */
/* ================================================================== */

const DOMAIN_META: Record<Domain, { label: string; icon: React.ComponentType<{ className?: string }>; subtitle: string }> = {
  business: {
    label: 'Business Analytics',
    icon: ShoppingBag,
    subtitle: 'Sales, profit, gold sold, top products and customers for the selected period.',
  },
  scheme: {
    label: 'Scheme Analytics',
    icon: Layers,
    subtitle: 'Collections, enrollments, scheme performance and top scheme customers for the selected period.',
  },
};

export default function AdminReportsPage() {
  const [domain, setDomain] = useState<Domain>('business');
  const [period, setPeriod] = useState<PeriodKey>('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const rangeParams = buildRangeParams(period, customFrom, customTo);
  const explicitRange = resolveExplicitRange(period, customFrom, customTo);
  const periodLabel = PERIOD_OPTIONS.find((p) => p.key === period)?.label ?? '';

  const handleExport = async () => {
    if (period === 'custom' && (!customFrom || !customTo)) {
      setToastMsg('Pick both custom range dates before exporting.');
      return;
    }
    setExporting(true);
    try {
      if (domain === 'business') {
        // Business export = completed-sale ledger (CA export), matching this range.
        if (!explicitRange) throw new ApiError('Range not set.', 400);
        await billingService.downloadCaExport(explicitRange);
        setToastMsg('Business sales export downloaded.');
      } else {
        if (!rangeParams) throw new ApiError('Range not set.', 400);
        const file = await reportService.exportReportsSummary({ ...rangeParams, format: 'excel' });
        triggerExportDownload(file);
        setToastMsg(`${file.filename} downloaded`);
      }
    } catch (err) {
      setToastMsg(err instanceof ApiError ? err.message : 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const meta = DOMAIN_META[domain];

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* HEADER */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">Reports & Analytics</h1>
        <p className="text-xs text-slate-500 mt-0.5 font-medium">{meta.subtitle}</p>
      </div>

      {/* DOMAIN SELECTOR */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 w-full sm:w-auto">
          {(Object.keys(DOMAIN_META) as Domain[]).map((d) => {
            const M = DOMAIN_META[d];
            const Icon = M.icon;
            return (
              <button
                key={d}
                onClick={() => setDomain(d)}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                  domain === d ? 'bg-[#2C6FBD] text-white shadow-sm' : 'text-slate-600 hover:text-[#0B0E23]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {M.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* PERIOD + EXPORT */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Period</span>
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setPeriod(opt.key)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
              period === opt.key ? 'bg-[#0B0E23] text-white border-[#0B0E23]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
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

        <Button onClick={handleExport} variant="outline" size="sm" className="h-9 ml-auto" isLoading={exporting}>
          <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
          {domain === 'business' ? 'Export Sales' : 'Export Summary'}
        </Button>
      </div>

      {period === 'custom' && !rangeParams && (
        <Card className="p-4 border-amber-200 bg-amber-50/60">
          <p className="text-xs font-medium text-amber-800">Choose both a start and end date to load the custom-range report.</p>
        </Card>
      )}

      {/* ACTIVE DOMAIN */}
      {rangeParams &&
        (domain === 'business' ? (
          <BusinessAnalytics rangeParams={rangeParams} explicitRange={explicitRange} periodLabel={periodLabel} />
        ) : (
          <SchemeAnalytics rangeParams={rangeParams} periodLabel={periodLabel} />
        ))}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  );
}
