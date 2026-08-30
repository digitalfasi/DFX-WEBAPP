import React from 'react';
import { PriceBreakdown } from '@/services/billingService';
import { formatCurrency } from '@/lib/formatters';

interface Row {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}

function chargeLabel(type: string, value: number): string {
  if (type === 'PERCENTAGE') return `${value}%`;
  if (type === 'PER_GRAM') return `${formatCurrency(value)}/g`;
  return formatCurrency(value);
}

export function PriceBreakdownCard({
  breakdown,
  margin,
}: {
  breakdown: PriceBreakdown;
  margin?: { purchaseCost: number | null; estimatedGrossMargin: number | null } | null;
}) {
  // Gold Profit is an INTERNAL margin — never itemised on this customer-facing
  // summary. It is folded into the Gold Value line so the visible rows still
  // reconcile to Subtotal (subtotal_before_tax already includes gold profit).
  const rows: Row[] = [
    { label: `Gold Value (${breakdown.netGoldWeightGrams.toFixed(3)}g)`, value: formatCurrency(breakdown.goldValueAmount + (breakdown.goldProfitAmount || 0)) },
    { label: `Making Charge (${chargeLabel(breakdown.makingChargeType, breakdown.makingChargeValue)})`, value: formatCurrency(breakdown.makingChargeAmount) },
    { label: `Wastage (${chargeLabel(breakdown.wastageType, breakdown.wastageValue)})`, value: formatCurrency(breakdown.wastageAmount) },
    { label: 'Stone Charge', value: formatCurrency(breakdown.stoneChargeAmount) },
    { label: 'Other Charges', value: formatCurrency(breakdown.otherChargesAmount) },
    { label: 'Subtotal', value: formatCurrency(breakdown.subtotalBeforeTax), muted: true },
    { label: breakdown.gstApplied ? `GST (${breakdown.taxRatePercent}%)` : 'GST (not applied)', value: formatCurrency(breakdown.taxAmount) },
    ...(breakdown.discountAmount > 0
      ? [{ label: 'Discount', value: `− ${formatCurrency(breakdown.discountAmount)}` }]
      : []),
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Price Breakdown</span>
        <span className="text-[10px] font-semibold text-slate-400">
          {breakdown.goldRateSource} rate · {breakdown.goldRateEffectiveDate}
        </span>
      </div>
      <div className="p-4 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className={`flex items-center justify-between text-xs ${row.muted ? 'pt-2 border-t border-slate-100 font-bold text-[#0B0E23]' : 'font-medium text-slate-600'}`}>
            <span>{row.label}</span>
            <span className="font-mono">{row.value}</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-3 border-t-2 border-gold/30">
          <span className="text-sm font-bold text-[#0B0E23]">Total</span>
          <span className="font-display font-extrabold text-2xl text-gold-dark">{formatCurrency(breakdown.finalAmount)}</span>
        </div>
        {margin && margin.estimatedGrossMargin !== null && (
          <div className="pt-2 mt-1 border-t border-dashed border-slate-200 space-y-2">
            {margin.purchaseCost !== null && (
              <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                <span>Purchase Cost</span>
                <span className="font-mono">{formatCurrency(margin.purchaseCost)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-500">
                {margin.estimatedGrossMargin >= 0 ? 'Profit' : 'Loss'}
                {margin.purchaseCost && margin.purchaseCost > 0
                  ? ` · ${((margin.estimatedGrossMargin / margin.purchaseCost) * 100).toFixed(1)}%`
                  : ''}
              </span>
              <span className={`font-mono ${margin.estimatedGrossMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(Math.abs(margin.estimatedGrossMargin))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
