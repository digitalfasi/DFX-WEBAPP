"use client";

import React, { useEffect, useState } from 'react';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Toast } from '@/components/ui/toast';
import { Store } from 'lucide-react';
import {
  billingService, ChargeType, CHARGE_TYPE_OPTIONS, PRICING_MODE_OPTIONS,
} from '@/services/billingService';
import { ApiError } from '@/lib/apiClient';

interface DefaultsForm {
  makingChargeType: ChargeType;
  makingChargeValue: string;
  wastageType: ChargeType;
  wastageValue: string;
  goldProfitPercent: string;
  taxRatePercent: string;
  defaultPricingMode: string;
}

const emptyForm: DefaultsForm = {
  makingChargeType: 'PERCENTAGE', makingChargeValue: '',
  wastageType: 'PERCENTAGE', wastageValue: '',
  goldProfitPercent: '', taxRatePercent: '', defaultPricingMode: '',
};

function toPayload(f: DefaultsForm) {
  return {
    makingChargeType: f.makingChargeValue ? f.makingChargeType : undefined,
    makingChargeValue: f.makingChargeValue ? parseFloat(f.makingChargeValue) : undefined,
    wastageType: f.wastageValue ? f.wastageType : undefined,
    wastageValue: f.wastageValue ? parseFloat(f.wastageValue) : undefined,
    goldProfitPercent: f.goldProfitPercent ? parseFloat(f.goldProfitPercent) : undefined,
    taxRatePercent: f.taxRatePercent ? parseFloat(f.taxRatePercent) : undefined,
    defaultPricingMode: (f.defaultPricingMode || undefined) as 'AUTO' | 'MANUAL' | undefined,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{label}</label>
      {children}
    </div>
  );
}

// Store Defaults are the single pricing-default source. Category and Vendor
// pricing defaults are retired — they no longer affect pricing resolution, so
// they are not shown here.
export function BillingDefaultsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [form, setForm] = useState<DefaultsForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    billingService.getStoreDefaults().then((d) => setForm({
      makingChargeType: d.makingChargeType || 'PERCENTAGE',
      makingChargeValue: d.makingChargeValue?.toString() ?? '',
      wastageType: d.wastageType || 'PERCENTAGE',
      wastageValue: d.wastageValue?.toString() ?? '',
      goldProfitPercent: d.goldProfitPercent?.toString() ?? '',
      taxRatePercent: d.taxRatePercent?.toString() ?? '',
      defaultPricingMode: d.defaultPricingMode === 'HYBRID' ? '' : (d.defaultPricingMode || ''),
    })).catch(() => {});
  }, [isOpen]);

  const save = async () => {
    setSaving(true);
    try {
      await billingService.updateStoreDefaults(toPayload(form));
      setToast({ message: 'Store defaults saved', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Could not save store defaults', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog isOpen={isOpen} onClose={onClose} title="Store Pricing Defaults" maxWidth="max-w-xl">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5">
            <Store className="h-4 w-4 text-gold-dark mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
              The single default pricing source for every new inventory item. Used to pre-fill
              Making, Wastage, Gold Profit and GST when adding stock. Never changes already-saved
              inventory — item values are frozen at creation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Making Type">
              <Select className="h-10" value={form.makingChargeType} onChange={(e) => setForm({ ...form, makingChargeType: e.target.value as ChargeType })}>
                {CHARGE_TYPE_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Making Value">
              <Input className="h-10" type="number" step="0.01" value={form.makingChargeValue} onChange={(e) => setForm({ ...form, makingChargeValue: e.target.value })} />
            </Field>
            <Field label="Wastage Type">
              <Select className="h-10" value={form.wastageType} onChange={(e) => setForm({ ...form, wastageType: e.target.value as ChargeType })}>
                {CHARGE_TYPE_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Wastage Value">
              <Input className="h-10" type="number" step="0.01" value={form.wastageValue} onChange={(e) => setForm({ ...form, wastageValue: e.target.value })} />
            </Field>
            <Field label="Gold Profit %">
              <Input className="h-10" type="number" step="0.01" value={form.goldProfitPercent} onChange={(e) => setForm({ ...form, goldProfitPercent: e.target.value })} />
            </Field>
            <Field label="GST %">
              <Input className="h-10" type="number" step="0.01" value={form.taxRatePercent} onChange={(e) => setForm({ ...form, taxRatePercent: e.target.value })} />
            </Field>
            <Field label="Pricing Mode">
              <Select className="h-10" value={form.defaultPricingMode} onChange={(e) => setForm({ ...form, defaultPricingMode: e.target.value })}>
                <option value="">Not set</option>
                {PRICING_MODE_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.value}</option>)}
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={save} isLoading={saving}>Save Store Defaults</Button>
        </DialogFooter>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
