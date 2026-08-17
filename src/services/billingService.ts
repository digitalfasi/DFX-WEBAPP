import { apiClient, API_BASE_URL, tokenStore } from '@/lib/apiClient';

export type Purity = '9K' | '14K' | '18K' | '20K' | '22K' | '24K';
export const PURITY_OPTIONS: Purity[] = ['9K', '14K', '18K', '20K', '22K', '24K'];

export type ChargeType = 'FIXED' | 'PER_GRAM' | 'PERCENTAGE';
export const CHARGE_TYPE_OPTIONS: { value: ChargeType; label: string }[] = [
  { value: 'PERCENTAGE', label: '% of gold value' },
  { value: 'PER_GRAM', label: 'Per gram' },
  { value: 'FIXED', label: 'Fixed amount' },
];

export type StockStatus = 'IN_STOCK' | 'SOLD' | 'INACTIVE' | 'RETURNED_PENDING_INSPECTION' | 'DAMAGED';
export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';
export const PAYMENT_METHOD_OPTIONS: PaymentMethod[] = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER'];
export type PaymentStatus = 'PAID' | 'PENDING' | 'PARTIAL';
export const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = ['PAID', 'PENDING', 'PARTIAL'];
/* Full stored vocabulary of a sale's payment status. The two refund states are
 * reachable only through a return, never by creating a sale. */
export type SalePaymentStatus = PaymentStatus | 'REFUNDED' | 'PARTIALLY_REFUNDED';
/* The SALE lifecycle, independent of the money lifecycle. There is no
 * PARTIALLY_RETURNED state: one sale carries one item in this data model. */
export type SaleStatus = 'COMPLETED' | 'RETURNED' | 'CANCELLED';
export type ReturnType = 'RETURN' | 'CANCELLATION';
export type InspectionOutcome = 'RESALABLE' | 'DAMAGED';

export type PricingMode = 'AUTO' | 'HYBRID' | 'MANUAL';
export const PRICING_MODE_OPTIONS: { value: PricingMode; label: string }[] = [
  { value: 'AUTO', label: 'Auto — system calculates' },
  { value: 'HYBRID', label: 'Hybrid — suggested, editable' },
  { value: 'MANUAL', label: 'Manual — you set the price' },
];
export type DefaultSource = 'VENDOR' | 'CATEGORY' | 'STORE' | 'NONE';

/* ------------------------------------------------------------------ */
/* Shared default-fields shape — Vendor / Category / Store defaults    */
/* all carry exactly this set (pre-fill only, never linked from a      */
/* saved InventoryItem/Sale).                                          */
/* ------------------------------------------------------------------ */

interface BackendBillingDefaultFields {
  making_charge_type: ChargeType | null;
  making_charge_value: number | null;
  wastage_type: ChargeType | null;
  wastage_value: number | null;
  gold_profit_percent: number | null;
  tax_rate_percent: number | null;
  default_pricing_mode: PricingMode | null;
}

export interface BillingDefaultFields {
  makingChargeType: ChargeType | null;
  makingChargeValue: number | null;
  wastageType: ChargeType | null;
  wastageValue: number | null;
  goldProfitPercent: number | null;
  taxRatePercent: number | null;
  defaultPricingMode: PricingMode | null;
}

function mapDefaultFields(raw: BackendBillingDefaultFields): BillingDefaultFields {
  return {
    makingChargeType: raw.making_charge_type,
    makingChargeValue: raw.making_charge_value,
    wastageType: raw.wastage_type,
    wastageValue: raw.wastage_value,
    goldProfitPercent: raw.gold_profit_percent,
    taxRatePercent: raw.tax_rate_percent,
    defaultPricingMode: raw.default_pricing_mode,
  };
}

