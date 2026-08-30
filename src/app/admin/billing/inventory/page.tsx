"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Badge, BadgeProps } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Boxes, Plus, Pencil, ImagePlus, Search, PackageX, PackagePlus, SlidersHorizontal, ClipboardCheck, PackageCheck, Tags, CheckCircle2, AlertCircle, Scale } from 'lucide-react';
import {
  billingService,
  InventoryItem,
  InventoryItemFormData,
  PricingSource,
  SaleReturn,
  Vendor,
  Purity,
  ChargeType,
  PricingMode,
  StockStatus,
  PURITY_OPTIONS,
  CHARGE_TYPE_OPTIONS,
  PRICING_MODE_OPTIONS,
} from '@/services/billingService';
import { ApiError } from '@/lib/apiClient';
import { formatWeight } from '@/lib/formatters';
import { VendorQuickAddDialog } from '../_components/VendorQuickAddDialog';
import { BulkPurchaseDialog } from '../_components/BulkPurchaseDialog';
import { BillingDefaultsDialog } from '../_components/BillingDefaultsDialog';

const STOCK_BADGE: Record<StockStatus, BadgeProps['variant']> = {
  IN_STOCK: 'success',
  SOLD: 'neutral',
  INACTIVE: 'inactive',
  // Post-return states — both are non-sellable stock.
  RETURNED_PENDING_INSPECTION: 'warn',
  DAMAGED: 'danger',
};

