import { billingService, Sale } from '@/services/billingService';
import { formatCurrency } from '@/lib/formatters';

/**
 * Opens a separate, minimal print window containing only the invoice — the
 * requirement is explicit that Print must not simply print the whole Admin
 * UI (sidebar/nav included). A fresh window with just this markup is the
 * smallest change that satisfies that without touching the shared layout.
 *
 * The window is opened synchronously (before any await) so the browser's
 * pop-up blocker never fires; the backend-authoritative payment ledger is then
 * fetched to itemise scheme redemption. All figures come from the sale snapshot
 * and its ledger — nothing is recomputed here. Gold Profit / purchase cost /
 * vendor cost / internal margin are never shown.
 */
export async function printInvoice(sale: Sale, businessName: string) {
  const win = window.open('', '_blank', 'width=480,height=700');
  if (!win) return;

  // Backend-authoritative payment ledger — scheme redemption settles the
  // invoice as a payment (source SCHEME_REDEMPTION) and is part of amountPaid.
  // Best-effort: if it can't be read the invoice still prints without the
  // scheme split.
  let schemeRedemption = 0;
  let schemeRef = '';
  try {
    const history = await billingService.getPaymentHistory(sale.id);
    const schemeRows = history.payments.filter((p) => p.source === 'SCHEME_REDEMPTION');
    schemeRedemption = schemeRows.reduce((t, p) => t + p.amount, 0);
    // The ledger carries no scheme NAME; its reference (enrollment no.) is the
    // only scheme identifier available on sale-scoped data.
    schemeRef = schemeRows.map((p) => p.referenceNo).filter(Boolean).join(', ');
  } catch {
    /* ledger unavailable — print the invoice without the scheme split */
  }

  // Gold Profit is an INTERNAL margin — never itemised on a customer document.
  // It is folded into the Gold Value line so the visible rows still reconcile
  // to the Subtotal (subtotalBeforeTax already includes gold profit).
  const rows: (readonly [string, number])[] = [
    ['Gold Value', sale.goldValueAmount + sale.goldProfitAmount],
    [`Making Charge (${sale.makingChargeType})`, sale.makingChargeAmount],
    [`Wastage (${sale.wastageType})`, sale.wastageAmount],
    ...(sale.stoneChargeAmount > 0 ? [['Stone Charge', sale.stoneChargeAmount] as const] : []),
    ...(sale.otherChargesAmount > 0 ? [['Other Charges', sale.otherChargesAmount] as const] : []),
    ['Subtotal', sale.subtotalBeforeTax],
    [`Tax / GST (${sale.taxRatePercent}%)`, sale.taxAmount],
    ...(sale.discountAmount > 0 ? [['Discount', -sale.discountAmount] as const] : []),
  ];

  // Payment position — customer-facing money truth. When a scheme settled part
  // of the bill, show it explicitly and split the cash portion out of the total
  // paid so every line reconciles:
  //   Payable After Scheme = finalAmount − schemeRedemption
  //   Cash Paid            = amountPaid − schemeRedemption
  //   Balance Due          = amountOutstanding  (= PayableAfterScheme − CashPaid)
  const hasScheme = schemeRedemption > 0;
  const payRows: (readonly [string, number])[] = hasScheme
    ? [
        [schemeRef ? `Scheme Redemption (${schemeRef})` : 'Scheme Redemption', -schemeRedemption],
        ['Payable After Scheme', sale.finalAmount - schemeRedemption],
        ['Cash Paid', sale.amountPaid - schemeRedemption],
        ...(sale.amountOutstanding > 0 ? [['Balance Due', sale.amountOutstanding] as const] : []),
      ]
    : [
        ['Amount Paid', sale.amountPaid],
        ...(sale.amountOutstanding > 0 ? [['Balance Due', sale.amountOutstanding] as const] : []),
      ];

  const html = `
    <html><head><title>${sale.invoiceNumber}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #0B0E23; max-width: 480px; margin: 0 auto; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .muted { color: #64748b; font-size: 12px; }
      table { width: 100%; margin-top: 16px; border-collapse: collapse; font-size: 13px; }
      td { padding: 4px 0; }
      .amt { text-align: right; }
      .total { font-weight: bold; font-size: 16px; border-top: 2px solid #C9A227; padding-top: 8px; }
      hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
    </style></head>
    <body>
      <h1>${businessName}</h1>
      <div class="muted">Invoice ${sale.invoiceNumber} · ${new Date(sale.saleTimestamp).toLocaleString('en-IN')}</div>
      <div class="muted">Customer: ${sale.customerName || sale.customerId || 'Walk-in'} ${sale.customerPhone || ''}</div>
      <hr />
      <div><strong>${sale.productCode} — ${sale.productName}</strong></div>
      <div class="muted">${sale.purity} · Gross ${sale.grossWeightGrams}g · Net ${sale.netGoldWeightGrams}g${sale.huid ? ' · HUID ' + sale.huid : ''}</div>
      <table>
        ${rows.map(([label, val]) => `<tr><td>${label}</td><td class="amt">${formatCurrency(val)}</td></tr>`).join('')}
        <tr class="total"><td>Amount Payable</td><td class="amt">${formatCurrency(sale.finalAmount)}</td></tr>
        ${payRows.map(([label, val]) => `<tr><td>${label}</td><td class="amt">${formatCurrency(val)}</td></tr>`).join('')}
      </table>
      <div class="muted" style="margin-top:12px;">Payment: ${sale.paymentMethod} (${sale.paymentStatus})</div>
    </body></html>
  `;

  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
