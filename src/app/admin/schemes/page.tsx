"use client";

import React, { useEffect, useState } from 'react';
import {
  schemeService,
  AdminScheme,
  SchemeFormData,
  SchemeTierInput,
} from '@/services/schemeService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Toast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Pencil, Ban, RotateCcw, Coins, Trash2, Layers } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { ApiError } from '@/lib/apiClient';

const EMPTY_FORM: SchemeFormData = {
  name: '',
  description: '',
  monthlyAmount: 1000,
  durationMonths: 11,
  bonusDescription: '',
  tiers: [],
};

type FieldErrors = Partial<Record<keyof SchemeFormData, string>>;

/** Backend rule: base maturity = monthly x duration; final = base + base x bonus%%.
 *  Used only as a live editor preview; persisted/displayed values come from the API. */
const previewBaseMaturity = (monthly: number, duration: number) =>
  Math.round((monthly || 0) * (duration || 0) * 100) / 100;

const previewFinalMaturity = (monthly: number, duration: number, bonusPct: number) => {
  const base = previewBaseMaturity(monthly, duration);
  return Math.round((base + (base * (bonusPct || 0)) / 100) * 100) / 100;
};

export default function AdminSchemesPage() {
  const [schemes, setSchemes] = useState<AdminScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SchemeFormData>(EMPTY_FORM);
  const [tiers, setTiers] = useState<SchemeTierInput[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadSchemes = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await schemeService.getAdminSchemes();
      setSchemes(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load schemes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchemes();
  }, []);

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTiers([]);
    setFieldErrors({});
    setFormError('');
    setDialogOpen(true);
  };

  const openEditDialog = (scheme: AdminScheme) => {
    setEditingId(scheme.id);
    setForm({
      name: scheme.name,
      description: scheme.description,
      monthlyAmount: scheme.monthlyAmount,
      durationMonths: scheme.durationMonths,
      bonusDescription: scheme.bonusDescription,
    });
    setTiers(
      scheme.tiers.map((t) => ({
        monthlyAmount: t.monthlyAmount,
        durationMonths: t.durationMonths,
        bonusPercentage: t.bonusPercentage,
        isActive: t.isActive,
      }))
    );
    setFieldErrors({});
    setFormError('');
    setDialogOpen(true);
  };

  const addTier = () =>
    setTiers((prev) => [
      ...prev,
      { monthlyAmount: 1000, durationMonths: 11, bonusPercentage: 0, isActive: true },
    ]);

  const updateTier = (index: number, patch: Partial<SchemeTierInput>) =>
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const removeTier = (index: number) =>
    setTiers((prev) => prev.filter((_, i) => i !== index));

  const applyApiError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.errors.length > 0) {
      const next: FieldErrors = {};
      let banner = '';
      const fieldMap: Record<string, keyof SchemeFormData> = {
        name: 'name',
        description: 'description',
        monthly_amount: 'monthlyAmount',
        duration_months: 'durationMonths',
        bonus_description: 'bonusDescription',
        tiers: 'tiers',
      };
      for (const e of err.errors) {
        const mapped = e.field ? fieldMap[e.field] : undefined;
        if (mapped && mapped !== 'tiers') {
          next[mapped] = e.message || 'Invalid value';
        } else {
          banner = e.message || err.message;
        }
      }
      setFieldErrors(next);
      setFormError(Object.keys(next).length === 0 || banner ? (banner || err.message) : '');
    } else {
      setFormError(err instanceof ApiError ? err.message : fallback);
    }
  };

  const handleSave = async () => {
    setFieldErrors({});
    setFormError('');

    // Local guard: reject duplicate (amount, duration) tiers before hitting the
    // API, which enforces the same uniqueness constraint.
    const seen = new Set<string>();
    for (const t of tiers) {
      const key = `${t.monthlyAmount}x${t.durationMonths}`;
      if (seen.has(key)) {
        setFormError(
          `Duplicate tier: ${formatCurrency(t.monthlyAmount)} x ${t.durationMonths} months is listed twice.`
        );
        return;
      }
      seen.add(key);
    }

    setSaving(true);
    // Always send tiers so the backend reconciles the set (adding new, deactivating
    // removed). On create an empty list simply means a single base-plan scheme.
    const payload: SchemeFormData = { ...form, tiers };
    try {
      if (editingId) {
        await schemeService.updateScheme(editingId, payload);
        setToast({ message: 'Scheme updated successfully', type: 'success' });
      } else {
        await schemeService.createScheme(payload);
        setToast({ message: 'Scheme created successfully', type: 'success' });
      }
      setDialogOpen(false);
      await loadSchemes();
    } catch (err) {
      applyApiError(err, 'Could not save scheme. Please try again.');
      setToast({ message: 'Could not save scheme', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (scheme: AdminScheme) => {
    setTogglingId(scheme.id);
    try {
      if (scheme.isActive) {
        await schemeService.deactivateScheme(scheme.id);
        setToast({ message: `"${scheme.name}" deactivated`, type: 'success' });
      } else {
        await schemeService.updateScheme(scheme.id, { isActive: true });
        setToast({ message: `"${scheme.name}" reactivated`, type: 'success' });
      }
      await loadSchemes();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not update scheme status',
        type: 'error',
      });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300 font-body">

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Gold Saving Schemes Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Configure schemes and the monthly-amount tiers customers select when they join.
          </p>
        </div>

        <Button onClick={openCreateDialog} size="sm" className="bg-gold hover:bg-gold-dark text-white font-bold h-9">
          <Plus className="w-4 h-4 mr-1.5" /> Create Scheme
        </Button>
      </div>

      {/* Loading state — skeleton cards, no white splash */}
      {loading && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Card key={i} className="p-5 space-y-4 bg-white border-slate-200 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-28 w-full rounded-xl" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Load error */}
      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadSchemes}>
            Retry
          </Button>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !loadError && schemes.length === 0 && (
        <EmptyState
          icon={<Coins className="h-7 w-7 text-gold" />}
          title="No schemes yet"
          description="Create your first gold savings scheme with selectable monthly tiers for customers to join."
          actionLabel="Create Scheme"
          onAction={openCreateDialog}
        />
      )}

      {/* SCHEMES — each scheme with its tier grid */}
      {!loading && !loadError && schemes.length > 0 && (
        <div className="space-y-4">
          {schemes.map((s) => {
            const activeTiers = s.tiers.filter((t) => t.isActive).length;
            return (
              <Card key={s.id} className="bg-white border-slate-200 shadow-xs overflow-hidden">
                {/* Scheme header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-slate-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gold/15 text-gold-dark flex items-center justify-center shrink-0 border border-gold/30">
                      <Coins className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-[15px] text-[#0B0E23] truncate">{s.name}</span>
                        <Badge variant={s.isActive ? 'success' : 'danger'} dot>
                          {s.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-500 font-medium truncate">
                        {s.description || 'No description'}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {s.tiers.length} tier{s.tiers.length === 1 ? '' : 's'}
                          {s.tiers.length > 0 && ` (${activeTiers} active)`}
                        </span>
                        {s.bonusDescription && (
                          <span className="bg-gold/15 text-gold-dark px-2 py-0.5 rounded-md font-bold border border-gold/30">
                            {s.bonusDescription}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-start sm:self-center">
                    <button
                      onClick={() => openEditDialog(s)}
                      className="p-1.5 text-slate-400 hover:text-[#0B0E23] hover:bg-slate-100 rounded-lg transition-colors"
                      title="Edit Scheme"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(s)}
                      disabled={togglingId === s.id}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                      title={s.isActive ? 'Deactivate Scheme' : 'Reactivate Scheme'}
                    >
                      {s.isActive ? <Ban className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Tier grid */}
                <div className="p-5">
                  {s.tiers.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-500 font-medium">
                      No tiers configured — customers enroll on the base terms{' '}
                      <span className="font-bold text-[#0B0E23]">
                        {formatCurrency(s.monthlyAmount)}/mo · {s.durationMonths} months
                      </span>
                      . Edit the scheme to add selectable tiers.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {s.tiers.map((t) => (
                        <div
                          key={t.id}
                          className={`rounded-xl border p-3.5 transition-colors ${
                            t.isActive
                              ? 'border-slate-200 bg-white hover:border-gold/40'
                              : 'border-slate-200 bg-slate-50/70 opacity-70'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-display font-extrabold text-lg text-[#0B0E23] leading-none">
                              {formatCurrency(t.monthlyAmount)}
                              <span className="text-[11px] font-semibold text-slate-400"> / mo</span>
                            </div>
                            <Badge variant={t.isActive ? 'success' : 'danger'} dot>
                              {t.isActive ? 'Active' : 'Off'}
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-600">
                            <span>{t.durationMonths} Months</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-gold-dark">
                              Bonus {t.bonusPercentage % 1 === 0 ? t.bonusPercentage : t.bonusPercentage.toFixed(2)}%
                            </span>
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5 text-[11px] font-medium">
                            <div className="flex justify-between text-slate-500">
                              <span>Base</span>
                              <span className="font-semibold text-slate-600">{formatCurrency(t.baseMaturityAmount)}</span>
                            </div>
                            {t.bonusAmount > 0 && (
                              <div className="flex justify-between text-slate-500">
                                <span>Bonus</span>
                                <span className="font-semibold text-gold-dark">+{formatCurrency(t.bonusAmount)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-[#0B0E23]">
                              <span className="font-bold">Final</span>
                              <span className="font-extrabold text-gold-dark">{formatCurrency(t.finalMaturityAmount)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT SCHEME DIALOG */}
      <Dialog
        isOpen={dialogOpen}
        onClose={() => !saving && setDialogOpen(false)}
        title={editingId ? 'Edit Scheme' : 'Create New Gold Savings Scheme'}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-3.5 text-xs">
          {formError && (
            <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Scheme Title *</label>
            <Input
              error={!!fieldErrors.name}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Festival Special Plan"
            />
            {fieldErrors.name && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.name}</p>}
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Description</label>
            <Input
              error={!!fieldErrors.description}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description shown to customers"
            />
            {fieldErrors.description && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.description}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Base Duration (Months) *</label>
              <Input
                type="number"
                error={!!fieldErrors.durationMonths}
                value={form.durationMonths}
                onChange={(e) => setForm((f) => ({ ...f, durationMonths: Number(e.target.value) }))}
              />
              {fieldErrors.durationMonths && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.durationMonths}</p>}
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Base Monthly Amount (₹) *</label>
              <Input
                type="number"
                error={!!fieldErrors.monthlyAmount}
                value={form.monthlyAmount}
                onChange={(e) => setForm((f) => ({ ...f, monthlyAmount: Number(e.target.value) }))}
              />
              {fieldErrors.monthlyAmount && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.monthlyAmount}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Bonus Note (scheme-wide, optional)</label>
            <Input
              error={!!fieldErrors.bonusDescription}
              value={form.bonusDescription}
              onChange={(e) => setForm((f) => ({ ...f, bonusDescription: e.target.value }))}
              placeholder="Optional marketing note — actual bonus is configured per tier below"
            />
            {fieldErrors.bonusDescription && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.bonusDescription}</p>}
          </div>

          {/* TIER EDITOR */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Selectable Tiers</label>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={addTier}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Tier
              </Button>
            </div>

            {tiers.length === 0 ? (
              <p className="text-[11px] text-slate-400 font-medium rounded-lg border border-dashed border-slate-200 px-3 py-2.5">
                No tiers — the scheme is offered on its base terms only. Add tiers to let customers
                pick a monthly amount (e.g. ₹1,000 / ₹2,000 / ₹5,000).
              </p>
            ) : (
              <div className="space-y-3">
                {tiers.map((t, i) => {
                  const active = t.isActive ?? true;
                  return (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                    >
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        {/* Monthly */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Monthly ₹</label>
                          <Input
                            type="number"
                            className="h-11 text-sm"
                            value={t.monthlyAmount}
                            onChange={(e) => updateTier(i, { monthlyAmount: Number(e.target.value) })}
                          />
                        </div>

                        {/* Months */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Months</label>
                          <Input
                            type="number"
                            className="h-11 text-sm"
                            value={t.durationMonths}
                            onChange={(e) => updateTier(i, { durationMonths: Number(e.target.value) })}
                          />
                        </div>

                        {/* Bonus % */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gold-dark uppercase tracking-wide">Bonus %</label>
                          <div className="relative">
                            <Input
                              type="number"
                              className="h-11 text-sm pr-7"
                              value={t.bonusPercentage ?? 0}
                              onChange={(e) => updateTier(i, { bonusPercentage: Number(e.target.value) })}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                          </div>
                        </div>

                        {/* Final Maturity — read-only, blue-tinted */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Final Maturity</label>
                          <div className="h-11 flex items-center px-3 rounded-xl bg-[#0B0E23]/[0.04] border border-[#0B0E23]/15 text-sm font-extrabold text-[#0B0E23] whitespace-nowrap overflow-x-auto">
                            {formatCurrency(previewFinalMaturity(t.monthlyAmount, t.durationMonths, t.bonusPercentage ?? 0))}
                          </div>
                        </div>
                      </div>

                      {/* Controls row — separated so nothing overlaps the fields */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/70">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={active}
                          onClick={() => updateTier(i, { isActive: !active })}
                          className="flex items-center gap-2 cursor-pointer"
                          title={active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                        >
                          <span
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                              active ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                                active ? 'translate-x-4' : 'translate-x-0.5'
                              }`}
                            />
                          </span>
                          <span className={`text-xs font-bold ${active ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {active ? 'Active' : 'Inactive'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => removeTier(i)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove tier"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">Remove</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {editingId && (
                  <p className="text-[10px] text-slate-400 font-medium">
                    Removing a tier deactivates it for new enrollments; existing enrollments keep
                    their snapshotted terms.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" isLoading={saving} onClick={handleSave}>
            {editingId ? 'Save Changes' : 'Create Scheme'}
          </Button>
        </DialogFooter>
      </Dialog>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
