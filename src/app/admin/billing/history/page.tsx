"use client";

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Receipt, Search, FileX, Download, Wallet, Undo2, PackageCheck, Scale } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/form-controls';
import {
  billingService, Sale, PaymentMethod, SalePaymentHistory,
  PAYMENT_METHOD_OPTIONS, SALES_HISTORY_PERIODS, SalesHistoryPeriod,
  SalePaymentStatus, SaleStatus, SaleReturn, SaleReturnPreview, ReturnType,
  SalesExportField, PURITY_OPTIONS,
} from '@/services/billingService';
import { ApiError } from '@/lib/apiClient';
import { formatCurrency, formatWeight } from '@/lib/formatters';
import { PriceBreakdownCard } from '../_components/PriceBreakdownCard';
import { InvoiceActions } from '../_components/InvoiceActions';
import { useTenant } from '@/hooks/useTenant';

/* One screen, one set of filters — never duplicate pages. ALL sends no filter
 * at all; a payment tab filters on the ledger-derived payment status, a sale
 * tab filters on the sale lifecycle. The two are separate backend columns, so
 * a tab declares which one it targets rather than overloading a single field. */
type TabKey = 'ALL' | 'PAID' | 'PARTIAL' | 'PENDING' | 'RETURNED' | 'CANCELLED';

const STATUS_TABS: { value: TabKey; label: string; kind: 'all' | 'payment' | 'sale' }[] = [
  { value: 'ALL', label: 'All', kind: 'all' },
  { value: 'PAID', label: 'Paid', kind: 'payment' },
  { value: 'PARTIAL', label: 'Partial', kind: 'payment' },
  { value: 'PENDING', label: 'Pending', kind: 'payment' },
  { value: 'RETURNED', label: 'Returned', kind: 'sale' },
  { value: 'CANCELLED', label: 'Cancelled', kind: 'sale' },
];

function tabFilters(tab: TabKey): { paymentStatus?: SalePaymentStatus; saleStatus?: SaleStatus } {
  const entry = STATUS_TABS.find((t) => t.value === tab);
  if (!entry || entry.kind === 'all') return {};
  if (entry.kind === 'sale') return { saleStatus: tab as SaleStatus };
  return { paymentStatus: tab as SalePaymentStatus };
}

/* Payment status carries five values once returns exist; map each to a badge
 * tone in one place. */
function paymentTone(status: SalePaymentStatus): 'success' | 'warn' | 'pending' | 'danger' {
  if (status === 'PAID') return 'success';
  if (status === 'PARTIAL' || status === 'PARTIALLY_REFUNDED') return 'warn';
  if (status === 'REFUNDED') return 'danger';
  return 'pending';
}

/* Human label for a payment-ledger source. Scheme redemption and refunds are
 * never shown as ordinary cash. */
