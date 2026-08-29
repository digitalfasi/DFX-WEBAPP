import { Quotation } from '@/services/billingService';
import { formatCurrency } from '@/lib/formatters';

/** Extra product/store details not carried on the QuotationResponse itself —
 *  taken from the loaded inventory quote and tenant branding at the call site.
 *  Never fabricated: a missing value is simply omitted from the document. */
export interface QuotationPrintExtras {
  storeName: string;
  storeAddress?: string | null;
  storeContact?: string | null;
  category?: string | null;
  subcategory?: string | null;
  grossWeightGrams?: number | null;
  netGoldWeightGrams?: number | null;
  huid?: string | null;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build the standalone A4 quotation document markup. All figures come from the
 * backend-computed QuotationResponse (breakdown/final/outstanding); the extras
 * are display-only product/store details. Rendered into a fresh window so only
 * the document prints — never the admin sidebar/nav (same approach as
 * printInvoice.ts).
 */
export function buildQuotationHtml(q: Quotation, extra: QuotationPrintExtras): string {
  const b = q.breakdown;
  const when = new Date(q.createdAt).toLocaleString('en-IN');

  const rows: [string, number][] = [
    // Gold Profit is an INTERNAL margin — never itemised for the customer. It is
    // folded into Gold Value so the visible rows still reconcile to Subtotal.
    ['Gold Value', b.goldValueAmount + b.goldProfitAmount],
    [`Making Charge (${b.makingChargeType})`, b.makingChargeAmount],
    [`Wastage (${b.wastageType})`, b.wastageAmount],
    ...(b.stoneChargeAmount > 0 ? ([['Stone Charge', b.stoneChargeAmount]] as [string, number][]) : []),
    ...(b.otherChargesAmount > 0 ? ([['Other Charges', b.otherChargesAmount]] as [string, number][]) : []),
  ];

  const productMeta = [
    extra.category,
    extra.subcategory,
    b.purity,
    extra.grossWeightGrams != null ? `Gross ${extra.grossWeightGrams}g` : null,
    extra.netGoldWeightGrams != null ? `Net Gold ${extra.netGoldWeightGrams}g` : null,
    extra.huid ? `HUID ${extra.huid}` : null,
  ].filter(Boolean).map(esc).join(' · ');

  const schemeRows = q.schemePreview
    .map(
      (s) =>
        `<tr><td>Scheme ${esc(s.enrollmentNumber)}</td><td class="amt">- ${formatCurrency(s.appliedAmount)}</td></tr>`
    )
    .join('');

  return `
    <html><head><title>${esc(q.quotationNumber)}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #0B0E23; margin: 0 auto; max-width: 720px; }
      .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2C6FBD; padding-bottom: 12px; }
      .store { font-size: 22px; font-weight: 800; color: #0B0E23; }
      .store-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
      .doc { text-align: right; }
      .doc .title { font-size: 13px; letter-spacing: 2px; font-weight: 700; color: #2C6FBD; text-transform: uppercase; }
      .doc .num { font-size: 15px; font-weight: 800; margin-top: 2px; }
      .doc .date { font-size: 11px; color: #64748b; margin-top: 2px; }
      .grid2 { display: flex; gap: 24px; margin-top: 16px; }
      .block { flex: 1; }
      .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 700; }
      .val { font-size: 13px; font-weight: 600; margin-top: 2px; }
      .muted { color: #64748b; font-size: 11px; margin-top: 2px; }
      table { width: 100%; margin-top: 20px; border-collapse: collapse; font-size: 13px; }
      th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; border-bottom: 1px solid #e5e7eb; padding: 6px 0; }
      td { padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
      .amt { text-align: right; font-variant-numeric: tabular-nums; }
      .sub td { border: none; padding: 3px 0; }
      .subtotal td { border-top: 1px solid #e5e7eb; padding-top: 8px; font-weight: 600; }
      .total td { border-top: 2px solid #2C6FBD; padding-top: 10px; font-size: 18px; font-weight: 800; color: #2C6FBD; }
      .note { margin-top: 20px; font-size: 11px; color: #475569; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
      .foot { margin-top: 28px; font-size: 10px; color: #94a3b8; text-align: center; }
    </style></head>
    <body>
      <div class="head">
        <div>
          <div class="store">${esc(extra.storeName)}</div>
          ${extra.storeAddress ? `<div class="store-sub">${esc(extra.storeAddress)}</div>` : ''}
          ${extra.storeContact ? `<div class="store-sub">${esc(extra.storeContact)}</div>` : ''}
        </div>
        <div class="doc">
          <div class="title">Quotation</div>
          <div class="num">${esc(q.quotationNumber)}</div>
          <div class="date">${esc(when)}</div>
        </div>
      </div>

      <div class="grid2">
        <div class="block">
          <div class="label">Customer</div>
          <div class="val">${esc(q.customerName || 'Walk-in')}</div>
          ${q.customerPhone ? `<div class="muted">${esc(q.customerPhone)}</div>` : ''}
        </div>
        <div class="block">
          <div class="label">Product</div>
          <div class="val">${esc(q.productCode)} — ${esc(q.productName)}</div>
          ${productMeta ? `<div class="muted">${productMeta}</div>` : ''}
        </div>
      </div>

      <table>
        <thead><tr><th>Description</th><th class="amt">Amount</th></tr></thead>
        <tbody>
          ${rows.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="amt">${formatCurrency(v)}</td></tr>`).join('')}
          <tr class="subtotal"><td>Subtotal</td><td class="amt">${formatCurrency(b.subtotalBeforeTax)}</td></tr>
          ${b.gstApplied ? `<tr class="sub"><td>GST (${b.taxRatePercent}%)</td><td class="amt">${formatCurrency(b.taxAmount)}</td></tr>` : ''}
          ${b.discountAmount > 0 ? `<tr class="sub"><td>Discount</td><td class="amt">- ${formatCurrency(b.discountAmount)}</td></tr>` : ''}
          <tr class="total"><td>Grand Total</td><td class="amt">${formatCurrency(q.finalAmount)}</td></tr>
          ${schemeRows}
          ${q.schemeAmountTotal > 0 ? `<tr class="subtotal"><td>Payable After Scheme</td><td class="amt">${formatCurrency(q.outstandingAmount)}</td></tr>` : ''}
        </tbody>
      </table>

      ${q.note ? `<div class="note">${esc(q.note)}</div>` : ''}

      <div class="foot">This is a quotation, not a tax invoice. Prices are subject to the prevailing gold rate at the time of sale.</div>
    </body></html>
  `;
}

/** Open the quotation in a dedicated window and trigger the browser's print
 *  dialog. The dialog's "Save as PDF" destination produces a real, usable PDF
 *  named after the quotation number — no heavy PDF dependency added. */
export function printQuotation(q: Quotation, extra: QuotationPrintExtras) {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) return;
  win.document.write(buildQuotationHtml(q, extra));
  win.document.close();
  win.focus();
  win.print();
}
