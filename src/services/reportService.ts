import { apiClient } from '@/lib/apiClient';
import { ExportFile, ExportFormat, BackendExportFile, mapExportFile } from '@/lib/exportDownload';

export type ReportPeriod = 'today' | 'this_week' | 'this_month' | 'this_year';

export interface ReportRangeParams {
  period?: ReportPeriod;
  /** YYYY-MM-DD. Both dateFrom and dateTo are required together — overrides `period` when set. */
  dateFrom?: string;
  dateTo?: string;
}

function buildQuery(params: object): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value === undefined) continue;
    const paramKey = key === 'dateFrom' ? 'date_from' : key === 'dateTo' ? 'date_to' : key;
    qs.set(paramKey, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** Shape of the `range` object every report response includes. */
interface BackendDateRange {
  date_from: string;
  date_to: string;
  label: string;
}

export interface DateRange {
  dateFrom: string;
  dateTo: string;
  label: string;
}

function mapRange(raw: BackendDateRange): DateRange {
  return { dateFrom: raw.date_from, dateTo: raw.date_to, label: raw.label };
}

/* ------------------------------------------------------------------ */
/* Payment Summary — Reports page KPIs/chart, Analytics avg-installment KPI */
/* ------------------------------------------------------------------ */

interface BackendPaymentTrendPoint {
  period_label: string;
  total_amount: number;
  payment_count: number;
}

interface BackendPaymentSummary {
  range: BackendDateRange;
  total_revenue: number;
  total_revenue_growth_percent: number | null;
  outstanding_dues: number;
  outstanding_dues_growth_percent: number | null;
  avg_installment_amount: number;
  success_payment_count: number;
  pending_payment_count: number;
  monthly_trend: BackendPaymentTrendPoint[];
}

export interface PaymentTrendPoint {
  label: string;
  totalAmount: number;
  paymentCount: number;
}

export interface PaymentSummary {
  range: DateRange;
  totalRevenue: number;
  totalRevenueGrowthPercent: number | null;
  outstandingDues: number;
  outstandingDuesGrowthPercent: number | null;
  avgInstallmentAmount: number;
  successPaymentCount: number;
  pendingPaymentCount: number;
  monthlyTrend: PaymentTrendPoint[];
}

function mapPaymentSummary(raw: BackendPaymentSummary): PaymentSummary {
  return {
    range: mapRange(raw.range),
    totalRevenue: raw.total_revenue,
    totalRevenueGrowthPercent: raw.total_revenue_growth_percent,
    outstandingDues: raw.outstanding_dues,
    outstandingDuesGrowthPercent: raw.outstanding_dues_growth_percent,
    avgInstallmentAmount: raw.avg_installment_amount,
    successPaymentCount: raw.success_payment_count,
    pendingPaymentCount: raw.pending_payment_count,
    monthlyTrend: raw.monthly_trend.map((t) => ({
      label: t.period_label,
      totalAmount: t.total_amount,
      paymentCount: t.payment_count,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Top Customers — Reports page table                                  */
/* ------------------------------------------------------------------ */

interface BackendTopCustomer {
  enrollment_id: string;
  customer_id: string;
  customer_name: string;
  scheme_name: string;
  enrollment_status: string;
  total_invested: number;
  gold_weight_grams: number;
}

interface BackendTopCustomersResponse {
  range: BackendDateRange;
  customers: BackendTopCustomer[];
}

export interface TopCustomer {
  enrollmentId: string;
  customerId: string;
  customerName: string;
  schemeName: string;
  enrollmentStatus: string;
  totalInvested: number;
  goldWeightGrams: number;
}

export interface TopCustomersReport {
  range: DateRange;
  customers: TopCustomer[];
}

function mapTopCustomers(raw: BackendTopCustomersResponse): TopCustomersReport {
  return {
    range: mapRange(raw.range),
    customers: raw.customers.map((c) => ({
      enrollmentId: c.enrollment_id,
      customerId: c.customer_id,
      customerName: c.customer_name,
      schemeName: c.scheme_name,
      enrollmentStatus: c.enrollment_status,
      totalInvested: c.total_invested,
      goldWeightGrams: c.gold_weight_grams,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Enrollment Summary — Reports Active Passbooks KPI, Analytics retention */
/* KPI + weekly trend chart                                            */
/* ------------------------------------------------------------------ */

interface BackendEnrollmentTrendPoint {
  period_label: string;
  new_enrollments: number;
  maturity_amount?: number;
}

interface BackendEnrollmentSummary {
  range: BackendDateRange;
  active_count: number;
  completed_count: number;
  cancelled_count: number;
  new_enrollments_in_range: number;
  retention_rate_percent: number | null;
  conversion_funnel_percent: number | null;
  redemption_velocity_days: number | null;
  daily_trend: BackendEnrollmentTrendPoint[];
}

export interface EnrollmentTrendPoint {
  label: string;
  newEnrollments: number;
  maturityAmount: number;
}

export interface EnrollmentSummary {
  range: DateRange;
  activeCount: number;
  completedCount: number;
  cancelledCount: number;
  newEnrollmentsInRange: number;
  retentionRatePercent: number | null;
  /** Always null: no leads/CRM capture exists in the backend yet. */
  conversionFunnelPercent: number | null;
  /** Always null: no redemption/maturity-payout event is modeled yet. */
  redemptionVelocityDays: number | null;
  dailyTrend: EnrollmentTrendPoint[];
}

function mapEnrollmentSummary(raw: BackendEnrollmentSummary): EnrollmentSummary {
  return {
    range: mapRange(raw.range),
    activeCount: raw.active_count,
    completedCount: raw.completed_count,
    cancelledCount: raw.cancelled_count,
    newEnrollmentsInRange: raw.new_enrollments_in_range,
    retentionRatePercent: raw.retention_rate_percent,
    conversionFunnelPercent: raw.conversion_funnel_percent,
    redemptionVelocityDays: raw.redemption_velocity_days,
    dailyTrend: raw.daily_trend.map((t) => ({ label: t.period_label, newEnrollments: t.new_enrollments, maturityAmount: t.maturity_amount ?? 0 })),
  };
}

/* ------------------------------------------------------------------ */
/* Gold Rate Trend / Scheme Summary / Dashboard Summary — built as a    */
/* reusable foundation in Module 12, first consumed by the Admin        */
/* Dashboard in Module 13 (see SESSION_HANDOFF.md)                      */
/* ------------------------------------------------------------------ */

interface BackendGoldRateTrendPoint {
  date: string;
  rate_24k: number;
}

interface BackendGoldRateTrendResponse {
  range: BackendDateRange;
  trend: BackendGoldRateTrendPoint[];
  latest_change_percent: number | null;
}

export interface GoldRateTrendPoint {
  date: string;
  rate24k: number;
}

export interface GoldRateTrendReport {
  range: DateRange;
  trend: GoldRateTrendPoint[];
  /** Day-over-day % change between the two most recent points, or null if <2 points. */
  latestChangePercent: number | null;
}

function mapGoldRateTrend(raw: BackendGoldRateTrendResponse): GoldRateTrendReport {
  return {
    range: mapRange(raw.range),
    trend: raw.trend.map((t) => ({ date: t.date, rate24k: t.rate_24k })),
    latestChangePercent: raw.latest_change_percent,
  };
}

interface BackendSchemeSummaryItem {
  scheme_id: string;
  scheme_name: string;
  is_active: boolean;
  active_enrollments: number;
  total_collected: number;
}

interface BackendSchemeSummaryResponse {
  range: BackendDateRange;
  schemes: BackendSchemeSummaryItem[];
}

export interface SchemeSummaryItem {
  schemeId: string;
  schemeName: string;
  isActive: boolean;
  activeEnrollments: number;
  totalCollected: number;
}

export interface SchemeSummaryReport {
  range: DateRange;
  schemes: SchemeSummaryItem[];
}

function mapSchemeSummary(raw: BackendSchemeSummaryResponse): SchemeSummaryReport {
  return {
    range: mapRange(raw.range),
    schemes: raw.schemes.map((s) => ({
      schemeId: s.scheme_id,
      schemeName: s.scheme_name,
      isActive: s.is_active,
      activeEnrollments: s.active_enrollments,
      totalCollected: s.total_collected,
    })),
  };
}

interface BackendDashboardSummary {
  range: BackendDateRange;
  total_revenue: number;
  total_revenue_growth_percent: number | null;
  active_enrollments: number;
  total_gold_accumulated_grams: number;
  outstanding_dues: number;
  total_customers: number;
  total_customers_growth_percent: number | null;
}

export interface DashboardSummary {
  range: DateRange;
  totalRevenue: number;
  totalRevenueGrowthPercent: number | null;
  activeEnrollments: number;
  totalGoldAccumulatedGrams: number;
  outstandingDues: number;
  totalCustomers: number;
  totalCustomersGrowthPercent: number | null;
}

function mapDashboardSummary(raw: BackendDashboardSummary): DashboardSummary {
  return {
    range: mapRange(raw.range),
    totalRevenue: raw.total_revenue,
    totalRevenueGrowthPercent: raw.total_revenue_growth_percent,
    activeEnrollments: raw.active_enrollments,
    totalGoldAccumulatedGrams: raw.total_gold_accumulated_grams,
    outstandingDues: raw.outstanding_dues,
    totalCustomers: raw.total_customers,
    totalCustomersGrowthPercent: raw.total_customers_growth_percent,
  };
}

/* ------------------------------------------------------------------ */
/* Sales Trend + Sales by Category — Admin Dashboard (Module 13)        */
/* ------------------------------------------------------------------ */

interface BackendSalesTrendPoint {
  period_label: string;
  total_amount: number;
  sale_count: number;
  profit?: number;
  gold_weight_grams?: number;
}
interface BackendSalesTrendResponse {
  range: BackendDateRange;
  trend: BackendSalesTrendPoint[];
}
export interface SalesTrendPoint {
  label: string;
  totalAmount: number;
  saleCount: number;
  profit: number;
  goldWeightGrams: number;
}
export interface SalesTrend {
  range: DateRange;
  trend: SalesTrendPoint[];
}

interface BackendCategorySalesItem {
  category: string;
  total_sales: number;
  bill_count: number;
  percentage: number;
}
interface BackendSalesByCategoryResponse {
  range: BackendDateRange;
  total_sales: number;
  categories: BackendCategorySalesItem[];
}
export interface CategorySalesItem {
  category: string;
  totalSales: number;
  billCount: number;
  percentage: number;
}
export interface SalesByCategory {
  range: DateRange;
  totalSales: number;
  categories: CategorySalesItem[];
}

/* ------------------------------------------------------------------ */
/* Insights (Phase 10) — data-grounded, birthday reminder etc.         */
/* ------------------------------------------------------------------ */

export interface InsightItem {
  id: string;
  category: string;
  title: string;
  detail: string;
  severity: 'info' | 'positive' | 'warning';
  evidence: Record<string, unknown>;
}
interface BackendInsightsResponse {
  range: BackendDateRange;
  module: 'business' | 'scheme';
  data_available: boolean;
  insights: InsightItem[];
  note: string | null;
}
export interface InsightsResult {
  range: DateRange;
  module: 'business' | 'scheme';
  dataAvailable: boolean;
  insights: InsightItem[];
  note: string | null;
}
function mapInsights(raw: BackendInsightsResponse): InsightsResult {
  return {
    range: mapRange(raw.range),
    module: raw.module,
    dataAvailable: raw.data_available,
    insights: raw.insights ?? [],
    note: raw.note,
  };
}

export const reportService = {
  /** GET /api/v1/reports/sales-trend (Admin) — Business sales time-series. */
  async getSalesTrend(params: ReportRangeParams = {}): Promise<SalesTrend> {
    const res = await apiClient.get<{ report: BackendSalesTrendResponse }>(
      `/reports/sales-trend${buildQuery(params)}`,
      { auth: true }
    );
    const r = res.data.report;
    return {
      range: mapRange(r.range),
      trend: r.trend.map((t) => ({
        label: t.period_label,
        totalAmount: t.total_amount,
        saleCount: t.sale_count,
        profit: t.profit ?? 0,
        goldWeightGrams: t.gold_weight_grams ?? 0,
      })),
    };
  },

  /** GET /api/v1/reports/sales-by-category (Admin) — Top Selling Categories donut. */
  async getSalesByCategory(params: ReportRangeParams = {}): Promise<SalesByCategory> {
    const res = await apiClient.get<{ report: BackendSalesByCategoryResponse }>(
      `/reports/sales-by-category${buildQuery(params)}`,
      { auth: true }
    );
    const r = res.data.report;
    return {
      range: mapRange(r.range),
      totalSales: r.total_sales,
      categories: r.categories.map((c) => ({
        category: c.category,
        totalSales: c.total_sales,
        billCount: c.bill_count,
        percentage: c.percentage,
      })),
    };
  },

  /** GET /api/v1/reports/insights/business (Admin) — includes birthday insight (Phase 10). */
  async getBusinessInsights(params: ReportRangeParams = {}): Promise<InsightsResult> {
    const res = await apiClient.get<{ insights: BackendInsightsResponse }>(
      `/reports/insights/business${buildQuery(params)}`,
      { auth: true }
    );
    return mapInsights(res.data.insights);
  },

  /** GET /api/v1/reports/insights/scheme (Admin) — includes birthday insight (Phase 10). */
  async getSchemeInsights(params: ReportRangeParams = {}): Promise<InsightsResult> {
    const res = await apiClient.get<{ insights: BackendInsightsResponse }>(
      `/reports/insights/scheme${buildQuery(params)}`,
      { auth: true }
    );
    return mapInsights(res.data.insights);
  },

  /** GET /api/v1/reports/payment-summary (Admin) */
  async getPaymentSummary(params: ReportRangeParams = {}): Promise<PaymentSummary> {
    const res = await apiClient.get<{ summary: BackendPaymentSummary }>(
      `/reports/payment-summary${buildQuery(params)}`,
      { auth: true }
    );
    return mapPaymentSummary(res.data.summary);
  },

  /** GET /api/v1/reports/top-customers (Admin) */
  async getTopCustomers(params: ReportRangeParams & { limit?: number } = {}): Promise<TopCustomersReport> {
    const res = await apiClient.get<{ report: BackendTopCustomersResponse }>(
      `/reports/top-customers${buildQuery(params)}`,
      { auth: true }
    );
    return mapTopCustomers(res.data.report);
  },

  /** GET /api/v1/reports/enrollment-summary (Admin) */
  async getEnrollmentSummary(params: ReportRangeParams = {}): Promise<EnrollmentSummary> {
    const res = await apiClient.get<{ summary: BackendEnrollmentSummary }>(
      `/reports/enrollment-summary${buildQuery(params)}`,
      { auth: true }
    );
    return mapEnrollmentSummary(res.data.summary);
  },

  /** GET /api/v1/reports/gold-rate-trend (Admin) — reusable, not wired to a page yet. */
  async getGoldRateTrend(params: ReportRangeParams = {}): Promise<GoldRateTrendReport> {
    const res = await apiClient.get<{ report: BackendGoldRateTrendResponse }>(
      `/reports/gold-rate-trend${buildQuery(params)}`,
      { auth: true }
    );
    return mapGoldRateTrend(res.data.report);
  },

  /** GET /api/v1/reports/scheme-summary (Admin) — reusable, not wired to a page yet. */
  async getSchemeSummary(params: ReportRangeParams = {}): Promise<SchemeSummaryReport> {
    const res = await apiClient.get<{ report: BackendSchemeSummaryResponse }>(
      `/reports/scheme-summary${buildQuery(params)}`,
      { auth: true }
    );
    return mapSchemeSummary(res.data.report);
  },

  /** GET /api/v1/reports/dashboard-summary (Admin) — reserved for a future Admin Dashboard module. */
  async getDashboardSummary(params: ReportRangeParams = {}): Promise<DashboardSummary> {
    const res = await apiClient.get<{ summary: BackendDashboardSummary }>(
      `/reports/dashboard-summary${buildQuery(params)}`,
      { auth: true }
    );
    return mapDashboardSummary(res.data.summary);
  },

  /* ---------------------------------------------------------------- */
  /* Export (Module 15) — each fetches the file; the caller passes the */
  /* result to triggerExportDownload() from '@/lib/exportDownload'.    */
  /* ---------------------------------------------------------------- */

  /** GET /api/v1/reports/export/reports-summary (Admin) — Top Customers table. */
  async exportReportsSummary(
    params: ReportRangeParams & { limit?: number; format?: ExportFormat } = {}
  ): Promise<ExportFile> {
    const res = await apiClient.get<{ export: BackendExportFile }>(
      `/reports/export/reports-summary${buildQuery(params)}`,
      { auth: true }
    );
    return mapExportFile(res.data.export);
  },

  /** GET /api/v1/reports/export/analytics-summary (Admin) — 4 Analytics-page KPIs. */
  async exportAnalyticsSummary(format: ExportFormat = 'excel'): Promise<ExportFile> {
    const res = await apiClient.get<{ export: BackendExportFile }>(
      `/reports/export/analytics-summary${buildQuery({ format })}`,
      { auth: true }
    );
    return mapExportFile(res.data.export);
  },

  /** GET /api/v1/reports/export/dashboard-summary (Admin) — today-scoped Dashboard KPIs. */
  async exportDashboardSummary(format: ExportFormat = 'excel'): Promise<ExportFile> {
    const res = await apiClient.get<{ export: BackendExportFile }>(
      `/reports/export/dashboard-summary${buildQuery({ format })}`,
      { auth: true }
    );
    return mapExportFile(res.data.export);
  },

  /** GET /api/v1/reports/top-products (Admin) — ranked products over a period. */
  async getTopProducts(params: {
    dateFrom: string;
    dateTo: string;
    metric?: 'revenue' | 'quantity' | 'weight' | 'profit';
    limit?: number;
  }): Promise<TopProductsResult> {
    const res = await apiClient.get<TopProductsResult>(
      `/reports/top-products${buildQuery({
        date_from: params.dateFrom,
        date_to: params.dateTo,
        metric: params.metric ?? 'revenue',
        limit: params.limit ?? 10,
      })}`,
      { auth: true }
    );
    return res.data;
  },
};

export interface DashboardCards {
  overdue_enrollments: number;
  pending_kyc: number;
  pending_inspection: number;
  /** Sellable inventory count (IN_STOCK). The data model has no quantity/reorder
   *  threshold, so there is no true "low stock" metric — this is the honest one. */
  items_in_stock: number;
}

export const dashboardCardsService = {
  /** GET /api/v1/reports/dashboard-cards (Admin/Staff) — live operational counts. */
  async getDashboardCards(): Promise<DashboardCards> {
    const res = await apiClient.get<DashboardCards>('/reports/dashboard-cards', { auth: true });
    return res.data;
  },
};

export interface CollectionItem {
  enrollment_id: string;
  enrollment_number: string;
  customer_id: string;
  customer_name: string | null;
  customer_code: string | null;
  customer_phone: string | null;
  scheme_name: string | null;
  due_date: string | null;
  overdue_days: number | null;
  reminders_sent: number;
  status: string;
}

export const collectionsService = {
  /** GET /api/v1/collections (Admin/Staff) — overdue scheme installments (read-only). */
  async getCollections(): Promise<CollectionItem[]> {
    const res = await apiClient.get<{ collections: CollectionItem[] }>('/collections', { auth: true });
    return res.data.collections;
  },
};

export type TopProductMetric = 'revenue' | 'quantity' | 'weight' | 'profit';

export interface TopProductItem {
  product_code: string;
  product_name: string;
  units: number;
  revenue: number;
  gold_weight_grams: number;
  profit: number | null;
}

export interface TopProductsResult {
  metric: TopProductMetric;
  date_from: string;
  date_to: string;
  profit_visible: boolean;
  items: TopProductItem[];
}
