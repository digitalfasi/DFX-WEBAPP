"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Toast } from '@/components/ui/toast';
import { formatCurrency } from '@/lib/formatters';
import {
  Search,
  Plus,
  Receipt,
  Eye,
  Package,
  Coins,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Filter,
  Wallet,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Smartphone,
  CreditCard,
  Landmark,
  FileText,
  Globe,
  Banknote,
} from 'lucide-react';
import {
  paymentService,
  AdminPayment,
  PaymentMethod,
  PaymentStatus,
  ManualPaymentFormData,
} from '@/services/paymentService';
import { billingService, Sale, SalePaymentStatus } from '@/services/billingService';
import { enrollmentService } from '@/services/enrollmentService';
import { ApiError } from '@/lib/apiClient';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

type MainTab = 'business' | 'scheme';
const PAGE_SIZE = 10;

/** Build a backend date range (YYYY-MM-DD) from the most specific of the
 *  day / month / year inputs. Day wins over month wins over year. */
function resolveDateRange(day: string, month: string, year: string): { from?: string; to?: string } {
  if (day) return { from: day, to: day };
  if (month) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
  }
  if (year) return { from: `${year}-01-01`, to: `${year}-12-31` };
  return {};
}

function fmtDateTime(iso: string): { d: string; t: string } {
  const dt = new Date(iso);
  return {
    d: dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    t: dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  };
}

function addMonths(iso: string, n: number): Date {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + n);
  return d;
}

/** Indian currency with 2 decimals, e.g. ₹15,000.00. Presentation only —
 *  the underlying numeric value is never altered. */
function inr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Lucide icon for a backend payment-method value (no invented methods). */
function methodIcon(method: string): React.ReactNode {
  switch (method) {
    case 'UPI': return <Smartphone className="w-3.5 h-3.5 text-slate-500" />;
    case 'CARD': return <CreditCard className="w-3.5 h-3.5 text-slate-500" />;
    case 'BANK_TRANSFER': return <Landmark className="w-3.5 h-3.5 text-slate-500" />;
    case 'CHEQUE': return <FileText className="w-3.5 h-3.5 text-slate-500" />;
    case 'ONLINE': return <Globe className="w-3.5 h-3.5 text-slate-500" />;
    default: return <Banknote className="w-3.5 h-3.5 text-slate-500" />; // CASH / OTHER
  }
}
const MethodCell: React.FC<{ method: string }> = ({ method }) => (
  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
    {methodIcon(method)}{method.replace('_', ' ')}
  </span>
);

