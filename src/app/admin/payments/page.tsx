"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Toast } from '@/components/ui/toast';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/formatters';
import {
  Search,
  Filter,
  Plus,
  Receipt,
  Eye,
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  paymentService,
  AdminPayment,
  PaymentStatus,
} from '@/services/paymentService';
import { billingService, Sale, SalePaymentStatus } from '@/services/billingService';
import { ApiError } from '@/lib/apiClient';
import RecordManualPaymentDialog from './_components/RecordManualPaymentDialog';

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

type MainTab = 'business' | 'scheme';
const PAGE_SIZE = 10;

/* Business Payments period presets — reuse backend date_from/date_to. */
const BUSINESS_PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'custom', label: 'Custom' },
] as const;
type BusinessPeriod = (typeof BUSINESS_PERIODS)[number]['key'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** {from,to} (YYYY-MM-DD) for a preset. Custom returns the raw inputs. */
function businessPeriodRange(period: BusinessPeriod, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'custom') return { from: customFrom || undefined, to: customTo || undefined };
  if (period === 'today') return { from: ymd(today), to: ymd(today) };
  if (period === 'this_week') {
    const dow = (today.getDay() + 6) % 7; // Monday = 0
    const start = new Date(today); start.setDate(today.getDate() - dow);
    return { from: ymd(start), to: ymd(today) };
  }
  if (period === 'this_month') {
    return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
  }
  // last_month
  return {
    from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)),
  };
}

function fmtDateTime(iso: string): { d: string; t: string } {
  const dt = new Date(iso);
  return {
    d: dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    t: dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  };
}

/** Indian currency with 2 decimals. Presentation only — value never altered. */
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
  loading?: boolean;
  accent?: 'danger';
}
const KpiCard: React.FC<KpiCardProps> = ({ icon, tint, label, value, loading, accent }) => (
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
      </div>
    </div>
  </Card>
);

/** Labeled compact wrapper so native date inputs never show a bare placeholder. */
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-1.5 h-9 px-2 rounded-lg border border-slate-200 bg-white">
    <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">{label}</span>
    {children}
  </div>
);

