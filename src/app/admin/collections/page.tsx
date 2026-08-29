"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Toast } from '@/components/ui/toast';
import { formatCurrency } from '@/lib/formatters';
import {
  Users, CheckCircle2, AlertTriangle, Wallet, CircleDot,
  Search, RotateCcw, Eye, AlarmClock, Plus,
} from 'lucide-react';
import { enrollmentService, AdminEnrollment } from '@/services/enrollmentService';
import { collectionsService, CollectionItem, reportService, ReportPeriod } from '@/services/reportService';
import { passbookService, Passbook } from '@/services/passbookService';
import { ApiError } from '@/lib/apiClient';
import RecordManualPaymentDialog from '../payments/_components/RecordManualPaymentDialog';

/* ------------------------------------------------------------------ */
/* Collection operational status — derived, separate from the enrollment
 * LIFECYCLE status. Outstanding is a MONEY VALUE, never a status.      */
/* ------------------------------------------------------------------ */

type CollStatus = 'ON_TRACK' | 'OVERDUE' | 'COMPLETED';

interface Row {
  e: AdminEnrollment;
  coll?: CollectionItem;      // present only for overdue enrollments (/collections)
  monthly: number;
  totalInstallments: number;
  paidInstallments: number;
  totalDue: number;           // base/contractual maturity (backend)
  totalPaid: number;          // authoritative ledger sum (backend total_paid)
  outstanding: number;        // max(0, totalDue - totalPaid) — a money value
  status: CollStatus;
  overdueDays: number | null;
}

function classify(e: AdminEnrollment, coll?: CollectionItem): CollStatus {
  if (e.status !== 'ACTIVE') return 'COMPLETED'; // COMPLETED/REDEEMED/CLOSED/CANCELLED
  if (coll) return 'OVERDUE'; // /collections lists overdue enrollments only
  return 'ON_TRACK';
}

function buildRow(e: AdminEnrollment, coll?: CollectionItem): Row {
  const monthly = e.monthlyAmount || 0;
  const totalInstallments = e.durationMonths || 0;
  const paidInstallments = Math.min(e.monthsPaid || 0, totalInstallments || e.monthsPaid || 0);
  // Money comes ONLY from the backend: total_paid is the authoritative SUCCESS
  // ledger sum, totalDue is the contractual base maturity. Never monthly x months.
  const totalPaid = e.totalPaid || 0;
  const totalDue = e.maturityAmount || monthly * totalInstallments;
  const outstanding = Math.max(0, totalDue - totalPaid);
  return { e, coll, monthly, totalInstallments, paidInstallments, totalDue, totalPaid, outstanding, status: classify(e, coll), overdueDays: coll?.overdue_days ?? null };
}

const STATUS_META: Record<CollStatus, { label: string; variant: 'success' | 'danger' | 'neutral' }> = {
  ON_TRACK: { label: 'On Track', variant: 'success' },
  OVERDUE: { label: 'Overdue', variant: 'danger' },
  COMPLETED: { label: 'Completed', variant: 'neutral' },
};

function addMonths(iso: string, n: number): Date {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + n);
  return d;
}
const monthLabel = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/* Timeline — schedule (joinedDate + i months) vs monthsPaid (credited) + today. */
type SlotState = 'PAID' | 'OVERDUE' | 'UPCOMING';
interface Slot { label: string; amount: number; state: SlotState; }

function buildTimeline(row: Row): Slot[] {
  const { e, monthly, totalInstallments, paidInstallments } = row;
  const now = new Date();
  const slots: Slot[] = [];
  for (let i = 0; i < totalInstallments; i++) {
    const due = addMonths(e.joinedDate, i);
    let state: SlotState;
    if (i < paidInstallments) state = 'PAID';
    else if (due < now) state = 'OVERDUE';
    else state = 'UPCOMING';
    slots.push({ label: monthLabel(due), amount: monthly, state });
  }
  return slots.reverse(); // newest first
}

