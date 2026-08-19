"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Tag, X, Smartphone, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/form-controls';
import { catalogueService, ProductFormData } from '@/services/catalogueService';
import { ApiError } from '@/lib/apiClient';
import { formatCurrency } from '@/lib/formatters';
import { useStudio } from '../StudioContext';

interface PanelProps {
  onToast: (message: string, type?: 'success' | 'error') => void;
}

/* Quick-pick vocabularies. These are UX shortcuts layered OVER the existing
 * free-text fields — category/purity remain plain strings on the backend, so
 * any existing value keeps loading and editing, and admins can still type a
 * value that isn't in these lists. Nothing here is a backend enum. */
const CATEGORY_PRESETS = ['Chains', 'Bangles', 'Necklaces', 'Rings', 'Pendants', 'Earrings'];
const PURITY_PRESETS = ['18K', '22K', '24K', '916'];
const TAG_PRESETS: { emoji: string; label: string }[] = [
  { emoji: '🔥', label: 'Bestseller' },
  { emoji: '✨', label: 'New Arrival' },
  { emoji: '💎', label: 'Trending' },
  { emoji: '⚡', label: 'Exclusive' },
  { emoji: '🎁', label: 'Festive' },
  { emoji: '📦', label: 'Ready to Ship' },
];
const DISCOUNT_LABEL_SUGGESTIONS = ['15% Off on Making Value', 'Zero Making Charges', 'BIG SALE', 'Festive Offer'];

/** Live mobile product-card preview. Renders ONLY data that exists on the
 * product model — no invented pricing. There is no customer-facing discounted-
 * price / strike-through formula anywhere in the app today, so the making-charge
 * discount is shown as a labelled badge, never applied to the price. */