interface KpiCardProps {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  accent?: 'danger';
}
const KpiCard: React.FC<KpiCardProps> = ({ icon, tint, label, value, sub, loading, accent }) => (
  <Card className={`p-3 bg-white shadow-xs ${accent === 'danger' ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-200'}`}>
    <div className="flex items-center gap-2.5">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-[10px] font-bold uppercase tracking-wide truncate ${accent === 'danger' ? 'text-red-500' : 'text-slate-500'}`}>{label}</p>
        {loading ? (
          <Skeleton className="h-5 w-16 mt-0.5" />
        ) : (
          <p className={`font-display font-extrabold text-base leading-tight ${accent === 'danger' ? 'text-red-600' : 'text-[#0B0E23]'}`}>{value}</p>
        )}
        {sub && !loading && <p className="text-[10px] text-slate-400 font-medium leading-tight">{sub}</p>}
      </div>
    </div>
  </Card>
);

/** Labeled compact field wrapper so native date/month inputs never show a bare
 *  dd-mm-yyyy placeholder alone — the label names the control. */
const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={`flex items-center gap-1.5 h-9 px-2 rounded-lg border border-slate-200 bg-white ${className || ''}`}>
    <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">{label}</span>
    {children}
  </div>
);

/** Toolbar shared by both tabs: search + day/month/year + status + Apply/Clear. */
interface ToolbarProps {
  search: string;
  onSearch: (v: string) => void;
  day: string;
  onDay: (v: string) => void;
  month: string;
  onMonth: (v: string) => void;
  year: string;
  onYear: (v: string) => void;
  status: string;
  statusOptions: { value: string; label: string }[];
  onStatus: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
}
const FilterToolbar: React.FC<ToolbarProps> = (p) => (
  <Card className="p-3 bg-white border-slate-200 shadow-xs">
    <div className="flex flex-wrap xl:flex-nowrap gap-2 items-center">
      <div className="relative flex-1 min-w-[12rem]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={p.search}
          onChange={(e) => p.onSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && p.onApply()}
          placeholder="Search by customer, invoice, mobile, payment ID..."
          className="pl-9 h-9"
        />
      </div>
      <Field label="Date">
        <input type="date" value={p.day} onChange={(e) => p.onDay(e.target.value)} className="h-full w-[7.5rem] bg-transparent text-xs text-slate-600 outline-none" />
      </Field>
      <Field label="Month">
        <input type="month" value={p.month} onChange={(e) => p.onMonth(e.target.value)} className="h-full w-[6.5rem] bg-transparent text-xs text-slate-600 outline-none" />
      </Field>
      <Field label="Year">
        <input type="number" value={p.year} onChange={(e) => p.onYear(e.target.value)} placeholder="—" className="h-full w-[3.5rem] bg-transparent text-xs text-slate-600 outline-none" />
      </Field>
      <Select value={p.status} onChange={(e) => p.onStatus(e.target.value)} className="h-9 w-32 shrink-0">
        {p.statusOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
      <Button size="sm" className="h-9 bg-gold hover:bg-gold-dark text-white shrink-0" onClick={p.onApply}>
        <Filter className="w-3.5 h-3.5 mr-1.5" /> Apply
      </Button>
      <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={p.onClear}>
        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Clear
      </Button>
    </div>
  </Card>
);

/** Status sub-tab pills (All / Paid / Partial / ...) with live counts. */
interface StatusPill { key: string; label: string; count?: number; color: string; }
const StatusTabs: React.FC<{ tabs: StatusPill[]; active: string; onChange: (k: string) => void }> = ({ tabs, active, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {tabs.map((t) => {
      const on = t.key === active;
      return (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
            on ? 'bg-gold text-white border-gold' : `bg-white ${t.color} border-slate-200 hover:border-slate-300`
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${on ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>
              {t.count.toLocaleString('en-IN')}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

/** Page numbers with intelligent ellipsis: 1 … p-1 p p+1 … last. */
function pageList(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(pages - 1, page + 1);
  if (lo > 2) out.push('…');
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 1) out.push('…');
  out.push(pages);
  return out;
}

const Pagination: React.FC<{ page: number; total: number; onPage: (p: number) => void }> = ({ page, total, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total === 0) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-slate-100">
      <p className="text-[11px] text-slate-500 font-medium">
        Showing {from} to {to} of {total.toLocaleString('en-IN')} entries
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1.5 text-[11px] text-slate-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`min-w-[1.9rem] h-[1.9rem] rounded-lg text-[11px] font-bold border transition-colors ${
                p === page ? 'bg-gold text-white border-gold' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const SALE_BADGE: Record<SalePaymentStatus, 'success' | 'pending' | 'danger' | 'gold' | 'neutral'> = {
  PAID: 'success',
  PARTIAL: 'gold',
  PENDING: 'pending',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'neutral',
};
const SCHEME_BADGE: Record<PaymentStatus, 'success' | 'pending' | 'danger' | 'gold' | 'neutral'> = {
  SUCCESS: 'success',
  PENDING: 'pending',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'gold',
};

/* ================================================================== */
/* BUSINESS PAYMENTS TAB                                               */
/* ================================================================== */

const BUSINESS_STATUS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Status' },
  { value: 'PAID', label: 'Paid' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'OUTSTANDING', label: 'Outstanding' },
];

function BusinessPayments() {
  const [search, setSearch] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);

  // committed filters (only change on Apply / status-tab / page)
  const [applied, setApplied] = useState({ search: '', from: '' as string | undefined, to: '' as string | undefined });

  const [rows, setRows] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [counts, setCounts] = useState<{ all: number; paid: number; partial: number; pending: number } | null>(null);
  const [detail, setDetail] = useState<Sale | null>(null);

  const seq = useRef(0);

  const loadList = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const outstanding = status === 'OUTSTANDING';
      const res = await billingService.listSales({
        page,
        limit: PAGE_SIZE,
        search: applied.search || undefined,
        dateFrom: applied.from,
        dateTo: applied.to,
        paymentStatus: status === 'ALL' || outstanding ? undefined : (status as SalePaymentStatus),
      });
      if (id !== seq.current) return;
      const list = outstanding ? res.sales.filter((s) => s.amountOutstanding > 0) : res.sales;
      setRows(list);
      setTotal(outstanding ? list.length : res.total);
    } catch (err) {
      if (id !== seq.current) return;
      setError(err instanceof ApiError ? err.message : 'Could not load payments.');
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [page, status, applied]);

  const loadCounts = useCallback(async () => {
    try {
      const base = { limit: 1, dateFrom: applied.from, dateTo: applied.to };
      const [all, paid, partial, pending] = await Promise.all([
        billingService.listSales({ ...base }),
        billingService.listSales({ ...base, paymentStatus: 'PAID' }),
        billingService.listSales({ ...base, paymentStatus: 'PARTIAL' }),
        billingService.listSales({ ...base, paymentStatus: 'PENDING' }),
      ]);
      setCounts({ all: all.total, paid: paid.total, partial: partial.total, pending: pending.total });
    } catch {
      setCounts(null);
    }
  }, [applied]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const apply = () => {
    const { from, to } = resolveDateRange(day, month, year);
    setPage(1);
    setApplied({ search: search.trim(), from, to });
  };
  const clear = () => {
    setSearch(''); setDay(''); setMonth(''); setYear(''); setStatus('ALL'); setPage(1);
    setApplied({ search: '', from: undefined, to: undefined });
  };

  const outstandingCount = counts ? counts.partial + counts.pending : undefined;
  const statusTabs: StatusPill[] = [
    { key: 'ALL', label: 'All Payments', count: counts?.all, color: 'text-slate-700' },
    { key: 'PAID', label: 'Paid / Completed', count: counts?.paid, color: 'text-emerald-600' },
    { key: 'PARTIAL', label: 'Partial', count: counts?.partial, color: 'text-gold-dark' },
    { key: 'PENDING', label: 'Pending', count: counts?.pending, color: 'text-sky-600' },
    { key: 'OUTSTANDING', label: 'Outstanding', count: outstandingCount, color: 'text-red-600' },
  ];

  return (
    <div className="space-y-3">
      {/* status pills → KPI cards → toolbar → table → pagination */}
      <StatusTabs tabs={statusTabs} active={status} onChange={(k) => { setStatus(k); setPage(1); }} />

      {/* KPI cards — real counts (backend has no ₹ aggregate for sales) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <KpiCard icon={<Wallet className="w-4 h-4 text-slate-600" />} tint="bg-slate-100" label="Total Sales" value={(counts?.all ?? 0).toLocaleString('en-IN')} loading={!counts} />
        <KpiCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} tint="bg-emerald-50" label="Paid / Completed" value={(counts?.paid ?? 0).toLocaleString('en-IN')} loading={!counts} />
        <KpiCard icon={<Clock className="w-4 h-4 text-gold-dark" />} tint="bg-gold/10" label="Partial" value={(counts?.partial ?? 0).toLocaleString('en-IN')} loading={!counts} />
        <KpiCard icon={<Clock className="w-4 h-4 text-sky-600" />} tint="bg-sky-50" label="Pending" value={(counts?.pending ?? 0).toLocaleString('en-IN')} loading={!counts} />
        <KpiCard icon={<AlertTriangle className="w-4 h-4 text-red-600" />} tint="bg-red-50" label="Outstanding" value={(outstandingCount ?? 0).toLocaleString('en-IN')} loading={!counts} />
      </div>

      <FilterToolbar
        search={search} onSearch={setSearch}
        day={day} onDay={setDay} month={month} onMonth={setMonth} year={year} onYear={setYear}
        status={status} statusOptions={BUSINESS_STATUS} onStatus={(v) => { setStatus(v); setPage(1); }}
        onApply={apply} onClear={clear}
      />

      {loading && <Skeleton className="h-72 w-full rounded-2xl" />}

      {!loading && error && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{error}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadList}>Retry</Button>
        </Card>
      )}

      {!loading && !error && rows.length === 0 && (
        <EmptyState icon={<Receipt className="h-7 w-7 text-gold" />} title="No business payments found" description="No sales match the current filters." />
      )}

      {!loading && !error && rows.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="px-3 py-2.5 w-8">#</th>
                  <th className="px-3 py-2.5">Payment ID / Invoice</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5 text-right">Paid</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5 text-right">Outstanding</th>
                  <th className="px-3 py-2.5">Method</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="font-medium text-slate-700">
                {rows.map((s, i) => {
                  const { d, t } = fmtDateTime(s.saleTimestamp);
                  return (
                    <tr key={s.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-gold/5 transition-colors">
                      <td className="px-3 py-2.5 text-slate-400 font-mono">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-[#0B0E23]">{s.invoiceNumber}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold">{s.customerName || 'Walk-in'}</div>
                        {s.customerPhone && <div className="text-[10px] text-slate-400">{s.customerPhone}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-[#0B0E23]">{inr(s.finalAmount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-700">{inr(s.amountPaid)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant={SALE_BADGE[s.paymentStatus]} className="text-[10px]" dot>{s.paymentStatus}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-red-600">{s.amountOutstanding > 0 ? inr(s.amountOutstanding) : '—'}</td>
                      <td className="px-3 py-2.5"><MethodCell method={s.paymentMethod} /></td>
                      <td className="px-3 py-2.5 text-slate-600">
                        <div>{d}</div><div className="text-[10px] text-slate-400">{t}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => setDetail(s)} className="p-1.5 text-slate-400 hover:text-gold hover:bg-gold/10 rounded-lg transition-colors" title="View">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {status !== 'OUTSTANDING' && <Pagination page={page} total={total} onPage={setPage} />}
        </Card>
      )}

      {/* Business payment detail — read-only, uses already-loaded row data */}
      <Dialog isOpen={!!detail} onClose={() => setDetail(null)} title={detail ? `Invoice ${detail.invoiceNumber}` : ''}>
        {detail && (
          <div className="space-y-2.5 text-xs">
            {[
              ['Customer', detail.customerName || 'Walk-in'],
              ['Phone', detail.customerPhone || '—'],
              ['Product', `${detail.productName} (${detail.productCode})`],
              ['Total Amount', formatCurrency(detail.finalAmount)],
              ['Paid', formatCurrency(detail.amountPaid)],
              ['Outstanding', formatCurrency(detail.amountOutstanding)],
              ['Method', detail.paymentMethod.replace('_', ' ')],
              ['Status', detail.paymentStatus],
              ['Date', new Date(detail.saleTimestamp).toLocaleString('en-IN')],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-1.5">
                <span className="text-slate-500 font-semibold">{k}</span>
                <span className="font-bold text-[#0B0E23] text-right">{v}</span>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => setDetail(null)}>Close</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

/* ================================================================== */
/* SCHEME PAYMENTS TAB (preserves existing manual-payment logic)      */
/* ================================================================== */

const METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'ONLINE'];
// Scheme payments are collected in-person or online and recorded as completed
// transactions; the app has no partial/pending installment concept. Only the
// statuses the backend actually produces are offered here.
const SCHEME_STATUS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Payments' },
  { value: 'SUCCESS', label: 'Completed / Paid' },
];
const EMPTY_FORM: ManualPaymentFormData = { enrollmentId: '', amount: 0, paymentMethod: 'CASH', remarks: '' };

function SchemePayments() {
  const router = useRouter();

  const [all, setAll] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Aggregate ₹ currently overdue across all active scheme enrollments,
  // derived from the enrollment schedule + monthsPaid (no backend aggregate).
  const [overdueAmount, setOverdueAmount] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState({ search: '', from: '' as string | undefined, to: '' as string | undefined });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ManualPaymentFormData>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setAll(await paymentService.getAdminPayments());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load payments.');
    } finally {
      setLoading(false);
    }
  };

  // Overdue aggregate: for each ACTIVE enrollment count schedule slots
  // (joinedDate + i months) already due but not covered by monthsPaid, times
  // the monthly amount. Enrollment list is one call — no per-passbook N+1.
  const loadOverdue = async () => {
    try {
      const enrollments = await enrollmentService.getAdminEnrollments();
      const now = new Date();
      let sum = 0;
      for (const e of enrollments) {
        if (e.status !== 'ACTIVE') continue;
        const monthly = e.monthlyAmount || 0;
        const duration = e.durationMonths || 0;
        let dueByNow = 0;
        for (let i = 0; i < duration; i++) if (addMonths(e.joinedDate, i) <= now) dueByNow++;
        const overdueInst = Math.max(0, dueByNow - (e.monthsPaid || 0));
        sum += monthly * overdueInst;
      }
      setOverdueAmount(sum);
    } catch {
      setOverdueAmount(null);
    }
  };

  useEffect(() => { loadPayments(); loadOverdue(); }, []);

  // client-side filter (full list is returned by the backend)
  const filtered = all.filter((p) => {
    if (status !== 'ALL' && p.paymentStatus !== status) return false;
    if (applied.from && p.paymentDate.slice(0, 10) < applied.from) return false;
    if (applied.to && p.paymentDate.slice(0, 10) > applied.to) return false;
    if (applied.search) {
      const q = applied.search.toLowerCase();
      if (
        !p.paymentReference.toLowerCase().includes(q) &&
        !p.customerName.toLowerCase().includes(q) &&
        !p.enrollmentNumber.toLowerCase().includes(q) &&
        !p.schemeName.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const totalCount = all.length;
  const successRows = all.filter((p) => p.paymentStatus === 'SUCCESS');
  const successCount = successRows.length;
  const sumSuccess = successRows.reduce((a, p) => a + p.amount, 0);

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const apply = () => {
    const { from, to } = resolveDateRange(day, month, year);
    setPage(1);
    setApplied({ search: search.trim(), from, to });
  };
  const clear = () => {
    setSearch(''); setDay(''); setMonth(''); setYear(''); setStatus('ALL'); setPage(1);
    setApplied({ search: '', from: undefined, to: undefined });
  };

  const openRecordDialog = () => { setForm(EMPTY_FORM); setFieldErrors({}); setFormError(''); setDialogOpen(true); };

  const handleSave = async () => {
    setFieldErrors({}); setFormError('');
    if (!form.enrollmentId.trim()) { setFieldErrors({ enrollmentId: 'Enrollment number is required' }); return; }
    if (!form.amount || form.amount <= 0) { setFieldErrors({ amount: 'Enter an amount greater than ₹0' }); return; }
    setSaving(true);
    try {
      await paymentService.recordManualPayment(form);
      setToast({ message: 'Payment recorded successfully', type: 'success' });
      setDialogOpen(false);
      await loadPayments();
    } catch (err) {
      if (err instanceof ApiError && err.errors.length > 0) {
        const next: Record<string, string> = {};
        let banner = '';
        const fieldMap: Record<string, string> = { enrollment_id: 'enrollmentId', amount: 'amount', payment_method: 'paymentMethod', payment_status: 'paymentStatus' };
        for (const e of err.errors) {
          const mapped = e.field ? fieldMap[e.field] : undefined;
          if (mapped) next[mapped] = e.message || 'Invalid value';
          else banner = e.message || err.message;
        }
        setFieldErrors(next);
        setFormError(Object.keys(next).length === 0 ? (banner || err.message) : '');
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Could not record payment. Please try again.');
      }
      setToast({ message: 'Could not record payment', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* KPI cards: total, completed/paid, and the prominent overdue aggregate */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <KpiCard icon={<Coins className="w-4 h-4 text-gold-dark" />} tint="bg-gold/10" label="Total Scheme Payments" value={totalCount.toLocaleString('en-IN')} loading={loading} />
        <KpiCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} tint="bg-emerald-50" label="Completed / Paid" value={successCount.toLocaleString('en-IN')} sub={inr(sumSuccess)} loading={loading} />
        <KpiCard
          icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
          tint="bg-red-50"
          label="Overdue Amount"
          value={overdueAmount === null ? '—' : inr(overdueAmount)}
          sub="Across active enrollments"
          loading={overdueAmount === null}
          accent="danger"
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={openRecordDialog} size="sm" className="bg-gold hover:bg-gold-dark text-white font-bold h-9">
          <Plus className="w-4 h-4 mr-1.5" /> Record Manual Payment
        </Button>
      </div>

      <FilterToolbar
        search={search} onSearch={setSearch}
        day={day} onDay={setDay} month={month} onMonth={setMonth} year={year} onYear={setYear}
        status={status} statusOptions={SCHEME_STATUS} onStatus={(v) => { setStatus(v); setPage(1); }}
        onApply={apply} onClear={clear}
      />

      <div className="flex items-center gap-2 pt-1">
        <Receipt className="w-4 h-4 text-gold" />
        <h2 className="font-display font-bold text-sm text-[#0B0E23]">Scheme Payment History</h2>
      </div>

      {loading && <Skeleton className="h-72 w-full rounded-2xl" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadPayments}>Retry</Button>
        </Card>
      )}

      {!loading && !loadError && all.length === 0 && (
        <EmptyState
          icon={<Receipt className="h-7 w-7 text-gold" />}
          title="No payments recorded yet"
          description="Record a manual payment for a customer's enrollment to see it here."
          actionLabel="Record Manual Payment"
          onAction={openRecordDialog}
        />
      )}

      {!loading && !loadError && all.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="px-3 py-2.5 w-8">#</th>
                  <th className="px-3 py-2.5">Payment ID</th>
                  <th className="px-3 py-2.5">Enrollment</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Scheme</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5">Method</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="font-medium text-slate-700">
                {paged.map((p, i) => {
                  const { d, t } = fmtDateTime(p.paymentDate);
                  return (
                    <tr key={p.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-gold/5 transition-colors">
                      <td className="px-3 py-2.5 text-slate-400 font-mono">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-[#0B0E23]">{p.paymentReference}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-600">{p.enrollmentNumber}</td>
                      <td className="px-3 py-2.5 font-semibold">{p.customerName}</td>
                      <td className="px-3 py-2.5">{p.schemeName}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-[#0B0E23]">{inr(p.amount)}</td>
                      <td className="px-3 py-2.5 text-center"><Badge variant={SCHEME_BADGE[p.paymentStatus]} className="text-[10px]" dot>{p.paymentStatus}</Badge></td>
                      <td className="px-3 py-2.5"><MethodCell method={p.paymentMethod} /></td>
                      <td className="px-3 py-2.5 text-slate-600"><div>{d}</div><div className="text-[10px] text-slate-400">{t}</div></td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => router.push(`/admin/payments/${p.id}`)} className="p-1.5 text-slate-400 hover:text-gold hover:bg-gold/10 rounded-lg transition-colors" title="View Details">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > PAGE_SIZE && <Pagination page={page} total={total} onPage={setPage} />}
          {paged.length === 0 && <div className="p-8 text-center text-xs text-slate-400 font-medium">No payments match the current filters.</div>}
        </Card>
      )}

      {/* RECORD MANUAL PAYMENT DIALOG — unchanged logic */}
      <Dialog isOpen={dialogOpen} onClose={() => !saving && setDialogOpen(false)} title="Record Manual Payment">
        <div className="space-y-3.5 text-xs">
          {formError && (
            <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>
          )}
          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Enrollment Number *</label>
            <Input
              error={!!fieldErrors.enrollmentId}
              value={form.enrollmentId}
              onChange={(e) => setForm((f) => ({ ...f, enrollmentId: e.target.value }))}
              placeholder="ENR-260819-7BF03A"
              className="font-mono"
            />
            {fieldErrors.enrollmentId && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.enrollmentId}</p>}
            <p className="text-[10px] text-slate-400">Enter the enrollment number shown on the customer&apos;s enrollment in the Enrollments tab.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Amount (₹) *</label>
              <Input type="number" error={!!fieldErrors.amount} value={form.amount || ''} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
              {fieldErrors.amount && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.amount}</p>}
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Method *</label>
              <Select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))}>
                {METHODS.map((m) => (<option key={m} value={m}>{m.replace('_', ' ')}</option>))}
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Advance (months)</label>
            <Select value={String(form.monthsCovered ?? 1)} onChange={(e) => setForm((f) => ({ ...f, monthsCovered: Number(e.target.value) as 1 | 3 | 6 }))}>
              <option value="1">1 month (regular)</option>
              <option value="3">3 months (advance)</option>
              <option value="6">6 months (advance)</option>
            </Select>
            {(form.monthsCovered ?? 1) > 1 && (
              <p className="text-[11px] text-slate-500">Advance: amount must equal monthly × {form.monthsCovered}. One transaction, {form.monthsCovered} installments covered.</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Remarks</label>
            <Input value={form.remarks || ''} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="e.g. Counter cash collection" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" isLoading={saving} onClick={handleSave}>Record Payment</Button>
        </DialogFooter>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ================================================================== */
/* PAGE SHELL — main tab switch                                        */
/* ================================================================== */

export default function AdminPaymentsPage() {
  const [tab, setTab] = useState<MainTab>('business');

  return (
    <div className="space-y-5 animate-in fade-in duration-300 font-body">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">Payments</h1>
        <p className="text-xs text-slate-500 mt-0.5 font-medium">View and manage all business and scheme payments.</p>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setTab('business')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
              tab === 'business' ? 'bg-gold text-white border-gold' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Package className="w-4 h-4" /> Product / Business Payments
          </button>
          <button
            onClick={() => setTab('scheme')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
              tab === 'scheme' ? 'bg-gold text-white border-gold' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Coins className="w-4 h-4" /> Scheme Payments
          </button>
        </div>
      </div>

      {tab === 'business' ? <BusinessPayments /> : <SchemePayments />}
    </div>
  );
}
