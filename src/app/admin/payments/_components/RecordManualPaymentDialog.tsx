"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { customerService, AdminCustomerListItem } from '@/services/customerService';
import { enrollmentService, AdminEnrollment, EnrollmentBalance } from '@/services/enrollmentService';
import { paymentService, PaymentMethod } from '@/services/paymentService';
import { ApiError } from '@/lib/apiClient';

const METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'ONLINE'];

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Fired after a payment is successfully recorded, so the parent can refresh. */
  onRecorded: () => void;
}

/**
 * Customer-first Record Manual Payment.
 *
 * Flow: search customer → pick customer → pick one of their ACTIVE enrollments →
 * review backend-provided coverage → enter amount + method → POST /payments/manual.
 *
 * Every rupee/month figure shown here comes from the backend (customer search,
 * GET /enrollments?customer_id, GET /enrollments/{id}/balance). This component
 * never derives the financial truth; the client-side amount checks below are
 * only fast UX hints — the backend re-validates the multiple, the maturity cap
 * and the atomic passbook write authoritatively on submit.
 */
export default function RecordManualPaymentDialog({ isOpen, onClose, onRecorded }: Props) {
  // Step 1 — customer search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminCustomerListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Step 2 — selected customer + their enrollments
  const [customer, setCustomer] = useState<AdminCustomerListItem | null>(null);
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [enrollmentsError, setEnrollmentsError] = useState('');

  // Step 3 — selected enrollment + authoritative balance
  const [balance, setBalance] = useState<EnrollmentBalance | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  // Step 4 — payment entry
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [remarks, setRemarks] = useState('');
  const [amountError, setAmountError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const resetAll = () => {
    setQuery(''); setResults([]); setSearching(false); setSearchError('');
    setCustomer(null); setEnrollments([]); setLoadingEnrollments(false); setEnrollmentsError('');
    setBalance(null); setLoadingBalance(false); setBalanceError('');
    setAmount(0); setMethod('CASH'); setRemarks(''); setAmountError(''); setFormError(''); setSaving(false);
  };

  // Reset whenever the dialog is (re)opened, so no stale customer/enrollment leaks in.
  useEffect(() => {
    if (isOpen) resetAll();
  }, [isOpen]);

  // Debounced customer search. Only runs while no customer is selected.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isOpen || customer) return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); setSearchError(''); return; }
    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await customerService.getAdminCustomers(1, 10, q);
        setResults(res.customers);
        setSearchError('');
      } catch (err) {
        setResults([]);
        setSearchError(err instanceof ApiError ? err.message : 'Search failed.');
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, customer, isOpen]);

  const activeEnrollments = useMemo(
    () => enrollments.filter((e) => e.status === 'ACTIVE'),
    [enrollments],
  );

  const selectCustomer = async (c: AdminCustomerListItem) => {
    setCustomer(c);
    setResults([]);
    setEnrollments([]);
    setBalance(null);
    setLoadingEnrollments(true);
    setEnrollmentsError('');
    try {
      const list = await enrollmentService.getAdminEnrollments(c.id);
      setEnrollments(list);
    } catch (err) {
      setEnrollmentsError(err instanceof ApiError ? err.message : 'Could not load enrollments.');
    } finally {
      setLoadingEnrollments(false);
    }
  };

  const selectEnrollment = async (e: AdminEnrollment) => {
    setLoadingBalance(true);
    setBalanceError('');
    setBalance(null);
    setAmount(0); setAmountError(''); setFormError('');
    try {
      const bal = await enrollmentService.getEnrollmentBalance(e.id);
      setBalance(bal);
    } catch (err) {
      setBalanceError(err instanceof ApiError ? err.message : 'Could not load enrollment balance.');
    } finally {
      setLoadingBalance(false);
    }
  };

  const clearCustomer = () => { resetAll(); };
  const clearEnrollment = () => { setBalance(null); setBalanceError(''); setAmount(0); setAmountError(''); setFormError(''); };

  // Derived display values (from backend numbers only).
  const remainingMonths = balance ? Math.max(0, balance.durationMonths - balance.monthsPaid) : 0;
  const remainingAmount = balance ? Math.max(0, balance.maturityAmount - balance.totalPaid) : 0;

  const validateAmount = (): boolean => {
    if (!balance) return false;
    if (!amount || amount <= 0) { setAmountError('Enter an amount greater than ₹0'); return false; }
    if (balance.monthlyAmount > 0 && Math.abs(amount % balance.monthlyAmount) > 0.005) {
      setAmountError(`Must be a whole-month multiple of ${formatCurrency(balance.monthlyAmount)}`);
      return false;
    }
    if (amount > remainingAmount + 0.005) {
      setAmountError(`Cannot exceed the remaining contractual amount (${formatCurrency(remainingAmount)})`);
      return false;
    }
    setAmountError('');
    return true;
  };

  const submit = async () => {
    setFormError('');
    if (!balance) return;
    if (!balance.canContribute) { setFormError('This enrollment cannot accept contributions.'); return; }
    if (!validateAmount()) return;
    setSaving(true);
    try {
      await paymentService.recordManualPayment({
        enrollmentId: balance.enrollmentId,
        amount,
        paymentMethod: method,
        remarks: remarks.trim() || undefined,
      });
      onRecorded();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.errors.length > 0) {
        const amt = err.errors.find((e) => e.field === 'amount');
        if (amt) setAmountError(amt.message || 'Invalid amount');
        else setFormError(err.errors[0].message || err.message);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Could not record payment. Please try again.');
      }
      // Reload the balance so the UI reflects true backend state after any failure.
      try { setBalance(await enrollmentService.getEnrollmentBalance(balance.enrollmentId)); } catch { /* keep prior */ }
    } finally {
      setSaving(false);
    }
  };

  const label = (t: string) => <label className="font-bold text-slate-500 uppercase text-[10px]">{t}</label>;

  return (
    <Dialog isOpen={isOpen} onClose={() => !saving && onClose()} title="Record Manual Payment">
      <div className="space-y-3.5 text-xs">
        {/* STEP 1 — search / STEP 2 — customer chosen */}
        {!customer ? (
          <div className="space-y-2">
            {label('Search Customer *')}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, mobile number or customer ID"
                className="pl-9"
              />
            </div>
            {searching && <p className="text-[11px] text-slate-400">Searching…</p>}
            {searchError && <p className="text-[11px] text-red-600 font-medium">{searchError}</p>}
            {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
              <p className="text-[11px] text-slate-400">No customer found.</p>
            )}
            <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCustomer(c)}
                  className="w-full text-left px-2 py-2 hover:bg-slate-50 rounded-md"
                >
                  <div className="font-bold text-[#0B0E23]">{c.name}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {c.phone || '—'} · {c.customerCode || '—'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
            <div>
              <div className="font-bold text-[#0B0E23]">{customer.name}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                {customer.phone || '—'} · {customer.customerCode || '—'}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={clearCustomer} disabled={saving}>Change</Button>
          </div>
        )}

        {/* STEP 3 — pick an active enrollment */}
        {customer && !balance && (
          <div className="space-y-2">
            {loadingBalance && <p className="text-[11px] text-slate-400">Loading enrollment…</p>}
            {loadingEnrollments ? (
              <p className="text-[11px] text-slate-400">Loading active schemes…</p>
            ) : enrollmentsError ? (
              <p className="text-[11px] text-red-600 font-medium">{enrollmentsError}</p>
            ) : activeEnrollments.length === 0 ? (
              <p className="text-[11px] text-slate-400">This customer has no active scheme enrollments.</p>
            ) : (
              <>
                {label('Active Schemes')}
                {balanceError && <p className="text-[11px] text-red-600 font-medium">{balanceError}</p>}
                {activeEnrollments.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => selectEnrollment(e)}
                    className="w-full text-left border border-slate-200 rounded-lg px-3 py-2 hover:border-gold hover:bg-gold/5 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0B0E23]">{e.schemeName}</span>
                      <Badge variant="success" dot>{e.status}</Badge>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {formatCurrency(e.monthlyAmount)} / month · {e.monthsPaid}/{e.durationMonths} paid ·
                      Next due {fmtDate(e.nextDueDate)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{e.enrollmentNumber}</div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* STEP 4 — coverage context + payment entry */}
        {balance && (
          <div className="space-y-3">
            <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#0B0E23]">{balance.schemeName}</span>
                <button type="button" onClick={clearEnrollment} className="text-[11px] text-slate-500 hover:text-[#0B0E23] flex items-center gap-1">
                  <ArrowLeft className="w-3 h-3" /> Change scheme
                </button>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">{balance.enrollmentNumber}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] pt-1">
                <span className="text-slate-500">Monthly</span><span className="text-right font-mono">{formatCurrency(balance.monthlyAmount)}</span>
                <span className="text-slate-500">Duration</span><span className="text-right font-mono">{balance.durationMonths} mo</span>
                <span className="text-slate-500">Base maturity</span><span className="text-right font-mono">{formatCurrency(balance.maturityAmount)}</span>
                <span className="text-slate-500">Months paid</span><span className="text-right font-mono">{balance.monthsPaid}/{balance.durationMonths}</span>
                <span className="text-slate-500">Remaining months</span><span className="text-right font-mono">{remainingMonths}</span>
                <span className="text-slate-500">Total paid</span><span className="text-right font-mono">{formatCurrency(balance.totalPaid)}</span>
                <span className="text-slate-500">Remaining amount</span><span className="text-right font-mono font-bold text-gold-dark">{formatCurrency(remainingAmount)}</span>
                <span className="text-slate-500">Next due</span><span className="text-right font-mono">{fmtDate(balance.nextDueDate)}</span>
                <span className="text-slate-500">Status</span><span className="text-right">{balance.status}</span>
              </div>
            </div>

            {!balance.canContribute || remainingMonths === 0 ? (
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {remainingMonths === 0
                  ? 'Fully covered — this enrollment has reached its contractual maturity.'
                  : `This enrollment cannot accept contributions (status ${balance.status}).`}
              </div>
            ) : (
              <>
                {formError && (
                  <div role="alert" className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-medium">{formError}</div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    {label('Amount (₹) *')}
                    <Input
                      type="number"
                      error={!!amountError}
                      value={amount || ''}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      placeholder={String(balance.monthlyAmount)}
                    />
                  </div>
                  <div className="space-y-1">
                    {label('Method *')}
                    <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                      {METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                    </Select>
                  </div>
                </div>
                {amountError && <p className="text-[11px] text-red-600 font-medium">{amountError}</p>}
                <p className="text-[10px] text-slate-400">
                  Whole-month multiple of {formatCurrency(balance.monthlyAmount)} (e.g.{' '}
                  {formatCurrency(balance.monthlyAmount)}, {formatCurrency(balance.monthlyAmount * 2)},{' '}
                  {formatCurrency(balance.monthlyAmount * 4)}). Backend derives months from the amount and rejects
                  non-multiples or amounts past maturity.
                </p>
                <div className="space-y-1">
                  {label('Remarks')}
                  <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Counter cash collection" />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        {balance && balance.canContribute && remainingMonths > 0 && (
          <Button size="sm" isLoading={saving} onClick={submit}>Record Payment</Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
