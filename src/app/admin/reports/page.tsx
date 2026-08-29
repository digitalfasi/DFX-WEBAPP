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
  Cake,
} from 'lucide-react';
import {
  AreaChart,
  Area,
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
  TopProductsResult,
  AiAnalysis,
  AiPriority,
  BirthdaySummary,
  BirthdayCustomer,
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
/* Birthday intelligence — real DOB data, business-opportunity framing */
/* ================================================================== */

function BirthdayRow({ c, domain, today }: { c: BirthdayCustomer; domain: 'BUSINESS' | 'SCHEME'; today?: boolean }) {
  const valueLabel = domain === 'BUSINESS' ? 'business spend' : 'invested';
  return (
    <div
      className={`flex items-center justify-between rounded-xl border p-3 ${
        c.isPriority ? 'border-gold/40 bg-gold/[0.07]' : today ? 'border-[#2C6FBD]/25 bg-[#2C6FBD]/[0.04]' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-[#0B0E23] truncate">{c.customerName ?? 'Customer'}</span>
          {c.isPriority && <Badge variant="gold" className="text-[9px] shrink-0">PRIORITY</Badge>}
        </div>
        <div className="text-[10px] font-medium text-slate-500 mt-0.5">
          {c.customerCode && <span className="font-mono text-slate-400">{c.customerCode} · </span>}
          {c.isPriority && c.value != null
            ? `${domain === 'BUSINESS' ? 'Priority Business' : 'Priority Scheme'} Customer · ${formatCurrency(c.value)} ${valueLabel}`
            : `Birthday Opportunity · ${valueLabel} —`}
        </div>
      </div>
      <div className="text-right shrink-0 ml-3">
        <div className="text-xs font-mono font-bold text-slate-600">{c.birthday}</div>
        <div className="text-[10px] font-bold text-slate-400">
          {today ? 'Today' : c.daysUntil === 1 ? 'in 1 day' : `in ${c.daysUntil} days`}
        </div>
      </div>
    </div>
  );
}

function BirthdayPanel({ data }: { data: BirthdaySummary | null }) {
  if (!data) return null;
  const hasAny = data.totalWithDob > 0 && (data.todayCount > 0 || data.upcomingCount > 0);
  const all = [...data.today, ...data.upcoming];
  const priority = all.filter((c) => c.isPriority);
  const normal = all.filter((c) => !c.isPriority);
  const domainWord = data.domain === 'BUSINESS' ? 'business' : 'scheme';
  return (
    <Panel
      title="Birthday Opportunities"
      subtitle={`Customer birthdays in the next ${data.windowDays} days — priority uses ${domainWord} customer value`}
      badge={
        <div className="flex items-center gap-2">
          <Badge variant="gold">{data.todayCount} today</Badge>
          <Badge variant="neutral">{data.upcomingCount} upcoming</Badge>
          {data.priorityCount > 0 && <Badge variant="success">{data.priorityCount} priority</Badge>}
        </div>
      }
      empty={!hasAny}
      emptyMsg={
        data.totalWithDob === 0
          ? 'No customer birth dates on record yet.'
          : `No customer birthdays in the next ${data.windowDays} days.`
      }
    >
      <div className="space-y-4">
        {priority.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Cake className="w-4 h-4 text-gold-dark" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Priority / Complimentary Opportunities
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {priority.map((c) => (
                <BirthdayRow key={c.customerId} c={c} domain={data.domain} today={c.daysUntil === 0} />
              ))}
            </div>
            <p className="text-[10px] font-medium text-slate-500 mt-2">
              Action: send birthday wishes and consider a complimentary gesture.
            </p>
          </div>
        )}
        {normal.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Cake className="w-4 h-4 text-[#2C6FBD]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Birthday Opportunities
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {normal.slice(0, 12).map((c) => (
                <BirthdayRow key={c.customerId} c={c} domain={data.domain} today={c.daysUntil === 0} />
              ))}
            </div>
            {normal.length > 12 && (
              <p className="text-[10px] font-medium text-slate-400 mt-2">
                +{normal.length - 12} more within {data.windowDays} days.
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

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
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#2C6FBD] text-white">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-bold text-[#0B0E23]">{title}</span>
        </div>
        <Button onClick={run} size="sm" isLoading={loading} className="bg-[#2C6FBD] hover:bg-[#255ea3] text-white font-bold h-8 shrink-0">
          {data || error ? 'Refresh' : 'Generate'}
        </Button>
      </div>

      <div className="p-4">
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

        {!loading && !error && data && data.available && (() => {
          // One compact card per insight: Key Signal (what happened), Why It
          // Matters, Recommended Action — all strings straight from the
          // deterministic engine, paired by position. Nothing invented.
          const why = [...data.opportunities, ...data.risks];
          const count = Math.max(data.keyFindings.length, why.length, actions.length);
          const cards = Array.from({ length: count }, (_, i) => ({
            signal: data.keyFindings[i], why: why[i], action: actions[i],
          })).filter((c) => c.signal || c.why || c.action);

          return (
            <div className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {cards.map((c, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                    {c.signal && (
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[#2C6FBD]">Key Signal</p>
                        <p className="text-xs font-bold text-[#0B0E23] leading-snug">{c.signal}</p>
                      </div>
                    )}
                    {c.why && (
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Why It Matters</p>
                        <p className="text-xs text-slate-600 font-medium leading-snug">{c.why}</p>
                      </div>
                    )}
                    {c.action && (
                      <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Recommended Action</p>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${PRIORITY_STYLE[c.action.priority].badge}`}>
                            {c.action.priority}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[#0B0E23] leading-snug">{c.action.title}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1 text-[10px] font-medium text-slate-400 border-t border-slate-100">
                <span>{data.model ? `Analyzed by ${data.model}` : 'AI analysis'}</span>
                <span>{data.range.label}</span>
              </div>
            </div>
          );
        })()}
      </div>
    </Card>
  );
}

