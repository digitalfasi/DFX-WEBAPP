"use client";

import React, { useState } from 'react';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Plus, Trash2, Copy, CopyPlus, ChevronDown, ChevronUp } from 'lucide-react';
import {
  billingService,
  Vendor,
  BulkPurchaseLineItem,
  Purity,
  ChargeType,
  PricingMode,
  DefaultSource,
  PURITY_OPTIONS,
  CHARGE_TYPE_OPTIONS,
  PRICING_MODE_OPTIONS,
} from '@/services/billingService';
import { ApiError } from '@/lib/apiClient';
import { formatCurrency } from '@/lib/formatters';

interface Row {
  key: string;
  productCode: string;
  productName: string;
  category: string;
  purity: Purity;
  huid: string;
  grossWeightGrams: string;
  netGoldWeightGrams: string;
  purchaseRatePerGram: string;
  purchaseCost: string;
  makingChargeType: ChargeType;
  makingChargeValue: string;
  wastageType: ChargeType;
  wastageValue: string;
  goldProfitPercent: string;
  taxRatePercent: string;
  pricingMode: PricingMode;
  customerPrice: string;
  advancedOpen: boolean;
  selected: boolean;
  sources: Record<string, DefaultSource>;
  suggestedPrice: number | null;
  profitOrLoss: number | null;
  previewError: string;
}

function emptyRow(): Row {
  return {
    key: Math.random().toString(36).slice(2),
    productCode: '', productName: '', category: '', purity: '22K', huid: '',
    grossWeightGrams: '', netGoldWeightGrams: '', purchaseRatePerGram: '', purchaseCost: '',
    makingChargeType: 'PERCENTAGE', makingChargeValue: '',
    wastageType: 'PERCENTAGE', wastageValue: '',
    goldProfitPercent: '', taxRatePercent: '',
    pricingMode: 'AUTO', customerPrice: '',
    advancedOpen: false, selected: false, sources: {},
    suggestedPrice: null, profitOrLoss: null, previewError: '',
  };
}

const APPLY_FIELD_OPTIONS: { value: string; label: string; fields: (keyof Row)[] }[] = [
  { value: 'gst', label: 'GST', fields: ['taxRatePercent'] },
  { value: 'making', label: 'Making Charge', fields: ['makingChargeType', 'makingChargeValue'] },
  { value: 'wastage', label: 'Wastage', fields: ['wastageType', 'wastageValue'] },
  { value: 'goldProfit', label: 'Gold Profit %', fields: ['goldProfitPercent'] },
  { value: 'mode', label: 'Pricing Mode', fields: ['pricingMode'] },
];

