"use client";

import React, { useEffect, useState } from 'react';
import { promotionService, AdminPromotion, PromotionFormData } from '@/services/promotionService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea, Switch } from '@/components/ui/form-controls';
import { Toast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Pencil, Trash2, Megaphone, ImagePlus } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';

const EMPTY_FORM: PromotionFormData = {
  bannerType: 'STANDARD',
  title: '',
  subtitle: '',
  description: '',
  imageUrl: '',
  buttonText: '',
  buttonLink: '',
  backgroundColor: '',
  textColor: '',
  priority: 0,
  isActive: true,
  startDate: null,
  endDate: null,
};

type FieldErrors = Partial<Record<keyof PromotionFormData, string>>;

/** Backend expects full ISO datetimes; date inputs give "YYYY-MM-DD". */
function dateInputToIso(value: string): string | null {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function isoToDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export default function MarketingPage() {
  const [promotions, setPromotions] = useState<AdminPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Picked-but-not-yet-uploaded banner file. The upload endpoint needs a
  // promotion id, so the file is held here and sent right after the
  // create/update call returns (see handleSave).
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [form, setForm] = useState<PromotionFormData>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPromotion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadPromotions = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await promotionService.getAdminPromotions();
      setPromotions(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load promotions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPromotions();
  }, []);

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
    setDialogOpen(true);
  };

  const openEditDialog = (promo: AdminPromotion) => {
    setEditingId(promo.id);
    setForm({
      bannerType: promo.bannerType,
      title: promo.title,
      subtitle: promo.subtitle,
      description: promo.description,
      imageUrl: promo.imageUrl,
      buttonText: promo.buttonText,
      buttonLink: promo.buttonLink,
      backgroundColor: promo.backgroundColor,
      textColor: promo.textColor,
      priority: promo.priority,
      isActive: promo.isActive,
      startDate: promo.startDate,
      endDate: promo.endDate,
    });
    setFieldErrors({});
    setFormError('');
    setDialogOpen(true);
  };

  const applyApiError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.errors.length > 0) {
      const next: FieldErrors = {};
      let banner = '';
      const fieldMap: Record<string, keyof PromotionFormData> = {
        banner_type: 'bannerType',
        title: 'title',
        subtitle: 'subtitle',
        description: 'description',
        image_url: 'imageUrl',
        button_text: 'buttonText',
        button_link: 'buttonLink',
        background_color: 'backgroundColor',
        text_color: 'textColor',
        priority: 'priority',
        is_active: 'isActive',
        start_date: 'startDate',
        end_date: 'endDate',
      };
      for (const e of err.errors) {
        const mapped = e.field ? fieldMap[e.field] : undefined;
        if (mapped) {
          next[mapped] = e.message || 'Invalid value';
        } else {
          banner = e.message || err.message;
        }
      }
      setFieldErrors(next);
      setFormError(Object.keys(next).length === 0 ? (banner || err.message) : '');
    } else {
      setFormError(err instanceof ApiError ? err.message : fallback);
    }
  };

  const isImageOnly = form.bannerType === 'IMAGE_ONLY';

  const handleSave = async () => {
    setFieldErrors({});
    setFormError('');
    // Image-Only requires an image; Standard requires a title. Validated here
    // for instant feedback and again on the backend (source of truth).
    if (isImageOnly && !pendingImage && !form.imageUrl?.trim()) {
      setFieldErrors({ imageUrl: 'An Image-Only banner requires an image.' });
      return;
    }
    if (!isImageOnly && !form.title?.trim()) {
      setFieldErrors({ title: 'A Standard banner requires a title.' });
      return;
    }
    setSaving(true);
    try {
      let promoId = editingId;
      if (editingId) {
        await promotionService.updatePromotion(editingId, form);
        setToast({ message: 'Promotion updated successfully', type: 'success' });
      } else {
        const created = await promotionService.createPromotion(form);
        promoId = created.id;
        setToast({ message: 'Promotion created successfully', type: 'success' });
      }
      if (pendingImage && promoId) {
        await promotionService.uploadPromotionImage(promoId, pendingImage);
      }
      setPendingImage(null);
      setImagePreview('');
      setDialogOpen(false);
      await loadPromotions();
    } catch (err) {
      applyApiError(err, 'Could not save promotion. Please try again.');
      setToast({ message: 'Could not save promotion', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (promo: AdminPromotion) => {
    setTogglingId(promo.id);
    try {
      await promotionService.updatePromotion(promo.id, { isActive: !promo.isActive });
      setToast({ message: `"${promo.title}" ${promo.isActive ? 'deactivated' : 'activated'}`, type: 'success' });
      await loadPromotions();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not update promotion status',
        type: 'error',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await promotionService.deletePromotion(deleteTarget.id);
      setToast({ message: `"${deleteTarget.title}" deleted`, type: 'success' });
      setDeleteTarget(null);
      await loadPromotions();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not delete promotion',
        type: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Promotion Banners
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Manage the home screen promotion banner shown to your customers. WhatsApp/SMS/Email campaign
            tools are a separate, not-yet-built feature.
          </p>
        </div>

        <Button onClick={openCreateDialog} size="sm" className="bg-gold hover:bg-gold-dark text-white font-bold h-9">
          <Plus className="w-4 h-4 mr-1.5" /> Create Promotion
        </Button>
      </div>

      {/* Loading state */}
      {loading && <Skeleton className="h-64 w-full" />}

      {/* Load error */}
      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadPromotions}>
            Retry
          </Button>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !loadError && promotions.length === 0 && (
        <EmptyState
          icon={<Megaphone className="h-7 w-7 text-gold" />}
          title="No promotions yet"
          description="Create your first home screen banner to promote offers to your customers."
          actionLabel="Create Promotion"
          onAction={openCreateDialog}
        />
      )}

      {/* PROMOTIONS TABLE */}
      {!loading && !loadError && promotions.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-4">Title</th>
                  <th className="p-4 text-center">Priority</th>
                  <th className="p-4 text-center">Active Window</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {promotions.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-bold text-[#0B0E23] flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gold/15 text-gold-dark font-bold text-xs flex items-center justify-center shrink-0 border border-gold/30">
                        <Megaphone className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-[#0B0E23]">
                          {p.bannerType === 'IMAGE_ONLY' ? (p.title || 'Image-Only Banner') : p.title}
                        </div>
                        {p.bannerType === 'IMAGE_ONLY'
                          ? <div className="text-[10px] text-gold-dark font-semibold">Image-Only</div>
                          : (p.subtitle && <div className="text-[10px] text-slate-400">{p.subtitle}</div>)}
                      </div>
                    </td>
                    <td className="p-4 text-center font-mono font-bold text-[#0B0E23]">{p.priority}</td>
                    <td className="p-4 text-center text-[11px] text-slate-500 font-medium">
                      {p.startDate || p.endDate
                        ? `${p.startDate ? new Date(p.startDate).toLocaleDateString('en-IN') : '—'} – ${p.endDate ? new Date(p.endDate).toLocaleDateString('en-IN') : '—'}`
                        : 'Always'}
                    </td>
                    <td className="p-4 text-center">
                      <Badge variant={p.isActive ? 'success' : 'danger'} dot>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditDialog(p)}
                          className="p-1.5 text-slate-400 hover:text-[#0B0E23] hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit Promotion"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <Switch
                          checked={p.isActive}
                          onChange={() => handleToggleActive(p)}
                          disabled={togglingId === p.id}
                        />
                        <button
                          onClick={() => setDeleteTarget(p)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Promotion"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* CREATE / EDIT PROMOTION DIALOG */}
      <Dialog
        isOpen={dialogOpen}
        onClose={() => !saving && setDialogOpen(false)}
        title={editingId ? 'Edit Promotion' : 'Create New Promotion Banner'}
        maxWidth="max-w-lg"
      >
        <div className="space-y-3.5 text-xs max-h-[70vh] overflow-y-auto pr-1">
          {formError && (
            <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          {/* BANNER TYPE SELECTOR */}
          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Banner Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['STANDARD', 'IMAGE_ONLY'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, bannerType: t }))}
                  className={
                    'rounded-xl border px-3 py-2 text-left transition-colors ' +
                    (form.bannerType === t
                      ? 'border-gold bg-gold/10 text-[#0B0E23]'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300')
                  }
                >
                  <div className="font-bold text-[11px]">{t === 'STANDARD' ? 'Standard Banner' : 'Image-Only Banner'}</div>
                  <div className="text-[10px] mt-0.5">
                    {t === 'STANDARD' ? 'Title, text & button' : 'Uploaded image is the whole banner'}
                  </div>
                </button>
              ))}
            </div>
            {isImageOnly && (
              <p className="text-[10px] text-slate-500 font-medium">
                This image will be displayed as the complete promotion — no text or button is added over it.
              </p>
            )}
          </div>

          {!isImageOnly && (
          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Title *</label>
            <Input
              error={!!fieldErrors.title}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Festival Offer — Flat 5% Bonus"
            />
            {fieldErrors.title && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.title}</p>}
          </div>
          )}

          {!isImageOnly && (
          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Subtitle</label>
            <Input
              error={!!fieldErrors.subtitle}
              value={form.subtitle}
              onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
              placeholder="Short supporting line"
            />
            {fieldErrors.subtitle && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.subtitle}</p>}
          </div>
          )}

          {!isImageOnly && (
          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Description</label>
            <Textarea
              error={!!fieldErrors.description}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Full banner copy shown to customers"
            />
            {fieldErrors.description && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.description}</p>}
          </div>
          )}

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">
              Banner Image{isImageOnly ? ' *' : ''}
            </label>
            {/* 16:9 — matches the mobile app's banner box, so what's shown
              * here is exactly what the customer sees (object-cover, so the
              * same edges get cropped). */}
            <div className="relative w-full aspect-video rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
              {imagePreview || form.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview || form.imageUrl} alt="Banner preview" className={`w-full h-full ${isImageOnly ? 'object-contain' : 'object-cover'}`} />
              ) : (
                <span className="text-[11px] text-slate-400 font-medium">No image selected</span>
              )}
            </div>
            <input
              id="promo-image-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPendingImage(file);
                setImagePreview(URL.createObjectURL(file));
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => document.getElementById('promo-image-input')?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
              {imagePreview || form.imageUrl ? 'Replace Image' : 'Upload Image'}
            </Button>
            <p className="text-[10px] text-slate-400 font-medium">
              {isImageOnly
                ? 'Uploaded on save. Shown to customers in full — nothing is cropped or overlaid.'
                : 'Uploaded on save. Shown to customers at 16:9 — keep key content centered.'}
            </p>
            {fieldErrors.imageUrl && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.imageUrl}</p>}
          </div>

          {!isImageOnly && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Button Text</label>
              <Input
                error={!!fieldErrors.buttonText}
                value={form.buttonText}
                onChange={(e) => setForm((f) => ({ ...f, buttonText: e.target.value }))}
                placeholder="e.g. Enroll Now"
              />
              {fieldErrors.buttonText && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.buttonText}</p>}
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Button Link</label>
              <Input
                error={!!fieldErrors.buttonLink}
                value={form.buttonLink}
                onChange={(e) => setForm((f) => ({ ...f, buttonLink: e.target.value }))}
                placeholder="/customer/schemes"
              />
              {fieldErrors.buttonLink && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.buttonLink}</p>}
            </div>
          </div>
          )}

          {!isImageOnly && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Background Color</label>
              <Input
                error={!!fieldErrors.backgroundColor}
                value={form.backgroundColor}
                onChange={(e) => setForm((f) => ({ ...f, backgroundColor: e.target.value }))}
                placeholder="#0B0E23"
              />
              {fieldErrors.backgroundColor && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.backgroundColor}</p>}
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Text Color</label>
              <Input
                error={!!fieldErrors.textColor}
                value={form.textColor}
                onChange={(e) => setForm((f) => ({ ...f, textColor: e.target.value }))}
                placeholder="#FFFFFF"
              />
              {fieldErrors.textColor && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.textColor}</p>}
            </div>
          </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Start Date</label>
              <Input
                type="date"
                error={!!fieldErrors.startDate}
                value={isoToDateInput(form.startDate ?? null)}
                onChange={(e) => setForm((f) => ({ ...f, startDate: dateInputToIso(e.target.value) }))}
              />
              {fieldErrors.startDate && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.startDate}</p>}
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">End Date</label>
              <Input
                type="date"
                error={!!fieldErrors.endDate}
                value={isoToDateInput(form.endDate ?? null)}
                onChange={(e) => setForm((f) => ({ ...f, endDate: dateInputToIso(e.target.value) }))}
              />
              {fieldErrors.endDate && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.endDate}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Priority</label>
            <Input
              type="number"
              error={!!fieldErrors.priority}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
            />
            <p className="text-[10px] text-slate-400">Higher priority banners are shown first when multiple are active.</p>
            {fieldErrors.priority && <p className="text-[11px] text-red-600 font-medium">{fieldErrors.priority}</p>}
          </div>

          <Switch
            checked={form.isActive ?? true}
            onChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
            label="Active"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" isLoading={saving} onClick={handleSave}>
            {editingId ? 'Save Changes' : 'Create Promotion'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete Promotion?"
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <span className="font-bold">{deleteTarget?.title}</span>? This
          permanently removes the banner — this cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" isLoading={deleting} onClick={confirmDelete}>
            Delete
          </Button>
        </DialogFooter>
      </Dialog>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