const emptyForm: InventoryItemFormData = {
  productCode: '',
  productName: '',
  category: '',
  subcategory: '',
  huid: '',
  purity: '22K',
  grossWeightGrams: 0,
  netGoldWeightGrams: 0,
  vendorId: '',
  vendorName: '',
  purchaseRatePerGram: undefined,
  purchaseDate: '',
  purchaseInvoiceRef: '',
  purchaseCost: undefined,
  makingChargeType: 'PERCENTAGE',
  // null = leave blank to inherit the resolved Vendor/Category/Store default at
  // create time. Typing an explicit 0 keeps a configured 0.
  makingChargeValue: null,
  wastageType: 'PERCENTAGE',
  wastageValue: null,
  goldProfitPercent: null,
  taxRatePercent: 3,
  pricingMode: 'AUTO',
};

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  // Unfiltered snapshot backing the filter dropdown option lists.
  const [facetItems, setFacetItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalGoldWeightGrams, setTotalGoldWeightGrams] = useState(0);
  // Global, filter-independent gold aggregate (unfiltered backend total).
  const [globalGoldWeightGrams, setGlobalGoldWeightGrams] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StockStatus | ''>('');

  /* Direct inspection of a returned item. Reuses the same backend inspection
   * action Sales History uses — the item's pending return is looked up by
   * inventory id, then inspected by its sale_id. No duplicate inspection logic. */
  const [inspectItem, setInspectItem] = useState<InventoryItem | null>(null);
  const [inspectReturn, setInspectReturn] = useState<SaleReturn | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectSaving, setInspectSaving] = useState(false);
  const [inspectError, setInspectError] = useState('');

  const openInspect = async (item: InventoryItem) => {
    setInspectItem(item);
    setInspectReturn(null);
    setInspectError('');
    setInspectLoading(true);
    try {
      const rec = await billingService.getInventoryReturn(item.id);
      if (!rec) {
        setInspectError('No return awaiting inspection was found for this item. Refresh and retry.');
      }
      setInspectReturn(rec);
    } catch (err) {
      setInspectError(err instanceof ApiError ? err.message : 'Could not load the return.');
    } finally {
      setInspectLoading(false);
    }
  };

  const closeInspect = () => {
    setInspectItem(null);
    setInspectReturn(null);
    setInspectError('');
  };

  const handleInspect = async (outcome: 'RESALABLE' | 'DAMAGED') => {
    if (!inspectReturn) return;
    setInspectSaving(true);
    setInspectError('');
    try {
      // Same authoritative inspection endpoint as Sales History, keyed by sale_id.
      await billingService.recordReturnInspection(inspectReturn.saleId, outcome);
      closeInspect();
      await loadItems();
    } catch (err) {
      setInspectError(err instanceof ApiError ? err.message : 'Could not record the inspection.');
    } finally {
      setInspectSaving(false);
    }
  };
  const [vendorFilter, setVendorFilter] = useState('');
  // Client-side refinements over the loaded set (server already filtered by
  // search/status/vendor). Kept consistent with Clear (one click resets all).
  const [fCategory, setFCategory] = useState('');
  const [fSubcategory, setFSubcategory] = useState('');
  const [fPurity, setFPurity] = useState('');

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [defaultsDialogOpen, setDefaultsDialogOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<InventoryItemFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Create-only: the mandatory product image (uploaded before the item exists)
  // and whether to jump straight into the catalogue publish flow after create.
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const [createImagePreview, setCreateImagePreview] = useState<string>('');
  const [addToCatalogueOnCreate, setAddToCatalogueOnCreate] = useState(false);

  /* Inventory → Catalogue publish. Reuses the real backend publish endpoint;
   * the catalogue image is the item's own uploaded image (mandatory). */
  const [publishItem, setPublishItem] = useState<InventoryItem | null>(null);
  const [publishSource, setPublishSource] = useState<PricingSource>('SELLING_COST');
  const [publishPrice, setPublishPrice] = useState('');
  const [publishSubCat, setPublishSubCat] = useState('');
  const [publishGst, setPublishGst] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ALL six filters are applied server-side so results never miss inventory
  // outside the loaded page.
  const loadItems = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await billingService.listInventory({
        search: search || undefined,
        stockStatus: statusFilter || undefined,
        vendorId: vendorFilter || undefined,
        category: fCategory || undefined,
        subcategory: fSubcategory || undefined,
        purity: fPurity || undefined,
        limit: 100,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalGoldWeightGrams(res.totalGoldWeightGrams);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load inventory.');
    } finally {
      setLoading(false);
    }
  };

  // Dropdown option lists come from an UNFILTERED snapshot so a chosen filter
  // never shrinks the choices available in the other selects. Refreshed on
  // mount and after any create/edit that could introduce a new value.
  const loadFacets = async () => {
    try {
      const res = await billingService.listInventory({ limit: 100 });
      setFacetItems(res.items);
      // Backend returns the full gold aggregate regardless of page size; an
      // unfiltered call is the permanent store-wide total.
      setGlobalGoldWeightGrams(res.totalGoldWeightGrams);
    } catch {
      // Non-fatal — selects just fall back to whatever is currently loaded.
    }
  };

  const loadVendors = async () => {
    try {
      setVendors(await billingService.listVendors());
    } catch {
      // Non-fatal — vendor select just shows empty; inventory list itself still works.
    }
  };

  useEffect(() => {
    loadVendors();
    loadFacets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, vendorFilter, fCategory, fSubcategory, fPurity]);

  const uniq = (xs: (string | null | undefined)[]) =>
    Array.from(new Set(xs.map((x) => (x || '').trim()).filter(Boolean))).sort();
  const facetSource = facetItems.length ? facetItems : items;
  const categoryOptions = uniq(facetSource.map((i) => i.category));
  const subcategoryOptions = uniq(
    facetSource.filter((i) => !fCategory || i.category === fCategory).map((i) => i.subcategory)
  );
  const purityOptions = uniq(facetSource.map((i) => i.purity));
  const filtersActive = !!(search || statusFilter || vendorFilter || fCategory || fSubcategory || fPurity);

  const clearAllFilters = () => {
    setFCategory('');
    setFSubcategory('');
    setFPurity('');
    setSearch('');
    setStatusFilter('');
    setVendorFilter('');
    // search is applied on loadItems; status/vendor also re-fire it via effect,
    // but call once here so a Clear with only search set still reloads.
    loadItems();
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setForm(emptyForm);
    setCreateImageFile(null);
    setCreateImagePreview('');
    setAddToCatalogueOnCreate(false);
    setFormError('');
    setModalOpen(true);
  };

  const openPublish = (item: InventoryItem) => {
    setPublishItem(item);
    setPublishSource('SELLING_COST');
    setPublishPrice('');
    setPublishSubCat(item.subcategory || '');
    setPublishGst(true);
    setPublishError('');
  };
  const closePublish = () => { if (!publishing) setPublishItem(null); };

  const handlePublish = async () => {
    if (!publishItem) return;
    if (!publishItem.imageUrl) {
      setPublishError('A catalogue image is required. Upload an image on the item (Edit) before publishing.');
      return;
    }
    if (publishSource === 'CATALOGUE_COST') {
      const p = parseFloat(publishPrice);
      if (isNaN(p) || p <= 0) { setPublishError('Enter a catalogue price greater than 0.'); return; }
    }
    setPublishing(true);
    setPublishError('');
    try {
      await billingService.publishInventoryItem(publishItem.id, {
        pricingSource: publishSource,
        cataloguePrice: publishSource === 'CATALOGUE_COST' ? parseFloat(publishPrice) : undefined,
        subCategory: publishSubCat.trim() || undefined,
        gstApplied: publishSource === 'SELLING_COST' ? publishGst : undefined,
      });
      setItems((prev) => prev.map((i) => (i.id === publishItem.id ? { ...i, addToCatalogue: true } : i)));
      setToast({ message: `${publishItem.productCode} published to catalogue`, type: 'success' });
      setPublishItem(null);
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : 'Could not publish to catalogue.');
    } finally {
      setPublishing(false);
    }
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setForm({
      productCode: item.productCode,
      productName: item.productName,
      category: item.category || '',
      subcategory: item.subcategory || '',
      huid: item.huid || '',
      purity: item.purity,
      grossWeightGrams: item.grossWeightGrams,
      netGoldWeightGrams: item.netGoldWeightGrams,
      vendorId: item.vendorId || '',
      vendorName: item.vendorName || '',
      purchaseDate: item.purchaseDate || '',
      purchaseInvoiceRef: item.purchaseInvoiceRef || '',
      purchaseRatePerGram: item.purchaseRatePerGram ?? undefined,
      purchaseCost: item.purchaseCost ?? undefined,
      makingChargeType: item.makingChargeType,
      makingChargeValue: item.makingChargeValue,
      wastageType: item.wastageType,
      wastageValue: item.wastageValue,
      goldProfitPercent: item.goldProfitPercent,
      taxRatePercent: item.taxRatePercent,
      // Legacy HYBRID label collapses to AUTO — HYBRID is retired as a pricing mode.
      pricingMode: (item.pricingMode === 'MANUAL' ? 'MANUAL' : 'AUTO'),
    });
    setFormError('');
    setModalOpen(true);
  };

  const isSold = editingItem?.stockStatus === 'SOLD';

  const validate = (): string | null => {
    if (!form.productCode.trim()) return 'Product Code is required.';
    if (!form.productName.trim() || form.productName.trim().length < 2) return 'Product Name is required.';
    if (!form.grossWeightGrams || form.grossWeightGrams <= 0) return 'Gross Weight must be greater than 0.';
    if (!form.netGoldWeightGrams || form.netGoldWeightGrams <= 0) return 'Net Gold Weight must be greater than 0.';
    if (form.netGoldWeightGrams > form.grossWeightGrams) return 'Net Gold Weight cannot exceed Gross Weight.';
    if (form.taxRatePercent === undefined || form.taxRatePercent === null || form.taxRatePercent < 0) {
      return 'Tax/GST rate is required.';
    }
    // Vendor Purchase Cost is compulsory — it is the basis for vendor-cost
    // profit and break-even/safe-price guidance. An item cannot be created (or
    // saved) without it; a legacy null-cost item must have it filled before it
    // can be sold.
    if (form.purchaseCost === undefined || form.purchaseCost === null || form.purchaseCost <= 0) {
      return 'Purchase Cost (vendor cost) is required and must be greater than 0.';
    }
    // A product image is mandatory to create (backend enforces this too).
    if (!editingItem && !createImageFile) return 'A product image is required.';
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      if (editingItem) {
        await billingService.updateInventoryItem(editingItem.id, form);
        setToast({ message: 'Inventory item updated successfully', type: 'success' });
        setModalOpen(false);
        loadItems();
        loadFacets();
      } else {
        // Mandatory image: upload first, then create with the returned path.
        const imageStoragePath = await billingService.uploadInventoryStagingImage(createImageFile!);
        const created = await billingService.createInventoryItem({ ...form, imageStoragePath });
        setToast({ message: 'Inventory item created successfully', type: 'success' });
        setModalOpen(false);
        loadItems();
        loadFacets();
        // Add to Catalogue = Yes → hand off to the existing publish flow, which
        // requires the catalogue price. No duplicate publish logic here.
        if (addToCatalogueOnCreate) openPublish(created);
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the inventory item.');
    } finally {
      setSaving(false);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingItem) return;
    setUploadingImage(true);
    try {
      const updated = await billingService.uploadInventoryItemImage(editingItem.id, file);
      setEditingItem(updated);
      setToast({ message: 'Image uploaded successfully', type: 'success' });
      loadItems();
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Image upload failed', type: 'error' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRetireItem = async (item: InventoryItem) => {
    try {
      const updated = await billingService.setInventoryItemStatus(item.id, 'INACTIVE');
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setToast({ message: 'Item marked inactive', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Could not update item', type: 'error' });
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300 font-body">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
            <Boxes className="h-5 w-5 text-gold" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">Inventory</h1>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Finished jewellery products bought from vendors, each with a unique Product Code.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setDefaultsDialogOpen(true)}>
            <SlidersHorizontal className="h-4 w-4 mr-1.5" /> Defaults
          </Button>
          <Button variant="outline" onClick={() => setPurchaseDialogOpen(true)}>
            <PackagePlus className="h-4 w-4 mr-1.5" /> Bulk Purchase
          </Button>
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Item
          </Button>
        </div>
      </div>

      {/* Two gold-weight aggregates, both server-side across ALL matching rows
       * (not the current page):
       *  - GLOBAL: unfiltered inventory total (loadFacets, filter-independent).
       *  - FILTERED: current-filter total (loadItems). Shown only when filters
       *    are active so the two never read as duplicate. */}
      {!loading && !loadError && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
              <Scale className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Gold in Inventory</p>
              <p className="text-lg font-display font-extrabold text-[#0B0E23]">{formatWeight(globalGoldWeightGrams)}</p>
              <p className="text-[10px] text-slate-400 font-medium">All items · unaffected by filters</p>
            </div>
          </Card>
          {filtersActive && (
            <Card className="p-4 flex items-center gap-4 border-gold/40 bg-gold/5">
              <div className="w-10 h-10 rounded-xl bg-white border border-gold/30 flex items-center justify-center shrink-0">
                <Scale className="h-5 w-5 text-gold" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filtered Gold</p>
                <p className="text-lg font-display font-extrabold text-[#0B0E23]">{formatWeight(totalGoldWeightGrams)}</p>
                <p className="text-[10px] text-slate-400 font-medium truncate">
                  {[fPurity, fCategory, fSubcategory].filter(Boolean).join(' · ') || 'Current filters'} · {total} item{total === 1 ? '' : 's'}
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by product code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadItems()}
              className="pl-9 h-10"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StockStatus | '')}
            className="h-10 w-full sm:w-[170px]"
          >
            <option value="">All statuses</option>
            <option value="IN_STOCK">In Stock</option>
            <option value="SOLD">Sold</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
          <Select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="h-10 w-full sm:w-[170px]">
            <option value="">All vendors</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
          <Button variant="outline" className="h-10" onClick={loadItems}>Search</Button>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center">
          <Select className="h-10 w-full sm:w-[170px]" value={fCategory} onChange={(e) => { setFCategory(e.target.value); setFSubcategory(''); }}>
            <option value="">All Categories</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select className="h-10 w-full sm:w-[170px]" value={fSubcategory} onChange={(e) => setFSubcategory(e.target.value)} disabled={subcategoryOptions.length === 0}>
            <option value="">All Sub-categories</option>
            {subcategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select className="h-10 w-full sm:w-[130px]" value={fPurity} onChange={(e) => setFPurity(e.target.value)}>
            <option value="">All Purity</option>
            {purityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Button variant="ghost" className="h-10 text-slate-500" onClick={clearAllFilters} disabled={!filtersActive}>Clear</Button>
          <span className="text-[11px] font-medium text-slate-400 sm:ml-auto">
            Showing {items.length}{total > items.length ? ` of ${total}` : ''} matching
          </span>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadItems}>Retry</Button>
        </Card>
      )}

      {!loading && !loadError && items.length === 0 && (
        <Card>
          {filtersActive ? (
            <EmptyState
              icon={<PackageX className="h-7 w-7 text-slate-400" />}
              title="No matching items"
              description="No inventory matches the current search or filters."
              actionLabel="Clear filters"
              onAction={clearAllFilters}
            />
          ) : (
            <EmptyState
              icon={<PackageX className="h-7 w-7 text-gold" />}
              title="No inventory items yet"
              description="Add a finished jewellery item bought from a vendor to give it a Product Code you can sell against."
              actionLabel="Add Item"
              onAction={openCreateModal}
            />
          )}
        </Card>
      )}

      {!loading && !loadError && items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Product Code', 'Name', 'Category', 'Sub-category', 'Purity', 'Net Wt.', 'Vendor', 'Status', 'Catalogue', ''].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-mono font-bold text-[#0B0E23]">{item.productCode}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-[#0B0E23]">{item.productName}</td>
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-600">{item.category || '—'}</td>
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-600">{item.subcategory || '—'}</td>
                    <td className="px-3 py-2.5 text-xs font-bold text-gold-dark">{item.purity}</td>
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-600">{formatWeight(item.netGoldWeightGrams)}</td>
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-600">{item.vendorName || '—'}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={STOCK_BADGE[item.stockStatus]} dot>{item.stockStatus.replace('_', ' ')}</Badge>

                    </td>
                    <td className="px-3 py-2.5">
                      {item.addToCatalogue ? (
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> In Catalogue
                          </span>
                          {item.catalogueProductId && (
                            <button
                              onClick={() => router.push(`/admin/catalogue/studio/${item.catalogueProductId}`)}
                              className="text-[10px] font-bold text-[#2C6FBD] hover:underline"
                            >
                              View Product
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400">Not listed</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="icon" variant="ghost" onClick={() => openEditModal(item)} aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {item.stockStatus === 'IN_STOCK' && !item.addToCatalogue && (
                          <Button size="sm" onClick={() => openPublish(item)} className="bg-[#2C6FBD] hover:bg-[#245a9c] text-white">
                            <Tags className="h-3.5 w-3.5 mr-1" /> Add to Catalogue
                          </Button>
                        )}
                        {item.stockStatus === 'IN_STOCK' && item.addToCatalogue && (
                          <Button size="sm" variant="outline" onClick={() => openPublish(item)}>
                            Update Listing
                          </Button>
                        )}
                        {item.stockStatus === 'IN_STOCK' && (
                          <Button size="sm" variant="outline" onClick={() => handleRetireItem(item)}>
                            Retire
                          </Button>
                        )}
                        {item.stockStatus === 'RETURNED_PENDING_INSPECTION' && (
                          <Button size="sm" variant="outline" onClick={() => openInspect(item)}>
                            <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Inspect
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2.5 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
            {items.length} shown{total > items.length ? ` of ${total} matching` : ''}
          </div>
        </Card>
      )}

      <Dialog
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingItem ? `Edit ${editingItem.productCode}` : 'Add Inventory Item'}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          {formError && (
            <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}
          {isSold && (
            <div className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This item has been sold — its record is locked and cannot be edited.
            </div>
          )}

          {editingItem && (
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                {editingItem.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editingItem.imageUrl} alt={editingItem.productName} className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-slate-300" />
                )}
              </div>
              <label className="text-xs font-semibold text-gold-dark cursor-pointer hover:underline">
                {uploadingImage ? 'Uploading...' : 'Upload Photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingImage} onChange={handleImageChange} />
              </label>
            </div>
          )}

          {!editingItem && (
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                {createImagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={createImagePreview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-slate-300" />
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gold-dark cursor-pointer hover:underline">
                  {createImageFile ? 'Change Photo' : 'Upload Photo *'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setCreateImageFile(f);
                      setCreateImagePreview(f ? URL.createObjectURL(f) : '');
                    }}
                  />
                </label>
                <p className="text-[10px] text-slate-400 mt-0.5">Required · JPEG, PNG or WebP</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Product Code *">
              <Input value={form.productCode} disabled={!!editingItem} onChange={(e) => setForm({ ...form, productCode: e.target.value })} placeholder="GN00125" />
            </Field>
            <Field label="HUID">
              <Input value={form.huid} disabled={isSold} onChange={(e) => setForm({ ...form, huid: e.target.value })} placeholder="AB12CD34" />
            </Field>
            <Field label="Product Name *" full>
              <Input value={form.productName} disabled={isSold} onChange={(e) => setForm({ ...form, productName: e.target.value })} placeholder="22K Gold Necklace" />
            </Field>
            <Field label="Category">
              <Input value={form.category} disabled={isSold} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Necklace" />
            </Field>
            <Field label="Subcategory">
              <Input value={form.subcategory} disabled={isSold} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} placeholder="Chain" />
            </Field>
            <Field label="Purity *">
              <Select value={form.purity} disabled={isSold} onChange={(e) => setForm({ ...form, purity: e.target.value as Purity })}>
                {PURITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Gross Weight (g) *">
              <Input type="number" step="0.001" min="0" value={form.grossWeightGrams || ''} disabled={isSold}
                onChange={(e) => setForm({ ...form, grossWeightGrams: parseFloat(e.target.value) || 0 })} />
            </Field>
            <Field label="Net Gold Weight (g) *">
              <Input type="number" step="0.001" min="0" value={form.netGoldWeightGrams || ''} disabled={isSold}
                onChange={(e) => setForm({ ...form, netGoldWeightGrams: parseFloat(e.target.value) || 0 })} />
            </Field>

            <div className="col-span-2 pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Vendor / Purchase (historical)</p>
            </div>
            <Field label="Vendor / Supplier">
              <div className="flex gap-1.5">
                <Select
                  value={form.vendorId || ''}
                  disabled={isSold}
                  onChange={(e) => {
                    const v = vendors.find((x) => x.id === e.target.value);
                    setForm({ ...form, vendorId: e.target.value, vendorName: v?.name || '' });
                  }}
                >
                  <option value="">Select vendor...</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
                {!isSold && (
                  <Button variant="outline" size="icon" onClick={() => setVendorDialogOpen(true)} aria-label="Add vendor">
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Field>
            <Field label="Purchase Date">
              <Input type="date" value={form.purchaseDate} disabled={isSold} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
            </Field>
            <Field label="Purchase Invoice Ref">
              <Input value={form.purchaseInvoiceRef} disabled={isSold} onChange={(e) => setForm({ ...form, purchaseInvoiceRef: e.target.value })} />
            </Field>
            <Field label="Purchase Rate (₹/g)">
              <Input type="number" step="0.01" min="0" value={form.purchaseRatePerGram ?? ''} disabled={isSold}
                onChange={(e) => setForm({ ...form, purchaseRatePerGram: e.target.value ? parseFloat(e.target.value) : undefined })} />
            </Field>
            <Field label="Purchase Value / Cost (₹) *">
              <Input type="number" step="0.01" min="0" placeholder="Required — vendor cost"
                value={form.purchaseCost ?? ''} disabled={isSold}
                onChange={(e) => setForm({ ...form, purchaseCost: e.target.value ? parseFloat(e.target.value) : undefined })} />
            </Field>

            <div className="col-span-2 pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Selling Price Rules</p>
            </div>
            <Field label="Making Charge Type">
              <Select value={form.makingChargeType} disabled={isSold} onChange={(e) => setForm({ ...form, makingChargeType: e.target.value as ChargeType })}>
                {CHARGE_TYPE_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Making Charge Value">
              <Input type="number" step="0.01" min="0" placeholder="Inherit default" value={form.makingChargeValue ?? ''} disabled={isSold}
                onChange={(e) => setForm({ ...form, makingChargeValue: e.target.value === '' ? null : parseFloat(e.target.value) })} />
            </Field>
            <Field label="Wastage Type">
              <Select value={form.wastageType} disabled={isSold} onChange={(e) => setForm({ ...form, wastageType: e.target.value as ChargeType })}>
                {CHARGE_TYPE_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Wastage Value">
              <Input type="number" step="0.01" min="0" placeholder="Inherit default" value={form.wastageValue ?? ''} disabled={isSold}
                onChange={(e) => setForm({ ...form, wastageValue: e.target.value === '' ? null : parseFloat(e.target.value) })} />
            </Field>
            <Field label="Gold Profit %">
              <Input type="number" step="0.01" min="0" max="100" placeholder="Inherit default" value={form.goldProfitPercent ?? ''} disabled={isSold}
                onChange={(e) => setForm({ ...form, goldProfitPercent: e.target.value === '' ? null : parseFloat(e.target.value) })} />
            </Field>
            <Field label="Tax / GST (%) *">
              <Input type="number" step="0.01" min="0" max="100" value={form.taxRatePercent} disabled={isSold}
                onChange={(e) => setForm({ ...form, taxRatePercent: parseFloat(e.target.value) || 0 })} />
            </Field>
            <Field label="Pricing Mode">
              <Select value={form.pricingMode || 'AUTO'} disabled={isSold} onChange={(e) => setForm({ ...form, pricingMode: e.target.value as PricingMode })}>
                {PRICING_MODE_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>
          </div>

          {!editingItem && (
            <div className="pt-3 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addToCatalogueOnCreate}
                  onChange={(e) => setAddToCatalogueOnCreate(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-gold focus:ring-gold/30 accent-gold"
                />
                Add to Catalogue after creating?
              </label>
              {addToCatalogueOnCreate && (
                <p className="text-[10px] text-slate-400 mt-1">
                  After the item is created, the Catalogue publish step opens — Catalogue Price is required there.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
          {!isSold && (
            <Button onClick={handleSave} isLoading={saving}>
              {editingItem ? 'Save Changes' : 'Create Item'}
            </Button>
          )}
        </DialogFooter>
      </Dialog>

      <VendorQuickAddDialog
        isOpen={vendorDialogOpen}
        onClose={() => setVendorDialogOpen(false)}
        onCreated={(v) => {
          setVendors((prev) => [...prev, v]);
          setForm((f) => ({ ...f, vendorId: v.id, vendorName: v.name }));
          setToast({ message: 'Vendor added', type: 'success' });
        }}
      />
      <BulkPurchaseDialog
        isOpen={purchaseDialogOpen}
        onClose={() => setPurchaseDialogOpen(false)}
        vendors={vendors}
        onCompleted={(count) => {
          setToast({ message: `${count} inventory item(s) created from purchase`, type: 'success' });
          loadItems();
        }}
      />
      <BillingDefaultsDialog isOpen={defaultsDialogOpen} onClose={() => setDefaultsDialogOpen(false)} />

      {/* Inventory → Catalogue publish */}
      <Dialog
        isOpen={!!publishItem}
        onClose={closePublish}
        title={publishItem?.addToCatalogue ? 'Update Catalogue Listing' : 'Add to Catalogue'}
        maxWidth="max-w-lg"
      >
        {publishItem && (
          <div className="space-y-4">
            {/* Product + image preview */}
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
                {publishItem.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={publishItem.imageUrl} alt={publishItem.productName} className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-slate-300" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#0B0E23] truncate">{publishItem.productName}</p>
                <p className="text-[11px] font-mono text-slate-500">{publishItem.productCode} · {publishItem.purity}</p>
              </div>
            </div>

            {/* Image requirement — the backend uses the item's own image and rejects none. */}
            {!publishItem.imageUrl && (
              <div className="flex items-start gap-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>A catalogue image is required. Close this, open <strong>Edit</strong> on the item, upload a photo, then publish.</span>
              </div>
            )}

            {/* Catalogue pricing — single listing workflow. */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Catalogue Pricing</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setPublishSource('SELLING_COST'); setPublishError(''); }}
                  className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                    publishSource === 'SELLING_COST'
                      ? 'border-[#2C6FBD] bg-[#2C6FBD]/5 ring-1 ring-[#2C6FBD]/30'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-bold text-[#0B0E23]">Selling Price</p>
                  <p className="text-[10px] text-slate-500 font-medium">Server-computed from billing rules</p>
                </button>
                <button
                  type="button"
                  onClick={() => { setPublishSource('CATALOGUE_COST'); setPublishError(''); }}
                  className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                    publishSource === 'CATALOGUE_COST'
                      ? 'border-[#2C6FBD] bg-[#2C6FBD]/5 ring-1 ring-[#2C6FBD]/30'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-bold text-[#0B0E23]">Catalogue Price</p>
                  <p className="text-[10px] text-slate-500 font-medium">Manual price you set</p>
                </button>
              </div>
            </div>

            {publishSource === 'CATALOGUE_COST' && (
              <Field label="Catalogue Price (₹) *">
                <Input
                  type="number" step="0.01" min="0"
                  value={publishPrice}
                  onChange={(e) => setPublishPrice(e.target.value)}
                  placeholder="e.g. 85000"
                />
              </Field>
            )}

            {publishSource === 'SELLING_COST' && (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" className="accent-[#2C6FBD] w-4 h-4" checked={publishGst} onChange={(e) => setPublishGst(e.target.checked)} />
                Apply GST in the computed selling price
              </label>
            )}

            <Field label="Sub-category (optional)">
              <Input value={publishSubCat} onChange={(e) => setPublishSubCat(e.target.value)} placeholder="e.g. Chain" />
            </Field>

            {publishError && (
              <p className="text-[11px] font-medium text-red-600">{publishError}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={closePublish} disabled={publishing}>Cancel</Button>
          <Button
            onClick={handlePublish}
            isLoading={publishing}
            disabled={!publishItem?.imageUrl}
            className="bg-[#2C6FBD] hover:bg-[#245a9c] text-white"
          >
            {publishItem?.addToCatalogue ? 'Update Listing' : 'Publish to Catalogue'}
          </Button>
        </DialogFooter>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Direct return inspection — same outcomes and backend action as the
        * Sales History return panel. */}
      <Dialog
        isOpen={!!inspectItem}
        onClose={closeInspect}
        title={inspectItem ? `Inspect ${inspectItem.productCode}` : undefined}
        maxWidth="max-w-md"
      >
        {inspectLoading && <p className="text-xs text-slate-500 font-medium">Loading return…</p>}

        {inspectItem && !inspectLoading && (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {[
                ['Product', inspectItem.productName],
                ['Code', inspectItem.productCode],
                ['Current Status', inspectItem.stockStatus.replace(/_/g, ' ')],
                ...(inspectReturn ? [
                  ['Original Invoice', inspectReturn.invoiceNumber],
                  ['Return Reason', inspectReturn.reason],
                ] as [string, string][] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-3 py-2 gap-3">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">{label}</span>
                  <span className="text-xs font-bold text-[#0B0E23] text-right truncate">{value}</span>
                </div>
              ))}
            </div>

            {inspectReturn && (
              <p className="text-[11px] text-slate-500 font-medium">
                Good Condition returns the item to sellable stock (IN_STOCK). Mark Damaged keeps it
                out of sellable stock (DAMAGED).
              </p>
            )}
            {inspectError && <p className="text-[11px] font-medium text-red-600">{inspectError}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={closeInspect}>Cancel</Button>
          {inspectReturn && (
            <>
              <Button variant="outline" isLoading={inspectSaving} onClick={() => handleInspect('DAMAGED')}>
                Mark Damaged
              </Button>
              <Button isLoading={inspectSaving} onClick={() => handleInspect('RESALABLE')}>
                <PackageCheck className="h-3.5 w-3.5 mr-1" /> Good Condition
              </Button>
            </>
          )}
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2 space-y-1' : 'space-y-1'}>
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{label}</label>
      {children}
    </div>
  );
}
