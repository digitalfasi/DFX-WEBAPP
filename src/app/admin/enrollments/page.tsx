"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Gem, BookOpen, Wallet, Lock, Pencil } from 'lucide-react';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/form-controls';
import {
  enrollmentService, AdminEnrollment, EnrollmentStatus, EnrollmentBalance,
} from '@/services/enrollmentService';
import { billingService, Sale } from '@/services/billingService';
import { passbookService, Passbook } from '@/services/passbookService';
import { ApiError } from '@/lib/apiClient';
import { formatCurrency } from '@/lib/formatters';

const STATUS_VARIANT: Record<EnrollmentStatus, 'success' | 'gold' | 'danger' | 'warn' | 'neutral'> = {
  ACTIVE: 'success',
  COMPLETED: 'gold',
  CANCELLED: 'danger',
  // Stopped contributing, balance still redeemable.
  CLOSED: 'warn',
  // Balance fully consumed by purchases.
  REDEEMED: 'neutral',
};

export default function AdminEnrollmentsPage() {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const REMARK_PRESETS = ['Followed up by phone', 'Requested payment extension', 'Payment promised', 'Documents pending', 'Do not disturb'];
  const [remarksTarget, setRemarksTarget] = useState<AdminEnrollment | null>(null);
  const [remarksText, setRemarksText] = useState('');
  const [remarksSaving, setRemarksSaving] = useState(false);
  const [remarksError, setRemarksError] = useState('');
  const openRemarks = (e: AdminEnrollment) => { setRemarksTarget(e); setRemarksText(e.remarks || ''); setRemarksError(''); };
  const saveRemarks = async (clear = false) => {
    if (!remarksTarget) return;
    setRemarksSaving(true); setRemarksError('');
    try {
      const updated = await enrollmentService.updateRemarks(remarksTarget.id, clear ? null : (remarksText.trim() || null));
      setEnrollments((prev) => prev.map((x) => (x.id === updated.id ? { ...x, remarks: updated.remarks } : x)));
      setRemarksTarget(null);
    } catch (err) {
      setRemarksError(err instanceof ApiError ? err.message : 'Could not save remarks.');
    } finally { setRemarksSaving(false); }
  };

  /* Scheme credit panel. Every figure is read from the backend, which derives it
   * from the contribution and redemption ledgers — nothing is computed here, and
   * no historical payment is ever editable from this screen. */
  const [balance, setBalance] = useState<EnrollmentBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [passbook, setPassbook] = useState<Passbook | null>(null);
  const [panelError, setPanelError] = useState('');
  const [saving, setSaving] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState('');
  /* Eligible-invoice picker. The Admin never types an internal sale ID. */
  const [saleSearch, setSaleSearch] = useState('');
  const [eligibleSales, setEligibleSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  /* Invoices this enrollment's balance may legitimately settle. Filtered to the
   * same customer, intact sales only, and only those still owing money. This is
   * a convenience filter — the redemption endpoint re-validates tenant,
   * customer, sale status, balance and outstanding, and remains the authority. */
  const loadEligibleSales = async (target: EnrollmentBalance, search: string) => {
    setSalesLoading(true);
    try {
      const res = await billingService.listSales({
        search: search.trim() || target.customerName,
        saleStatus: 'COMPLETED',
        limit: 50,
      });
      setEligibleSales(
        res.sales.filter((sl) => sl.customerId === target.customerId && sl.amountOutstanding > 0)
      );
    } catch (err) {
      setPanelError(err instanceof ApiError ? err.message : 'Could not load the customer invoices.');
      setEligibleSales([]);
    } finally {
      setSalesLoading(false);
    }
  };

  const openDetails = async (enrollmentId: string) => {
    setBalance(null);
    setPassbook(null);
    setPanelError('');
    setBalanceLoading(true);
    try {
      // Balance + contribution passbook are two authoritative reads; the
      // passbook is contributions only, redemptions come from the balance.
      const [bal, pb] = await Promise.all([
        enrollmentService.getEnrollmentBalance(enrollmentId),
        passbookService.getAdminPassbook(enrollmentId).catch(() => null),
      ]);
      setBalance(bal);
      setPassbook(pb);
    } catch (err) {
      setPanelError(err instanceof ApiError ? err.message : 'Could not load the scheme balance.');
    } finally {
      setBalanceLoading(false);
    }
  };

  const closeDetails = () => {
    setBalance(null);
    setPassbook(null);
    setPanelError('');
  };

  const applyUpdated = (updated: EnrollmentBalance) => {
    setBalance(updated);
    setEnrollments((prev) =>
      prev.map((e) => (e.id === updated.enrollmentId ? { ...e, status: updated.status } : e))
    );
  };

  const handleClose = async () => {
    if (!balance) return;
    if (closeReason.trim().length < 3) {
      setPanelError('A closure reason is required.');
      return;
    }
    setPanelError('');
    setSaving(true);
    try {
      applyUpdated(await enrollmentService.closeEnrollment(balance.enrollmentId, closeReason.trim()));
      setCloseOpen(false);
      setCloseReason('');
    } catch (err) {
      setPanelError(err instanceof ApiError ? err.message : 'Could not close the scheme.');
    } finally {
      setSaving(false);
    }
  };

  /* MIN(scheme balance, invoice outstanding) — the store can neither spend
   * credit the customer never paid in nor over-settle an invoice. */
  const maxRedeemable = balance
    ? Math.min(balance.availableBalance, selectedSale?.amountOutstanding ?? balance.availableBalance)
    : 0;
  const parsedRedeem = parseFloat(redeemAmount);
  const redeemValid =
    !!selectedSale &&
    !isNaN(parsedRedeem) &&
    parsedRedeem > 0 &&
    parsedRedeem <= maxRedeemable + 0.005;

  const handleRedeem = async () => {
    if (!balance) return;
    const amount = parseFloat(redeemAmount);
    if (!selectedSale) {
      setPanelError('Select the invoice the scheme balance should settle.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setPanelError('Enter a redemption amount greater than zero.');
      return;
    }
    if (amount > maxRedeemable + 0.005) {
      setPanelError(
        `Maximum redeemable against this invoice is ${formatCurrency(maxRedeemable)}.`
      );
      return;
    }
    setPanelError('');
    setSaving(true);
    try {
      applyUpdated(
        await enrollmentService.redeemScheme(balance.enrollmentId, selectedSale.id, amount)
      );
      setRedeemOpen(false);
      setSelectedSale(null);
      setSaleSearch('');
      setEligibleSales([]);
      setRedeemAmount('');
    } catch (err) {
      setPanelError(err instanceof ApiError ? err.message : 'Could not redeem the scheme balance.');
    } finally {
      setSaving(false);
    }
  };

  const loadEnrollments = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await enrollmentService.getAdminEnrollments();
      setEnrollments(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load enrollments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEnrollments();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Scheme Enrollments
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Read-only view of every customer enrollment across your active and past schemes.
          </p>
        </div>
      </div>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadEnrollments}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && enrollments.length === 0 && (
        <EmptyState
          icon={<Gem className="h-7 w-7 text-gold" />}
          title="No enrollments yet"
          description="Once customers join your schemes, their enrollments will appear here."
        />
      )}

      {!loading && !loadError && enrollments.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-4">Enrollment No.</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Scheme</th>
                  <th className="p-4 text-center">Joined</th>
                  <th className="p-4 text-center">Maturity</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {enrollments.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-mono font-bold text-[#0B0E23]">{e.enrollmentNumber}</td>
                    <td className="p-4 font-bold text-[#0B0E23]">{e.customerName}</td>
                    <td className="p-4">{e.schemeName}</td>
                    <td className="p-4 text-center">{new Date(e.joinedDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                    <td className="p-4 text-center">{new Date(e.maturityDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                    <td className="p-4 text-center">
                      <Badge variant={STATUS_VARIANT[e.status]} dot>{e.status}</Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => openDetails(e.id)}>
                          View Details
                        </Button>
                        <button
                          onClick={() => router.push(`/admin/enrollments/${e.id}/passbook`)}
                          className="p-1.5 text-slate-400 hover:text-gold hover:bg-gold/10 rounded-lg transition-colors"
                          title="View Passbook"
                        >
                          <BookOpen className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openRemarks(e)}
                          className="p-1.5 text-slate-400 hover:text-[#0B0E23] hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit Remarks"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                      {e.remarks && <div className="text-[10px] text-slate-400 text-center mt-1 truncate max-w-[160px] mx-auto">{e.remarks}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Scheme credit, closure and redemption. Read-only on the money side:
        * contributions and passbook history are never editable here. */}
      <Dialog
        isOpen={balanceLoading || !!balance}
        onClose={closeDetails}
        title={balance ? `Enrollment ${balance.enrollmentNumber}` : 'Loading…'}
        maxWidth="max-w-lg"
      >
        {balanceLoading && <p className="text-xs text-slate-500 font-medium">Loading scheme balance…</p>}

        {balance && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#0B0E23] truncate">{balance.customerName}</p>
                <p className="text-[11px] text-slate-500 font-medium truncate">
                  {balance.schemeName} · Customer {balance.customerId} · {balance.enrollmentNumber}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[balance.status]} dot>{balance.status}</Badge>
            </div>

            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {[
                ['Monthly Amount', formatCurrency(balance.monthlyAmount)],
                ['Planned Duration', `${balance.durationMonths} months`],
                ['Successful Payments', String(balance.successfulPaymentCount)],
                ['Total Paid In', formatCurrency(balance.totalPaid)],
                ['Already Redeemed', formatCurrency(balance.totalRedeemed)],
                ['Available Balance', formatCurrency(balance.availableBalance)],
                ['Maturity', new Date(balance.maturityDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-3 py-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
                  <span className="text-xs font-bold font-mono text-[#0B0E23]">{value}</span>
                </div>
              ))}
            </div>

            {balance.closedAt && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Closed</p>
                <p className="text-[11px] text-slate-700 font-medium mt-0.5">
                  {new Date(balance.closedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  {balance.closedByName && ` · ${balance.closedByName}`}
                </p>
                <p className="text-[11px] text-slate-700 font-medium">Reason: {balance.closureReason}</p>
                <p className="text-[11px] text-slate-700 font-medium mt-1">
                  Remaining redeemable balance: {formatCurrency(balance.availableBalance)} — preserved, not refunded or forfeited.
                </p>
              </div>
            )}

            {/* Contributions — immutable ledger, read only. Distinct from
              * redemptions below. */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                <BookOpen className="h-4 w-4 text-gold" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Contributions</p>
              </div>
              {!passbook || passbook.entries.length === 0 ? (
                <p className="px-3 py-2.5 text-[11px] text-slate-500 font-medium">No contributions recorded.</p>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                  {passbook.entries.map((e) => (
                    <li key={e.id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold font-mono text-emerald-700">{formatCurrency(e.amount)}</p>
                        <p className="text-[11px] text-slate-500 font-medium truncate">
                          {new Date(e.entryDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                          {e.description ? ` · ${e.description}` : ''}
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-400 font-semibold shrink-0">#{e.entryNumber}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                <Wallet className="h-4 w-4 text-gold" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Redemption History</p>
              </div>
              {balance.redemptions.length === 0 ? (
                <p className="px-3 py-2.5 text-[11px] text-slate-500 font-medium">
                  No scheme balance has been redeemed yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {balance.redemptions.map((r) => {
                    // Negative amount = balance restored by a returned scheme-settled sale.
                    const restored = r.amount < 0;
                    return (
                      <li key={r.id} className="px-3 py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`text-xs font-bold font-mono ${restored ? 'text-emerald-700' : 'text-violet-700'}`}>
                            {restored ? '+' : '-'}{formatCurrency(Math.abs(r.amount))}
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium truncate">
                            {restored ? 'Restored (return)' : 'Redeemed'} · Invoice {r.invoiceNumber} ·{' '}
                            {new Date(r.redeemedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                          </p>
                        </div>
                        <p className="text-[10px] text-slate-400 font-semibold shrink-0">{r.recordedByName || ''}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {panelError && <p className="text-[11px] font-medium text-red-600">{panelError}</p>}
          </div>
        )}

        <DialogFooter>
          {balance?.canContribute && (
            <Button variant="outline" onClick={() => { setPanelError(''); setCloseOpen(true); }}>
              <Lock className="h-3.5 w-3.5 mr-1" /> Close Scheme
            </Button>
          )}
          {balance?.canRedeem && (
            <Button
              onClick={() => {
                setPanelError('');
                setSelectedSale(null);
                setSaleSearch('');
                setRedeemAmount('');
                setRedeemOpen(true);
                void loadEligibleSales(balance, '');
              }}
            >
              Redeem For Purchase
            </Button>
          )}
          <Button variant="outline" onClick={closeDetails}>Close</Button>
        </DialogFooter>
      </Dialog>

      {/* Closing stops future contributions only. */}
      <Dialog isOpen={closeOpen} onClose={() => setCloseOpen(false)} title="Close Scheme" maxWidth="max-w-md">
        <div className="space-y-3">
          <p className="text-xs text-slate-600 font-medium">
            Stops future contributions on {balance?.enrollmentNumber}. Every payment already made
            stays on record, and the {formatCurrency(balance?.availableBalance ?? 0)} balance stays
            available for a future jewellery purchase — nothing is refunded or forfeited.
          </p>
          <Input
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            placeholder="Closure reason (required)"
          />
          {panelError && <p className="text-[11px] font-medium text-red-600">{panelError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancel</Button>
          <Button isLoading={saving} onClick={handleClose}>Confirm Closure</Button>
        </DialogFooter>
      </Dialog>

      {/* Redemption. The backend validates the amount against BOTH the available
        * balance and the invoice's outstanding, and settles it on the invoice's
        * existing payment ledger as a SCHEME_REDEMPTION row — never as cash. */}
      <Dialog isOpen={redeemOpen} onClose={() => setRedeemOpen(false)} title="Redeem For Purchase" maxWidth="max-w-md">
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {[
              ['Customer', balance?.customerName ?? '—'],
              ['Scheme', balance?.schemeName ?? '—'],
              ['Total Contributions', formatCurrency(balance?.totalPaid ?? 0)],
              ['Total Redeemed', formatCurrency(balance?.totalRedeemed ?? 0)],
              ['Available Scheme Balance', formatCurrency(balance?.availableBalance ?? 0)],
              ['Scheme Status', balance?.status ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between px-3 py-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
                <span className="text-xs font-bold text-[#0B0E23]">{value}</span>
              </div>
            ))}
          </div>

          {/* Invoice picker — same customer, intact sales, still owing money. */}
          {!selectedSale && (
            <div className="space-y-2">
              <Input
                value={saleSearch}
                onChange={(e) => setSaleSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && balance) void loadEligibleSales(balance, saleSearch);
                }}
                placeholder="Search invoice number or product, then press Enter"
              />
              {salesLoading && <p className="text-[11px] text-slate-500 font-medium">Loading invoices…</p>}
              {!salesLoading && eligibleSales.length === 0 && (
                <p className="text-[11px] text-slate-500 font-medium">
                  No unsettled invoice found for this customer.
                </p>
              )}
              {eligibleSales.length > 0 && (
                <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {eligibleSales.map((sl) => (
                    <li key={sl.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSale(sl);
                          setPanelError('');
                          setRedeemAmount(
                            String(Math.min(balance?.availableBalance ?? 0, sl.amountOutstanding))
                          );
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors"
                      >
                        <p className="text-xs font-bold font-mono text-[#0B0E23]">{sl.invoiceNumber}</p>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {sl.productName} · Total {formatCurrency(sl.finalAmount)} · Outstanding{' '}
                          {formatCurrency(sl.amountOutstanding)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selectedSale && balance && (
            <>
              <div className="rounded-xl border border-gold/40 bg-gold/5 px-3 py-2.5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold font-mono text-[#0B0E23]">{selectedSale.invoiceNumber}</p>
                  <p className="text-[11px] text-slate-600 font-medium">{selectedSale.productName}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelectedSale(null)}>
                  Change
                </Button>
              </div>

              <Input
                type="number"
                step="0.01"
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                placeholder={`Max ${maxRedeemable}`}
              />

              {/* Live settlement preview. Figures come from the sale's own
                * backend-recorded totals — no calculation engine here. */}
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {[
                  ['Sale Total', formatCurrency(selectedSale.finalAmount)],
                  ['Other Amount Paid', formatCurrency(selectedSale.amountPaid)],
                  ['Scheme Redemption', formatCurrency(redeemValid ? parsedRedeem : 0)],
                  [
                    'Remaining Customer Payment',
                    formatCurrency(
                      Math.max(0, selectedSale.amountOutstanding - (redeemValid ? parsedRedeem : 0))
                    ),
                  ],
                  [
                    'Scheme Balance After',
                    formatCurrency(
                      Math.max(0, balance.availableBalance - (redeemValid ? parsedRedeem : 0))
                    ),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
                    <span className="text-xs font-bold font-mono text-[#0B0E23]">{value}</span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-500 font-medium">
                Maximum redeemable here is {formatCurrency(maxRedeemable)} — the lower of the scheme
                balance and this invoice&apos;s outstanding. Applied as a scheme redemption, never as
                cash collected. Any remaining balance stays available for a future purchase, and any
                remaining customer payment is collected through Add Payment on the invoice.
              </p>
            </>
          )}

          {panelError && <p className="text-[11px] font-medium text-red-600">{panelError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRedeemOpen(false)}>Cancel</Button>
          <Button isLoading={saving} disabled={!redeemValid} onClick={handleRedeem}>
            Confirm Redemption
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog isOpen={!!remarksTarget} onClose={() => !remarksSaving && setRemarksTarget(null)} title="Enrollment Remarks" maxWidth="max-w-md">
        <div className="space-y-3 text-xs">
          {remarksError && <div role="alert" className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-medium">{remarksError}</div>}
          <div className="flex flex-wrap gap-1.5">
            {REMARK_PRESETS.map((r) => (
              <button key={r} type="button" onClick={() => setRemarksText(r)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200">{r}</button>
            ))}
          </div>
          <Textarea value={remarksText} onChange={(e) => setRemarksText(e.target.value)} placeholder="Custom remark (optional)" maxLength={500} />
          <p className="text-[10px] text-slate-400">Operational note only — never affects any financial record.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => saveRemarks(true)} disabled={remarksSaving}>Clear</Button>
          <Button onClick={() => saveRemarks(false)} isLoading={remarksSaving}>Save</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