function MobilePreviewCard({
  form,
  imageUrl,
}: {
  form: ProductFormData;
  imageUrl: string | null;
}) {
  const purityWeight = [form.purity?.trim(), form.weightGrams ? `${form.weightGrams}g` : '']
    .filter(Boolean)
    .join(' · ');
  const discountPct = form.makingChargeDiscountPercent;
  const discountLabel = (form.makingChargeDiscountLabel ?? '').trim();
  const tags = form.tags ?? [];

  return (
    <div className="mx-auto w-full max-w-[220px] rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="relative aspect-square bg-slate-100 flex items-center justify-center">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={form.name || 'Product'} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-300">
            <ImageIcon className="w-8 h-8" />
            <span className="text-[10px] font-semibold">No image yet</span>
          </div>
        )}
        {tags[0] && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#0B0E23]/90 text-white text-[9px] font-bold">
            {tags[0]}
          </span>
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className="text-xs font-bold text-[#0B0E23] leading-tight line-clamp-2">
          {form.name || 'Product name'}
        </p>
        {purityWeight && (
          <p className="text-[10px] text-slate-500 font-medium">{purityWeight}</p>
        )}
        <p className="text-sm font-extrabold text-gold-dark font-mono">
          {form.price != null && !isNaN(form.price) ? formatCurrency(form.price) : '—'}
        </p>
        {(discountLabel || (discountPct != null && discountPct > 0)) && (
          <span className="inline-block px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-bold">
            {discountLabel || `${discountPct}% off making`}
            {discountLabel && discountPct != null && discountPct > 0 ? ` · ${discountPct}% making` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

export const ProductDetailsPanel: React.FC<PanelProps> = React.memo(({ onToast }) => {
  const router = useRouter();
  const { product, isNewProduct, setProduct, setCurrentStep } = useStudio();

  const [form, setForm] = useState<ProductFormData>({
    name: product?.name ?? '',
    category: product?.category ?? '',
    sku: product?.sku ?? '',
    purity: product?.purity ?? '',
    price: product?.price ?? undefined,
    weightGrams: product?.weightGrams ?? undefined,
    description: product?.description ?? '',
    tags: product?.tags ?? [],
    makingChargeDiscountPercent: product?.makingChargeDiscountPercent ?? undefined,
    makingChargeDiscountLabel: product?.makingChargeDiscountLabel ?? '',
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (!(form.tags ?? []).includes(tag)) {
      setForm((f) => ({ ...f, tags: [...(f.tags ?? []), tag] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: (f.tags ?? []).filter((t) => t !== tag) }));
  };

  /* Preset tag chip — adds if absent, removes if present. Never duplicates, and
   * leaves custom / existing tags untouched. */
  const toggleTag = (tag: string) => {
    setForm((f) => {
      const tags = f.tags ?? [];
      return { ...f, tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag] };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.name.trim().length < 2) {
      onToast('Product name must be at least 2 characters.', 'error');
      return;
    }
    if (
      form.makingChargeDiscountPercent !== undefined &&
      form.makingChargeDiscountPercent !== null &&
      (form.makingChargeDiscountPercent < 0 || form.makingChargeDiscountPercent > 100)
    ) {
      onToast('Making-charge discount must be between 0 and 100.', 'error');
      return;
    }
    setSaving(true);
    try {
      const saved = isNewProduct
        ? await catalogueService.createProduct(form)
        : await catalogueService.updateProduct(product!.id, form);
      setProduct(saved);
      if (isNewProduct) {
        router.replace(`/admin/catalogue/studio/${saved.id}`);
      }
      onToast('Product details saved');
      setCurrentStep(1);
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not save product details.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const chipBase =
    'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors border';
  const chipOn = 'bg-[#0B0E23] text-white border-[#0B0E23]';
  const chipOff = 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-full">
      {/* LIVE MOBILE PREVIEW — updates as the form changes. Toggleable so it
        * never competes with the fields on a short screen. */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wide">
            <Smartphone className="w-3.5 h-3.5 text-gold" /> Live Preview
          </span>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-[11px] font-bold text-gold-dark hover:underline"
          >
            {showPreview ? 'Hide' : 'Show'}
          </button>
        </div>
        {showPreview && (
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
            <MobilePreviewCard form={form} imageUrl={product?.primaryImageUrl ?? null} />
            <p className="text-[10px] text-slate-400 text-center mt-2 font-medium">
              How this product appears to customers.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4 flex-1">
        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
            Product Name <span className="text-red-500">*</span>
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Royal Kundan Necklace"
            required
            minLength={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Category</label>
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Necklace, Ring…"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">SKU</label>
            <Input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="RKN-2201"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm((f) => ({ ...f, category: c }))}
              className={`${chipBase} ${form.category === c ? chipOn : chipOff}`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Purity</label>
            <Input
              value={form.purity}
              onChange={(e) => setForm({ ...form, purity: e.target.value })}
              placeholder="22K, 916"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Weight (g)</label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={form.weightGrams ?? ''}
              onChange={(e) => setForm({ ...form, weightGrams: e.target.value ? parseFloat(e.target.value) : undefined })}
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PURITY_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setForm((f) => ({ ...f, purity: p }))}
              className={`${chipBase} ${form.purity === p ? chipOn : chipOff}`}
            >
              {p}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Price (₹)</label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={form.price ?? ''}
            onChange={(e) => setForm({ ...form, price: e.target.value ? parseFloat(e.target.value) : undefined })}
            placeholder="0.00"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
              Making-Charge Discount (%)
            </label>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={form.makingChargeDiscountPercent ?? ''}
              onChange={(e) =>
                setForm({ ...form, makingChargeDiscountPercent: e.target.value ? parseFloat(e.target.value) : undefined })
              }
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
              Discount Label
            </label>
            <Input
              value={form.makingChargeDiscountLabel ?? ''}
              onChange={(e) => setForm({ ...form, makingChargeDiscountLabel: e.target.value })}
              placeholder="e.g. Festive Offer"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DISCOUNT_LABEL_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setForm((f) => ({ ...f, makingChargeDiscountLabel: s }))}
              className={`${chipBase} ${form.makingChargeDiscountLabel === s ? chipOn : chipOff}`}
            >
              {s}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Description</label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Craftsmanship notes, occasion, styling tips…"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {TAG_PRESETS.map((t) => {
              const active = (form.tags ?? []).includes(t.label);
              return (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => toggleTag(t.label)}
                  className={`${chipBase} ${active ? chipOn : chipOff}`}
                >
                  <span className="mr-1">{t.emoji}</span>{t.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Type & press Enter"
            />
            <Button type="button" variant="outline" size="default" onClick={addTag} className="shrink-0">
              <Tag className="w-3.5 h-3.5" />
            </Button>
          </div>
          {(form.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {(form.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* STICKY SAVE BAR — docked at the bottom of the right panel's scroll area.
        * Negative margins cancel the panel's px padding so it spans full width. */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-5 mt-4 px-4 sm:px-5 py-3 bg-white/95 backdrop-blur border-t border-slate-200">
        <Button type="submit" isLoading={saving} className="w-full gap-1.5">
          <span>{isNewProduct ? 'Create & Continue' : 'Save & Continue'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </form>
  );
});
ProductDetailsPanel.displayName = 'ProductDetailsPanel';
