"use client";

import React, { useEffect, useState } from 'react';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { billingService, Vendor } from '@/services/billingService';
import { ApiError } from '@/lib/apiClient';

interface FormState {
  name: string;
  phone: string;
  gst: string;
}

const emptyForm: FormState = { name: '', phone: '', gst: '' };

// Vendor pricing defaults are retired — Store Defaults are the only pricing
// source — so this dialog captures only the vendor's business/contact details
// needed for inventory procurement.
export function VendorQuickAddDialog({
  isOpen,
  onClose,
  onCreated,
  vendor,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (vendor: Vendor) => void;
  /** When provided, the dialog edits this vendor's business details. */
  vendor?: Vendor | null;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (vendor) {
      setForm({ name: vendor.name, phone: vendor.phone || '', gst: vendor.gstNumber || '' });
    } else {
      setForm(emptyForm);
    }
    setError('');
  }, [isOpen, vendor]);

  const handleSave = async () => {
    if (!form.name.trim() || form.name.trim().length < 2) {
      setError('Vendor name is required.');
      return;
    }
    setSaving(true);
    setError('');
    // Only business fields are sent — no pricing-default fields. The backend
    // keeps its (now unused) default columns nullable, so omitting them is safe.
    const payload = { name: form.name, phone: form.phone, gstNumber: form.gst };
    try {
      const saved = vendor
        ? await billingService.updateVendor(vendor.id, payload)
        : await billingService.createVendor(payload);
      onCreated(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${vendor ? 'update' : 'create'} vendor.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={() => !saving && onClose()} title={vendor ? `Edit ${vendor.name}` : 'Add Vendor'} maxWidth="max-w-sm">
      <div className="space-y-3">
        {error && (
          <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Vendor Name *</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ABC Gold Supplier" autoFocus />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Phone</label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">GST Number</label>
          <Input value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} isLoading={saving}>{vendor ? 'Save Changes' : 'Add Vendor'}</Button>
      </DialogFooter>
    </Dialog>
  );
}
