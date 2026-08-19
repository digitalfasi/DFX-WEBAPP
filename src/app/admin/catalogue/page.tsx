"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Package, ImageOff, Wand2, Trash2, ImagePlus, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/form-controls';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/shared/ErrorState';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Toast } from '@/components/ui/toast';
import { catalogueService, Product, ProductFormData } from '@/services/catalogueService';
import { ApiError } from '@/lib/apiClient';

const EMPTY_QUICK_FORM: ProductFormData = { name: '', price: null, category: '', purity: '', description: '' };

/**
 * Catalogue Studio — Product Studio redesign. This page is now just the
 * product grid: a single guided per-product wizard
 * (/admin/catalogue/studio/[productId]) replaced the previous 6-tab layout
 * (Products / Media Library / AI Enhancement / Templates / Marketing
 * Assets / Generated Catalogue). Every real capability those tabs exposed
 * is still reachable — Templates and rendering live in the wizard's Steps
 * 4-6 — except the AI Enhancement tab, which was a stub for a still-
 * unconfigured AI provider and has no place in this offline-only redesign.
 */
export default function CatalogueStudioPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Quick Add — the fast path: name, price, basic details, one image, save, done.
  // Advanced editing (multi-image, AI enhancement, templates) stays in Product Studio.
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickForm, setQuickForm] = useState<ProductFormData>(EMPTY_QUICK_FORM);
  const [quickImage, setQuickImage] = useState<File | null>(null);
  const [quickImagePreview, setQuickImagePreview] = useState<string | null>(null);
  const [quickError, setQuickError] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProducts = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setProducts(await catalogueService.getProducts());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await catalogueService.deactivateProduct(deleteTarget.id);
      setToast({ message: `"${deleteTarget.name}" deleted`, type: 'success' });
      setDeleteTarget(null);
      await loadProducts();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not delete product',
        type: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  const openQuickAdd = () => {
    setQuickForm(EMPTY_QUICK_FORM);
    setQuickImage(null);
    setQuickImagePreview(null);
    setQuickError('');
    setQuickAddOpen(true);
  };

  const handlePickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQuickImage(file);
    setQuickImagePreview(URL.createObjectURL(file));
  };

  const handleQuickSave = async () => {
    setQuickError('');
    if (!quickForm.name.trim()) {
      setQuickError('Product name is required.');
      return;
    }
    setQuickSaving(true);
    try {
      const created = await catalogueService.createProduct(quickForm);
      if (quickImage) {
        try {
          await catalogueService.uploadImage(created.id, quickImage);
        } catch {
          // Product itself saved fine — surface the image failure honestly
          // rather than claiming full success.
          setToast({ message: `"${created.name}" saved, but the image failed to upload. Open it in Product Studio to retry.`, type: 'error' });
          setQuickAddOpen(false);
          await loadProducts();
          return;
        }
      }
      setQuickAddOpen(false);
      setToast({ message: `"${created.name}" added to your catalogue.`, type: 'success' });
      await loadProducts();
    } catch (err) {
      setQuickError(err instanceof ApiError ? err.message : 'Could not save product.');
    } finally {
      setQuickSaving(false);
    }
  };

  const filtered = products.filter(
    (p) =>
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
              Catalogue Studio
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gold/10 border border-gold/30 text-[10px] font-bold text-gold-dark uppercase tracking-wide">
              Product Studio
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Add a product in seconds, or open Product Studio for images, editing, and templates.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/catalogue/studio/new')} className="gap-1.5">
            <Wand2 className="w-4 h-4" />
            <span>Product Studio</span>
          </Button>
          <Button onClick={openQuickAdd} className="gap-1.5">
            <Plus className="w-4 h-4" />
            <span>New Product</span>
          </Button>
        </div>
      </div>

      {/* SEARCH */}
      {!loading && !loadError && products.length > 0 && (
        <div className="max-w-sm">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" />
        </div>
      )}

      {/* PRODUCT GRID */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && loadError && <ErrorState message={loadError} onRetry={loadProducts} />}

      {!loading && !loadError && products.length === 0 && (
        <Card>
          <EmptyState
            icon={<Package className="h-7 w-7 text-gold" />}
            title="No products yet"
            description="Add your first jewellery product — name, price, and a photo is all you need to start."
            actionLabel="New Product"
            onAction={openQuickAdd}
          />
        </Card>
      )}

      {!loading && !loadError && products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((product) => (
            <Card
              key={product.id}
              hoverable
              onClick={() => router.push(`/admin/catalogue/studio/${product.id}`)}
              className="overflow-hidden cursor-pointer group"
            >
              <div className="relative aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
                {product.primaryImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.primaryImageUrl}
                    alt={product.name}
                    loading="lazy"
                    className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <ImageOff className="w-8 h-8 text-slate-300" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(product);
                  }}
                  className="absolute top-2 right-2 flex items-center justify-center h-7 w-7 rounded-lg bg-white text-slate-500 border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all duration-150 shadow-sm z-10"
                  aria-label={`Delete ${product.name}`}
                  title="Delete product"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="p-3.5">
                <p className="text-sm font-bold text-[#0B0E23] truncate">{product.name}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {product.imageCount} image{product.imageCount === 1 ? '' : 's'}
                  </span>
                  {!product.isActive && <Badge variant="inactive">Inactive</Badge>}
                </div>
                {(product.purity || product.price) && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {product.purity && <Badge variant="gold">{product.purity}</Badge>}
                    {product.price != null && (
                      <span className="text-[11px] font-bold text-slate-600">₹{product.price.toLocaleString('en-IN')}</span>
                    )}
                  </div>
                )}
                {product.tags && product.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {product.tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="neutral">{t}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-xs text-slate-400 py-8">No products match &quot;{search}&quot;.</p>
          )}
        </div>
      )}

      {/* QUICK ADD — the simple path: details, one image, save, done. */}
      <Dialog
        isOpen={quickAddOpen}
        onClose={() => !quickSaving && setQuickAddOpen(false)}
        title="New Product"
        maxWidth="max-w-lg"
      >
        <div className="space-y-3.5 text-xs max-h-[70vh] overflow-y-auto pr-1">
          {quickError && (
            <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {quickError}
            </div>
          )}

          {/* Image picker — the whole point is one photo, not a gallery. */}
          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Photo</label>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePickImage} className="hidden" />
            {quickImagePreview ? (
              <div className="relative aspect-square w-32 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={quickImagePreview} alt="Selected product" className="w-full h-full object-contain p-2" />
                <button
                  onClick={() => { setQuickImage(null); setQuickImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  aria-label="Remove selected photo"
                  className="absolute top-1.5 right-1.5 flex items-center justify-center h-6 w-6 rounded-lg bg-white/95 text-slate-500 border border-slate-200 hover:text-red-600 hover:border-red-200 shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1.5 aspect-square w-32 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-gold/50 hover:text-gold-dark transition-colors"
              >
                <ImagePlus className="w-5 h-5" />
                <span className="text-[10px] font-bold">Add photo</span>
              </button>
            )}
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Product Name *</label>
            <Input
              value={quickForm.name}
              onChange={(e) => setQuickForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Gold Necklace — Temple Design"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Price (₹)</label>
              <Input
                type="number"
                min="0"
                value={quickForm.price ?? ''}
                onChange={(e) => setQuickForm((f) => ({ ...f, price: e.target.value ? Number(e.target.value) : null }))}
                placeholder="45000"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-500 uppercase text-[10px]">Purity</label>
              <Input
                value={quickForm.purity}
                onChange={(e) => setQuickForm((f) => ({ ...f, purity: e.target.value }))}
                placeholder="e.g. 22K"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Category</label>
            <Input
              value={quickForm.category}
              onChange={(e) => setQuickForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Necklace, Ring, Bangle"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Details</label>
            <Textarea
              value={quickForm.description}
              onChange={(e) => setQuickForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional — craftsmanship, occasion, weight, etc."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setQuickAddOpen(false)} disabled={quickSaving}>
            Cancel
          </Button>
          <Button size="sm" isLoading={quickSaving} onClick={handleQuickSave}>
            Save Product
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete Product?"
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <span className="font-bold">{deleteTarget?.name}</span>? It will be
          marked inactive (shown with an &quot;Inactive&quot; badge here). Its images and design history are kept,
          not permanently erased — reopen it in Product Studio anytime to reactivate it.
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

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