function sourceLabel(source: string): string {
  if (source === 'SCHEME_REDEMPTION') return 'Scheme Redemption';
  if (source === 'REFUND') return 'Refund';
  return 'Collection';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SalesHistoryPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  // Filter-aware gold-sold aggregate (current filters) + the global,
  // filter-independent total (unfiltered listSales, server aggregate).
  const [totalGoldSold, setTotalGoldSold] = useState(0);
  const [globalGoldSold, setGlobalGoldSold] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusTab, setStatusTab] = useState<TabKey>('ALL');
  const [period, setPeriod] = useState<SalesHistoryPeriod>('this_month');
  const [exporting, setExporting] = useState(false);
  // Product filters — backend-resolved (purity off the frozen sale snapshot;
  // category/subcategory via the linked inventory item). Category/subcategory
  // option lists are gathered from the global sales set, not the current page.
  const [fCategory, setFCategory] = useState('');
  const [fSubcategory, setFSubcategory] = useState('');
  const [fPurity, setFPurity] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [subcategoryOptions, setSubcategoryOptions] = useState<string[]>([]);

  /* Export / Report Builder. CA and Owner reuse the existing dedicated exports;
   * Custom sends a chosen field set that the backend re-authorizes. */
  const [exportOpen, setExportOpen] = useState(false);
  const [reportType, setReportType] = useState<'ca' | 'owner' | 'custom'>('owner');
  const [exportFields, setExportFields] = useState<SalesExportField[]>([]);
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([]);
  const CUSTOM_PRESET_KEY = 'dfx.salesExport.customPreset';

  const [selected, setSelected] = useState<Sale | null>(null);
  /* Payment ledger for the invoice open in the detail dialog. */
  const [history, setHistory] = useState<SalePaymentHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayIso());
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [payReference, setPayReference] = useState('');
  const [payError, setPayError] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  /* Return / cancellation. The preview is fetched from the backend so the
   * confirmation shows real figures, never anything computed in the browser. */
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnPreview, setReturnPreview] = useState<SaleReturnPreview | null>(null);
  const [returnRecord, setReturnRecord] = useState<SaleReturn | null>(null);
  const [returnType, setReturnType] = useState<ReturnType>('RETURN');
  const [returnReason, setReturnReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');
  const [refundReference, setRefundReference] = useState('');
  const [returnError, setReturnError] = useState('');
  const [returnSaving, setReturnSaving] = useState(false);
  const { branding } = useTenant();

  const loadSales = async (
    statusOverride?: TabKey,
    // Explicit product-filter values for calls that fire in the same tick as a
    // state reset (e.g. Clear), where reading the state would see stale values.
    filterOverride?: { category?: string; subcategory?: string; purity?: string },
  ) => {
    const status = statusOverride ?? statusTab;
    const cat = filterOverride ? filterOverride.category : fCategory;
    const sub = filterOverride ? filterOverride.subcategory : fSubcategory;
    const pur = filterOverride ? filterOverride.purity : fPurity;
    setLoading(true);
    setLoadError('');
    try {
      const res = await billingService.listSales({
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        category: cat || undefined,
        subcategory: sub || undefined,
        purity: pur || undefined,
        ...tabFilters(status),
        limit: 100,
      });
      setSales(res.sales);
      setTotal(res.total);
      setTotalGoldSold(res.totalGoldWeightGrams);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load sales history.');
    } finally {
      setLoading(false);
    }
  };

  // Global, filter-independent gold-sold total. One unfiltered call; the backend
  // returns the full aggregate regardless of page size, so filters never move it.
  const loadGlobalGold = async () => {
    try {
      // Unfiltered: backend returns the full gold aggregate regardless of limit.
      // The returned page also seeds the category/sub-category filter options.
      const res = await billingService.listSales({ limit: 100 });
      setGlobalGoldSold(res.totalGoldWeightGrams);
      const cats = Array.from(new Set(res.sales.map((s) => s.category).filter((c): c is string => !!c))).sort();
      const subs = Array.from(new Set(res.sales.map((s) => s.subcategory).filter((c): c is string => !!c))).sort();
      setCategoryOptions(cats);
      setSubcategoryOptions(subs);
    } catch { /* KPI best-effort; leave at 0 if unavailable */ }
  };

  useEffect(() => {
    loadSales();
    loadGlobalGold();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTab = (value: TabKey) => {
    setStatusTab(value);
    loadSales(value);
  };

  const openExport = async () => {
    setExportOpen(true);
    if (exportFields.length === 0) {
      try {
        const fields = await billingService.getSalesExportFields();
        setExportFields(fields);
        // Restore a saved custom preset, keeping only fields this user may pick.
        let preset: string[] = [];
        try {
          const raw = typeof window !== 'undefined' ? window.localStorage.getItem(CUSTOM_PRESET_KEY) : null;
          if (raw) preset = JSON.parse(raw);
        } catch { /* ignore malformed preset */ }
        const allowed = new Set(fields.map((f) => f.key));
        const restored = preset.filter((k) => allowed.has(k));
        setSelectedFieldKeys(restored.length ? restored : fields.filter((f) => !f.financial).map((f) => f.key));
      } catch {
        setExportFields([]);
      }
    }
  };

  const toggleField = (key: string) => {
    setSelectedFieldKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const saveCustomPreset = () => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CUSTOM_PRESET_KEY, JSON.stringify(selectedFieldKeys));
      }
    } catch { /* non-fatal */ }
  };

  const handleExport = async () => {
    setExporting(true);
    const common = {
      period,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
      ...tabFilters(statusTab),
    };
    try {
      if (reportType === 'ca') {
        await billingService.downloadCaExport({
          period,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
      } else if (reportType === 'custom') {
        await billingService.downloadCustomExport({ ...common, fields: selectedFieldKeys });
      } else {
        await billingService.downloadSalesHistoryExcel(common);
      }
      setExportOpen(false);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not export sales history.');
    } finally {
      setExporting(false);
    }
  };

  /* Opening an invoice always re-reads its ledger from the backend rather than
   * trusting the list row, so the paid/outstanding figures shown next to the
   * "Add Payment" form are current. */
  const openSale = async (sale: Sale) => {
    setSelected(sale);
    setHistory(null);
    setPayAmount('');
    setPayDate(todayIso());
    setPayMethod(sale.paymentMethod);
    setPayReference('');
    setPayError('');
    setReturnRecord(null);
    setReturnError('');
    setHistoryLoading(true);
    try {
      setHistory(await billingService.getPaymentHistory(sale.id));
      /* A reversed sale carries a return record; an intact one does not. */
      if (sale.saleStatus !== 'COMPLETED') {
        setReturnRecord(await billingService.getSaleReturn(sale.id));
      }
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'Could not load the payment history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeSale = () => {
    setSelected(null);
    setHistory(null);
    setReturnRecord(null);
  };

  /* Return / cancellation ------------------------------------------------
   * The dialog never decides what may be refunded: it asks the backend for the
   * impact, shows it, and sends back only the Admin's reason and refund
   * choice. The backend re-validates everything against the ledger. */
  const openReturn = async () => {
    if (!selected) return;
    setReturnOpen(true);
    setReturnPreview(null);
    setReturnRecord(null);
    setReturnType('RETURN');
    setReturnReason('');
    setRefundAmount('');
    setRefundReference('');
    setReturnError('');
    try {
      const preview = await billingService.previewSaleReturn(selected.id);
      setReturnPreview(preview);
      setRefundMethod(selected.paymentMethod);
      /* Default to refunding exactly what was collected — the outstanding
       * balance is written off, never refunded. */
      setRefundAmount(String(preview.maxRefundable));
    } catch (err) {
      setReturnError(err instanceof ApiError ? err.message : 'Could not load the return preview.');
    }
  };

  const closeReturn = () => {
    setReturnOpen(false);
    setReturnPreview(null);
    setReturnError('');
  };

  const handleProcessReturn = async () => {
    if (!selected || !returnPreview) return;
    if (returnReason.trim().length < 3) {
      setReturnError('A return reason is required.');
      return;
    }
    const refund = refundAmount.trim() === '' ? undefined : parseFloat(refundAmount);
    if (refund !== undefined && (isNaN(refund) || refund < 0)) {
      setReturnError('Enter a valid refund amount.');
      return;
    }
    setReturnError('');
    setReturnSaving(true);
    try {
      const record = await billingService.processSaleReturn(selected.id, {
        returnType,
        reason: returnReason.trim(),
        refundAmount: refund,
        refundMethod: refund && refund > 0 ? refundMethod : undefined,
        refundReferenceNo: refundReference.trim() || undefined,
      });
      setReturnRecord(record);
      setReturnOpen(false);
      /* Re-read both the invoice and the list from the backend rather than
       * patching statuses locally — the backend owns every derived figure. */
      const [refreshed, ledger] = await Promise.all([
        billingService.getSale(selected.id),
        billingService.getPaymentHistory(selected.id),
      ]);
      setSelected(refreshed);
      setHistory(ledger);
      setSales((prev) => prev.map((s) => (s.id === refreshed.id ? refreshed : s)));
    } catch (err) {
      setReturnError(err instanceof ApiError ? err.message : 'Could not process the return.');
    } finally {
      setReturnSaving(false);
    }
  };

  /* The explicit second step: a returned item is not sellable until an Admin
   * decides its condition. */
  const handleInspection = async (outcome: 'RESALABLE' | 'DAMAGED') => {
    if (!selected) return;
    setReturnSaving(true);
    setReturnError('');
    try {
      setReturnRecord(await billingService.recordReturnInspection(selected.id, outcome));
    } catch (err) {
      setReturnError(err instanceof ApiError ? err.message : 'Could not record the inspection.');
    } finally {
      setReturnSaving(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!selected) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      setPayError('Enter a payment amount greater than zero.');
      return;
    }
    setPayError('');
    setPaySaving(true);
    try {
      const updated = await billingService.recordPayment(selected.id, {
        amount,
        paymentDate: payDate,
        paymentMethod: payMethod,
        referenceNo: payReference.trim() || undefined,
      });
      setHistory(updated);
      setPayAmount('');
      setPayReference('');
      /* Keep the row behind the dialog consistent with the ledger. */
      setSelected({
        ...selected,
        paymentStatus: updated.paymentStatus,
        amountPaid: updated.amountPaid,
        amountOutstanding: updated.amountOutstanding,
      });
      setSales((prev) =>
        prev.map((s) =>
          s.id === selected.id
            ? {
                ...s,
                paymentStatus: updated.paymentStatus,
                amountPaid: updated.amountPaid,
                amountOutstanding: updated.amountOutstanding,
              }
            : s
        )
      );
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'Could not record the payment.');
    } finally {
      setPaySaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      <div className="flex items-center gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="w-11 h-11 rounded-2xl bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
          <Receipt className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">Sales History</h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Every completed sale, permanently recorded with the pricing snapshot used at the time.
          </p>
        </div>
      </div>

      {/* GLOBAL Total Gold Sold (filter-independent) + a filter-aware card shown
       * only when the supported filters (search / date / status) are active, so
       * the two never read as duplicate. Category/purity breakdown needs backend
       * fields the sales list does not yet expose — deferred, not faked here. */}
      {!loadError && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
              <Scale className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Gold Sold</p>
              <p className="text-lg font-display font-extrabold text-[#0B0E23]">{formatWeight(globalGoldSold)}</p>
              <p className="text-[10px] text-slate-400 font-medium">All sales · unaffected by filters</p>
            </div>
          </Card>
          {(search || dateFrom || dateTo || statusTab !== 'ALL' || fCategory || fSubcategory || fPurity) && (
            <Card className="p-4 flex items-center gap-4 border-gold/40 bg-gold/5">
              <div className="w-10 h-10 rounded-xl bg-white border border-gold/30 flex items-center justify-center shrink-0">
                <Scale className="h-5 w-5 text-gold" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filtered Gold Sold</p>
                <p className="text-lg font-display font-extrabold text-[#0B0E23]">{formatWeight(totalGoldSold)}</p>
                <p className="text-[10px] text-slate-400 font-medium truncate">{total} sale{total === 1 ? '' : 's'} matching filters</p>
              </div>
            </Card>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-slate-200 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => selectTab(tab.value)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              statusTab === tab.value
                ? 'bg-gold/15 text-gold-dark border border-gold/40'
                : 'text-slate-500 hover:bg-slate-50 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search invoice, code, or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadSales()}
            className="pl-9"
          />
        </div>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="max-w-[160px]" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="max-w-[160px]" />
        <Button variant="outline" onClick={() => loadSales()}>Filter</Button>
        {/* Export period is only used when no custom date range is set — the
          * backend applies the same precedence. */}
        <div className="w-[170px] shrink-0">
          <Select value={period} onChange={(e) => setPeriod(e.target.value as SalesHistoryPeriod)}>
            {SALES_HISTORY_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </div>
        <Button variant="outline" onClick={openExport}>
          <Download className="h-4 w-4 mr-1.5" />
          Export Report
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center">
        <Select
          className="w-full sm:w-[170px]"
          value={fCategory}
          onChange={(e) => { setFCategory(e.target.value); setFSubcategory(''); }}
        >
          <option value="">All Categories</option>
          {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select
          className="w-full sm:w-[170px]"
          value={fSubcategory}
          onChange={(e) => setFSubcategory(e.target.value)}
          disabled={subcategoryOptions.length === 0}
        >
          <option value="">All Sub-categories</option>
          {subcategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select className="w-full sm:w-[130px]" value={fPurity} onChange={(e) => setFPurity(e.target.value)}>
          <option value="">All Purity</option>
          {PURITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Button variant="outline" onClick={() => loadSales()}>Apply</Button>
        <Button
          variant="ghost"
          className="text-slate-500"
          disabled={!fCategory && !fSubcategory && !fPurity}
          onClick={() => {
            setFCategory(''); setFSubcategory(''); setFPurity('');
            loadSales(undefined, { category: '', subcategory: '', purity: '' });
          }}
        >
          Clear
        </Button>
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => loadSales()}>Retry</Button>
        </Card>
      )}

      {!loading && !loadError && sales.length === 0 && (
        <Card>
          <EmptyState
            icon={<FileX className="h-7 w-7 text-gold" />}
            title="No sales yet"
            description="Completed sales will appear here with a full, permanent record of the price breakdown used."
          />
        </Card>
      )}

      {!loading && !loadError && sales.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Invoice', 'Date', 'Product', 'Category', 'Sub-category', 'Vendor', 'Customer', 'Total', 'Paid', 'Outstanding', 'Profit/Loss', 'Payment', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono font-bold text-[#0B0E23]">{sale.invoiceNumber}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600">
                      {new Date(sale.saleTimestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="font-mono font-bold text-slate-500">{sale.productCode}</span>
                      <span className="block text-[11px] font-semibold text-[#0B0E23]">{sale.productName}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600">{sale.category || '—'}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600">{sale.subcategory || '—'}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600">{sale.vendorName || '—'}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-600">
                      <div className="truncate">{sale.customerName || 'Walk-in'}</div>
                      {sale.customerCode && (
                        <div className="font-mono text-[10px] text-slate-400 whitespace-nowrap">{sale.customerCode}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-gold-dark font-mono">{formatCurrency(sale.finalAmount)}</td>
                    <td className="px-4 py-3 text-xs font-mono font-bold text-emerald-700">{formatCurrency(sale.amountPaid)}</td>
                    <td className="px-4 py-3 text-xs font-mono font-bold">
                      {sale.amountOutstanding > 0
                        ? <span className="text-amber-700">{formatCurrency(sale.amountOutstanding)}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono font-bold">
                      {sale.estimatedGrossMargin !== null ? (
                        <span className={sale.estimatedGrossMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                          {sale.estimatedGrossMargin < 0 ? '-' : ''}{formatCurrency(Math.abs(sale.estimatedGrossMargin))}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={paymentTone(sale.paymentStatus)}>{sale.paymentStatus}</Badge>
                        {sale.saleStatus !== 'COMPLETED' && (
                          <Badge variant="danger">{sale.saleStatus}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => openSale(sale)}>View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
            {total} sale{total === 1 ? '' : 's'}
          </div>
        </Card>
      )}

      <Dialog isOpen={!!selected} onClose={closeSale} title={selected ? `Invoice ${selected.invoiceNumber}` : undefined} maxWidth="max-w-lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <div>
                <p className="font-mono font-bold text-slate-500">{selected.productCode}</p>
                <p className="font-display font-bold text-sm text-[#0B0E23]">{selected.productName}</p>
                <p className="text-slate-500 font-medium mt-0.5">
                  {selected.purity} · Gross {formatWeight(selected.grossWeightGrams)} · Net {formatWeight(selected.netGoldWeightGrams)}
                  {selected.huid && ` · HUID ${selected.huid}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 font-semibold">
                  {selected.customerName || 'Walk-in'}
                  {selected.customerCode ? ` · ${selected.customerCode}` : ''}
                </p>
                <p className="text-slate-400">{new Date(selected.saleTimestamp).toLocaleDateString('en-IN')}</p>
              </div>
            </div>
            <PriceBreakdownCard
              breakdown={selected}
              margin={{ purchaseCost: selected.purchaseCostSnapshot, estimatedGrossMargin: selected.estimatedGrossMargin }}
            />

            {/* Payment position + permanent collection history. Recorded
              * payments are never edited or removed here — each collection is
              * appended, and the status/outstanding figures come back from the
              * backend's own recalculation. */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <Wallet className="h-4 w-4 text-gold" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Payments</p>
              </div>

              {historyLoading && <p className="px-4 py-3 text-xs text-slate-500 font-medium">Loading payments…</p>}

              {history && (
                <>
                  <div className="grid grid-cols-4 gap-2 px-4 py-3 text-center border-b border-slate-100">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</p>
                      <p className="text-sm font-bold font-mono text-[#0B0E23]">{formatCurrency(history.finalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paid</p>
                      <p className="text-sm font-bold font-mono text-emerald-700">{formatCurrency(history.amountPaid)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Outstanding</p>
                      <p className="text-sm font-bold font-mono text-amber-700">{formatCurrency(history.amountOutstanding)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</p>
                      <Badge variant={paymentTone(history.paymentStatus)}>{history.paymentStatus}</Badge>
                    </div>
                  </div>

                  {history.payments.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-500 font-medium">
                      No payment recorded against this invoice yet.
                    </p>
                  ) : (
                    <>
                      {/* Settlement breakdown — grouped straight from the ledger
                        * rows by source. Scheme redemption settles the invoice
                        * but is NOT cash, and refunds are shown separately. */}
                      {(() => {
                        const cash = history.payments
                          .filter((p) => p.source !== 'SCHEME_REDEMPTION' && p.source !== 'REFUND')
                          .reduce((t, p) => t + p.amount, 0);
                        const scheme = history.payments
                          .filter((p) => p.source === 'SCHEME_REDEMPTION')
                          .reduce((t, p) => t + p.amount, 0);
                        const refunded = history.payments
                          .filter((p) => p.source === 'REFUND')
                          .reduce((t, p) => t - p.amount, 0);
                        if (scheme <= 0 && refunded <= 0) return null;
                        return (
                          <div className="grid grid-cols-3 gap-2 px-4 py-2.5 text-center bg-slate-50/60 border-b border-slate-100">
                            <div>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cash Collected</p>
                              <p className="text-xs font-bold font-mono text-emerald-700">{formatCurrency(cash)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scheme Redemption</p>
                              <p className="text-xs font-bold font-mono text-violet-700">{formatCurrency(scheme)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Refunded</p>
                              <p className="text-xs font-bold font-mono text-red-700">{formatCurrency(refunded)}</p>
                            </div>
                          </div>
                        );
                      })()}
                      <ul className="divide-y divide-slate-100">
                        {history.payments.map((p) => {
                          const refund = p.source === 'REFUND';
                          const scheme = p.source === 'SCHEME_REDEMPTION';
                          const tone = refund ? 'text-red-700' : scheme ? 'text-violet-700' : 'text-[#0B0E23]';
                          return (
                            <li key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                              <div>
                                <p className={`text-xs font-bold font-mono ${tone}`}>
                                  {refund ? '-' : ''}{formatCurrency(Math.abs(p.amount))}
                                </p>
                                <p className="text-[11px] text-slate-500 font-medium">
                                  <span className="font-bold">{sourceLabel(p.source)}</span>
                                  {' · '}{new Date(p.paymentDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                                  {!scheme && ` · ${p.paymentMethod.replace('_', ' ')}`}
                                  {p.referenceNo && ` · ${p.referenceNo}`}
                                </p>
                              </div>
                              <p className="text-[10px] text-slate-400 font-semibold text-right shrink-0">
                                {p.recordedByName || ''}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}

                  {history.amountOutstanding > 0 && selected.saleStatus === 'COMPLETED' && (
                    <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/60 space-y-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Add Payment</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          placeholder={`Max ${history.amountOutstanding}`}
                        />
                        <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                        <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                          {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                        </Select>
                        <Input
                          value={payReference}
                          onChange={(e) => setPayReference(e.target.value)}
                          placeholder="Reference (optional)"
                        />
                      </div>
                      {payError && <p className="text-[11px] font-medium text-red-600">{payError}</p>}
                      <Button size="sm" className="w-full" isLoading={paySaving} onClick={handleRecordPayment}>
                        Record Payment
                      </Button>
                    </div>
                  )}
                </>
              )}

              {!historyLoading && !history && payError && (
                <p className="px-4 py-3 text-xs font-medium text-red-600">{payError}</p>
              )}
            </div>

            {/* Reversal record. The original invoice above is untouched — this
              * is a separate, permanent transaction linked to it. */}
            {selected.saleStatus !== 'COMPLETED' && returnRecord && (
              <div className="rounded-xl border border-red-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border-b border-red-200">
                  <Undo2 className="h-4 w-4 text-red-600" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">
                    {returnRecord.returnType === 'CANCELLATION' ? 'Sale Cancelled' : 'Sale Returned'}
                  </p>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Refunded</p>
                      <p className="text-sm font-bold font-mono text-red-700">{formatCurrency(returnRecord.refundAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Written Off</p>
                      <p className="text-sm font-bold font-mono text-slate-700">{formatCurrency(returnRecord.outstandingWrittenOff)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Item</p>
                      <p className="text-[11px] font-bold text-slate-700">{returnRecord.currentStockStatus?.replace(/_/g, ' ') || '—'}</p>
                    </div>
                  </div>
                  {returnRecord.schemeRestored > 0 && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-violet-800 uppercase tracking-wider">Scheme Restored</span>
                      <span className="text-sm font-bold font-mono text-violet-700">{formatCurrency(returnRecord.schemeRestored)}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-600 font-medium">
                    {new Date(returnRecord.returnedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    {returnRecord.processedByName && ' · ' + returnRecord.processedByName}
                  </p>
                  <p className="text-[11px] text-slate-600 font-medium">Reason: {returnRecord.reason}</p>

                  {returnRecord.inspectionStatus === 'PENDING' ? (
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Inspection — the item is not sellable until this is recorded
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" isLoading={returnSaving} onClick={() => handleInspection('RESALABLE')}>
                          <PackageCheck className="h-3.5 w-3.5 mr-1" /> Back To Inventory
                        </Button>
                        <Button size="sm" variant="outline" isLoading={returnSaving} onClick={() => handleInspection('DAMAGED')}>
                          Mark Damaged
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] font-medium text-slate-600 pt-2 border-t border-slate-100">
                      Inspected: {returnRecord.inspectionStatus}
                      {returnRecord.inspectedByName && ' · ' + returnRecord.inspectedByName}
                    </p>
                  )}
                  {returnError && <p className="text-[11px] font-medium text-red-600">{returnError}</p>}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {selected && selected.saleStatus === 'COMPLETED' && (
            <Button variant="outline" onClick={openReturn}>
              <Undo2 className="h-3.5 w-3.5 mr-1" /> Return / Cancel
            </Button>
          )}
          {selected && <InvoiceActions sale={selected} businessName={branding.brandName} />}
          <Button variant="outline" onClick={closeSale}>Close</Button>
        </DialogFooter>
      </Dialog>

      {/* Return / cancel confirmation. Nothing here is silent: the Admin sees
        * the backend's own impact figures and must give a reason. */}
      <Dialog
        isOpen={returnOpen}
        onClose={closeReturn}
        title={selected ? 'Return / Cancel ' + selected.invoiceNumber : undefined}
        maxWidth="max-w-md"
      >
        {!returnPreview && !returnError && (
          <p className="text-xs text-slate-500 font-medium">Loading financial impact…</p>
        )}
        {returnPreview && (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Invoice Total</span>
                <span className="text-xs font-bold font-mono text-[#0B0E23]">{formatCurrency(returnPreview.originalSaleAmount)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Collected</span>
                <span className="text-xs font-bold font-mono text-emerald-700">{formatCurrency(returnPreview.amountCollected)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Refundable</span>
                <span className="text-xs font-bold font-mono text-red-700">{formatCurrency(returnPreview.maxRefundable)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Written Off</span>
                <span className="text-xs font-bold font-mono text-slate-700">{formatCurrency(returnPreview.outstandingToWriteOff)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Item Becomes</span>
                <span className="text-[11px] font-bold text-slate-700">{returnPreview.resultingStockStatus.replace(/_/g, ' ')}</span>
              </div>
            </div>

            {!returnPreview.canReturn ? (
              <p className="text-[11px] font-medium text-red-600">{returnPreview.blockedReason}</p>
            ) : (
              <>
                <Select value={returnType} onChange={(e) => setReturnType(e.target.value as ReturnType)}>
                  <option value="RETURN">Return (customer brought the item back)</option>
                  <option value="CANCELLATION">Cancellation (sale reversed before delivery)</option>
                </Select>
                <Input
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Reason (required)"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder={'Max ' + returnPreview.maxRefundable}
                  />
                  <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}>
                    {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </Select>
                </div>
                <Input
                  value={refundReference}
                  onChange={(e) => setRefundReference(e.target.value)}
                  placeholder="Refund reference (optional)"
                />
                <p className="text-[11px] text-slate-500 font-medium">
                  The original invoice and every earlier payment stay on record. The refund is added
                  to the payment ledger as a separate event.
                </p>
              </>
            )}
            {returnError && <p className="text-[11px] font-medium text-red-600">{returnError}</p>}
          </div>
        )}
        {returnError && !returnPreview && (
          <p className="text-[11px] font-medium text-red-600">{returnError}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={closeReturn}>Cancel</Button>
          <Button
            isLoading={returnSaving}
            disabled={!returnPreview?.canReturn}
            onClick={handleProcessReturn}
          >
            Confirm Return
          </Button>
        </DialogFooter>
      </Dialog>

      {/* EXPORT / REPORT BUILDER */}
      <Dialog isOpen={exportOpen} onClose={() => !exporting && setExportOpen(false)} title="Export Report" maxWidth="max-w-lg">
        <div className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Report Type</label>
            <Select value={reportType} onChange={(e) => setReportType(e.target.value as 'ca' | 'owner' | 'custom')}>
              <option value="ca">CA / Accounting Report</option>
              <option value="owner">Owner / Admin Report (full)</option>
              <option value="custom">Custom Report</option>
            </Select>
            <p className="text-[10px] text-slate-400">
              {reportType === 'ca'
                ? 'Accounting fields only — no internal cost or profit.'
                : reportType === 'owner'
                ? 'The full sales history. Cost and profit columns are included only for Admin/SuperAdmin.'
                : 'Choose exactly which columns to export. Restricted financial columns are only offered to authorized users, and are re-checked on the server.'}
            </p>
          </div>

          {reportType === 'custom' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-500 uppercase text-[10px]">Fields</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-[11px] font-bold text-gold-dark hover:underline"
                    onClick={() => setSelectedFieldKeys(exportFields.map((f) => f.key))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-[11px] font-bold text-slate-400 hover:underline"
                    onClick={() => setSelectedFieldKeys([])}
                  >
                    Clear
                  </button>
                </div>
              </div>
              {exportFields.length === 0 ? (
                <p className="text-[11px] text-slate-400">Loading available fields…</p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {exportFields.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFieldKeys.includes(f.key)}
                        onChange={() => toggleField(f.key)}
                      />
                      <span className="font-medium text-slate-700">{f.label}</span>
                      {f.financial && (
                        <span className="ml-auto text-[9px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                          Financial
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="text-[11px] font-bold text-gold-dark hover:underline"
                onClick={saveCustomPreset}
              >
                Save these fields as my default
              </button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button
            size="sm"
            isLoading={exporting}
            disabled={reportType === 'custom' && selectedFieldKeys.length === 0}
            onClick={handleExport}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
