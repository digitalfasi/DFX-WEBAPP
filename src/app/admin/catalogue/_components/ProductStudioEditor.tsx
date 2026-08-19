"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, ImageIcon, Upload, Repeat, Trash2, Save, Loader2, Smartphone, Tag as TagIcon, Plus, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/form-controls';
import { Toast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { catalogueService, Product, ProductFormData } from '@/services/catalogueService';
import { ApiError } from '@/lib/apiClient';
import { formatCurrency } from '@/lib/formatters';

/* Category/Purity are free-text strings on the backend — these are quick-pick
 * shortcuts that write the same single field, never a restrictive enum, so any
 * existing value still loads and edits. */
const CATEGORY_PRESETS = ['Chains', 'Bangles', 'Necklaces', 'Rings', 'Pendants', 'Earrings'];
const PURITY_PRESETS = ['18K', '22K', '916', '24K'];
const TAG_PRESETS: { emoji: string; label: string }[] = [
  { emoji: '🔥', label: 'Bestseller' },
  { emoji: '✨', label: 'New Arrival' },
  { emoji: '💎', label: 'Trending' },
  { emoji: '⚡', label: 'Exclusive' },
  { emoji: '🎁', label: 'Festive' },
  { emoji: '📦', label: 'Ready to Ship' },
];
const DISCOUNT_LABEL_SUGGESTIONS = ['15% Off on Making Value', 'Zero Making Charges', 'BIG SALE', 'Festive Offer'];

interface FormState {
  name: string;
  category: string;
  sku: string;
  price: string;
  purity: string;
  weightGrams: string;
  description: string;
  tags: string[];
  makingChargeDiscountPercent: string;
  makingChargeDiscountLabel: string;
}

const EMPTY_FORM: FormState = {
  name: '', category: '', sku: '', price: '', purity: '', weightGrams: '',
  description: '', tags: [], makingChargeDiscountPercent: '', makingChargeDiscountLabel: '',
};

function formFromProduct(p: Product): FormState {
  return {
    name: p.name ?? '',
    category: p.category ?? '',
    sku: p.sku ?? '',
    price: p.price != null ? String(p.price) : '',
    purity: p.purity ?? '',
    weightGrams: p.weightGrams != null ? String(p.weightGrams) : '',
    description: p.description ?? '',
    tags: p.tags ?? [],
    makingChargeDiscountPercent: p.makingChargeDiscountPercent != null ? String(p.makingChargeDiscountPercent) : '',
    makingChargeDiscountLabel: p.makingChargeDiscountLabel ?? '',
  };
}

function primaryImageUrl(p: Product | null): string | null {
  if (!p) return null;
  if (p.primaryImageUrl) return p.primaryImageUrl;
  const primary = p.images?.find((i) => i.isPrimary);
  return primary?.url ?? p.images?.[0]?.url ?? null;
}

export default function ProductStudioEditor() {
  const router = useRouter();
  const params = useParams<{ productId: string }>();
  const routeId = params.productId;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(routeId !== 'new');
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadedIdRef = useRef<string | null>(null);
  // For a brand-new product the image is chosen up front and held locally (raw
  // File + an object-URL preview), then uploaded automatically on the single
  // Create action — so the admin never has to save twice. Nothing is cropped or
  // processed; the original File is sent as-is to the existing upload API.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);

  // Release the object URL when it changes or the editor unmounts.
  useEffect(() => {
    return () => { if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl); };
  }, [pendingPreviewUrl]);

  // Load an existing product once per real id. A brand-new product starts empty
  // and only fetches after its first save (which sets `product` directly).
  useEffect(() => {
    if (routeId === 'new') return;
    if (product?.id === routeId || loadedIdRef.current === routeId) return;
    loadedIdRef.current = routeId;
    setLoading(true);
    setLoadError('');
    catalogueService.getProductById(routeId)
      .then((p) => { setProduct(p); setForm(formFromProduct(p)); })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load product.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const isNew = !product;

  const priceNum = parseFloat(form.price);
  const weightNum = parseFloat(form.weightGrams);
  const discountNum = form.makingChargeDiscountPercent ? parseFloat(form.makingChargeDiscountPercent) : undefined;

  const errors = {
    name: form.name.trim().length < 2 ? 'Name must be at least 2 characters' : '',
    category: form.category.trim() ? '' : 'Category is required',
    price: !form.price || isNaN(priceNum) || priceNum <= 0 ? 'Price must be greater than 0' : '',
    purity: form.purity.trim() ? '' : 'Purity is required',
    weight: !form.weightGrams || isNaN(weightNum) || weightNum <= 0 ? 'Weight must be greater than 0' : '',
    discount:
      discountNum !== undefined && (isNaN(discountNum) || discountNum < 0 || discountNum > 100)
        ? 'Discount must be between 0 and 100'
        : '',
  };
  const isValid = !errors.name && !errors.category && !errors.price && !errors.purity && !errors.weight && !errors.discount;

  const toggleTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));
  };

  const addCustomTag = () => {
    const t = customTag.trim();
    if (!t) return;
    if (!form.tags.includes(t)) setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    setCustomTag('');
  };

  const buildPayload = (): ProductFormData => ({
    name: form.name.trim(),
    category: form.category.trim(),
    sku: form.sku.trim() || undefined,
    price: priceNum,
    purity: form.purity.trim(),
    weightGrams: weightNum,
    description: form.description.trim() || undefined,
    tags: form.tags,
    makingChargeDiscountPercent: discountNum,
    makingChargeDiscountLabel: form.makingChargeDiscountLabel.trim() || undefined,
  });

  const handleSave = async () => {
    if (!isValid) {
      setToast({ message: 'Please complete the required fields.', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      if (product) {
        const saved = await catalogueService.updateProduct(product.id, buildPayload());
        setProduct(saved);
        setForm(formFromProduct(saved));
        setToast({ message: 'Product saved.', type: 'success' });
      } else {
        // One Create action: create the product, then (if an image was chosen
        // up front) upload it to the new product id automatically — no second
        // save. The raw File is sent as-is; the backend keeps the original.
        let saved = await catalogueService.createProduct(buildPayload());
        if (pendingFile) {
          try {
            const img = await catalogueService.uploadImage(saved.id, pendingFile);
            await catalogueService.setPrimaryImage(saved.id, img.id);
            saved = await catalogueService.getProductById(saved.id);
            if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
            setPendingFile(null);
            setPendingPreviewUrl(null);
          } catch {
            // Product is created; only the image upload failed. Keep the pending
            // file so the admin can retry the image without recreating.
            setToast({ message: 'Product created, but the image upload failed — try uploading it again.', type: 'error' });
          }
        }
        setProduct(saved);
        setForm(formFromProduct(saved));
        loadedIdRef.current = saved.id;
        // Move to the product's own URL so a refresh reopens it.
        router.replace(`/admin/catalogue/studio/${saved.id}`);
        if (!pendingFile) setToast({ message: 'Product created.', type: 'success' });
      }
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Could not save product.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const refreshProduct = async (id: string) => {
    const p = await catalogueService.getProductById(id);
    setProduct(p);
  };

  const handleFile = async (file: File | undefined, replaceImageId?: string) => {
    if (!file || !product) return;
    setUploading(true);
    try {
      const img = await catalogueService.uploadImage(product.id, file);
      await catalogueService.setPrimaryImage(product.id, img.id);
      if (replaceImageId) {
        try { await catalogueService.deleteImage(product.id, replaceImageId); } catch { /* keep the new one regardless */ }
      }
      await refreshProduct(product.id);
      setToast({ message: replaceImageId ? 'Image replaced.' : 'Image uploaded.', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Could not upload image.', type: 'error' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Choosing a file: an existing product uploads immediately; a new product
  // holds the file locally (instant preview) until the single Create action.
  const onSelectFile = (file: File | undefined) => {
    if (!file) return;
    if (product) {
      handleFile(file, product.images?.find((i) => i.isPrimary)?.id);
    } else {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      setPendingFile(file);
      setPendingPreviewUrl(URL.createObjectURL(file));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleRemoveImage = async () => {
    // New product with only a held (not-yet-uploaded) image: just drop it.
    if (!product) {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      setPendingFile(null);
      setPendingPreviewUrl(null);
      return;
    }
    const primary = product.images?.find((i) => i.isPrimary) ?? product.images?.[0];
    if (!primary) return;
    setUploading(true);
    try {
      await catalogueService.deleteImage(product.id, primary.id);
      await refreshProduct(product.id);
      setToast({ message: 'Image removed.', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Could not remove image.', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const imageUrl = primaryImageUrl(product) ?? pendingPreviewUrl;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-2xl" />
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-96 rounded-3xl" />
          <Skeleton className="h-96 rounded-3xl" />
        </div>
      </div>
    );
  }

  const labelCls = 'text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block';
  const chipBase = 'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors border';
  const chipOn = 'bg-[#0B0E23] text-white border-[#0B0E23]';
  const chipOff = 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100';
  const errCls = 'text-[11px] text-red-600 font-medium mt-1';

  return (
    <div className="animate-in fade-in duration-300 font-body pb-6">
      {/* HEADER */}
      <div className="sticky top-0 z-20 flex items-center gap-3 bg-white/90 backdrop-blur border-b border-slate-200 px-4 sm:px-5 py-3 -mx-4 sm:-mx-6 mb-5">
        <button
          onClick={() => router.push('/admin/catalogue')}
          className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:border-gold hover:text-gold-dark transition-colors"
          aria-label="Back to Catalogue"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display font-extrabold text-lg text-[#0B0E23] flex-1 truncate">
          {isNew ? 'Create Product' : 'Edit Product'}
        </h1>
        <Button size="sm" onClick={handleSave} isLoading={saving} disabled={!isValid} className="gap-1.5">
          <Save className="w-3.5 h-3.5" /> Save Product
        </Button>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
          {loadError}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5">
        {/* LEFT — IMAGE + LIVE CUSTOMER PREVIEW */}
        <div className="space-y-5">
          {/* Image management */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className={labelCls}>Product Image</span>
            <div className="relative aspect-square rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={form.name || 'Product'} className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-slate-300">
                  <ImageIcon className="w-10 h-10" />
                  <span className="text-[11px] font-semibold">No image yet</span>
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-gold animate-spin" />
                </div>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onSelectFile(e.target.files?.[0])}
            />

            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {imageUrl ? <Repeat className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
                {imageUrl ? 'Replace' : 'Upload Image'}
              </Button>
              {imageUrl && (
                <Button size="sm" variant="outline" className="gap-1.5 text-red-600 hover:bg-red-50" disabled={uploading} onClick={handleRemoveImage}>
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </Button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-2">
              {isNew
                ? 'The image is added automatically when you create the product. The original photo is kept exactly as uploaded — no cropping or resizing.'
                : 'The original photo is kept exactly as uploaded — no cropping or resizing.'}
            </p>
          </div>

          {/* Live customer preview */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-3">
              <Smartphone className="w-3.5 h-3.5 text-gold" /> Live Customer Preview
            </span>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <div className="mx-auto w-full max-w-[240px] rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="relative aspect-square bg-slate-100 flex items-center justify-center">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={form.name || 'Product'} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-300" />
                  )}
                  {form.tags[0] && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#0B0E23]/90 text-white text-[9px] font-bold uppercase">
                      {form.tags[0]}
                    </span>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-sm font-bold text-[#0B0E23] leading-tight line-clamp-2">{form.name || 'Product name'}</p>
                  {(form.purity.trim() || form.weightGrams) && (
                    <p className="text-[11px] text-slate-500 font-medium">
                      {[form.purity.trim(), form.weightGrams ? `${form.weightGrams}g` : ''].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="text-base font-extrabold text-gold-dark font-mono">
                    {!isNaN(priceNum) && priceNum > 0 ? formatCurrency(priceNum) : '—'}
                  </p>
                  {(form.makingChargeDiscountLabel.trim() || (discountNum != null && discountNum > 0)) && (
                    <span className="inline-block px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">
                      {form.makingChargeDiscountLabel.trim() || `${discountNum}% off making`}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 text-center mt-2 font-medium">How this product appears to customers.</p>
            </div>
          </div>
        </div>

        {/* RIGHT — FORM */}
        <div className="space-y-5">
          {/* Product details */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
            <h2 className="font-display font-bold text-sm text-[#0B0E23]">Product Details</h2>

            <div>
              <label className={labelCls}>Product Name <span className="text-red-500">*</span></label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Royal Kundan Necklace" error={!!errors.name} />
              {errors.name && <p className={errCls}>{errors.name}</p>}
            </div>

            <div>
              <label className={labelCls}>Category <span className="text-red-500">*</span></label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Necklaces, Rings…" error={!!errors.category} />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {CATEGORY_PRESETS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, category: c }))} className={`${chipBase} ${form.category === c ? chipOn : chipOff}`}>{c}</button>
                ))}
              </div>
              {errors.category && <p className={errCls}>{errors.category}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Price (₹) <span className="text-red-500">*</span></label>
                <Input type="number" step="0.01" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" error={!!errors.price} />
                {errors.price && <p className={errCls}>{errors.price}</p>}
              </div>
              <div>
                <label className={labelCls}>SKU</label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Optional" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Purity <span className="text-red-500">*</span></label>
                <Input value={form.purity} onChange={(e) => setForm({ ...form, purity: e.target.value })} placeholder="22K, 916" error={!!errors.purity} />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PURITY_PRESETS.map((p) => (
                    <button key={p} type="button" onClick={() => setForm((f) => ({ ...f, purity: p }))} className={`${chipBase} ${form.purity === p ? chipOn : chipOff}`}>{p}</button>
                  ))}
                </div>
                {errors.purity && <p className={errCls}>{errors.purity}</p>}
              </div>
              <div>
                <label className={labelCls}>Weight (g) <span className="text-red-500">*</span></label>
                <Input type="number" step="0.01" min={0} value={form.weightGrams} onChange={(e) => setForm({ ...form, weightGrams: e.target.value })} placeholder="0.00" error={!!errors.weight} />
                {errors.weight && <p className={errCls}>{errors.weight}</p>}
              </div>
            </div>
          </section>

          {/* Offer */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
            <h2 className="font-display font-bold text-sm text-[#0B0E23]">Offer</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Making-Charge Discount (%)</label>
                <Input type="number" step="0.01" min={0} max={100} value={form.makingChargeDiscountPercent} onChange={(e) => setForm({ ...form, makingChargeDiscountPercent: e.target.value })} placeholder="0" error={!!errors.discount} />
                {errors.discount && <p className={errCls}>{errors.discount}</p>}
              </div>
              <div>
                <label className={labelCls}>Discount Label</label>
                <Input value={form.makingChargeDiscountLabel} onChange={(e) => setForm({ ...form, makingChargeDiscountLabel: e.target.value })} placeholder="e.g. Festive Offer" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DISCOUNT_LABEL_SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => setForm((f) => ({ ...f, makingChargeDiscountLabel: s }))} className={`${chipBase} ${form.makingChargeDiscountLabel === s ? chipOn : chipOff}`}>{s}</button>
              ))}
            </div>
          </section>

          {/* Tags — one array, presets + custom */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <h2 className="font-display font-bold text-sm text-[#0B0E23] flex items-center gap-1.5">
              <TagIcon className="w-3.5 h-3.5 text-gold" /> Tags
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {TAG_PRESETS.map((t) => {
                const active = form.tags.includes(t.label);
                return (
                  <button key={t.label} type="button" onClick={() => toggleTag(t.label)} className={`${chipBase} ${active ? chipOn : chipOff}`}>
                    <span className="mr-1">{t.emoji}</span>{t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                placeholder="Add a custom tag"
              />
              <Button type="button" variant="outline" size="default" onClick={addCustomTag} className="shrink-0 gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((tag) => {
                  const preset = TAG_PRESETS.find((p) => p.label === tag);
                  return (
                    <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                      {preset ? `${preset.emoji} ` : ''}{tag}
                      <button type="button" onClick={() => toggleTag(tag)} className="hover:text-red-600" aria-label={`Remove ${tag}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </section>

          {/* Description */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <label className={labelCls}>Description</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Craftsmanship notes, occasion, styling tips…" />
          </section>
        </div>
      </div>

      {!isValid && (
        <p className="text-[11px] text-slate-400 font-medium mt-4">
          Complete the required fields (name, category, price, purity, weight) to save.
        </p>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