export function BulkPurchaseDialog({
  isOpen,
  onClose,
  vendors,
  onCompleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  vendors: Vendor[];
  onCompleted: (count: number) => void;
}) {
  const [vendorId, setVendorId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceRef, setInvoiceRef] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [applyField, setApplyField] = useState(APPLY_FIELD_OPTIONS[0].value);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const updateRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const applyResolved = (key: string, fields: Partial<Row>, sources: Record<string, DefaultSource>) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const next = { ...r };
      // Only fill fields the admin hasn't already typed something into —
      // never clobber a manual override.
      if (!next.makingChargeValue && fields.makingChargeValue !== undefined) {
        next.makingChargeType = fields.makingChargeType as ChargeType;
        next.makingChargeValue = fields.makingChargeValue as string;
      }
      if (!next.wastageValue && fields.wastageValue !== undefined) {
        next.wastageType = fields.wastageType as ChargeType;
        next.wastageValue = fields.wastageValue as string;
      }
      if (!next.goldProfitPercent && fields.goldProfitPercent !== undefined) next.goldProfitPercent = fields.goldProfitPercent as string;
      if (!next.taxRatePercent && fields.taxRatePercent !== undefined) next.taxRatePercent = fields.taxRatePercent as string;
      if (next.pricingMode === 'AUTO' && fields.pricingMode !== undefined) next.pricingMode = fields.pricingMode as PricingMode;
      next.sources = sources;
      return next;
    }));
  };

  const resolveForRow = async (key: string, category: string) => {
    if (!vendorId) return;
    try {
      const resolved = await billingService.resolveDefaults(vendorId, category || undefined);
      applyResolved(key, {
        makingChargeType: resolved.makingChargeType || undefined,
        makingChargeValue: resolved.makingChargeValue?.toString(),
        wastageType: resolved.wastageType || undefined,
        wastageValue: resolved.wastageValue?.toString(),
        goldProfitPercent: resolved.goldProfitPercent?.toString(),
        taxRatePercent: resolved.taxRatePercent?.toString(),
        pricingMode: resolved.pricingMode || undefined,
      }, resolved.sources);
    } catch {
      // Non-fatal — row simply stays blank for the admin to fill manually.
    }
  };

  const handleVendorChange = async (id: string) => {
    setVendorId(id);
    if (!id) return;
    for (const row of rows) {
      await resolveForRow(row.key, row.category);
    }
  };

  const addRow = () => {
    const row = emptyRow();
    setRows((prev) => [...prev, row]);
    if (vendorId) resolveForRow(row.key, '');
  };

  const duplicateRow = (key: string) => {
    const source = rows.find((r) => r.key === key);
    if (!source) return;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      const clone = { ...source, key: Math.random().toString(36).slice(2), productCode: '', selected: false };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  };

  const copyPreviousRow = (key: string) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      if (idx <= 0) return prev;
      const prevRow = prev[idx - 1];
      const next = [...prev];
      next[idx] = { ...prevRow, key: prev[idx].key, productCode: '', selected: false };
      return next;
    });
  };

  const deleteRow = (key: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  };

  const applyFieldToSelected = () => {
    const selected = rows.filter((r) => r.selected);
    if (selected.length < 2) return;
    const source = selected[0];
    const option = APPLY_FIELD_OPTIONS.find((o) => o.value === applyField);
    if (!option) return;
    setRows((prev) => prev.map((r) => {
      if (!r.selected || r.key === source.key) return r;
      const patch: Partial<Row> = {};
      option.fields.forEach((f) => { (patch as any)[f] = (source as any)[f]; });
      return { ...r, ...patch };
    }));
  };

  const refreshPreview = async (key: string) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const netWeight = parseFloat(row.netGoldWeightGrams);
    if (!netWeight || netWeight <= 0) return;
    try {
      const result = await billingService.previewPrice({
        purity: row.purity,
        netGoldWeightGrams: netWeight,
        makingChargeType: row.makingChargeType,
        makingChargeValue: parseFloat(row.makingChargeValue) || 0,
        wastageType: row.wastageType,
        wastageValue: parseFloat(row.wastageValue) || 0,
        goldProfitPercent: parseFloat(row.goldProfitPercent) || 0,
        taxRatePercent: parseFloat(row.taxRatePercent) || 0,
        purchaseCost: row.purchaseCost ? parseFloat(row.purchaseCost) : undefined,
        customerPrice: row.pricingMode !== 'AUTO' && row.customerPrice ? parseFloat(row.customerPrice) : undefined,
      });
      updateRow(key, {
        suggestedPrice: result.breakdown.finalAmount,
        profitOrLoss: result.profitOrLoss,
        previewError: '',
      });
    } catch (err) {
      updateRow(key, { previewError: err instanceof ApiError ? err.message : 'Preview failed', suggestedPrice: null, profitOrLoss: null });
    }
  };

  const handleSave = async () => {
    setError('');
    if (!vendorId) { setError('Select a vendor.'); return; }
    const items: BulkPurchaseLineItem[] = [];
    for (const r of rows) {
      if (!r.productCode.trim() || !r.productName.trim() || !r.grossWeightGrams || !r.netGoldWeightGrams || !r.taxRatePercent) {
        setError('Every row needs a Product Code, Name, Gross/Net Weight and GST %.');
        return;
      }
      // Vendor cost is compulsory per line — same rule as single-item create.
      if (!r.purchaseCost || parseFloat(r.purchaseCost) <= 0) {
        setError(`${r.productCode || 'A row'}: Purchase Cost (vendor cost) is required and must be greater than 0.`);
        return;
      }
      const gross = parseFloat(r.grossWeightGrams);
      const net = parseFloat(r.netGoldWeightGrams);
      if (net > gross) {
        setError(`${r.productCode}: Net Gold Weight cannot exceed Gross Weight.`);
        return;
      }
      items.push({
        productCode: r.productCode, productName: r.productName, category: r.category || undefined,
        huid: r.huid || undefined, purity: r.purity, grossWeightGrams: gross, netGoldWeightGrams: net,
        purchaseRatePerGram: r.purchaseRatePerGram ? parseFloat(r.purchaseRatePerGram) : undefined,
        purchaseCost: parseFloat(r.purchaseCost),
        makingChargeType: r.makingChargeType, makingChargeValue: parseFloat(r.makingChargeValue) || 0,
        wastageType: r.wastageType, wastageValue: parseFloat(r.wastageValue) || 0,
        goldProfitPercent: parseFloat(r.goldProfitPercent) || 0,
        taxRatePercent: parseFloat(r.taxRatePercent),
        pricingMode: r.pricingMode,
      });
    }
    setSaving(true);
    try {
      const created = await billingService.bulkPurchase({ vendorId, purchaseDate, purchaseInvoiceRef: invoiceRef, items });
      onCompleted(created.length);
      setRows([emptyRow()]);
      setInvoiceRef('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this purchase entry.');
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <Dialog isOpen={isOpen} onClose={() => !saving && onClose()} title="Bulk Inventory Receiving" maxWidth="max-w-6xl">
      <div className="space-y-3">
        {error && (
          <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label="Vendor *">
            <Select value={vendorId} onChange={(e) => handleVendorChange(e.target.value)}>
              <option value="">Select vendor...</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <Field label="Purchase Date *">
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
          <Field label="Invoice No.">
            <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="INV-1023" />
          </Field>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{rows.length} product{rows.length === 1 ? '' : 's'}</span>
          <div className="flex gap-2">
            {selectedCount >= 2 && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg pl-2 pr-1 py-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Apply to {selectedCount}:</span>
                <Select className="h-7 text-xs !py-1 !px-2" value={applyField} onChange={(e) => setApplyField(e.target.value)}>
                  {APPLY_FIELD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
                <Button variant="outline" size="sm" className="h-7 px-2" onClick={applyFieldToSelected}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Row
            </Button>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[50vh]">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  {['', 'Code', 'Name', 'Category', 'Purity', 'Gross g', 'Net g', 'Cost ₹ *', 'Mode', 'Price/Profit', ''].map((h) => (
                    <th key={h} className="px-2 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-500 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => (
                  <React.Fragment key={row.key}>
                    <tr className="hover:bg-slate-50/60">
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={row.selected} onChange={(e) => updateRow(row.key, { selected: e.target.checked })} />
                      </td>
                      <td className="px-2 py-1.5"><Input className="h-8 w-24 text-xs" value={row.productCode} onChange={(e) => updateRow(row.key, { productCode: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><Input className="h-8 w-32 text-xs" value={row.productName} onChange={(e) => updateRow(row.key, { productName: e.target.value })} /></td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 w-28 text-xs"
                          value={row.category}
                          onChange={(e) => updateRow(row.key, { category: e.target.value })}
                          onBlur={(e) => resolveForRow(row.key, e.target.value)}
                          placeholder="Gold Ring"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Select className="h-8 w-20 text-xs" value={row.purity} onChange={(e) => updateRow(row.key, { purity: e.target.value as Purity })}>
                          {PURITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5"><Input type="number" step="0.001" className="h-8 w-20 text-xs" value={row.grossWeightGrams} onChange={(e) => updateRow(row.key, { grossWeightGrams: e.target.value })} onBlur={() => refreshPreview(row.key)} /></td>
                      <td className="px-2 py-1.5"><Input type="number" step="0.001" className="h-8 w-20 text-xs" value={row.netGoldWeightGrams} onChange={(e) => updateRow(row.key, { netGoldWeightGrams: e.target.value })} onBlur={() => refreshPreview(row.key)} /></td>
                      <td className="px-2 py-1.5"><Input type="number" step="0.01" className="h-8 w-24 text-xs" value={row.purchaseCost} onChange={(e) => updateRow(row.key, { purchaseCost: e.target.value })} onBlur={() => refreshPreview(row.key)} /></td>
                      <td className="px-2 py-1.5">
                        <Select className="h-8 w-24 text-xs" value={row.pricingMode} onChange={(e) => updateRow(row.key, { pricingMode: e.target.value as PricingMode })}>
                          {PRICING_MODE_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.value}</option>)}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5 min-w-[110px]">
                        {row.pricingMode !== 'AUTO' && (
                          <Input type="number" step="0.01" className="h-8 w-24 text-xs mb-1" placeholder="Customer ₹" value={row.customerPrice} onChange={(e) => updateRow(row.key, { customerPrice: e.target.value })} onBlur={() => refreshPreview(row.key)} />
                        )}
                        {row.suggestedPrice !== null && (
                          <div className="font-mono text-[11px]">
                            <div className="font-bold text-[#0B0E23]">{formatCurrency(row.suggestedPrice)}</div>
                            {row.profitOrLoss !== null && (
                              <div className={row.profitOrLoss >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                {row.profitOrLoss >= 0 ? '🟢' : '🔴'} {formatCurrency(Math.abs(row.profitOrLoss))}
                              </div>
                            )}
                          </div>
                        )}
                        {row.previewError && <p className="text-[10px] text-red-500">{row.previewError}</p>}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateRow(row.key, { advancedOpen: !row.advancedOpen })} className="text-slate-400 hover:text-gold-dark" aria-label="Advanced">
                            {row.advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          <button onClick={() => duplicateRow(row.key)} className="text-slate-400 hover:text-gold-dark" aria-label="Duplicate row">
                            <CopyPlus className="h-3.5 w-3.5" />
                          </button>
                          {idx > 0 && (
                            <button onClick={() => copyPreviousRow(row.key)} className="text-slate-400 hover:text-gold-dark" aria-label="Copy previous row">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => deleteRow(row.key)} className="text-red-400 hover:text-red-600" aria-label="Delete row">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {row.advancedOpen && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={11} className="px-4 py-3">
                          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                            <AdvField label="HUID"><Input className="h-8 text-xs" value={row.huid} onChange={(e) => updateRow(row.key, { huid: e.target.value })} /></AdvField>
                            <AdvField label="Purchase Rate ₹/g"><Input type="number" step="0.01" className="h-8 text-xs" value={row.purchaseRatePerGram} onChange={(e) => updateRow(row.key, { purchaseRatePerGram: e.target.value })} /></AdvField>
                            <AdvField label={sourceLabel('Making', row.sources.making_charge)}>
                              <Select className="h-8 text-xs" value={row.makingChargeType} onChange={(e) => updateRow(row.key, { makingChargeType: e.target.value as ChargeType })}>
                                {CHARGE_TYPE_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </Select>
                            </AdvField>
                            <AdvField label="Making Value">
                              <Input type="number" step="0.01" className="h-8 text-xs" value={row.makingChargeValue} onChange={(e) => updateRow(row.key, { makingChargeValue: e.target.value })} onBlur={() => refreshPreview(row.key)} />
                            </AdvField>
                            <AdvField label={sourceLabel('Wastage', row.sources.wastage)}>
                              <Select className="h-8 text-xs" value={row.wastageType} onChange={(e) => updateRow(row.key, { wastageType: e.target.value as ChargeType })}>
                                {CHARGE_TYPE_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </Select>
                            </AdvField>
                            <AdvField label="Wastage Value">
                              <Input type="number" step="0.01" className="h-8 text-xs" value={row.wastageValue} onChange={(e) => updateRow(row.key, { wastageValue: e.target.value })} onBlur={() => refreshPreview(row.key)} />
                            </AdvField>
                            <AdvField label={sourceLabel('Gold Profit %', row.sources.gold_profit_percent)}>
                              <Input type="number" step="0.01" className="h-8 text-xs" value={row.goldProfitPercent} onChange={(e) => updateRow(row.key, { goldProfitPercent: e.target.value })} onBlur={() => refreshPreview(row.key)} />
                            </AdvField>
                            <AdvField label={sourceLabel('GST % *', row.sources.tax_rate_percent)}>
                              <Input type="number" step="0.01" className="h-8 text-xs" value={row.taxRatePercent} onChange={(e) => updateRow(row.key, { taxRatePercent: e.target.value })} onBlur={() => refreshPreview(row.key)} />
                            </AdvField>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} isLoading={saving}>Save Purchase ({rows.length} item{rows.length === 1 ? '' : 's'})</Button>
      </DialogFooter>
    </Dialog>
  );
}

function sourceLabel(label: string, source?: DefaultSource): string {
  if (!source || source === 'NONE') return label;
  return `${label} · ${source[0]}${source.slice(1).toLowerCase()}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{label}</label>
      {children}
    </div>
  );
}

function AdvField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block truncate">{label}</label>
      {children}
    </div>
  );
}
