"use client";

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/form-controls';
import { Toast } from '@/components/ui/toast';
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Coins,
  ShieldCheck,
  Wallet,
  Receipt,
  RotateCcw,
  BookOpen,
  IdCard,
  Plus,
  Pencil,
} from 'lucide-react';
import {
  customerService,
  AdminCustomerListItem,
  CustomerOverview,
  AdminCustomerCreateData,
  AdminCustomerUpdateData,
} from '@/services/customerService';
import { schemeService, AdminScheme } from '@/services/schemeService';
import { ApiError } from '@/lib/apiClient';

const PAGE_SIZE = 20;

const KYC_BADGE_VARIANT: Record<string, 'success' | 'warn' | 'danger'> = {
  Verified: 'success',
  Pending: 'warn',
  Rejected: 'danger',
};

const formatMoney = (v: number) =>
  `\u20B9${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDate = (v: string) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-IN', { dateStyle: 'medium' });
};

/** Collapsible-free list block used by every Customer 360 section, so each
 * section scrolls inside itself instead of stretching the dialog. */
function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
        {icon}
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">{title}</p>
        <span className="ml-auto text-[10px] font-bold text-slate-400">{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-3 py-2.5 text-[11px] text-slate-500 font-medium">Nothing recorded.</p>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto">{children}</ul>
      )}
    </div>
  );
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomerListItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'WALK-IN' | 'SCHEME CUSTOMER' | 'HYBRID' | 'NEW'>('ALL');
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  /* Customer 360 — one authoritative read; this screen renders what the
   * backend composed and never recomputes a balance or a total. */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerOverview | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [schemes, setSchemes] = useState<AdminScheme[]>([]);

  /* CREATE — reuses the same API/service the backend already supports:
   * walk-in (no phone/email), optional scheme_id enrollment. */
  const EMPTY_CREATE_FORM: AdminCustomerCreateData = { name: '', phone: '', email: '', password: '', schemeId: '', dateOfBirth: '' };
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<AdminCustomerCreateData>(EMPTY_CREATE_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  /* EDIT — partial update of an existing customer. */
  const [editTarget, setEditTarget] = useState<AdminCustomerListItem | null>(null);
  const [editForm, setEditForm] = useState<AdminCustomerUpdateData>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  /* ENROL EXISTING — join an existing customer to a scheme (WALK-IN becomes
   * HYBRID) without ever creating a second customer. */
  const [enrollTarget, setEnrollTarget] = useState<AdminCustomerListItem | null>(null);
  const [enrollSchemeId, setEnrollSchemeId] = useState('');
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollError, setEnrollError] = useState('');

  useEffect(() => {
    schemeService.getAdminSchemes().then(setSchemes).catch(() => {});
  }, []);

  const loadCustomers = async (targetPage: number, searchTerm: string, type: typeof typeFilter = typeFilter) => {
    setLoading(true);
    setLoadError('');
    try {
      // Classification filter is applied server-side so pagination reflects the
      // FILTERED dataset (e.g. 7 walk-ins = 1 page), never the whole customer base.
      const result = await customerService.getAdminCustomers(
        targetPage, PAGE_SIZE, searchTerm || undefined, type === 'ALL' ? undefined : type
      );
      setCustomers(result.customers);
      setTotalItems(result.pagination.totalItems);
      setTotalPages(result.pagination.totalPages);
      setPage(result.pagination.page);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load customers.');
    } finally {
      setLoading(false);
    }
  };

  // Search or classification-tab change reloads from page 1 against the backend.
  useEffect(() => {
    const timer = setTimeout(() => loadCustomers(1, search, typeFilter), search ? 350 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter]);

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const data = await customerService.getCustomerOverview(id);
      setDetail(data);
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : 'Could not load customer detail.');
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreate = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateError('');
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      setCreateError('Name is required.');
      return;
    }
    if (!createForm.password || createForm.password.length < 8) {
      setCreateError('Password must be at least 8 characters.');
      return;
    }
    if (!createForm.dateOfBirth) {
      setCreateError('Date of birth is required.');
      return;
    }
    if (createForm.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      setCreateError('Date of birth cannot be in the future.');
      return;
    }
    setCreateSaving(true);
    setCreateError('');
    try {
      const result = await customerService.createCustomerAdmin(createForm);
      setCreateOpen(false);
      setToast({
        message: `Customer created — Customer ID ${result.customerCode || result.id}${
          result.enrollmentNumber ? ` · Enrollment ${result.enrollmentNumber}` : ''
        }`,
        type: 'success',
      });
      loadCustomers(1, search);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Could not create customer.');
    } finally {
      setCreateSaving(false);
    }
  };

  const openEdit = (c: AdminCustomerListItem) => {
    setEditTarget(c);
    setEditForm({ name: c.name, phone: c.phone, email: c.email, isActive: c.isActive, dateOfBirth: c.dateOfBirth || undefined });
    setEditError('');
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    if (editForm.name !== undefined && !editForm.name.trim()) {
      setEditError('Name is required.');
      return;
    }
    if (editForm.password && editForm.password.length < 8) {
      setEditError('Password must be at least 8 characters.');
      return;
    }
    if (editForm.dateOfBirth && editForm.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      setEditError('Date of birth cannot be in the future.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      await customerService.updateCustomerAdmin(editTarget.id, editForm);
      setEditTarget(null);
      setToast({ message: 'Customer updated.', type: 'success' });
      loadCustomers(page, search);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Could not update customer.');
    } finally {
      setEditSaving(false);
    }
  };

  const openEnroll = (c: AdminCustomerListItem) => {
    setEnrollTarget(c);
    setEnrollSchemeId('');
    setEnrollError('');
  };

  const handleEnroll = async () => {
    if (!enrollTarget) return;
    if (!enrollSchemeId) {
      setEnrollError('Select a scheme.');
      return;
    }
    setEnrollSaving(true);
    setEnrollError('');
    try {
      const result = await customerService.enrollExistingCustomer(enrollTarget.id, enrollSchemeId);
      setEnrollTarget(null);
      setToast({
        message: `Enrolled ${result.name}${result.enrollmentNumber ? ` · Enrollment ${result.enrollmentNumber}` : ''}`,
        type: 'success',
      });
      loadCustomers(page, search);
    } catch (err) {
      setEnrollError(err instanceof ApiError ? err.message : 'Could not enrol customer.');
    } finally {
      setEnrollSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Customer Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Search and review every customer registered under your store, their KYC status, and investment summary.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Customer
        </Button>
      </div>

      {/* SEARCH */}
      <Card className="p-4 bg-white border-slate-200 shadow-xs">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer code, name, email, or phone..."
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(['ALL', 'NEW', 'WALK-IN', 'SCHEME CUSTOMER', 'HYBRID'] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={'px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ' +
                (typeFilter === t ? 'bg-[#0B0E23] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
              {t === 'ALL' ? 'All Types' : t}
            </button>
          ))}
        </div>
      </Card>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => loadCustomers(page, search)}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && customers.length === 0 && (
        <EmptyState
          icon={<Users className="h-7 w-7 text-gold" />}
          title="No customers found"
          description={search ? 'Try a different search term.' : 'No customers have registered under your store yet.'}
        />
      )}

      {!loading && !loadError && customers.length > 0 && (
        <>
          <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-4">Customer</th>
                    <th className="p-4">Customer Code</th>
                    <th className="p-4 text-center">Type</th>
                    <th className="p-4">Contact</th>
                    <th className="p-4 text-center">KYC Status</th>
                    <th className="p-4">Member Since</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => openDetail(c.id)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="p-4 font-bold text-[#0B0E23] flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-gold/15 text-gold-dark font-bold text-xs flex items-center justify-center shrink-0 border border-gold/30">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        {c.name}
                      </td>
                      <td className="p-4">
                        <span className="font-mono text-[11px] font-bold text-slate-600 whitespace-nowrap">
                          {c.customerCode || '—'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <Badge variant={c.customerType === 'HYBRID' ? 'gold' : c.customerType === 'SCHEME CUSTOMER' ? 'success' : c.customerType === 'WALK-IN' ? 'neutral' : 'warn'} className="text-[10px] whitespace-nowrap">
                          {c.customerType === 'SCHEME CUSTOMER' ? 'Scheme' : c.customerType === 'HYBRID' ? 'Hybrid' : c.customerType === 'WALK-IN' ? 'Walk-in' : 'New'}
                        </Badge>
                      </td>
                      <td className="p-4 text-[11px] text-slate-500">
                        <div>{c.email || '—'}</div>
                        <div>{c.phone || '—'}</div>
                      </td>
                      <td className="p-4 text-center">
                        <Badge variant={KYC_BADGE_VARIANT[c.kycStatus] ?? 'warn'} className="text-[10px]">
                          {c.kycStatus}
                        </Badge>
                      </td>
                      <td className="p-4 text-[11px] text-slate-500">{c.memberSince || '—'}</td>
                      <td className="p-4 text-center">
                        <Badge variant={c.isActive ? 'success' : 'danger'} dot className="text-[10px]">
                          {c.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEnroll(c);
                            }}
                            className="p-1.5 text-slate-400 hover:text-gold-dark hover:bg-gold/10 rounded-lg transition-colors"
                            title="Enrol in scheme"
                          >
                            <Coins className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(c);
                            }}
                            className="p-1.5 text-slate-400 hover:text-gold-dark hover:bg-gold/10 rounded-lg transition-colors"
                            title="Edit customer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
            <span>
              Page {page} of {Math.max(totalPages, 1)} ({totalItems.toLocaleString('en-IN')} total customers)
            </span>
            {/* Prev/Next only when the CURRENT filtered dataset spans 2+ pages. */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => loadCustomers(page - 1, search)}>
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => loadCustomers(page + 1, search)}>
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* CUSTOMER 360 */}
      <Dialog
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        title="Customer 360"
        maxWidth="max-w-3xl"
      >
        {detailLoading && <Skeleton className="h-64 w-full" />}
        {!detailLoading && detailError && <p className="text-xs font-medium text-red-700">{detailError}</p>}

        {!detailLoading && !detailError && detail && (
          <div className="space-y-4 text-xs max-h-[70vh] overflow-y-auto pr-1">
            {/* PROFILE */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gold/15 text-gold-dark font-bold text-lg flex items-center justify-center border border-gold/30 shrink-0">
                {detail.profile.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm text-[#0B0E23] truncate">{detail.profile.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-slate-600">
                    <IdCard className="w-3 h-3" /> {detail.profile.customerCode || 'No code'}
                  </span>
                  <Badge variant="gold" className="text-[10px]">{detail.profile.customerType}</Badge>
                  <Badge variant={detail.profile.isActive ? 'success' : 'danger'} dot className="text-[10px]">
                    {detail.profile.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="text-slate-400 text-[11px] mt-1 truncate">
                  {detail.profile.phone || '—'}
                  {detail.profile.email ? ` · ${detail.profile.email}` : ''}
                </div>
                {detail.profile.dateOfBirth && (
                  <div className="text-slate-400 text-[11px] mt-0.5">DOB · {formatDate(detail.profile.dateOfBirth)}</div>
                )}
              </div>
            </div>

            {/* KYC + HEADLINE TOTALS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[10px] mb-1">
                  <ShieldCheck className="w-3 h-3" /> KYC
                </div>
                <Badge variant={KYC_BADGE_VARIANT[detail.kyc.status] ?? 'warn'} className="text-[10px]">
                  {detail.kyc.status}
                </Badge>
                <div className="text-[10px] text-slate-400 mt-1">
                  {detail.kyc.docType || 'No document'}
                  {detail.kyc.documentCount > 0 ? ` · ${detail.kyc.documentCount} file(s)` : ''}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[10px] mb-1">
                  <Coins className="w-3 h-3" /> Schemes
                </div>
                <div className="font-bold text-[#0B0E23]">{detail.totals.enrollmentCount}</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Balance {formatMoney(detail.totals.schemeAvailableBalance)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[10px] mb-1">
                  <Receipt className="w-3 h-3" /> Purchases
                </div>
                <div className="font-bold text-[#0B0E23]">{detail.totals.purchaseCount}</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {formatMoney(detail.totals.purchaseTotal)} billed
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[10px] mb-1">
                  <Wallet className="w-3 h-3" /> Outstanding
                </div>
                <div className="font-bold text-amber-700">{formatMoney(detail.totals.purchaseOutstanding)}</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Paid {formatMoney(detail.totals.purchasePaid)}
                </div>
              </div>
            </div>

            {/* ENROLLMENTS */}
            <Section icon={<Coins className="w-3.5 h-3.5 text-gold" />} title="Scheme Enrollments" count={detail.enrollments.length}>
              {detail.enrollments.map((e) => (
                <li key={e.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0B0E23] truncate">{e.schemeName}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {e.enrollmentNumber} · {e.status}
                      {e.maturityDate ? ` · matures ${e.maturityDate}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-violet-700">{formatMoney(e.availableBalance)}</p>
                    <p className="text-[10px] text-slate-400">
                      Paid {formatMoney(e.totalPaid)} · Redeemed {formatMoney(e.totalRedeemed)}
                    </p>
                  </div>
                </li>
              ))}
            </Section>

            {/* CONTRIBUTIONS */}
            <Section icon={<BookOpen className="w-3.5 h-3.5 text-gold" />} title="Contributions" count={detail.contributions.length}>
              {detail.contributions.map((c) => (
                <li key={c.id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-emerald-700">{formatMoney(c.amount)}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {formatDate(c.entryDate)}
                      {c.description ? ` · ${c.description}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                    {c.entryNumber !== null ? `#${c.entryNumber}` : ''}
                  </span>
                </li>
              ))}
            </Section>

            {/* REDEMPTIONS */}
            <Section icon={<Wallet className="w-3.5 h-3.5 text-gold" />} title="Scheme Redemptions" count={detail.redemptions.length}>
              {detail.redemptions.map((r) => {
                // Negative = credit restored by a returned scheme-settled sale.
                const restored = r.amount < 0;
                return (
                  <li key={r.id} className="px-3 py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-mono font-bold ${restored ? 'text-emerald-700' : 'text-violet-700'}`}>
                        {restored ? '+' : '-'}{formatMoney(Math.abs(r.amount))}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {restored ? 'Restored (return)' : 'Redeemed'} · {r.enrollmentNumber || '—'} · Invoice {r.invoiceNumber || '—'}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">{formatDate(r.redeemedAt)}</span>
                  </li>
                );
              })}
            </Section>

            {/* PURCHASES */}
            <Section icon={<Receipt className="w-3.5 h-3.5 text-gold" />} title="Purchases" count={detail.purchases.length}>
              {detail.purchases.map((pu) => (
                <li key={pu.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0B0E23] truncate">{pu.invoiceNumber}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {pu.productName} · {formatDate(pu.saleTimestamp)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-[#0B0E23]">{formatMoney(pu.finalAmount)}</p>
                    <p className="text-[10px] text-slate-400">
                      {pu.saleStatus !== 'COMPLETED' ? pu.saleStatus : pu.paymentStatus}
                      {pu.outstanding > 0 ? ` · due ${formatMoney(pu.outstanding)}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </Section>

            {/* PAYMENTS */}
            <Section icon={<Wallet className="w-3.5 h-3.5 text-gold" />} title="Payments Collected" count={detail.payments.length}>
              {detail.payments.map((pa) => (
                <li key={pa.id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-[#0B0E23]">{formatMoney(pa.amount)}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      Invoice {pa.invoiceNumber || '—'} · {pa.source.replace(/_/g, ' ')}
                      {pa.paymentMethod ? ` · ${pa.paymentMethod}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">{pa.paymentDate || '—'}</span>
                </li>
              ))}
            </Section>

            {/* RETURNS */}
            <Section icon={<RotateCcw className="w-3.5 h-3.5 text-gold" />} title="Returns" count={detail.returns.length}>
              {detail.returns.map((r) => (
                <li key={r.saleId} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0B0E23] truncate">Invoice {r.invoiceNumber || '—'}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {r.reason || '—'} · {r.inspectionOutcome || 'PENDING'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-red-600">{formatMoney(r.refundAmount)}</p>
                    <p className="text-[10px] text-slate-400">
                      {r.schemeRestored > 0 ? `Scheme restored ${formatMoney(r.schemeRestored)}` : ''}
                      {r.writtenOffAmount > 0 ? ` · written off ${formatMoney(r.writtenOffAmount)}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </Section>

            <p className="text-[11px] text-slate-500">
              Member since {detail.profile.memberSince || '—'}. Every figure above is read from the
              billing, scheme and return ledgers — nothing on this screen is recalculated.
            </p>
          </div>
        )}
      </Dialog>

      {/* CREATE CUSTOMER */}
      <Dialog isOpen={createOpen} onClose={() => !createSaving && setCreateOpen(false)} title="Add Customer" maxWidth="max-w-md">
        <div className="space-y-3.5 text-xs">
          {createError && (
            <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {createError}
            </div>
          )}

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Name *</label>
            <Input value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="Customer's full name" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Phone</label>
              <Input value={createForm.phone} onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Optional for walk-in" />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Email</label>
              <Input value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} placeholder="Optional for walk-in" />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 -mt-2">
            Leave phone and email blank to create a walk-in customer — a Customer ID is generated either way.
          </p>

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Initial Password *</label>
            <Input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Min. 8 characters"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Date of Birth *</label>
            <Input
              type="date"
              value={createForm.dateOfBirth}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setCreateForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Enroll in Scheme (optional)</label>
            <Select value={createForm.schemeId} onChange={(e) => setCreateForm((f) => ({ ...f, schemeId: e.target.value }))}>
              <option value="">No scheme</option>
              {schemes.filter((s) => s.isActive).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)} disabled={createSaving}>
            Cancel
          </Button>
          <Button size="sm" isLoading={createSaving} onClick={handleCreate}>
            Create Customer
          </Button>
        </DialogFooter>
      </Dialog>

      {/* EDIT CUSTOMER */}
      <Dialog isOpen={!!editTarget} onClose={() => !editSaving && setEditTarget(null)} title="Edit Customer" maxWidth="max-w-md">
        {editTarget && (
          <>
            <div className="space-y-3.5 text-xs">
              {editError && (
                <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {editError}
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-slate-500 uppercase text-[10px]">Customer ID</label>
                <p className="font-mono font-bold text-slate-600">{editTarget.customerCode || '—'}</p>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-500 uppercase text-[10px]">Name *</label>
                <Input value={editForm.name ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase text-[10px]">Phone</label>
                  <Input value={editForm.phone ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase text-[10px]">Email</label>
                  <Input value={editForm.email ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase text-[10px]">Date of Birth</label>
                  <Input
                    type="date"
                    value={editForm.dateOfBirth ?? ''}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setEditForm((f) => ({ ...f, dateOfBirth: e.target.value || undefined }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 uppercase text-[10px]">New Password</label>
                  <Input
                    type="password"
                    value={editForm.password ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value || undefined }))}
                    placeholder="Leave blank to keep current"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                <span className="font-bold text-slate-600 text-[11px]">Active</span>
                <button
                  type="button"
                  onClick={() => setEditForm((f) => ({ ...f, isActive: !f.isActive }))}
                  className={'px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ' +
                    (editForm.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}
                >
                  {editForm.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditTarget(null)} disabled={editSaving}>
                Cancel
              </Button>
              <Button size="sm" isLoading={editSaving} onClick={handleEdit}>
                Save Changes
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>

      {/* ENROL EXISTING CUSTOMER IN A SCHEME */}
      <Dialog isOpen={!!enrollTarget} onClose={() => !enrollSaving && setEnrollTarget(null)} title="Enrol in Scheme" maxWidth="max-w-md">
        {enrollTarget && (
          <>
            <div className="space-y-3.5 text-xs">
              {enrollError && (
                <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {enrollError}
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-slate-500 uppercase text-[10px]">Customer</label>
                <p className="font-bold text-slate-700">
                  {enrollTarget.name}
                  <span className="font-mono font-medium text-slate-500"> · {enrollTarget.customerCode || '—'}</span>
                </p>
                <p className="text-[11px] text-slate-400">Keeps the same Customer ID — no new customer is created.</p>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-500 uppercase text-[10px]">Scheme *</label>
                <Select value={enrollSchemeId} onChange={(e) => setEnrollSchemeId(e.target.value)}>
                  <option value="">Select a scheme</option>
                  {schemes.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEnrollTarget(null)} disabled={enrollSaving}>
                Cancel
              </Button>
              <Button size="sm" isLoading={enrollSaving} onClick={handleEnroll}>
                Enrol Customer
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

    </div>
  );
}