/* ================================================================== */
/* BUSINESS ANALYTICS                                                  */
/* ================================================================== */

/** Workspace header for a Report/Analytics section — icon + title + a
 *  view-specific accent bar. Pure visual differentiation (no explanatory
 *  copy): Report reads dark/structured, Analytics reads blue/analytical. */
function ViewBand({ label, view }: { label: string; view: ReportView }) {
  const Icon = VIEW_META[view].icon;
  const accent = view === 'report' ? 'border-[#0B0E23]' : 'border-[#2C6FBD]';
  const tint = view === 'report' ? 'bg-slate-100 text-[#0B0E23]' : 'bg-blue-50 text-[#2C6FBD]';
  return (
    <div className={`flex items-center gap-2.5 pl-3 border-l-4 ${accent}`}>
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${tint}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="font-display font-extrabold text-sm text-[#0B0E23]">{label}</span>
    </div>
  );
}

function BusinessAnalytics({
  rangeParams,
  explicitRange,
  periodLabel,
  view,
}: {
  rangeParams: ReportRangeParams;
  explicitRange: { dateFrom: string; dateTo: string } | null;
  periodLabel: string;
  view: ReportView;
}) {
  const [salesTrend, setSalesTrend] = useState<SalesTrend | null>(null);
  const [category, setCategory] = useState<SalesByCategory | null>(null);
  const [topCust, setTopCust] = useState<TopCustomersBySalesReport | null>(null);
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [birthdays, setBirthdays] = useState<BirthdaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const key = JSON.stringify(rangeParams);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [st, cat, tc, ins, bd] = await Promise.all([
        reportService.getSalesTrend(rangeParams),
        reportService.getSalesByCategory(rangeParams),
        reportService.getTopCustomersBusiness({ ...rangeParams, limit: 10 }),
        reportService.getBusinessInsights(rangeParams),
        // Birthdays are next-30-days from today; priority uses business spend over the period.
        reportService.getBirthdays('BUSINESS', 30, rangeParams),
      ]);
      setSalesTrend(st);
      setCategory(cat);
      setTopCust(tc);
      setInsights(ins);
      setBirthdays(bd);
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
      {view === 'report' && (
      <>
      {/* REPORT — factual figures for the period */}
      <ViewBand label="Business Report" view="report" />
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
            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dfxRevenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C6A24C" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#C6A24C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
              <Tooltip formatter={(val: number) => [formatCurrency(val), 'Revenue']} contentStyle={chartTooltipStyle} />
              <Area type="monotone" dataKey="revenue" stroke="#C6A24C" strokeWidth={2.5} fill="url(#dfxRevenueFill)" name="Revenue" dot={false} activeDot={{ r: 4, fill: '#0B0E23' }} />
            </AreaChart>
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

      </>
      )}

      {view === 'analytics' && (
      <>
      {/* ANALYTICS — interpretation, opportunities, deterministic insights */}
      <ViewBand label="Business Analytics" view="analytics" />
      <BirthdayPanel data={birthdays} />

      <AiAnalystPanel domain="BUSINESS" rangeParams={rangeParams} title="AI Business Analyst" />
      </>
      )}
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
  const [result, setResult] = useState<TopProductsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const key = explicitRange ? `${explicitRange.dateFrom}|${explicitRange.dateTo}` : 'none';

  const load = async () => {
    if (!explicitRange) return;
    setLoading(true);
    setErr('');
    try {
      // Sales-volume ranking only. 'quantity' = units sold. Tie-break by grams
      // sold is applied client-side over the same backend aggregate.
      setResult(await reportService.getTopProducts({ ...explicitRange, metric: 'quantity', limit: 10 }));
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

  // Units Sold DESC, then Grams Sold DESC. No revenue/profit/margin ranking.
  const ranked = [...(result?.items ?? [])].sort(
    (a, b) => b.units - a.units || b.gold_weight_grams - a.gold_weight_grams,
  );

  return (
    <Panel
      title="Top Selling Products"
      subtitle="Ranked by units sold (grams sold breaks ties)"
      badge={<Badge variant="gold">{periodLabel}</Badge>}
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
              <th className="p-3 text-right">Units Sold</th>
              <th className="p-3 text-right">Grams Sold</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {ranked.map((it) => (
              <tr key={it.product_code} className="hover:bg-slate-50/80">
                <td className="p-3 font-bold text-[#0B0E23]">
                  {it.product_name}
                  <span className="block text-[10px] text-slate-400 font-mono">{it.product_code}</span>
                </td>
                <td className="p-3 text-right font-mono">{formatCount(it.units)}</td>
                <td className="p-3 text-right font-mono">{formatGrams(it.gold_weight_grams)}</td>
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
  view,
}: {
  rangeParams: ReportRangeParams;
  periodLabel: string;
  view: ReportView;
}) {
  const [payments, setPayments] = useState<PaymentSummary | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentSummary | null>(null);
  const [topCust, setTopCust] = useState<TopCustomersReport | null>(null);
  const [schemeSummary, setSchemeSummary] = useState<SchemeSummaryReport | null>(null);
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [birthdays, setBirthdays] = useState<BirthdaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const key = JSON.stringify(rangeParams);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [pay, enr, tc, ss, ins, bd] = await Promise.all([
        reportService.getPaymentSummary(rangeParams),
        reportService.getEnrollmentSummary(rangeParams),
        reportService.getTopCustomers({ ...rangeParams, limit: 10 }),
        reportService.getSchemeSummary(rangeParams),
        reportService.getSchemeInsights(rangeParams),
        reportService.getBirthdays('SCHEME', 30, rangeParams),
      ]);
      setPayments(pay);
      setEnrollments(enr);
      setTopCust(tc);
      setSchemeSummary(ss);
      setInsights(ins);
      setBirthdays(bd);
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
      {view === 'report' && (
      <>
      {/* REPORT — factual scheme figures for the period */}
      <ViewBand label="Scheme Report" view="report" />
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
            <AreaChart data={collectionsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dfxCollectionsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C6A24C" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#C6A24C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
              <Tooltip formatter={(val: number) => [formatCurrency(val), 'Collections']} contentStyle={chartTooltipStyle} />
              <Area type="monotone" dataKey="amount" stroke="#C6A24C" strokeWidth={2.5} fill="url(#dfxCollectionsFill)" name="Collections" dot={false} activeDot={{ r: 4, fill: '#0B0E23' }} />
            </AreaChart>
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
            <AreaChart data={enrollmentData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dfxEnrollmentFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2C6FBD" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2C6FBD" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
              <Tooltip formatter={(val: number) => [String(val), 'New Enrollments']} contentStyle={chartTooltipStyle} />
              <Area type="monotone" dataKey="count" stroke="#2C6FBD" strokeWidth={2.5} fill="url(#dfxEnrollmentFill)" name="New Enrollments" dot={false} activeDot={{ r: 4, fill: '#0B0E23' }} />
            </AreaChart>
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

      </>
      )}

      {view === 'analytics' && (
      <>
      {/* ANALYTICS — interpretation, opportunities, deterministic insights */}
      <ViewBand label="Scheme Analytics" view="analytics" />
      <BirthdayPanel data={birthdays} />

      <AiAnalystPanel domain="SCHEME" rangeParams={rangeParams} title="AI Scheme Analyst" />
      </>
      )}
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
    label: 'Business',
    icon: ShoppingBag,
    subtitle: 'Sales, profit, gold sold, top products and customers for the selected period.',
  },
  scheme: {
    label: 'Scheme',
    icon: Layers,
    subtitle: 'Collections, enrollments, scheme performance and top scheme customers for the selected period.',
  },
};

type ReportView = 'report' | 'analytics';
const VIEW_META: Record<ReportView, { label: string; icon: React.ComponentType<{ className?: string }>; active: string }> = {
  report: { label: 'Report', icon: ClipboardList, active: 'bg-[#0B0E23] text-white shadow-sm' },
  analytics: { label: 'Analytics', icon: Sparkles, active: 'bg-[#2C6FBD] text-white shadow-sm' },
};

export default function AdminReportsPage() {
  const [domain, setDomain] = useState<Domain>('business');
  const [view, setView] = useState<ReportView>('report');
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

        {/* REPORT vs ANALYTICS segmented control — distinct icon + active
            colour per view so the active workspace is obvious at a glance. */}
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 w-full sm:w-auto">
          {(Object.keys(VIEW_META) as ReportView[]).map((v) => {
            const VIcon = VIEW_META[v].icon;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                  view === v ? VIEW_META[v].active : 'text-slate-600 hover:text-[#0B0E23]'
                }`}
              >
                <VIcon className="w-4 h-4" />
                {VIEW_META[v].label}
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
          <BusinessAnalytics rangeParams={rangeParams} explicitRange={explicitRange} periodLabel={periodLabel} view={view} />
        ) : (
          <SchemeAnalytics rangeParams={rangeParams} periodLabel={periodLabel} view={view} />
        ))}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  );
}
