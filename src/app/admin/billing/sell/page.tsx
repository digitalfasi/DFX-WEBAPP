"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/form-controls';
import { Toast } from '@/components/ui/toast';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Calculator, ScanLine, CheckCircle2, RotateCcw, Gem, FileText } from 'lucide-react';
import {
  billingService, SaleQuote, Sale, PaymentMethod, PaymentStatus, SafePriceGuidance,
  PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS,
} from '@/services/billingService';
import { ApiError } from '@/lib/apiClient';
import { printQuotation } from '../_components/printQuotation';
import { formatCurrency, formatWeight } from '@/lib/formatters';
import { PriceBreakdownCard } from '../_components/PriceBreakdownCard';
import { InvoiceActions } from '../_components/InvoiceActions';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { enrollmentService, EnrollmentBalance } from '@/services/enrollmentService';
import { customerService, AdminCustomerListItem } from '@/services/customerService';

type Stage = 'scan' | 'loading' | 'review' | 'success';

export default function NewSalePage() {
  const [stage, setStage] = useState<Stage>('scan');
  const [code, setCode] = useState('');
  const [scanError, setScanError] = useState('');

  const [quote, setQuote] = useState<SaleQuote | null>(null);
  const [customerPrice, setCustomerPrice] = useState('');
  const [gstApplied, setGstApplied] = useState(true);
  const [makingValue, setMakingValue] = useState('');
  const [wastageValue, setWastageValue] = useState('');
  const [goldProfitPct, setGoldProfitPct] = useState('');
  // Quotation ("sample bill") — non-destructive: nothing is sold, no scheme
  // balance spent. Every figure comes from the backend quotation response.
  const [quotationBusy, setQuotationBusy] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [priceError, setPriceError] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<AdminCustomerListItem[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  /* Mobile-field customer resolution — entering a full mobile in the Mobile box
   * resolves an existing customer (and their schemes) without the user having to
   * find the separate search box. Kept separate from customerResults so the two
   * inputs never clobber each other's dropdown. */
  const [phoneResults, setPhoneResults] = useState<AdminCustomerListItem[]>([]);
  const [phoneSearching, setPhoneSearching] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('PAID');
  // Only meaningful for PARTIAL — the amount actually handed over at the
  // counter. A PARTIAL bill must record a real collection, not just the label.
  const [initialPayment, setInitialPayment] = useState('');

  /* Scheme redemption toward this sale. Balances are backend-derived; this
   * screen never computes scheme money. A redemption is applied only if the
   * Admin explicitly picks an enrollment and an amount. */
  const [schemeOptions, setSchemeOptions] = useState<EnrollmentBalance[]>([]);
  const [schemeLoading, setSchemeLoading] = useState(false);
  /* enrollmentId -> amount typed by the Admin. A customer may settle one bill
   * from several schemes; each selected scheme keeps its own amount so the
   * ledger records which scheme funded which rupee. */
  const [schemeAmounts, setSchemeAmounts] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Phase 5 — customer-app OTP gate for scheme redemption.
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpSaleId, setOtpSaleId] = useState<string | null>(null);
  const [otpItems, setOtpItems] = useState<{ enrollmentId: string; amount: number }[]>([]);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { branding } = useTenant();
  const { user } = useAuth();

  /* Server-side unfinished bill this screen is currently working on (if any).
   * Set when resuming a draft via ?draft=<id>, or after Save as Draft. On a
   * successful finalize the draft is removed from the open list. */
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const searchParams = useSearchParams();
  const serverDraftLoaded = useRef(false);

  /* Recalculation sequencing. Every quote request gets a number; only the
   * newest one is allowed to write state, and the previous in-flight request is
   * aborted. Without this, a slow earlier response can land after a faster
   * later one and silently overwrite the Admin's newer input with stale money. */
  const recalcSeq = useRef(0);
  const recalcAbort = useRef<AbortController | null>(null);
  const recalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Signature of the last successfully applied quote — an edit that ends up
   * back at the same inputs (retype, blur after no change) costs no request. */
  const lastQuoteKey = useRef('');

  /* Draft restore. A draft is only offered, never silently applied on top of a
   * bill in progress. */

  // Tenant-scoped customer lookup — staff search by name/phone/email rather
  // than recalling an internal usr_ id. Debounced so typing doesn't spam the API.
  useEffect(() => {
    const q = customerQuery.trim();
    if (q.length < 2 || customerId) { setCustomerResults([]); return; }
    let cancelled = false;
    setCustomerSearching(true);
    const t = setTimeout(() => {
      customerService.getAdminCustomers(1, 8, q)
        .then((r) => { if (!cancelled) setCustomerResults(r.customers); })
        .catch(() => { if (!cancelled) setCustomerResults([]); })
        .finally(() => { if (!cancelled) setCustomerSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [customerQuery, customerId]);

  const selectCustomer = (c: AdminCustomerListItem) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone ?? '');
    setCustomerQuery(c.name);
    setCustomerResults([]);
    setPhoneResults([]);
  };

  const clearCustomer = () => {
    setCustomerId('');
    setCustomerQuery('');
    setCustomerResults([]);
    setPhoneResults([]);
    setSchemeOptions([]);
    setSchemeAmounts({});
  };

  /* Editing the Mobile field is the primary way to pull up an existing customer.
   * If a customer was already resolved, changing the number drops that selection
   * (and their scheme data) first, so Customer A's schemes can never linger while
   * the box now shows Customer B's number. */
  const onMobileChange = (val: string) => {
    setCustomerPhone(val);
    if (customerId) {
      setCustomerId('');
      setSchemeOptions([]);
      setSchemeAmounts({});
    }
  };

  /* Mobile-field customer resolution. Once the Mobile box holds a full (10-digit)
   * number and no customer is selected yet, search the tenant's customers by that
   * number. Exactly one match auto-resolves the customer (which loads their
   * schemes via the customerId effect below); several matches show a picker; none
   * is a walk-in (no fake data). Same debounce/tenant-scoped search as the name
   * box, so no duplicate machinery and no per-keystroke spam. */
  useEffect(() => {
    if (customerId) { setPhoneResults([]); return; }
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length < 10) { setPhoneResults([]); return; }
    let cancelled = false;
    setPhoneSearching(true);
    const t = setTimeout(() => {
      customerService.getAdminCustomers(1, 8, digits)
        .then((r) => {
          if (cancelled) return;
          if (r.customers.length === 1) {
            selectCustomer(r.customers[0]);   // unique match → auto-resolve
            setPhoneResults([]);
          } else {
            setPhoneResults(r.customers);      // 0 = walk-in, many = user picks
          }
        })
        .catch(() => { if (!cancelled) setPhoneResults([]); })
        .finally(() => { if (!cancelled) setPhoneSearching(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerPhone, customerId]);

  /* Load the selected customer's redeemable scheme balances. Filtered to this
   * customer client-side (no by-customer endpoint), then each balance is fetched
   * from the authoritative backend. Awareness only until the Admin chooses to
   * use one. */
  useEffect(() => {
    if (!customerId) { setSchemeOptions([]); setSchemeAmounts({}); return; }
    let cancelled = false;
    setSchemeLoading(true);
    (async () => {
      try {
        const all = await enrollmentService.getAdminEnrollments();
        const mine = all.filter((e) => e.customerId === customerId && e.status !== 'CANCELLED');
        const balances = await Promise.all(mine.map((e) => enrollmentService.getEnrollmentBalance(e.id)));
        if (!cancelled) setSchemeOptions(balances.filter((b) => b.canRedeem && b.availableBalance > 0));
      } catch {
        if (!cancelled) setSchemeOptions([]);
      } finally {
        if (!cancelled) setSchemeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  const runScan = async (rawCode: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed) return;
    setScanError('');
    setStage('loading');
    try {
      const q = await billingService.getSaleQuote(trimmed, 0, true);
      setQuote(q);
      lastQuoteKey.current = [
        q.inventoryItem.productCode, '', true,
        String(q.breakdown.makingChargeValue), String(q.breakdown.wastageValue),
        String(q.breakdown.goldProfitPercent),
      ].join('|');
      setCustomerPrice(String(q.breakdown.finalAmount));
      setGstApplied(true);
      setMakingValue(String(q.breakdown.makingChargeValue));
      setWastageValue(String(q.breakdown.wastageValue));
      setGoldProfitPct(String(q.breakdown.goldProfitPercent));
      setStage('review');
    } catch (err) {
      setScanError(err instanceof ApiError ? err.message : 'Could not load this product.');
      setStage('scan');
    }
  };

  /** Every change to the price or the charge fields is re-verified against the
   * backend's own deterministic calculation — the numbers shown are never
   * computed client-side, and there is no second calculation engine here. The
   * request is debounced, sequenced and abortable; the arithmetic itself is
   * still entirely BillingCalculationEngine's, and createSale recalculates
   * server-side again before anything is saved. */
  const num = (v: string) => (v.trim() !== '' && !isNaN(parseFloat(v)) ? parseFloat(v) : undefined);

  const runRecalculate = async (
    productCode: string,
    nextPrice: string,
    nextGst: boolean,
    making: string,
    wastage: string,
    goldProfit: string
  ) => {
    const parsed = parseFloat(nextPrice);
    const hasPrice = nextPrice.trim() !== '' && !isNaN(parsed);
    const key = [productCode, hasPrice ? parsed : '', nextGst, making, wastage, goldProfit].join('|');
    if (key === lastQuoteKey.current) {
      setRecalculating(false);
      return;
    }

    recalcAbort.current?.abort();
    const controller = new AbortController();
    recalcAbort.current = controller;
    const seq = ++recalcSeq.current;

    setRecalculating(true);
    setPriceError('');
    try {
      const q = await billingService.getSaleQuote(
        productCode, 0, nextGst, hasPrice ? parsed : undefined,
        {
          makingChargeValue: num(making),
          wastageValue: num(wastage),
          goldProfitPercent: num(goldProfit),
        },
        controller.signal
      );
      /* A superseded response is dropped, never applied. */
      if (seq !== recalcSeq.current) return;
      lastQuoteKey.current = key;
      setQuote(q);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (seq !== recalcSeq.current) return;
      setPriceError(err instanceof ApiError ? err.message : 'Could not recalculate.');
    } finally {
      if (seq === recalcSeq.current) setRecalculating(false);
    }
  };

  /* Debounced entry point. Typing keeps the last good figures on screen and
   * fires one request when the Admin pauses, instead of one per keystroke. */
  const recalculate = (
    nextPrice: string,
    nextGst: boolean,
    o: { making?: string; wastage?: string; goldProfit?: string } = {},
    delayMs = 350
  ) => {
    if (!quote) return;
    const productCode = quote.inventoryItem.productCode;
    const making = o.making ?? makingValue;
    const wastage = o.wastage ?? wastageValue;
    const goldProfit = o.goldProfit ?? goldProfitPct;

    if (recalcTimer.current) clearTimeout(recalcTimer.current);
    if (delayMs <= 0) {
      void runRecalculate(productCode, nextPrice, nextGst, making, wastage, goldProfit);
      return;
    }
    recalcTimer.current = setTimeout(() => {
      void runRecalculate(productCode, nextPrice, nextGst, making, wastage, goldProfit);
    }, delayMs);
  };

  /* Drop any pending/in-flight recalculation when the screen goes away. */
  useEffect(() => () => {
    if (recalcTimer.current) clearTimeout(recalcTimer.current);
    recalcAbort.current?.abort();
  }, []);

  const resetToScan = () => {
    if (recalcTimer.current) clearTimeout(recalcTimer.current);
    recalcAbort.current?.abort();
    recalcSeq.current += 1;
    lastQuoteKey.current = '';
    setSchemeOptions([]);
    setSchemeAmounts({});
    setStage('scan');
    setCode('');
    setQuote(null);
    setCustomerPrice('');
    setGstApplied(true);
    setInitialPayment('');
    setMakingValue('');
    setWastageValue('');
    setGoldProfitPct('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerId('');
    setCustomerQuery('');
    setCustomerResults([]);
    setPaymentMethod('CASH');
    setPaymentStatus('PAID');
    setCompletedSale(null);
    setCompleteError('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  /* Unfinished bills are server-side only (see billingService drafts + the
   * Unfinished Bills page). This Sell screen no longer reads or writes the old
   * localStorage draft — the server is the single source of truth. */

  /* Resume a server-side unfinished bill opened from the Unfinished Bills list
   * (?draft=<id>). The item, gold rate and every amount are re-read live, so a
   * resumed draft can never carry a stale price — only the Admin's own inputs
   * come from the draft. */
  useEffect(() => {
    const draftId = searchParams?.get('draft');
    if (!draftId || serverDraftLoaded.current) return;
    serverDraftLoaded.current = true;
    (async () => {
      setStage('loading');
      try {
        const d = await billingService.getDraft(draftId);
        const priceStr = d.customerPrice != null ? String(d.customerPrice) : '';
        const parsedPrice = parseFloat(priceStr);
        const q = await billingService.getSaleQuote(
          d.productCode, 0, d.gstApplied,
          !isNaN(parsedPrice) ? parsedPrice : undefined,
          {
            makingChargeValue: d.makingChargeValue ?? undefined,
            wastageValue: d.wastageValue ?? undefined,
            goldProfitPercent: d.goldProfitPercent ?? undefined,
          }
        );
        setQuote(q);
        setCustomerPrice(priceStr);
        setGstApplied(d.gstApplied);
        setMakingValue(d.makingChargeValue != null ? String(d.makingChargeValue) : '');
        setWastageValue(d.wastageValue != null ? String(d.wastageValue) : '');
        setGoldProfitPct(d.goldProfitPercent != null ? String(d.goldProfitPercent) : '');
        setCustomerName(d.customerName ?? '');
        setCustomerPhone(d.customerPhone ?? '');
        setCustomerId(d.customerId ?? '');
        setCustomerQuery(d.customerQuery ?? '');
        setPaymentMethod((d.paymentMethod as PaymentMethod) ?? 'CASH');
        setPaymentStatus((d.paymentStatus as PaymentStatus) ?? 'PAID');
        setInitialPayment(d.initialPayment != null ? String(d.initialPayment) : '');
        setSchemeAmounts(
          d.schemeAmounts
            ? Object.fromEntries(Object.entries(d.schemeAmounts).map(([k, v]) => [k, String(v)]))
            : {}
        );
        setActiveDraftId(d.id);
        setStage('review');
      } catch (err) {
        setScanError(err instanceof ApiError ? err.message : 'Could not open the unfinished bill.');
        setStage('scan');
      }
    })();
  }, [searchParams]);

  /* Save the current bill as a server-side unfinished bill (draft). Creates a
   * new draft, or updates the one being resumed. Never touches inventory,
   * scheme balances or any total — only Save Bill (finalize) does that. */
  const saveAsServerDraft = async () => {
    if (!quote) return;
    setSavingDraft(true);
    try {
      const schemeNums: Record<string, number> = {};
      for (const [k, v] of Object.entries(schemeAmounts)) {
        const n = parseFloat(v);
        if (!isNaN(n) && n > 0) schemeNums[k] = n;
      }
      const input = {
        productCode: quote.inventoryItem.productCode,
        customerId: customerId.trim() || null,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        customerQuery: customerQuery.trim() || null,
        customerPrice: num(customerPrice) ?? null,
        gstApplied,
        makingChargeValue: num(makingValue) ?? null,
        wastageValue: num(wastageValue) ?? null,
        goldProfitPercent: num(goldProfitPct) ?? null,
        paymentMethod,
        paymentStatus,
        initialPayment: num(initialPayment) ?? null,
        schemeAmounts: Object.keys(schemeNums).length ? schemeNums : null,
      };
      if (activeDraftId) {
        await billingService.updateDraft(activeDraftId, input);
      } else {
        const created = await billingService.createDraft(input);
        setActiveDraftId(created.id);
      }
      setToast({ message: 'Saved to Unfinished Bills', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Could not save the draft.', type: 'error' });
    } finally {
      setSavingDraft(false);
    }
  };

  /* A resumed/created draft has become a real Sale — remove it from the open
   * list. Best-effort: a failed cleanup never blocks the completed sale. */
  const clearActiveServerDraft = async () => {
    if (!activeDraftId) return;
    try {
      await billingService.discardDraft(activeDraftId);
    } catch {
      /* ignore — the sale is already finalized; the stale draft can be
       * discarded manually from the Unfinished Bills list. */
    }
    setActiveDraftId(null);
  };

  const customerIdentified = customerId.trim().length > 0 || customerName.trim().length > 0;

  /* PARTIAL requires a collected amount strictly between 0 and the invoice
   * total. Checked here purely so the Admin gets immediate feedback — the
   * backend enforces the same rule and remains the authority. */
  const invoiceTotal = quote?.breakdown.finalAmount ?? 0;
  const parsedInitialPayment = parseFloat(initialPayment);
  const initialPaymentValid =
    initialPayment.trim() !== '' &&
    !isNaN(parsedInitialPayment) &&
    parsedInitialPayment > 0 &&
    parsedInitialPayment < invoiceTotal;
  const partialAmountOk = paymentStatus !== 'PARTIAL' || initialPaymentValid;

  /* Scheme application maths — all bounded, backend re-validates every line and
   * the combined total inside one transaction. */
  const schemeLines = schemeOptions
    .map((sc) => ({ scheme: sc, amount: parseFloat(schemeAmounts[sc.enrollmentId] ?? '') }))
    .filter((l) => !isNaN(l.amount) && l.amount > 0);
  const parsedSchemeAmount = Number(
    schemeLines.reduce((t, l) => t + l.amount, 0).toFixed(2)
  );
  const schemeApplied = schemeLines.length > 0;
  const anyLineOverBalance = schemeLines.some(
    (l) => l.amount > l.scheme.availableBalance + 0.005
  );
  // Cash the customer pays now (the non-scheme side), from the existing payment
  // controls: PAID means cash settles whatever scheme does not.
  const cashNow = schemeApplied
    ? (paymentStatus === 'PAID'
        ? Math.max(0, Number((invoiceTotal - parsedSchemeAmount).toFixed(2)))
        : paymentStatus === 'PARTIAL'
          ? (initialPaymentValid ? parsedInitialPayment : 0)
          : 0)
    : 0;
  const schemePlusCashOk =
    !schemeApplied ||
    (!anyLineOverBalance &&
     Number((parsedSchemeAmount + cashNow).toFixed(2)) <= invoiceTotal + 0.005);
  const schemeOutstanding = schemeApplied
    ? Math.max(0, Number((invoiceTotal - parsedSchemeAmount - cashNow).toFixed(2)))
    : 0;
  // Backend safe-price guidance gates finalization. PURCHASE_COST_REQUIRED =
  // the item has no vendor cost (cannot be safely sold until one is entered);
  // NOT_ACHIEVABLE = the requested price is below break-even (would be a loss).
  // The backend independently rejects both — this only prevents the click.
  const safePrice = quote?.safePrice ?? null;
  const priceBlocked =
    safePrice?.status === 'PURCHASE_COST_REQUIRED' || safePrice?.status === 'NOT_ACHIEVABLE';
  const canConfirm = customerIdentified && partialAmountOk && schemePlusCashOk && !priceBlocked;

  /* Generate a quotation ("sample bill"). Non-destructive: the backend records
   * a quotation but sells nothing, spends no scheme balance and writes no sale
   * ledger entry. The figures come from the same pricing inputs as the live
   * bill, then the printable document opens in its own window. */
  const generateQuotation = async () => {
    if (!quote || quotationBusy) return;
    setQuotationBusy(true);
    try {
      const q = await billingService.createQuotation({
        productCode: quote.inventoryItem.productCode,
        customerId: customerId || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerPrice: num(customerPrice),
        gstApplied,
        makingChargeType: quote.breakdown.makingChargeType ?? undefined,
        makingChargeValue: num(makingValue),
        wastageType: quote.breakdown.wastageType ?? undefined,
        wastageValue: num(wastageValue),
        goldProfitPercent: num(goldProfitPct),
      });
      printQuotation(q, {
        storeName: branding.brandName,
        category: quote.inventoryItem.category,
        subcategory: quote.inventoryItem.subcategory,
        grossWeightGrams: quote.inventoryItem.grossWeightGrams,
        netGoldWeightGrams: quote.inventoryItem.netGoldWeightGrams,
        huid: quote.inventoryItem.huid,
      });
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Could not generate the quotation.', type: 'error' });
    } finally {
      setQuotationBusy(false);
    }
  };

  const handleCompleteSale = async () => {
    if (!quote) return;
    setCompleteError('');
    setCompleting(true);
    try {
      const parsedPrice = parseFloat(customerPrice);
      // With a scheme redemption the sale is created for the CASH side first
      // (never PAID — that would zero the outstanding the scheme must settle),
      // then the scheme is redeemed against the created invoice. Backend
      // re-validates both and stays authoritative.
      const createStatus: PaymentStatus = schemeApplied
        ? (cashNow > 0 ? 'PARTIAL' : 'PENDING')
        : paymentStatus;
      const createInitial = schemeApplied
        ? (cashNow > 0 ? cashNow : undefined)
        : (paymentStatus === 'PARTIAL' ? parsedInitialPayment : undefined);

      let sale: Sale;
      if (activeDraftId) {
        // Resumed unfinished bill: persist the Admin's latest edits, then
        // finalize THROUGH the server draft endpoint. The server locks the
        // draft, recomputes pricing live, marks inventory SOLD, creates exactly
        // one Sale and flips the draft to FINALIZED. No second Sale is ever
        // created via createSale. A scheme selection makes the finalized Sale
        // PENDING so the existing per-sale OTP + redeem flow below settles it.
        await billingService.updateDraft(activeDraftId, {
          productCode: quote.inventoryItem.productCode,
          customerId: customerId.trim() || null,
          customerName: customerName.trim() || null,
          customerPhone: customerPhone.trim() || null,
          customerQuery: customerQuery.trim() || null,
          customerPrice: !isNaN(parsedPrice) ? parsedPrice : null,
          gstApplied,
          makingChargeValue: num(makingValue) ?? null,
          wastageValue: num(wastageValue) ?? null,
          goldProfitPercent: num(goldProfitPct) ?? null,
          paymentMethod,
          paymentStatus: createStatus,
          initialPayment: createInitial ?? null,
          schemeAmounts: schemeApplied
            ? Object.fromEntries(schemeLines.map((l) => [l.scheme.enrollmentId, l.amount]))
            : null,
        });
        sale = await billingService.finalizeDraft(activeDraftId);
        // Draft is FINALIZED server-side now — stop tracking it.
        setActiveDraftId(null);
      } else {
        sale = await billingService.createSale({
          productCode: quote.inventoryItem.productCode,
          customerId: customerId.trim() || undefined,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          customerPrice: !isNaN(parsedPrice) ? parsedPrice : undefined,
          gstApplied,
          makingChargeValue: num(makingValue),
          wastageValue: num(wastageValue),
          goldProfitPercent: num(goldProfitPct),
          paymentMethod,
          paymentStatus: createStatus,
          initialPaymentAmount: createInitial,
        });
      }

      if (schemeApplied) {
        // Phase 5: scheme redemption is sensitive — send a customer-app OTP and
        // hand off to the OTP dialog. The atomic multi-scheme redeem runs only
        // after the code verifies. The cash-side sale already exists.
        const items = schemeLines.map((l) => ({ enrollmentId: l.scheme.enrollmentId, amount: l.amount }));
        await enrollmentService.requestRedemptionOtp(sale.id);
        setOtpSaleId(sale.id);
        setOtpItems(items);
        setOtpCode('');
        setOtpError('');
        setConfirmOpen(false);
        setOtpOpen(true);
        return;
      }

      setCompletedSale(sale);
      setConfirmOpen(false);
      // Fresh (non-draft) sale finalized. A resumed draft was already flipped to
      // FINALIZED by the finalize endpoint above.
      await clearActiveServerDraft();
      setStage('success');
    } catch (err) {
      setCompleteError(err instanceof ApiError ? err.message : 'Could not complete the sale. Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  const handleResendOtp = async () => {
    if (!otpSaleId) return;
    setOtpError('');
    setOtpSending(true);
    try {
      await enrollmentService.requestRedemptionOtp(otpSaleId);
      setToast({ message: 'A new code was sent to the customer’s app', type: 'success' });
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : 'Could not resend the code.');
    } finally {
      setOtpSending(false);
    }
  };

  const handleConfirmOtp = async () => {
    if (!otpSaleId) return;
    if (otpCode.trim().length < 4) {
      setOtpError('Enter the verification code sent to the customer’s app.');
      return;
    }
    setOtpError('');
    setOtpVerifying(true);
    try {
      await enrollmentService.redeemSchemes(otpSaleId, otpItems, otpCode.trim());
      const sale = await billingService.getSale(otpSaleId);
      setCompletedSale(sale);
      setOtpOpen(false);
      await clearActiveServerDraft();
      setStage('success');
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : 'Could not verify the code. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body max-w-3xl">
      <div className="flex items-center gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="w-11 h-11 rounded-2xl bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
          <Calculator className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">New Sale</h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Scan or enter a Product Code to load pricing instantly from today&apos;s gold rate.
          </p>
        </div>
      </div>

      {(stage === 'scan' || stage === 'loading') && (
        <Card className="p-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gold/10 border border-gold/30 flex items-center justify-center">
            <ScanLine className="h-8 w-8 text-gold" />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg text-[#0B0E23]">Enter / Scan Product Code</h2>
            <p className="text-xs text-slate-500 mt-1">e.g. GN00125</p>
          </div>
          <div className="w-full max-w-sm space-y-2">
            <Input
              ref={inputRef}
              autoFocus
              disabled={stage === 'loading'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runScan(code)}
              placeholder="Product Code"
              className="text-center text-lg font-mono font-bold h-14"
              error={!!scanError}
            />
            {scanError && <p className="text-xs font-medium text-red-600">{scanError}</p>}
            <Button className="w-full h-12" isLoading={stage === 'loading'} onClick={() => runScan(code)}>
              {stage === 'loading' ? 'Loading...' : 'Load Product'}
            </Button>
          </div>
        </Card>
      )}

      {stage === 'review' && quote && (
        <div className="space-y-4">
          <Card className="p-4 flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
              {quote.inventoryItem.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={quote.inventoryItem.imageUrl} alt={quote.inventoryItem.productName} className="w-full h-full object-cover" />
              ) : (
                <Gem className="h-6 w-6 text-slate-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-500">{quote.inventoryItem.productCode}</span>
                <Badge variant="gold">{quote.inventoryItem.purity}</Badge>
                {quote.inventoryItem.huid && <span className="text-[10px] text-slate-400 font-mono">HUID {quote.inventoryItem.huid}</span>}
              </div>
              <h3 className="font-display font-bold text-base text-[#0B0E23] truncate">{quote.inventoryItem.productName}</h3>
              <p className="text-xs text-slate-500 font-medium">
                Gross {formatWeight(quote.inventoryItem.grossWeightGrams)} · Net Gold {formatWeight(quote.inventoryItem.netGoldWeightGrams)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={resetToScan}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Rescan
            </Button>
          </Card>

          <PriceComparisonPanel
            purchaseCost={quote.inventoryItem.purchaseCost}
            todaysGoldValue={quote.breakdown.goldValueAmount}
            sellingPrice={quote.breakdown.subtotalBeforeTax + quote.breakdown.taxAmount}
            customerPrice={customerPrice}
            onCustomerPriceChange={(v) => { setCustomerPrice(v); recalculate(v, gstApplied); }}
            onCustomerPriceCommit={(v) => recalculate(v, gstApplied, {}, 0)}
            recalculating={recalculating}
            error={priceError}
            historicalProfitOrLoss={quote.historicalProfitOrLoss}
            historicalProfitMarginPercent={quote.historicalProfitMarginPercent}
            currentGoldValueProfitOrLoss={quote.currentGoldValueProfitOrLoss}
            currentGoldValueMarginPercent={quote.currentGoldValueMarginPercent}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-3 gap-3">
            <BillField label={`Making (${quote.breakdown.makingChargeType === 'PERCENTAGE' ? '%' : quote.breakdown.makingChargeType === 'PER_GRAM' ? '₹/g' : '₹'})`}>
              <Input type="number" step="0.01" min="0" className="h-9 text-sm" value={makingValue}
                onChange={(e) => { setMakingValue(e.target.value); recalculate(customerPrice, gstApplied, { making: e.target.value }); }}
                onBlur={(e) => recalculate(customerPrice, gstApplied, { making: e.target.value }, 0)} />
            </BillField>
            <BillField label={`Wastage (${quote.breakdown.wastageType === 'PERCENTAGE' ? '%' : quote.breakdown.wastageType === 'PER_GRAM' ? '₹/g' : '₹'})`}>
              <Input type="number" step="0.01" min="0" className="h-9 text-sm" value={wastageValue}
                onChange={(e) => { setWastageValue(e.target.value); recalculate(customerPrice, gstApplied, { wastage: e.target.value }); }}
                onBlur={(e) => recalculate(customerPrice, gstApplied, { wastage: e.target.value }, 0)} />
            </BillField>
            <BillField label="Gold Profit %">
              <Input type="number" step="0.01" min="0" max="100" className="h-9 text-sm" value={goldProfitPct}
                onChange={(e) => { setGoldProfitPct(e.target.value); recalculate(customerPrice, gstApplied, { goldProfit: e.target.value }); }}
                onBlur={(e) => recalculate(customerPrice, gstApplied, { goldProfit: e.target.value }, 0)} />
            </BillField>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-600">GST on this bill</span>
            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => { setGstApplied(true); recalculate(customerPrice, true, {}, 0); }}
                className={`px-4 py-2 text-xs font-bold transition-colors ${gstApplied ? 'bg-gold text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                With GST
              </button>
              <button
                type="button"
                onClick={() => { setGstApplied(false); recalculate(customerPrice, false, {}, 0); }}
                className={`px-4 py-2 text-xs font-bold transition-colors border-l border-slate-200 ${!gstApplied ? 'bg-gold text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                Without GST
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Customer Name</label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer name" />
            </div>
            <div className="space-y-1 relative">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Mobile</label>
              <Input value={customerPhone} onChange={(e) => onMobileChange(e.target.value)} placeholder="+91 90000 00000" />
              {!customerId && customerPhone.replace(/\D/g, '').length >= 10 && (phoneSearching || phoneResults.length > 0) && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-xl border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
                  {phoneSearching ? (
                    <p className="px-3 py-2 text-xs text-slate-400 font-medium">Searching…</p>
                  ) : (
                    phoneResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectCustomer(c)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                      >
                        <span className="block text-xs font-bold text-[#0B0E23] truncate">{c.name}</span>
                        <span className="block text-[10px] text-slate-500 font-medium truncate">
                          {[c.customerCode, c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1 sm:col-span-2 relative">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Existing Customer (optional)
              </label>
              {customerId ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <span className="text-xs font-bold text-emerald-800 truncate">
                    {customerName}{customerPhone ? ` · ${customerPhone}` : ''}
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearCustomer}>Change</Button>
                </div>
              ) : (
                <>
                  <Input
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder="Search by name, phone or email"
                  />
                  {customerQuery.trim().length >= 2 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-xl border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
                      {customerSearching ? (
                        <p className="px-3 py-2 text-xs text-slate-400 font-medium">Searching…</p>
                      ) : customerResults.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400 font-medium">
                          No customer found — leave blank for a walk-in sale.
                        </p>
                      ) : (
                        customerResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => selectCustomer(c)}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                          >
                            <span className="block text-xs font-bold text-[#0B0E23] truncate">{c.name}</span>
                            <span className="block text-[10px] text-slate-500 font-medium truncate">
                              {[c.customerCode, c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Payment Method</label>
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Payment Status</label>
              <Select
                value={paymentStatus}
                onChange={(e) => {
                  const next = e.target.value as PaymentStatus;
                  setPaymentStatus(next);
                  if (next !== 'PARTIAL') setInitialPayment('');
                }}
              >
                {PAYMENT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </div>

          {/* Scheme balance — shown for any resolved existing customer. When the
            * customer has no redeemable credit we say so explicitly (not an
            * error, not hidden). Awareness + explicit opt-in; the Admin chooses
            * whether and how much to apply. Never auto-redeemed. */}
          {customerId && (
            <div className="space-y-2 bg-violet-50/60 border border-violet-200 rounded-xl p-4">
              <label className="text-[10px] font-bold text-violet-800 uppercase tracking-wider block">
                Customer Scheme Credit
              </label>
              {schemeLoading ? (
                <p className="text-[11px] text-slate-500 font-medium">Loading scheme balance…</p>
              ) : schemeOptions.length === 0 ? (
                <p className="text-[11px] text-slate-500 font-medium">
                  This customer has no redeemable scheme balance.
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Enter an amount against any scheme the customer wants to use. Leave a scheme
                    blank to skip it — all selected schemes settle in one transaction.
                  </p>

                  <ul className="rounded-xl border border-violet-200 bg-white divide-y divide-violet-100">
                    {schemeOptions.map((sc) => {
                      const raw = schemeAmounts[sc.enrollmentId] ?? '';
                      const amt = parseFloat(raw);
                      const used = !isNaN(amt) && amt > 0 ? amt : 0;
                      const over = used > sc.availableBalance + 0.005;
                      return (
                        <li key={sc.enrollmentId} className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#0B0E23] truncate">{sc.schemeName}</p>
                              <p className="text-[11px] text-slate-500 font-medium truncate">{sc.enrollmentNumber}</p>
                              <p className="text-[11px] text-slate-500 font-medium truncate">
                                Total Paid {formatCurrency(sc.totalPaid)} · Used {formatCurrency(sc.totalRedeemed)}
                                {' · '}
                                <span className="font-bold text-violet-700">Available {formatCurrency(sc.availableBalance)}</span>
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setSchemeAmounts((prev) => ({
                                  ...prev,
                                  // Offer the most this scheme can usefully cover: its own
                                  // balance, capped by what the invoice still needs.
                                  [sc.enrollmentId]: String(
                                    Math.max(
                                      0,
                                      Math.min(
                                        sc.availableBalance,
                                        Number((invoiceTotal - (parsedSchemeAmount - used)).toFixed(2))
                                      )
                                    )
                                  ),
                                }))
                              }
                            >
                              Use max
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 items-center">
                            <Input
                              type="number"
                              step="0.01"
                              value={raw}
                              onChange={(e) =>
                                setSchemeAmounts((prev) => ({ ...prev, [sc.enrollmentId]: e.target.value }))
                              }
                              placeholder="0.00"
                            />
                            <p className="text-[11px] font-medium text-slate-600 text-right">
                              Remaining after:{' '}
                              <span className="font-mono font-bold">
                                {formatCurrency(Math.max(0, Number((sc.availableBalance - used).toFixed(2))))}
                              </span>
                            </p>
                          </div>
                          {over && (
                            <p className="text-[11px] font-medium text-red-600">
                              Exceeds this scheme&apos;s available balance.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invoice</p>
                      <p className="text-sm font-bold text-[#0B0E23]">{formatCurrency(invoiceTotal)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Scheme{schemeLines.length > 1 ? ` (${schemeLines.length})` : ''}
                      </p>
                      <p className="text-sm font-bold text-violet-700">{formatCurrency(parsedSchemeAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cash + Outstanding</p>
                      <p className="text-sm font-bold text-amber-700">
                        {formatCurrency(Math.max(0, Number((invoiceTotal - parsedSchemeAmount).toFixed(2))))}
                      </p>
                    </div>
                  </div>

                  {schemeApplied && (
                    <p className="text-[11px] font-medium text-violet-800">
                      Paying now (cash): {formatCurrency(cashNow)} · Outstanding after: {formatCurrency(schemeOutstanding)}.
                      Scheme credit settles the invoice — it is not counted as cash.
                    </p>
                  )}
                  {!schemePlusCashOk && (
                    <p className="text-[11px] font-medium text-red-600">
                      Each scheme amount must stay within its own balance, and scheme + cash cannot
                      exceed the invoice total.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {paymentStatus === 'PARTIAL' && (
            <div className="space-y-2 bg-amber-50/60 border border-amber-200 rounded-xl p-4">
              <label className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                Amount Collected Now
              </label>
              <Input
                type="number"
                step="0.01"
                value={initialPayment}
                onChange={(e) => setInitialPayment(e.target.value)}
                placeholder="0.00"
              />
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</p>
                  <p className="text-sm font-bold text-[#0B0E23]">{formatCurrency(invoiceTotal)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paying Now</p>
                  <p className="text-sm font-bold text-emerald-700">
                    {formatCurrency(initialPaymentValid ? parsedInitialPayment : 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Outstanding</p>
                  <p className="text-sm font-bold text-amber-700">
                    {formatCurrency(initialPaymentValid ? invoiceTotal - parsedInitialPayment : invoiceTotal)}
                  </p>
                </div>
              </div>
              {!initialPaymentValid && (
                <p className="text-[11px] font-medium text-amber-800">
                  Enter an amount greater than 0 and less than the invoice total. To collect the full
                  amount, set Payment Status to PAID instead.
                </p>
              )}
            </div>
          )}

          <PriceBreakdownCard breakdown={quote.breakdown} />

          {safePrice && (
            <SafePricePanel guidance={safePrice} currentPrice={quote.breakdown.finalAmount} />
          )}

          {!customerIdentified && (
            <p className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Enter a customer name (or an existing Customer ID) to continue.
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-12"
              isLoading={quotationBusy}
              disabled={recalculating}
              onClick={generateQuotation}
              title="Generate a printable quotation / sample bill — nothing is sold"
            >
              <FileText className="h-4 w-4 mr-1.5" /> Quotation
            </Button>
            <Button
              variant="outline"
              className="h-12"
              isLoading={savingDraft}
              disabled={recalculating}
              onClick={saveAsServerDraft}
            >
              {activeDraftId ? 'Update Draft' : 'Save as Draft'}
            </Button>
            <Button className="flex-1 h-12" disabled={!canConfirm || recalculating} onClick={() => setConfirmOpen(true)}>
              Save Bill · {formatCurrency(quote.breakdown.finalAmount)}
            </Button>
          </div>
        </div>
      )}

      {stage === 'success' && completedSale && (
        <Card className="p-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg text-[#0B0E23]">Bill Saved</h2>
            <p className="text-xs text-slate-500 mt-1 font-mono">Invoice {completedSale.invoiceNumber}</p>
          </div>
          <p className="font-display font-extrabold text-3xl text-gold-dark">{formatCurrency(completedSale.finalAmount)}</p>
          <p className="text-xs text-slate-500">
            {completedSale.productCode} — {completedSale.productName} is now marked SOLD.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <InvoiceActions sale={completedSale} businessName={branding.brandName} />
          </div>
          <Button className="w-full max-w-xs h-12" onClick={resetToScan}>
            <ScanLine className="h-4 w-4 mr-2" /> Start Next Sale
          </Button>
        </Card>
      )}

      <Dialog isOpen={confirmOpen} onClose={() => !completing && setConfirmOpen(false)} title="Save Bill" maxWidth="max-w-md">
        {quote && (
          <div className="space-y-3">
            {completeError && (
              <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {completeError}
              </div>
            )}
            <p className="text-sm text-slate-600">
              Sell <strong>{quote.inventoryItem.productCode} — {quote.inventoryItem.productName}</strong> to{' '}
              <strong>{customerName || customerId}</strong> for
            </p>
            <p className="font-display font-extrabold text-3xl text-gold-dark text-center py-2">
              {formatCurrency(quote.breakdown.finalAmount)}
            </p>
            <p className="text-[11px] text-slate-400 text-center">
              This will permanently mark the item SOLD and finalize the invoice. This cannot be undone.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={completing}>Cancel</Button>
          <Button onClick={handleCompleteSale} isLoading={completing}>Finalize Sale</Button>
        </DialogFooter>
      </Dialog>

      <Dialog isOpen={otpOpen} onClose={() => !otpVerifying && !otpSending && setOtpOpen(false)} title="Verify Customer to Redeem Scheme" maxWidth="max-w-md">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">A verification code was sent to the customer&apos;s app. Enter it to release the scheme balance. The invoice is created; only the scheme redemption is pending this code.</p>
          {otpError && <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{otpError}</div>}
          <Input value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6-digit code" autoFocus />
          <button type="button" onClick={handleResendOtp} disabled={otpSending || otpVerifying} className="text-[11px] font-semibold text-gold-dark hover:underline disabled:opacity-40">{otpSending ? 'Sending…' : 'Resend code'}</button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOtpOpen(false)} disabled={otpVerifying || otpSending}>Cancel</Button>
          <Button onClick={handleConfirmOtp} isLoading={otpVerifying}>Verify &amp; Redeem</Button>
        </DialogFooter>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/**
 * The most important section of the screen. Plain numbers only — never a
 * recommendation ("you should sell" / "approved" / "profit too low" are
 * explicitly forbidden). The Admin decides; this only shows Vendor Price,
 * Today's Gold Value, Selling Price, the editable Customer Price, and
 * whether that price is a profit or a loss.
 */
function PriceComparisonPanel({
  purchaseCost,
  todaysGoldValue,
  sellingPrice,
  customerPrice,
  onCustomerPriceChange,
  onCustomerPriceCommit,
  recalculating,
  error,
  historicalProfitOrLoss,
  historicalProfitMarginPercent,
  currentGoldValueProfitOrLoss,
  currentGoldValueMarginPercent,
}: {
  purchaseCost: number | null;
  todaysGoldValue: number;
  sellingPrice: number;
  customerPrice: string;
  onCustomerPriceChange: (v: string) => void;
  onCustomerPriceCommit: (v: string) => void;
  recalculating: boolean;
  error: string;
  /** All backend-computed (Phase A), never re-derived client-side. Null when
   * purchase cost isn't tracked or the caller is a non-privileged Staff role. */
  historicalProfitOrLoss: number | null;
  historicalProfitMarginPercent: number | null;
  currentGoldValueProfitOrLoss: number | null;
  currentGoldValueMarginPercent: number | null;
}) {
  const parsed = parseFloat(customerPrice);
  const hasPrice = customerPrice.trim() !== '' && !isNaN(parsed);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center sm:text-left">
        {purchaseCost !== null && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Purchase Cost</p>
            <p className="font-mono font-bold text-base text-[#0B0E23]">{formatCurrency(purchaseCost)}</p>
          </div>
        )}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Today&apos;s Gold Value</p>
          <p className="font-mono font-bold text-base text-[#0B0E23]">{formatCurrency(todaysGoldValue)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Selling Price</p>
          <p className="font-mono font-bold text-base text-[#0B0E23]">{formatCurrency(sellingPrice)}</p>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 space-y-2">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Customer Price</label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={customerPrice}
          disabled={recalculating}
          onChange={(e) => onCustomerPriceChange(e.target.value)}
          onBlur={(e) => onCustomerPriceCommit(e.target.value)}
          className="text-center text-2xl font-mono font-extrabold h-16"
          placeholder="₹0"
        />
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      </div>

      {hasPrice && (historicalProfitOrLoss !== null || currentGoldValueProfitOrLoss !== null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <ProfitView
            label="Profit / Loss (vs Purchase Cost)"
            hint="vs vendor purchase cost"
            value={historicalProfitOrLoss}
            marginPercent={historicalProfitMarginPercent}
          />
          <ProfitView
            label="Today's Gold Value Profit / Loss"
            hint="vs current gold value"
            value={currentGoldValueProfitOrLoss}
            marginPercent={currentGoldValueMarginPercent}
          />
        </div>
      )}
    </div>
  );
}

/** One backend-computed profit view. Signed: positive = profit, negative =
 * loss, zero = break-even. Never recalculated client-side; margin shown only
 * when the backend supplies it. */
function ProfitView({
  label, hint, value, marginPercent,
}: {
  label: string;
  hint: string;
  value: number | null;
  marginPercent: number | null;
}) {
  if (value === null) return null;
  const profit = value > 0;
  const loss = value < 0;
  // Static class strings — Tailwind cannot detect dynamically-built class names.
  const box = profit
    ? 'bg-emerald-50 border-emerald-200'
    : loss ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200';
  const head = profit ? 'text-emerald-700' : loss ? 'text-red-700' : 'text-slate-700';
  const sub = profit ? 'text-emerald-600' : loss ? 'text-red-600' : 'text-slate-600';
  const word = profit ? '🟢 Profit' : loss ? '🔴 Loss' : 'Break-even';
  return (
    <div className={`rounded-xl p-3 text-center border ${box}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${head}`}>{label}</p>
      <p className={`font-mono font-extrabold text-base mt-0.5 ${head}`}>
        {loss ? '-' : ''}{formatCurrency(Math.abs(value))}
      </p>
      <p className={`text-[10px] font-semibold ${sub}`}>
        {word}{marginPercent !== null ? ` · ${marginPercent.toFixed(2)}%` : ''}
      </p>
      <p className="text-[9px] text-slate-400 font-medium mt-0.5">{hint}</p>
    </div>
  );
}

/** Backend-authoritative safe-price / discount guidance. Every figure comes
 * from the quote's safe_price payload — nothing is recomputed here. */
function SafePricePanel({ guidance, currentPrice }: { guidance: SafePriceGuidance; currentPrice: number }) {
  const { status, minimumSafePrice, message, isLoss } = guidance;
  const roomToDrop =
    minimumSafePrice !== null ? Math.max(0, Number((currentPrice - minimumSafePrice).toFixed(2))) : null;

  if (status === 'PURCHASE_COST_REQUIRED') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">Purchase Cost Required</p>
        <p className="text-[11px] font-medium text-red-700 mt-0.5">{message}</p>
        <p className="text-[10px] text-red-500 font-medium mt-1">
          Open this item in Inventory, enter its vendor Purchase Cost, then reload the bill. Sale is blocked until then.
        </p>
      </div>
    );
  }

  const blocked = status === 'NOT_ACHIEVABLE';
  const box = blocked
    ? 'border-red-200 bg-red-50'
    : status === 'ADJUSTABLE' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50';
  const head = blocked ? 'text-red-700' : status === 'ADJUSTABLE' ? 'text-amber-800' : 'text-emerald-700';
  const title = blocked ? 'Below Safe Price' : status === 'ADJUSTABLE' ? 'Discount Within Limit' : 'Safe Price';

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${box}`}>
      <div className="flex items-center justify-between">
        <p className={`text-[11px] font-bold uppercase tracking-wider ${head}`}>{title}</p>
        {isLoss && <span className="text-[10px] font-bold text-red-600 uppercase">Loss</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
        <Stat label="Current Price" value={formatCurrency(currentPrice)} />
        {minimumSafePrice !== null && <Stat label="Minimum Safe Price" value={formatCurrency(minimumSafePrice)} />}
        {roomToDrop !== null && <Stat label="Max Further Discount" value={formatCurrency(roomToDrop)} />}
      </div>
      {message && <p className={`text-[11px] font-medium mt-1.5 ${head}`}>{message}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="font-mono font-bold text-xs text-[#0B0E23]">{value}</p>
    </div>
  );
}

/** Compact inline bill-input cell — keeps the pre-confirmation editor
 * POS-dense rather than turning it into a full form. */
function BillField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{label}</label>
      {children}
    </div>
  );
}