function toBackendDefaultFields(data: Partial<BillingDefaultFields>) {
  return {
    making_charge_type: data.makingChargeType ?? null,
    making_charge_value: data.makingChargeValue ?? null,
    wastage_type: data.wastageType ?? null,
    wastage_value: data.wastageValue ?? null,
    gold_profit_percent: data.goldProfitPercent ?? null,
    tax_rate_percent: data.taxRatePercent ?? null,
    default_pricing_mode: data.defaultPricingMode ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Vendor                                                              */
/* ------------------------------------------------------------------ */

interface BackendVendor extends BackendBillingDefaultFields {
  id: string;
  tenant_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Vendor extends BillingDefaultFields {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstNumber: string | null;
  isActive: boolean;
}

export interface VendorFormData extends Partial<BillingDefaultFields> {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstNumber?: string;
}

function mapVendor(raw: BackendVendor): Vendor {
  return {
    ...mapDefaultFields(raw),
    id: raw.id,
    name: raw.name,
    contactPerson: raw.contact_person,
    phone: raw.phone,
    email: raw.email,
    address: raw.address,
    gstNumber: raw.gst_number,
    isActive: raw.is_active,
  };
}

/* ------------------------------------------------------------------ */
/* Category Pricing Default                                            */
/* ------------------------------------------------------------------ */

interface BackendCategoryDefault extends BackendBillingDefaultFields {
  id: string;
  category: string;
  created_at: string;
}

export interface CategoryDefault extends BillingDefaultFields {
  id: string;
  category: string;
}

function mapCategoryDefault(raw: BackendCategoryDefault): CategoryDefault {
  return { ...mapDefaultFields(raw), id: raw.id, category: raw.category };
}

/* ------------------------------------------------------------------ */
/* Store (Tenant) Billing Defaults                                     */
/* ------------------------------------------------------------------ */

export type StoreDefaults = BillingDefaultFields;

/* ------------------------------------------------------------------ */
/* Resolved Defaults — field-by-field, for pre-filling forms           */
/* ------------------------------------------------------------------ */

interface BackendResolvedDefaults {
  making_charge_type: ChargeType | null;
  making_charge_value: number | null;
  wastage_type: ChargeType | null;
  wastage_value: number | null;
  gold_profit_percent: number | null;
  tax_rate_percent: number | null;
  pricing_mode: PricingMode | null;
  sources: Record<string, DefaultSource>;
}

export interface ResolvedDefaults {
  makingChargeType: ChargeType | null;
  makingChargeValue: number | null;
  wastageType: ChargeType | null;
  wastageValue: number | null;
  goldProfitPercent: number | null;
  taxRatePercent: number | null;
  pricingMode: PricingMode | null;
  sources: Record<string, DefaultSource>;
}

function mapResolvedDefaults(raw: BackendResolvedDefaults): ResolvedDefaults {
  return {
    makingChargeType: raw.making_charge_type,
    makingChargeValue: raw.making_charge_value,
    wastageType: raw.wastage_type,
    wastageValue: raw.wastage_value,
    goldProfitPercent: raw.gold_profit_percent,
    taxRatePercent: raw.tax_rate_percent,
    pricingMode: raw.pricing_mode,
    sources: raw.sources,
  };
}

/* ------------------------------------------------------------------ */
/* Inventory / Product Master                                         */
/* ------------------------------------------------------------------ */

interface BackendInventoryItem {
  id: string;
  tenant_id: string;
  product_code: string;
  product_name: string;
  category: string | null;
  subcategory: string | null;
  huid: string | null;
  purity: string;
  gross_weight_grams: number;
  net_gold_weight_grams: number;
  vendor_id: string | null;
  vendor_name: string | null;
  purchase_date: string | null;
  purchase_invoice_ref: string | null;
  purchase_rate_per_gram: number | null;
  purchase_cost: number | null;
  image_url: string | null;
  stock_status: StockStatus;
  making_charge_type: ChargeType;
  making_charge_value: number;
  wastage_type: ChargeType;
  wastage_value: number;
  gold_profit_percent: number;
  stone_charge_amount: number;
  other_charges_amount: number;
  tax_rate_percent: number;
  pricing_mode: PricingMode | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  productCode: string;
  productName: string;
  category: string | null;
  subcategory: string | null;
  huid: string | null;
  purity: Purity;
  grossWeightGrams: number;
  netGoldWeightGrams: number;
  vendorId: string | null;
  vendorName: string | null;
  purchaseDate: string | null;
  purchaseInvoiceRef: string | null;
  purchaseRatePerGram: number | null;
  purchaseCost: number | null;
  imageUrl: string | null;
  stockStatus: StockStatus;
  makingChargeType: ChargeType;
  makingChargeValue: number;
  wastageType: ChargeType;
  wastageValue: number;
  goldProfitPercent: number;
  stoneChargeAmount: number;
  otherChargesAmount: number;
  taxRatePercent: number;
  pricingMode: PricingMode | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItemFormData {
  productCode: string;
  productName: string;
  category?: string;
  subcategory?: string;
  huid?: string;
  purity: Purity;
  grossWeightGrams: number;
  netGoldWeightGrams: number;
  vendorId?: string;
  vendorName?: string;
  purchaseDate?: string;
  purchaseInvoiceRef?: string;
  purchaseRatePerGram?: number;
  purchaseCost?: number;
  makingChargeType: ChargeType;
  makingChargeValue: number;
  wastageType: ChargeType;
  wastageValue: number;
  goldProfitPercent: number;
  stoneChargeAmount?: number;
  otherChargesAmount?: number;
  taxRatePercent: number;
  pricingMode?: PricingMode | null;
}

function mapInventoryItem(raw: BackendInventoryItem): InventoryItem {
  return {
    id: raw.id,
    productCode: raw.product_code,
    productName: raw.product_name,
    category: raw.category,
    subcategory: raw.subcategory,
    huid: raw.huid,
    purity: raw.purity as Purity,
    grossWeightGrams: raw.gross_weight_grams,
    netGoldWeightGrams: raw.net_gold_weight_grams,
    vendorId: raw.vendor_id,
    vendorName: raw.vendor_name,
    purchaseDate: raw.purchase_date,
    purchaseInvoiceRef: raw.purchase_invoice_ref,
    purchaseRatePerGram: raw.purchase_rate_per_gram,
    purchaseCost: raw.purchase_cost,
    imageUrl: raw.image_url,
    stockStatus: raw.stock_status,
    makingChargeType: raw.making_charge_type,
    makingChargeValue: raw.making_charge_value,
    wastageType: raw.wastage_type,
    wastageValue: raw.wastage_value,
    goldProfitPercent: raw.gold_profit_percent,
    stoneChargeAmount: raw.stone_charge_amount,
    otherChargesAmount: raw.other_charges_amount,
    taxRatePercent: raw.tax_rate_percent,
    pricingMode: raw.pricing_mode,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function toBackendInventoryPayload(data: Partial<InventoryItemFormData>) {
  return {
    product_code: data.productCode,
    product_name: data.productName,
    category: data.category || null,
    subcategory: data.subcategory || null,
    huid: data.huid || null,
    purity: data.purity,
    gross_weight_grams: data.grossWeightGrams,
    net_gold_weight_grams: data.netGoldWeightGrams,
    vendor_id: data.vendorId || null,
    vendor_name: data.vendorName || null,
    purchase_date: data.purchaseDate || null,
    purchase_invoice_ref: data.purchaseInvoiceRef || null,
    purchase_rate_per_gram: data.purchaseRatePerGram ?? null,
    purchase_cost: data.purchaseCost ?? null,
    making_charge_type: data.makingChargeType,
    making_charge_value: data.makingChargeValue,
    wastage_type: data.wastageType,
    wastage_value: data.wastageValue,
    gold_profit_percent: data.goldProfitPercent,
    stone_charge_amount: data.stoneChargeAmount ?? 0,
    other_charges_amount: data.otherChargesAmount ?? 0,
    tax_rate_percent: data.taxRatePercent,
    pricing_mode: data.pricingMode ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Selling / Sale                                                      */
/* ------------------------------------------------------------------ */

export interface PriceBreakdown {
  purity: Purity;
  netGoldWeightGrams: number;
  goldRate24k: number;
  goldRatePurityFactor: number;
  goldRateApplied: number;
  goldRateSource: string;
  goldRateEffectiveDate: string;
  goldValueAmount: number;
  makingChargeType: ChargeType;
  makingChargeValue: number;
  makingChargeAmount: number;
  wastageType: ChargeType;
  wastageValue: number;
  wastageAmount: number;
  goldProfitPercent: number;
  goldProfitAmount: number;
  stoneChargeAmount: number;
  otherChargesAmount: number;
  subtotalBeforeTax: number;
  gstApplied: boolean;
  taxRatePercent: number;
  taxAmount: number;
  discountAmount: number;
  finalAmount: number;
}

interface BackendPriceBreakdown {
  purity: string;
  net_gold_weight_grams: number;
  gold_rate_24k: number;
  gold_rate_purity_factor: number;
  gold_rate_applied: number;
  gold_rate_source: string;
  gold_rate_effective_date: string;
  gold_value_amount: number;
  making_charge_type: ChargeType;
  making_charge_value: number;
  making_charge_amount: number;
  wastage_type: ChargeType;
  wastage_value: number;
  wastage_amount: number;
  gold_profit_percent: number;
  gold_profit_amount: number;
  stone_charge_amount: number;
  other_charges_amount: number;
  subtotal_before_tax: number;
  gst_applied: boolean;
  tax_rate_percent: number;
  tax_amount: number;
  discount_amount: number;
  final_amount: number;
}

function mapBreakdown(raw: BackendPriceBreakdown): PriceBreakdown {
  return {
    purity: raw.purity as Purity,
    netGoldWeightGrams: raw.net_gold_weight_grams,
    goldRate24k: raw.gold_rate_24k,
    goldRatePurityFactor: raw.gold_rate_purity_factor,
    goldRateApplied: raw.gold_rate_applied,
    goldRateSource: raw.gold_rate_source,
    goldRateEffectiveDate: raw.gold_rate_effective_date,
    goldValueAmount: raw.gold_value_amount,
    makingChargeType: raw.making_charge_type,
    makingChargeValue: raw.making_charge_value,
    makingChargeAmount: raw.making_charge_amount,
    wastageType: raw.wastage_type,
    wastageValue: raw.wastage_value,
    wastageAmount: raw.wastage_amount,
    goldProfitPercent: raw.gold_profit_percent,
    goldProfitAmount: raw.gold_profit_amount,
    stoneChargeAmount: raw.stone_charge_amount,
    otherChargesAmount: raw.other_charges_amount,
    subtotalBeforeTax: raw.subtotal_before_tax,
    gstApplied: raw.gst_applied,
    taxRatePercent: raw.tax_rate_percent,
    taxAmount: raw.tax_amount,
    discountAmount: raw.discount_amount,
    finalAmount: raw.final_amount,
  };
}

export interface SaleQuote {
  inventoryItem: InventoryItem;
  breakdown: PriceBreakdown;
  /** Historical-cost profit (kept for backward compat = historicalProfitOrLoss). */
  profitOrLoss: number | null;
  // Phase A dual profit views, backend-computed, null for non-privileged.
  historicalProfitOrLoss: number | null;
  historicalProfitMarginPercent: number | null;
  currentGoldValueProfitOrLoss: number | null;
  currentGoldValueMarginPercent: number | null;
}

export interface SaleCreateData {
  productCode: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  discountAmount?: number;
  customerPrice?: number;
  gstApplied?: boolean;
  pricingMode?: PricingMode;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  /* Required when paymentStatus is PARTIAL — the amount actually collected at
   * the counter. The backend rejects a PARTIAL sale without it, and rejects it
   * being sent for PAID/PENDING. */
  initialPaymentAmount?: number;
  paymentReferenceNo?: string;
  /* Optional per-bill overrides — the backend recalculates with these so the
   * finalized sale matches the previewed bill exactly. */
  makingChargeValue?: number;
  wastageValue?: number;
  goldProfitPercent?: number;
}

interface BackendSale extends BackendPriceBreakdown {
  id: string;
  tenant_id: string;
  invoice_number: string;
  inventory_item_id: string;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  product_code: string;
  product_name: string;
  vendor_name: string | null;
  huid: string | null;
  gross_weight_grams: number;
  payment_method: PaymentMethod;
  payment_status: SalePaymentStatus;
  amount_paid: number;
  amount_outstanding: number;
  sale_status?: SaleStatus;
  amount_refunded?: number;
  sale_return?: BackendSaleReturn | null;
  pricing_mode: PricingMode | null;
  purchase_cost_snapshot: number | null;
  estimated_gross_margin: number | null;
  sale_timestamp: string;
  created_by: string;
  created_at: string;
}

export interface Sale extends PriceBreakdown {
  id: string;
  invoiceNumber: string;
  inventoryItemId: string;
  customerId: string | null;
  /** Live customer code of the linked customer (blank for a walk-in). Read
   * from the customer record by the backend, not stored on the sale. */
  customerCode: string;
  customerName: string | null;
  customerPhone: string | null;
  productCode: string;
  productName: string;
  vendorName: string | null;
  huid: string | null;
  grossWeightGrams: number;
  paymentMethod: PaymentMethod;
  /* Derived by the backend from the payment ledger — never set by this client. */
  paymentStatus: SalePaymentStatus;
  amountPaid: number;
  amountOutstanding: number;
  saleStatus: SaleStatus;
  amountRefunded: number;
  /** Populated on the single-invoice read only; null on an intact sale. */
  saleReturn: SaleReturn | null;
  pricingMode: PricingMode | null;
  purchaseCostSnapshot: number | null;
  estimatedGrossMargin: number | null;
  saleTimestamp: string;
  createdBy: string;
  createdAt: string;
}

function mapSale(raw: BackendSale): Sale {
  return {
    ...mapBreakdown(raw),
    id: raw.id,
    invoiceNumber: raw.invoice_number,
    inventoryItemId: raw.inventory_item_id,
    customerId: raw.customer_id,
    customerCode: raw.customer_code ?? '',
    customerName: raw.customer_name,
    customerPhone: raw.customer_phone,
    productCode: raw.product_code,
    productName: raw.product_name,
    vendorName: raw.vendor_name,
    huid: raw.huid,
    grossWeightGrams: raw.gross_weight_grams,
    paymentMethod: raw.payment_method,
    paymentStatus: raw.payment_status,
    amountPaid: raw.amount_paid ?? 0,
    amountOutstanding: raw.amount_outstanding ?? 0,
    saleStatus: raw.sale_status ?? 'COMPLETED',
    amountRefunded: raw.amount_refunded ?? 0,
    saleReturn: raw.sale_return ? mapSaleReturn(raw.sale_return) : null,
    pricingMode: raw.pricing_mode,
    purchaseCostSnapshot: raw.purchase_cost_snapshot,
    estimatedGrossMargin: raw.estimated_gross_margin,
    saleTimestamp: raw.sale_timestamp,
    createdBy: raw.created_by,
    createdAt: raw.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* Sale return / cancellation — the reversal record for one invoice.    */
/* The original sale is never edited, and every figure below comes from  */
/* the backend, the sole authority on what may be refunded.             */
/* ------------------------------------------------------------------ */

const BILLING_SALES = '/billing/sales';

interface BackendSaleReturn {
  id: string;
  sale_id: string;
  invoice_number: string;
  inventory_item_id: string;
  product_code: string;
  return_type: ReturnType;
  reason: string;
  original_sale_amount: number;
  amount_collected_at_return: number;
  refund_amount: number;
  outstanding_written_off: number;
  scheme_restored?: number;
  refund_method: PaymentMethod | null;
  refund_reference_no: string | null;
  inspection_status: 'PENDING' | 'RESALABLE' | 'DAMAGED';
  inspection_notes: string | null;
  inspected_at: string | null;
  inspected_by: string | null;
  inspected_by_name: string | null;
  returned_at: string;
  processed_by: string;
  processed_by_name: string | null;
  current_stock_status: StockStatus | null;
  created_at: string;
}

export interface SaleReturn {
  id: string;
  saleId: string;
  invoiceNumber: string;
  inventoryItemId: string;
  productCode: string;
  returnType: ReturnType;
  reason: string;
  originalSaleAmount: number;
  amountCollectedAtReturn: number;
  refundAmount: number;
  outstandingWrittenOff: number;
  schemeRestored: number;
  refundMethod: PaymentMethod | null;
  refundReferenceNo: string | null;
  inspectionStatus: 'PENDING' | 'RESALABLE' | 'DAMAGED';
  inspectionNotes: string | null;
  inspectedAt: string | null;
  inspectedBy: string | null;
  inspectedByName: string | null;
  returnedAt: string;
  processedBy: string;
  processedByName: string | null;
  currentStockStatus: StockStatus | null;
  createdAt: string;
}

interface BackendSaleReturnPreview {
  sale_id: string;
  invoice_number: string;
  product_code: string;
  product_name: string;
  sale_status: SaleStatus;
  payment_status: SalePaymentStatus;
  original_sale_amount: number;
  amount_collected: number;
  outstanding: number;
  max_refundable: number;
  outstanding_to_write_off: number;
  current_stock_status: string;
  resulting_stock_status: string;
  can_return: boolean;
  blocked_reason: string | null;
}

export interface SaleReturnPreview {
  saleId: string;
  invoiceNumber: string;
  productCode: string;
  productName: string;
  saleStatus: SaleStatus;
  paymentStatus: SalePaymentStatus;
  originalSaleAmount: number;
  amountCollected: number;
  outstanding: number;
  /** Never more than what was actually collected — the unpaid balance is
   *  written off by the return, not refunded. */
  maxRefundable: number;
  outstandingToWriteOff: number;
  currentStockStatus: string;
  resultingStockStatus: string;
  canReturn: boolean;
  blockedReason: string | null;
}

export interface ProcessReturnData {
  returnType: ReturnType;
  reason: string;
  /** Omit to refund the full collected amount. */
  refundAmount?: number;
  refundMethod?: PaymentMethod;
  refundReferenceNo?: string;
  refundDate?: string;
}

function mapSaleReturn(raw: BackendSaleReturn): SaleReturn {
  return {
    id: raw.id,
    saleId: raw.sale_id,
    invoiceNumber: raw.invoice_number,
    inventoryItemId: raw.inventory_item_id,
    productCode: raw.product_code,
    returnType: raw.return_type,
    reason: raw.reason,
    originalSaleAmount: raw.original_sale_amount,
    amountCollectedAtReturn: raw.amount_collected_at_return,
    refundAmount: raw.refund_amount,
    outstandingWrittenOff: raw.outstanding_written_off,
    schemeRestored: raw.scheme_restored ?? 0,
    refundMethod: raw.refund_method,
    refundReferenceNo: raw.refund_reference_no,
    inspectionStatus: raw.inspection_status,
    inspectionNotes: raw.inspection_notes,
    inspectedAt: raw.inspected_at,
    inspectedBy: raw.inspected_by,
    inspectedByName: raw.inspected_by_name,
    returnedAt: raw.returned_at,
    processedBy: raw.processed_by,
    processedByName: raw.processed_by_name,
    currentStockStatus: raw.current_stock_status,
    createdAt: raw.created_at,
  };
}

function mapReturnPreview(raw: BackendSaleReturnPreview): SaleReturnPreview {
  return {
    saleId: raw.sale_id,
    invoiceNumber: raw.invoice_number,
    productCode: raw.product_code,
    productName: raw.product_name,
    saleStatus: raw.sale_status,
    paymentStatus: raw.payment_status,
    originalSaleAmount: raw.original_sale_amount,
    amountCollected: raw.amount_collected,
    outstanding: raw.outstanding,
    maxRefundable: raw.max_refundable,
    outstandingToWriteOff: raw.outstanding_to_write_off,
    currentStockStatus: raw.current_stock_status,
    resultingStockStatus: raw.resulting_stock_status,
    canReturn: raw.can_return,
    blockedReason: raw.blocked_reason,
  };
}

/* ------------------------------------------------------------------ */
/* Sale payment ledger — append-only collection history per invoice.   */
/* ------------------------------------------------------------------ */

export const SALES_HISTORY_PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'last_12_months', label: 'Last 12 Months' },
] as const;

export type SalesHistoryPeriod = (typeof SALES_HISTORY_PERIODS)[number]['value'];

interface BackendSalePayment {
  id: string;
  sale_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  source: string;
  reference_no: string | null;
  remarks: string | null;
  recorded_by: string;
  recorded_by_name: string | null;
  created_at: string;
}

interface BackendSalePaymentHistory {
  sale_id: string;
  invoice_number: string;
  final_amount: number;
  amount_paid: number;
  amount_outstanding: number;
  payment_status: PaymentStatus;
  payments: BackendSalePayment[];
}

export interface SalePayment {
  id: string;
  saleId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  source: string;
  referenceNo: string | null;
  remarks: string | null;
  recordedBy: string;
  recordedByName: string | null;
  createdAt: string;
}

export interface SalePaymentHistory {
  saleId: string;
  invoiceNumber: string;
  finalAmount: number;
  amountPaid: number;
  amountOutstanding: number;
  paymentStatus: SalePaymentStatus;
  payments: SalePayment[];
}

export interface RecordPaymentData {
  amount: number;
  /** ISO date (YYYY-MM-DD) — the business date of the collection. */
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNo?: string;
  remarks?: string;
}

function mapPaymentHistory(raw: BackendSalePaymentHistory): SalePaymentHistory {
  return {
    saleId: raw.sale_id,
    invoiceNumber: raw.invoice_number,
    finalAmount: raw.final_amount,
    amountPaid: raw.amount_paid,
    amountOutstanding: raw.amount_outstanding,
    paymentStatus: raw.payment_status,
    payments: raw.payments.map((p) => ({
      id: p.id,
      saleId: p.sale_id,
      amount: p.amount,
      paymentDate: p.payment_date,
      paymentMethod: p.payment_method,
      source: p.source,
      referenceNo: p.reference_no,
      remarks: p.remarks,
      recordedBy: p.recorded_by,
      recordedByName: p.recorded_by_name,
      createdAt: p.created_at,
    })),
  };
}


export interface BulkPurchaseLineItem {
  productCode: string;
  productName: string;
  category?: string;
  subcategory?: string;
  huid?: string;
  purity: Purity;
  grossWeightGrams: number;
  netGoldWeightGrams: number;
  purchaseRatePerGram?: number;
  purchaseCost?: number;
  makingChargeType: ChargeType;
  makingChargeValue: number;
  wastageType: ChargeType;
  wastageValue: number;
  goldProfitPercent: number;
  stoneChargeAmount?: number;
  otherChargesAmount?: number;
  taxRatePercent: number;
  pricingMode?: PricingMode | null;
}

export interface BulkPurchaseData {
  vendorId: string;
  purchaseDate: string;
  purchaseInvoiceRef?: string;
  items: BulkPurchaseLineItem[];
}

function toBackendLineItem(i: BulkPurchaseLineItem) {
  return {
    product_code: i.productCode,
    product_name: i.productName,
    category: i.category || null,
    subcategory: i.subcategory || null,
    huid: i.huid || null,
    purity: i.purity,
    gross_weight_grams: i.grossWeightGrams,
    net_gold_weight_grams: i.netGoldWeightGrams,
    purchase_rate_per_gram: i.purchaseRatePerGram ?? null,
    purchase_cost: i.purchaseCost ?? null,
    making_charge_type: i.makingChargeType,
    making_charge_value: i.makingChargeValue,
    wastage_type: i.wastageType,
    wastage_value: i.wastageValue,
    gold_profit_percent: i.goldProfitPercent,
    stone_charge_amount: i.stoneChargeAmount ?? 0,
    other_charges_amount: i.otherChargesAmount ?? 0,
    tax_rate_percent: i.taxRatePercent,
    pricing_mode: i.pricingMode ?? null,
  };
}

async function downloadBlob(path: string, filename: string): Promise<void> {
  const token = tokenStore.getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Dashboard Billing Summary                                          */
/* ------------------------------------------------------------------ */

export interface BillingPeriodSummary {
  /** Net sales (reversed sales excluded), backend-authoritative. */
  totalSales: number;
  totalProfit: number | null;   // historical-cost profit (Phase A basis)
  totalLoss: number | null;
  billCount: number;
  itemsSold: number;
  totalTax: number;
  avgBillValue: number;
  // Reversal-aware sales + money movement + receivables (Phase F/G).
  grossSales: number;
  salesReturns: number;
  returnCount: number;
  totalRefunded: number;
  cashCollected: number;
  schemeRedemption: number;
  refundsPaid: number;
  totalPaid: number;
  totalOutstanding: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
  saleCount: number;
}

export type BusinessHistoryPeriod =
  | 'today' | 'yesterday' | 'this_week' | 'last_week'
  | 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'last_12_months';

/** Periods accepted by GET /billing/business-summary. */
export type BusinessSummaryPeriod =
  | 'today' | 'yesterday' | 'this_week' | 'this_month'
  | 'last_month' | 'last_3_months' | 'last_6_months' | 'last_12_months';

export const BUSINESS_SUMMARY_PERIOD_OPTIONS: { value: BusinessSummaryPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'last_12_months', label: 'Last 12 Months' },
];

export interface BusinessSummary {
  period: string;
  dateFrom: string;
  dateTo: string;
  totalSales: number;
  totalProfit: number;
  totalLoss: number;
  billCount: number;
  itemsSold: number;
  totalTax: number;
  averageBillValue: number;
}

interface BackendBusinessSummary {
  period: string;
  date_from: string;
  date_to: string;
  total_sales: number;
  total_profit: number;
  total_loss: number;
  bill_count: number;
  items_sold: number;
  total_tax: number;
  average_bill_value: number;
}

function mapBusinessSummary(raw: BackendBusinessSummary): BusinessSummary {
  return {
    period: raw.period,
    dateFrom: raw.date_from,
    dateTo: raw.date_to,
    totalSales: raw.total_sales,
    totalProfit: raw.total_profit,
    totalLoss: raw.total_loss,
    billCount: raw.bill_count,
    itemsSold: raw.items_sold,
    totalTax: raw.total_tax,
    averageBillValue: raw.average_bill_value,
  };
}

export interface RecentSale {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  productCode: string;
  productName: string;
  finalAmount: number;
  profitOrLoss: number | null;
  saleTimestamp: string;
}

export interface BillingDashboardSummary {
  today: BillingPeriodSummary;
  thisMonth: BillingPeriodSummary;
  todayGoldRate24k: number | null;
  recentSales: RecentSale[];
  selectedPeriod: BillingPeriodSummary;
  selectedPeriodLabel: string;
  selectedDateFrom: string;
  selectedDateTo: string;
}

interface BackendBillingPeriodSummary {
  total_sales: number;
  total_profit: number | null;
  total_loss: number | null;
  bill_count: number;
  items_sold: number;
  total_tax: number;
  avg_bill_value: number;
  gross_sales?: number;
  sales_returns?: number;
  return_count?: number;
  total_refunded?: number;
  cash_collected?: number;
  scheme_redemption?: number;
  refunds_paid?: number;
  total_paid?: number;
  total_outstanding?: number;
  paid_count?: number;
  partial_count?: number;
  pending_count?: number;
  sale_count?: number;
}

interface BackendRecentSale {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  product_code: string;
  product_name: string;
  final_amount: number;
  profit_or_loss: number | null;
  sale_timestamp: string;
}

interface BackendBillingDashboardSummary {
  today: BackendBillingPeriodSummary;
  this_month: BackendBillingPeriodSummary;
  today_gold_rate_24k: number | null;
  recent_sales: BackendRecentSale[];
  selected_period: BackendBillingPeriodSummary;
  selected_period_label: string;
  selected_date_from: string;
  selected_date_to: string;
}

function mapPeriodSummary(raw: BackendBillingPeriodSummary): BillingPeriodSummary {
  return {
    totalSales: raw.total_sales,
    totalProfit: raw.total_profit,
    totalLoss: raw.total_loss,
    billCount: raw.bill_count,
    itemsSold: raw.items_sold,
    totalTax: raw.total_tax,
    avgBillValue: raw.avg_bill_value,
    grossSales: raw.gross_sales ?? raw.total_sales,
    salesReturns: raw.sales_returns ?? 0,
    returnCount: raw.return_count ?? 0,
    totalRefunded: raw.total_refunded ?? 0,
    cashCollected: raw.cash_collected ?? 0,
    schemeRedemption: raw.scheme_redemption ?? 0,
    refundsPaid: raw.refunds_paid ?? 0,
    totalPaid: raw.total_paid ?? 0,
    totalOutstanding: raw.total_outstanding ?? 0,
    paidCount: raw.paid_count ?? 0,
    partialCount: raw.partial_count ?? 0,
    pendingCount: raw.pending_count ?? 0,
    saleCount: raw.sale_count ?? 0,
  };
}

function mapDashboardSummary(raw: BackendBillingDashboardSummary): BillingDashboardSummary {
  return {
    today: mapPeriodSummary(raw.today),
    thisMonth: mapPeriodSummary(raw.this_month),
    todayGoldRate24k: raw.today_gold_rate_24k,
    selectedPeriod: mapPeriodSummary(raw.selected_period),
    selectedPeriodLabel: raw.selected_period_label,
    selectedDateFrom: raw.selected_date_from,
    selectedDateTo: raw.selected_date_to,
    recentSales: raw.recent_sales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoice_number,
      customerName: s.customer_name,
      productCode: s.product_code,
      productName: s.product_name,
      finalAmount: s.final_amount,
      profitOrLoss: s.profit_or_loss,
      saleTimestamp: s.sale_timestamp,
    })),
  };
}

export const billingService = {
  /* Vendors */
  async listVendors(search?: string): Promise<Vendor[]> {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const res = await apiClient.get<{ vendors: BackendVendor[] }>(`/billing/vendors${query}`, { auth: true });
    return res.data.vendors.map(mapVendor);
  },

  async createVendor(data: VendorFormData): Promise<Vendor> {
    const res = await apiClient.post<{ vendor: BackendVendor }>(
      '/billing/vendors',
      {
        name: data.name,
        contact_person: data.contactPerson || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        gst_number: data.gstNumber || null,
        ...toBackendDefaultFields(data),
      },
      { auth: true }
    );
    return mapVendor(res.data.vendor);
  },

  async updateVendor(vendorId: string, data: Partial<VendorFormData> & { isActive?: boolean }): Promise<Vendor> {
    const res = await apiClient.put<{ vendor: BackendVendor }>(
      `/billing/vendors/${vendorId}`,
      {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.contactPerson !== undefined ? { contact_person: data.contactPerson || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.address !== undefined ? { address: data.address || null } : {}),
        ...(data.gstNumber !== undefined ? { gst_number: data.gstNumber || null } : {}),
        ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
        ...toBackendDefaultFields(data),
      },
      { auth: true }
    );
    return mapVendor(res.data.vendor);
  },

  async setVendorActive(vendorId: string, isActive: boolean): Promise<Vendor> {
    return billingService.updateVendor(vendorId, { isActive });
  },

  /* Billing Defaults — Store / Category / Resolver */
  async getStoreDefaults(): Promise<StoreDefaults> {
    const res = await apiClient.get<BackendBillingDefaultFields>('/billing/defaults/store', { auth: true });
    return mapDefaultFields(res.data);
  },

  async updateStoreDefaults(data: Partial<BillingDefaultFields>): Promise<StoreDefaults> {
    const res = await apiClient.put<BackendBillingDefaultFields>(
      '/billing/defaults/store', toBackendDefaultFields(data), { auth: true }
    );
    return mapDefaultFields(res.data);
  },

  async listCategoryDefaults(): Promise<CategoryDefault[]> {
    const res = await apiClient.get<{ categories: BackendCategoryDefault[] }>('/billing/defaults/categories', { auth: true });
    return res.data.categories.map(mapCategoryDefault);
  },

  async upsertCategoryDefault(category: string, data: Partial<BillingDefaultFields>): Promise<CategoryDefault> {
    const res = await apiClient.put<BackendCategoryDefault>(
      '/billing/defaults/categories', { category, ...toBackendDefaultFields(data) }, { auth: true }
    );
    return mapCategoryDefault(res.data);
  },

  async resolveDefaults(vendorId?: string, category?: string): Promise<ResolvedDefaults> {
    const query = new URLSearchParams();
    if (vendorId) query.set('vendor_id', vendorId);
    if (category) query.set('category', category);
    const res = await apiClient.get<BackendResolvedDefaults>(`/billing/defaults/resolve?${query.toString()}`, { auth: true });
    return mapResolvedDefaults(res.data);
  },

  /* Live price preview for an unsaved bulk-entry row */
  async previewPrice(input: {
    purity: Purity;
    netGoldWeightGrams: number;
    makingChargeType: ChargeType;
    makingChargeValue: number;
    wastageType: ChargeType;
    wastageValue: number;
    goldProfitPercent: number;
    stoneChargeAmount?: number;
    otherChargesAmount?: number;
    taxRatePercent: number;
    purchaseCost?: number;
    customerPrice?: number;
  }): Promise<{ breakdown: PriceBreakdown; purchaseCost: number | null; profitOrLoss: number | null }> {
    const res = await apiClient.post<{ breakdown: BackendPriceBreakdown; purchase_cost: number | null; profit_or_loss: number | null }>(
      '/billing/inventory/preview-price',
      {
        purity: input.purity,
        net_gold_weight_grams: input.netGoldWeightGrams,
        making_charge_type: input.makingChargeType,
        making_charge_value: input.makingChargeValue,
        wastage_type: input.wastageType,
        wastage_value: input.wastageValue,
        gold_profit_percent: input.goldProfitPercent,
        stone_charge_amount: input.stoneChargeAmount ?? 0,
        other_charges_amount: input.otherChargesAmount ?? 0,
        tax_rate_percent: input.taxRatePercent,
        gst_applied: true,
        purchase_cost: input.purchaseCost ?? null,
        customer_price: input.customerPrice ?? null,
      },
      { auth: true }
    );
    return {
      breakdown: mapBreakdown(res.data.breakdown),
      purchaseCost: res.data.purchase_cost,
      profitOrLoss: res.data.profit_or_loss,
    };
  },

  /* Bulk Purchase */
  async bulkPurchase(data: BulkPurchaseData): Promise<InventoryItem[]> {
    const res = await apiClient.post<{ items: BackendInventoryItem[] }>(
      '/billing/inventory/bulk-purchase',
      {
        vendor_id: data.vendorId,
        purchase_date: data.purchaseDate,
        purchase_invoice_ref: data.purchaseInvoiceRef || null,
        items: data.items.map(toBackendLineItem),
      },
      { auth: true }
    );
    return res.data.items.map(mapInventoryItem);
  },

  /* Invoice export */
  async downloadInvoicePdf(saleId: string, invoiceNumber: string): Promise<void> {
    await downloadBlob(`/billing/sales/${saleId}/invoice.pdf`, `${invoiceNumber}.pdf`);
  },

  async downloadInvoiceExcel(saleId: string, invoiceNumber: string): Promise<void> {
    await downloadBlob(`/billing/sales/${saleId}/invoice.xlsx`, `${invoiceNumber}.xlsx`);
  },

  /* Sales History export — same raw-blob download path as the per-invoice
   * exports above, and respects exactly the filters the screen is showing. */
  async downloadSalesHistoryExcel(params: {
    period?: SalesHistoryPeriod;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    paymentStatus?: SalePaymentStatus;
    saleStatus?: SaleStatus;
  }): Promise<void> {
    const query = new URLSearchParams();
    if (params.dateFrom && params.dateTo) {
      query.set('date_from', params.dateFrom);
      query.set('date_to', params.dateTo);
    } else if (params.period) {
      query.set('period', params.period);
    }
    if (params.search) query.set('search', params.search);
    if (params.paymentStatus) query.set('payment_status', params.paymentStatus);
    if (params.saleStatus) query.set('sale_status', params.saleStatus);
    await downloadBlob(`/billing/sales/export.xlsx?${query.toString()}`, 'sales-history.xlsx');
  },

  /* CA / accounting export — accounting fields only. Same raw-blob path. */
  async downloadCaExport(params: { period?: SalesHistoryPeriod; dateFrom?: string; dateTo?: string }): Promise<void> {
    const query = new URLSearchParams();
    if (params.dateFrom && params.dateTo) {
      query.set('date_from', params.dateFrom);
      query.set('date_to', params.dateTo);
    } else if (params.period) {
      query.set('period', params.period);
    }
    await downloadBlob(`/billing/sales/ca-export.xlsx?${query.toString()}`, 'ca-export.xlsx');
  },

  /* Sale return / cancellation. The backend is the only authority on what may
   * be refunded and on the resulting statuses; this client never computes a
   * refund figure of its own. */
  async previewSaleReturn(saleId: string): Promise<SaleReturnPreview> {
    const res = await apiClient.get<{ preview: BackendSaleReturnPreview }>(
      BILLING_SALES + '/' + saleId + '/return/preview',
      { auth: true }
    );
    return mapReturnPreview(res.data.preview);
  },

  async getSaleReturn(saleId: string): Promise<SaleReturn | null> {
    const res = await apiClient.get<{ saleReturn: BackendSaleReturn | null }>(
      BILLING_SALES + '/' + saleId + '/return',
      { auth: true }
    );
    return res.data.saleReturn ? mapSaleReturn(res.data.saleReturn) : null;
  },

  /** The pending-inspection return for an inventory item, so the Inventory page
   *  can drive the same inspection action as Sales History. Null if none. */
  async getInventoryReturn(inventoryItemId: string): Promise<SaleReturn | null> {
    const res = await apiClient.get<{ saleReturn: BackendSaleReturn | null }>(
      `/billing/inventory/${inventoryItemId}/return`,
      { auth: true }
    );
    return res.data.saleReturn ? mapSaleReturn(res.data.saleReturn) : null;
  },

  async processSaleReturn(saleId: string, data: ProcessReturnData): Promise<SaleReturn> {
    const res = await apiClient.post<{ saleReturn: BackendSaleReturn }>(
      BILLING_SALES + '/' + saleId + '/return',
      {
        return_type: data.returnType,
        reason: data.reason,
        refund_amount: data.refundAmount ?? null,
        refund_method: data.refundMethod ?? null,
        refund_reference_no: data.refundReferenceNo || null,
        refund_date: data.refundDate ?? null,
      },
      { auth: true }
    );
    return mapSaleReturn(res.data.saleReturn);
  },

  /** The explicit second step: a returned item only becomes sellable when an
   *  Admin records RESALABLE. DAMAGED keeps it out of sellable stock. */
  async recordReturnInspection(
    saleId: string,
    outcome: InspectionOutcome,
    notes?: string
  ): Promise<SaleReturn> {
    const res = await apiClient.post<{ saleReturn: BackendSaleReturn }>(
      BILLING_SALES + '/' + saleId + '/return/inspection',
      { outcome, notes: notes || null },
      { auth: true }
    );
    return mapSaleReturn(res.data.saleReturn);
  },

  /* Payment ledger */
  async getPaymentHistory(saleId: string): Promise<SalePaymentHistory> {
    const res = await apiClient.get<{ paymentHistory: BackendSalePaymentHistory }>(
      `/billing/sales/${saleId}/payments`,
      { auth: true }
    );
    return mapPaymentHistory(res.data.paymentHistory);
  },

  async recordPayment(saleId: string, data: RecordPaymentData): Promise<SalePaymentHistory> {
    const res = await apiClient.post<{ paymentHistory: BackendSalePaymentHistory }>(
      `/billing/sales/${saleId}/payments`,
      {
        amount: data.amount,
        payment_date: data.paymentDate,
        payment_method: data.paymentMethod,
        reference_no: data.referenceNo || null,
        remarks: data.remarks || null,
      },
      { auth: true }
    );
    return mapPaymentHistory(res.data.paymentHistory);
  },

  /* Inventory */
  async listInventory(params: {
    page?: number;
    limit?: number;
    search?: string;
    stockStatus?: StockStatus;
    category?: string;
    vendorId?: string;
  } = {}): Promise<{ items: InventoryItem[]; total: number }> {
    const query = new URLSearchParams();
    query.set('page', String(params.page ?? 1));
    query.set('limit', String(params.limit ?? 50));
    if (params.search) query.set('search', params.search);
    if (params.stockStatus) query.set('stock_status', params.stockStatus);
    if (params.category) query.set('category', params.category);
    if (params.vendorId) query.set('vendor_id', params.vendorId);

    const res = await apiClient.get<{ items: BackendInventoryItem[]; total: number }>(
      `/billing/inventory?${query.toString()}`,
      { auth: true }
    );
    return { items: res.data.items.map(mapInventoryItem), total: res.data.total };
  },

  async getInventoryItem(itemId: string): Promise<InventoryItem> {
    const res = await apiClient.get<{ item: BackendInventoryItem }>(`/billing/inventory/${itemId}`, { auth: true });
    return mapInventoryItem(res.data.item);
  },

  async createInventoryItem(data: InventoryItemFormData): Promise<InventoryItem> {
    const res = await apiClient.post<{ item: BackendInventoryItem }>(
      '/billing/inventory',
      toBackendInventoryPayload(data),
      { auth: true }
    );
    return mapInventoryItem(res.data.item);
  },

  async updateInventoryItem(itemId: string, data: Partial<InventoryItemFormData>): Promise<InventoryItem> {
    const res = await apiClient.put<{ item: BackendInventoryItem }>(
      `/billing/inventory/${itemId}`,
      toBackendInventoryPayload(data),
      { auth: true }
    );
    return mapInventoryItem(res.data.item);
  },

  async setInventoryItemStatus(itemId: string, stockStatus: 'IN_STOCK' | 'INACTIVE'): Promise<InventoryItem> {
    const res = await apiClient.put<{ item: BackendInventoryItem }>(
      `/billing/inventory/${itemId}`,
      { stock_status: stockStatus },
      { auth: true }
    );
    return mapInventoryItem(res.data.item);
  },

  async uploadInventoryItemImage(itemId: string, file: File): Promise<InventoryItem> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<{ item: BackendInventoryItem }>(
      `/billing/inventory/${itemId}/image`,
      formData,
      { auth: true }
    );
    return mapInventoryItem(res.data.item);
  },

  /* Selling */
  async getSaleQuote(
    productCode: string,
    discountAmount = 0,
    gstApplied = true,
    customerPrice?: number,
    overrides: { makingChargeValue?: number; wastageValue?: number; goldProfitPercent?: number } = {},
    signal?: AbortSignal
  ): Promise<SaleQuote> {
    const query = new URLSearchParams({ discount_amount: String(discountAmount), gst_applied: String(gstApplied) });
    if (customerPrice !== undefined) query.set('customer_price', String(customerPrice));
    if (overrides.makingChargeValue !== undefined) query.set('making_charge_value', String(overrides.makingChargeValue));
    if (overrides.wastageValue !== undefined) query.set('wastage_value', String(overrides.wastageValue));
    if (overrides.goldProfitPercent !== undefined) query.set('gold_profit_percent', String(overrides.goldProfitPercent));
    const res = await apiClient.get<{
      inventory_item: BackendInventoryItem;
      breakdown: BackendPriceBreakdown;
      profit_or_loss: number | null;
      historical_profit_or_loss?: number | null;
      historical_profit_margin_percent?: number | null;
      current_gold_value_profit_or_loss?: number | null;
      current_gold_value_margin_percent?: number | null;
    }>(
      `/billing/sell/quote/${encodeURIComponent(productCode)}?${query.toString()}`,
      { auth: true, signal }
    );
    const d = res.data;
    return {
      inventoryItem: mapInventoryItem(d.inventory_item),
      breakdown: mapBreakdown(d.breakdown),
      profitOrLoss: d.profit_or_loss,
      historicalProfitOrLoss: d.historical_profit_or_loss ?? d.profit_or_loss,
      historicalProfitMarginPercent: d.historical_profit_margin_percent ?? null,
      currentGoldValueProfitOrLoss: d.current_gold_value_profit_or_loss ?? null,
      currentGoldValueMarginPercent: d.current_gold_value_margin_percent ?? null,
    };
  },

  async createSale(data: SaleCreateData): Promise<Sale> {
    const res = await apiClient.post<{ sale: BackendSale }>(
      '/billing/sell',
      {
        product_code: data.productCode,
        customer_id: data.customerId || null,
        customer_name: data.customerName || null,
        customer_phone: data.customerPhone || null,
        discount_amount: data.discountAmount ?? 0,
        customer_price: data.customerPrice ?? null,
        gst_applied: data.gstApplied ?? true,
        pricing_mode: data.pricingMode ?? null,
        payment_method: data.paymentMethod ?? 'CASH',
        payment_status: data.paymentStatus ?? 'PAID',
        initial_payment_amount: data.initialPaymentAmount ?? null,
        payment_reference_no: data.paymentReferenceNo ?? null,
        making_charge_value: data.makingChargeValue ?? null,
        wastage_value: data.wastageValue ?? null,
        gold_profit_percent: data.goldProfitPercent ?? null,
      },
      { auth: true }
    );
    return mapSale(res.data.sale);
  },

  /* Sales History */
  async listSales(params: {
    page?: number;
    limit?: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    paymentStatus?: SalePaymentStatus;
    saleStatus?: SaleStatus;
  } = {}): Promise<{ sales: Sale[]; total: number }> {
    const query = new URLSearchParams();
    query.set('page', String(params.page ?? 1));
    query.set('limit', String(params.limit ?? 50));
    if (params.search) query.set('search', params.search);
    if (params.dateFrom) query.set('date_from', params.dateFrom);
    if (params.dateTo) query.set('date_to', params.dateTo);
    if (params.paymentStatus) query.set('payment_status', params.paymentStatus);
    if (params.saleStatus) query.set('sale_status', params.saleStatus);

    const res = await apiClient.get<{ sales: BackendSale[]; total: number }>(
      `/billing/sales?${query.toString()}`,
      { auth: true }
    );
    return { sales: res.data.sales.map(mapSale), total: res.data.total };
  },

  async getSale(saleId: string): Promise<Sale> {
    const res = await apiClient.get<{ sale: BackendSale }>(`/billing/sales/${saleId}`, { auth: true });
    return mapSale(res.data.sale);
  },

  /* Dashboard */
  async getDashboardSummary(period?: BusinessHistoryPeriod): Promise<BillingDashboardSummary> {
    const query = period ? `?period=${period}` : '';
    const res = await apiClient.get<BackendBillingDashboardSummary>(`/billing/dashboard-summary${query}`, { auth: true });
    return mapDashboardSummary(res.data);
  },

  /** Real backend aggregation for the Business History block — either a named
   * period or an explicit custom date range (never filtered client-side). */
  async getBusinessSummary(params: {
    period?: BusinessSummaryPeriod;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<BusinessSummary> {
    const query = new URLSearchParams();
    if (params.dateFrom && params.dateTo) {
      query.set('date_from', params.dateFrom);
      query.set('date_to', params.dateTo);
    } else if (params.period) {
      query.set('period', params.period);
    }
    const res = await apiClient.get<BackendBusinessSummary>(`/billing/business-summary?${query.toString()}`, { auth: true });
    return mapBusinessSummary(res.data);
  },
};