/** The date-filter system for the Business Payments tab. */
function PeriodFilterBar(p: {
  search: string; onSearch: (v: string) => void;
  period: BusinessPeriod; onPeriod: (v: BusinessPeriod) => void;
  customFrom: string; onCustomFrom: (v: string) => void;
  customTo: string; onCustomTo: (v: string) => void;
  status: string; statusOptions: { value: string; label: string }[]; onStatus: (v: string) => void;
  onApply: () => void; onClear: () => void;
}) {
  return (
    <Card className="p-3 bg-white border-slate-200 shadow-xs">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && p.onApply()}
            placeholder="Search by customer, invoice, mobile..."
            className="pl-9 h-9"
          />
        </div>
        <Select value={p.status} onChange={(e) => p.onStatus(e.target.value)} className="h-9 w-36 shrink-0">
          {p.statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden">
          {BUSINESS_PERIODS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => p.onPeriod(b.key)}
              className={`px-3 py-2 text-xs font-bold transition-colors border-l first:border-l-0 border-slate-200 ${
                p.period === b.key ? 'bg-gold text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        {p.period === 'custom' && (
          <>
            <Field label="From">
              <input type="date" value={p.customFrom} onChange={(e) => p.onCustomFrom(e.target.value)} className="h-full w-[7.5rem] bg-transparent text-xs text-slate-600 outline-none" />
            </Field>
            <Field label="To">
              <input type="date" value={p.customTo} onChange={(e) => p.onCustomTo(e.target.value)} className="h-full w-[7.5rem] bg-transparent text-xs text-slate-600 outline-none" />
            </Field>
            <Button size="sm" className="h-9 bg-gold hover:bg-gold-dark text-white shrink-0" onClick={p.onApply}>
              <Filter className="w-3.5 h-3.5 mr-1.5" /> Apply
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={p.onClear}>Clear</Button>
      </div>
    </Card>
  );
}

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

/* Backend sale payment_status values: PAID | PENDING | PARTIAL | REFUNDED |
 * PARTIALLY_REFUNDED. String-keyed so it stays correct regardless of the
 * shared SalePaymentStatus alias. */
const SALE_BADGE: Record<string, 'success' | 'pending' | 'danger' | 'gold' | 'neutral'> = {
  PAID: 'success',
  PARTIAL: 'gold',
  PENDING: 'pending',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'neutral',
};

const STATUS_VARIANT: Record<PaymentStatus, 'success' | 'pending' | 'danger' | 'gold' | 'neutral'> = {
  SUCCESS: 'success',
  PENDING: 'pending',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'gold',
};

/* ================================================================== */
/* BUSINESS PAYMENTS TAB — read-only view over Sales (billingService). */
/* No payment-write workflow lives here; sale payments are captured at  */
/* sale finalize in New Sale/Billing.                                   */
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
  const [period, setPeriod] = useState<BusinessPeriod>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);

  // committed filters (change on Apply / period / status / page).
  const [applied, setApplied] = useState<{ search: string; from?: string; to?: string }>(() => {
    const r = businessPeriodRange('this_month', '', '');
    return { search: '', from: r.from, to: r.to };
  });

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
        billingService.listSales({ ...base, paymentStatus: 'PAID' as SalePaymentStatus }),
        billingService.listSales({ ...base, paymentStatus: 'PARTIAL' as SalePaymentStatus }),
        billingService.listSales({ ...base, paymentStatus: 'PENDING' as SalePaymentStatus }),
      ]);
      setCounts({ all: all.total, paid: paid.total, partial: partial.total, pending: pending.total });
    } catch {
      setCounts(null);
    }
  }, [applied]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Non-custom periods apply immediately; custom waits for Apply.
  const selectPeriod = (p: BusinessPeriod) => {
    setPeriod(p);
    if (p !== 'custom') {
      const { from, to } = businessPeriodRange(p, '', '');
      setPage(1);
      setApplied({ search: search.trim(), from, to });
    }
  };
  const apply = () => {
    const { from, to } = businessPeriodRange(period, customFrom, customTo);
    setPage(1);
    setApplied({ search: search.trim(), from, to });
  };
  const clear = () => {
    setSearch(''); setPeriod('this_month'); setCustomFrom(''); setCustomTo(''); setStatus('ALL'); setPage(1);
    const r = businessPeriodRange('this_month', '', '');
    setApplied({ search: '', from: r.from, to: r.to });
  };

  const outstandingCount = counts ? counts.partial + counts.pending : undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <KpiCard icon={<Wallet className="w-4 h-4 text-slate-600" />} tint="bg-slate-100" label="Total Sales" value={(counts?.all ?? 0).toLocaleString('en-IN')} loading={!counts} />
        <KpiCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} tint="bg-emerald-50" label="Paid / Completed" value={(counts?.paid ?? 0).toLocaleString('en-IN')} loading={!counts} />
        <KpiCard icon={<Clock className="w-4 h-4 text-gold-dark" />} tint="bg-gold/10" label="Partial" value={(counts?.partial ?? 0).toLocaleString('en-IN')} loading={!counts} />
        <KpiCard icon={<Clock className="w-4 h-4 text-sky-600" />} tint="bg-sky-50" label="Pending" value={(counts?.pending ?? 0).toLocaleString('en-IN')} loading={!counts} />
        <KpiCard icon={<AlertTriangle className="w-4 h-4 text-red-600" />} tint="bg-red-50" label="Outstanding" value={(outstandingCount ?? 0).toLocaleString('en-IN')} loading={!counts} accent="danger" />
      </div>

      <PeriodFilterBar
        search={search} onSearch={setSearch}
        period={period} onPeriod={selectPeriod}
        customFrom={customFrom} onCustomFrom={setCustomFrom}
        customTo={customTo} onCustomTo={setCustomTo}
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
                  <th className="px-3 py-2.5">Invoice</th>
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
                        <Badge variant={SALE_BADGE[s.paymentStatus] ?? 'neutral'} className="text-[10px]" dot>{s.paymentStatus}</Badge>
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
/* SCHEME PAYMENTS TAB — canonical customer-first manual payment.      */
/* Flow unchanged: customer → active enrollment → backend balance →    */
/* amount + method → POST /payments/manual.                            */
/* ================================================================== */

function SchemePayments() {
  const router = useRouter();

  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | PaymentStatus>('All');

  const [dialogOpen, setDialogOpen] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await paymentService.getAdminPayments();
      setPayments(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load payments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const filtered = payments.filter((p) => {
    const matchesSearch =
      p.paymentReference.toLowerCase().includes(search.toLowerCase()) ||
      p.customerName.toLowerCase().includes(search.toLowerCase()) ||
      p.enrollmentNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || p.paymentStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openRecordDialog = () => setDialogOpen(true);

  const handleRecorded = () => {
    setToast({ message: 'Payment recorded successfully', type: 'success' });
    loadPayments();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-500 font-medium">
          Scheme installment payments toward customer enrollments. Recorded manually (cash, bank transfer, cheque); a successful payment updates the enrollment, passbook and Collections.
        </p>
        <Button onClick={openRecordDialog} size="sm" className="bg-gold hover:bg-gold-dark text-white font-bold h-9 shrink-0">
          <Plus className="w-4 h-4 mr-1.5" /> Record Manual Payment
        </Button>
      </div>

      <Card className="p-4 bg-white border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, customer, or enrollment no..."
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | PaymentStatus)}
            className="w-40"
          >
            <option value="All">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
          </Select>
        </div>
      </Card>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadPayments}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && payments.length === 0 && (
        <EmptyState
          icon={<Receipt className="h-7 w-7 text-gold" />}
          title="No payments recorded yet"
          description="Record a manual payment for a customer's enrollment to see it here."
          actionLabel="Record Manual Payment"
          onAction={openRecordDialog}
        />
      )}

      {!loading && !loadError && payments.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-4">Reference No</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Scheme</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Method</th>
                  <th className="p-4 text-right">Amount</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-mono font-bold text-[#0B0E23]">{p.paymentReference}</td>
                    <td className="p-4 font-semibold">{p.customerName}</td>
                    <td className="p-4">{p.schemeName}</td>
                    <td className="p-4 text-slate-600">{new Date(p.paymentDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                    <td className="p-4 font-semibold text-slate-700">{p.paymentMethod.replace('_', ' ')}</td>
                    <td className="p-4 text-right font-mono font-bold text-[#0B0E23]">{formatCurrency(p.amount)}</td>
                    <td className="p-4 text-center">
                      <Badge variant={STATUS_VARIANT[p.paymentStatus]} className="text-[10px]" dot>
                        {p.paymentStatus}
                      </Badge>
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => router.push(`/admin/payments/${p.id}`)}
                        className="p-1.5 text-slate-400 hover:text-gold hover:bg-gold/10 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <RecordManualPaymentDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onRecorded={handleRecorded}
      />

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

export default function AdminPaymentsPage() {
  const [tab, setTab] = useState<MainTab>('business');

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* PAGE HEADER */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">Payments</h1>
        <p className="text-xs text-slate-500 mt-0.5 font-medium">
          Two distinct money flows: Business Payments received against jewellery sales, and Scheme Payments toward customer enrollments.
        </p>
        <div className="mt-4 flex gap-1 border-b border-slate-100 -mb-5">
          {([
            { key: 'business', label: 'Business Payments' },
            { key: 'scheme', label: 'Scheme Payments' },
          ] as { key: MainTab; label: string }[]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                tab === t.key ? 'border-gold text-[#0B0E23]' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'business' ? <BusinessPayments /> : <SchemePayments />}
    </div>
  );
}