const SLOT_STYLE: Record<SlotState, { chip: string; text: string; label: string }> = {
  PAID: { chip: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Paid' },
  OVERDUE: { chip: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Overdue' },
  UPCOMING: { chip: 'bg-slate-50 border-slate-200', text: 'text-slate-500', label: 'Upcoming' },
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ON_TRACK', label: 'On Track' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'COMPLETED', label: 'Completed' },
];

// Period drives the authoritative Overall Collection KPI (reports engine).
// 'custom' switches to an explicit date_from/date_to range.
type PeriodMode = ReportPeriod | 'custom';
const PERIOD_OPTIONS: { value: PeriodMode; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

export default function AdminCollectionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');

  // Overall Collection (authoritative per-scheme totals for the selected period).
  const [periodMode, setPeriodMode] = useState<PeriodMode>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [overall, setOverall] = useState<number | null>(null);
  const [overallLoading, setOverallLoading] = useState(true);

  // Record Collection (customer-first) + success toast.
  const [recordOpen, setRecordOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // detail dialog + lazy passbook cache
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const [passbook, setPassbook] = useState<Passbook | null>(null);
  const [pbLoading, setPbLoading] = useState(false);
  const [pbError, setPbError] = useState('');
  const pbCache = useRef<Record<string, Passbook>>({});

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const [enrollments, collections] = await Promise.all([
        enrollmentService.getAdminEnrollments(),
        collectionsService.getCollections(),
      ]);
      const overdueMap = new Map(collections.map((c) => [c.enrollment_id, c]));
      setRows(enrollments.map((e) => buildRow(e, overdueMap.get(e.id))));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not load collections.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // Overall Collection = sum of authoritative per-scheme totals for the period
  // (or the explicit custom range). Backend-driven; the range actually filters.
  useEffect(() => {
    if (periodMode === 'custom' && (!customFrom || !customTo)) { setOverall(null); setOverallLoading(false); return; }
    let cancelled = false;
    setOverallLoading(true);
    const params = periodMode === 'custom'
      ? { dateFrom: customFrom, dateTo: customTo }
      : { period: periodMode };
    reportService.getSchemeSummary(params)
      .then((r) => { if (!cancelled) setOverall(r.schemes.reduce((a, s) => a + s.totalCollected, 0)); })
      .catch(() => { if (!cancelled) setOverall(null); })
      .finally(() => { if (!cancelled) setOverallLoading(false); });
    return () => { cancelled = true; };
  }, [periodMode, customFrom, customTo]);

  const openDetail = async (row: Row) => {
    setOpenRow(row);
    setPbError('');
    const cached = pbCache.current[row.e.id];
    if (cached) { setPassbook(cached); return; }
    setPassbook(null);
    setPbLoading(true);
    try {
      const pb = await passbookService.getAdminPassbook(row.e.id);
      pbCache.current[row.e.id] = pb;
      setPassbook(pb);
    } catch (e) {
      setPbError(e instanceof ApiError ? e.message : 'Could not load payment history.');
    } finally {
      setPbLoading(false);
    }
  };

  const handleRecorded = () => {
    setToast({ message: 'Collection recorded successfully', type: 'success' });
    pbCache.current = {}; // invalidate cached timelines; balances changed
    load();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'ALL' && r.status !== status) return false;
      if (!q) return true;
      return (
        (r.e.customerName || '').toLowerCase().includes(q) ||
        (r.e.schemeName || '').toLowerCase().includes(q) ||
        r.e.enrollmentNumber.toLowerCase().includes(q)
      );
    });
  }, [rows, search, status]);

  const kpis = useMemo(() => {
    const active = rows.filter((r) => r.e.status === 'ACTIVE');
    return {
      total: rows.length,
      onTrack: rows.filter((r) => r.status === 'ON_TRACK').length,
      overdue: rows.filter((r) => r.status === 'OVERDUE').length,
      outstanding: active.reduce((a, r) => a + r.outstanding, 0),
    };
  }, [rows]);

  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === periodMode)?.label;

  return (
    <div className="space-y-5 animate-in fade-in duration-300 font-body">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">Collections</h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Full scheme collection status per enrollment — installments paid, outstanding and overdue timeline.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="h-9 w-36">
            {PERIOD_OPTIONS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
          </Select>
          {periodMode === 'custom' && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-40" />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-40" />
            </>
          )}
          <Button size="sm" onClick={() => setRecordOpen(true)} className="bg-gold hover:bg-gold-dark text-white font-bold h-9">
            <Plus className="w-4 h-4 mr-1.5" /> Record Collection
          </Button>
          <Button size="sm" variant="outline" onClick={load} isLoading={loading}>Refresh</Button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon={<Users className="w-[18px] h-[18px] text-slate-600" />} tint="bg-slate-100" label="Total Enrollments" value={kpis.total.toLocaleString('en-IN')} loading={loading} />
        <KpiCard icon={<CheckCircle2 className="w-[18px] h-[18px] text-emerald-600" />} tint="bg-emerald-50" label="On Track" value={kpis.onTrack.toLocaleString('en-IN')} loading={loading} />
        <KpiCard icon={<AlertTriangle className="w-[18px] h-[18px] text-red-600" />} tint="bg-red-50" label="Overdue" value={kpis.overdue.toLocaleString('en-IN')} loading={loading} />
        <KpiCard icon={<Wallet className="w-[18px] h-[18px] text-gold-dark" />} tint="bg-gold/10" label="Outstanding (Active)" value={formatCurrency(kpis.outstanding)} loading={loading} />
        <KpiCard icon={<CircleDot className="w-[18px] h-[18px] text-blue-600" />} tint="bg-blue-50" label={`Overall Collection (${periodLabel})`} value={overall === null ? '—' : formatCurrency(overall)} loading={overallLoading} />
      </div>

      {/* TOOLBAR */}
      <Card className="p-3 bg-white border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, scheme, enrollment no..." className="pl-9 h-9" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-40">
            {STATUS_FILTERS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </Select>
          <Button size="sm" variant="outline" className="h-9" onClick={() => { setSearch(''); setStatus('ALL'); }}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Clear
          </Button>
        </div>
      </Card>

      {loading && <Skeleton className="h-72 w-full rounded-2xl" />}

      {!loading && err && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{err}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button>
        </Card>
      )}

      {!loading && !err && rows.length === 0 && (
        <EmptyState icon={<AlarmClock className="h-7 w-7 text-gold" />} title="No enrollments" description="No scheme enrollments to show yet." />
      )}

      {!loading && !err && rows.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-3.5">Customer</th>
                  <th className="p-3.5">Scheme</th>
                  <th className="p-3.5 text-right">Installment</th>
                  <th className="p-3.5 text-center">Paid</th>
                  <th className="p-3.5 text-right">Total Paid</th>
                  <th className="p-3.5 text-right">Outstanding</th>
                  <th className="p-3.5 text-center">Next Due</th>
                  <th className="p-3.5 text-center">Overdue</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-center">Timeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filtered.map((r) => {
                  const sm = STATUS_META[r.status];
                  return (
                    <tr key={r.e.id} className="hover:bg-slate-50/80 transition-colors cursor-pointer" onClick={() => openDetail(r)}>
                      <td className="p-3.5">
                        <div className="font-bold text-[#0B0E23]">{r.e.customerName || '—'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{r.e.enrollmentNumber}</div>
                      </td>
                      <td className="p-3.5">{r.e.schemeName || '—'}</td>
                      <td className="p-3.5 text-right font-mono">{formatCurrency(r.monthly)}</td>
                      <td className="p-3.5 text-center font-semibold">{r.paidInstallments}/{r.totalInstallments}</td>
                      <td className="p-3.5 text-right font-mono text-emerald-700">{formatCurrency(r.totalPaid)}</td>
                      <td className="p-3.5 text-right font-mono text-red-600">{r.outstanding > 0 ? formatCurrency(r.outstanding) : '—'}</td>
                      <td className="p-3.5 text-center text-slate-600">{r.e.nextDueDate ? dateLabel(r.e.nextDueDate) : '—'}</td>
                      <td className="p-3.5 text-center">
                        {r.overdueDays != null ? (
                          <Badge variant={r.overdueDays >= 10 ? 'danger' : 'warn'} className="text-[10px]">{r.overdueDays}d</Badge>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="p-3.5 text-center"><Badge variant={sm.variant} className="text-[10px]" dot>{sm.label}</Badge></td>
                      <td className="p-3.5 text-center">
                        <button onClick={(ev) => { ev.stopPropagation(); openDetail(r); }} className="p-1.5 text-slate-400 hover:text-gold hover:bg-gold/10 rounded-lg transition-colors" title="View timeline">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="p-8 text-center text-xs text-slate-400 font-medium">No enrollments match the current filters.</div>}
        </Card>
      )}

      {/* DETAIL — payment timeline (lazy passbook) */}
      <Dialog isOpen={!!openRow} onClose={() => setOpenRow(null)} title={openRow ? `${openRow.e.customerName || 'Customer'} — ${openRow.e.schemeName || 'Scheme'}` : ''}>
        {openRow && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MiniStat label="Installment" value={formatCurrency(openRow.monthly)} />
              <MiniStat label="Paid" value={`${openRow.paidInstallments}/${openRow.totalInstallments}`} />
              <MiniStat
                label="Total Paid"
                value={formatCurrency(passbook?.balance?.totalPaid ?? passbook?.summary.totalAmountPaid ?? openRow.totalPaid)}
              />
              <MiniStat label="Outstanding" value={formatCurrency(openRow.outstanding)} tone="danger" />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-semibold">
                Last payment:{' '}
                <span className="text-[#0B0E23] font-bold">
                  {passbook && passbook.entries.length > 0 ? dateLabel(passbook.entries[passbook.entries.length - 1].entryDate) : '—'}
                </span>
              </span>
              <span className="text-slate-400">Enrollment {openRow.e.enrollmentNumber}</span>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <CircleDot className="w-3.5 h-3.5" /> Payment Timeline
              </div>
              {pbLoading && <Skeleton className="h-40 w-full" />}
              {!pbLoading && pbError && <p className="text-red-600 font-medium">{pbError}</p>}
              {!pbLoading && (
                <div className="max-h-72 overflow-y-auto pr-1 space-y-1.5">
                  {buildTimeline(openRow).map((s, i) => {
                    const st = SLOT_STYLE[s.state];
                    return (
                      <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${st.chip}`}>
                        <span className="font-bold text-[#0B0E23]">{s.label}</span>
                        <div className="flex items-center gap-3">
                          <span className={`font-mono ${s.state === 'PAID' ? 'text-emerald-700' : 'text-slate-500'}`}>{formatCurrency(s.amount)}</span>
                          <span className={`text-[10px] font-extrabold uppercase ${st.text} w-16 text-right`}>{st.label}</span>
                        </div>
                      </div>
                    );
                  })}
                  {openRow.totalInstallments === 0 && <p className="text-slate-400">No schedule available for this enrollment.</p>}
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-2">
                Timeline reflects installments credited (months paid) against the enrollment schedule. Paid totals come from the passbook / contribution ledger.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => setOpenRow(null)}>Close</Button>
        </DialogFooter>
      </Dialog>

      <RecordManualPaymentDialog
        isOpen={recordOpen}
        onClose={() => setRecordOpen(false)}
        onRecorded={handleRecorded}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const KpiCard: React.FC<{ icon: React.ReactNode; tint: string; label: string; value: string; loading?: boolean }> = ({ icon, tint, label, value, loading }) => (
  <Card className="p-4 bg-white border-slate-200 shadow-xs">
    <div className="flex items-start gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-500 truncate">{label}</p>
        {loading ? <Skeleton className="h-6 w-20 mt-1" /> : <p className="font-display font-extrabold text-lg text-[#0B0E23] leading-tight">{value}</p>}
      </div>
    </div>
  </Card>
);

const MiniStat: React.FC<{ label: string; value: string; tone?: 'danger' }> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
    <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{label}</p>
    <p className={`font-display font-extrabold text-sm ${tone === 'danger' ? 'text-red-600' : 'text-[#0B0E23]'}`}>{value}</p>
  </div>
);
