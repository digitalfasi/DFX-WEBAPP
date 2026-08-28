import { apiClient } from '@/lib/apiClient';
import { User } from '@/types';

/** Shape of the `profile` object returned by the FastAPI backend. */
interface BackendProfile {
  id: string;
  tenant_id: string | null;
  tenant_name: string;
  name: string;
  email: string | null;
  phone: string | null;
  kyc_status: string;
  member_since: string | null;
  avatar_url: string | null;
}

export interface CustomerProfile {
  id: string;
  tenantId: string | null;
  tenantName: string;
  name: string;
  email: string;
  phone: string;
  kycStatus: User['kycStatus'];
  memberSince: string;
  avatarUrl: string | null;
}

export interface UpdateProfileData {
  name?: string;
  email?: string;
  phone?: string;
}

const KYC_STATUSES: User['kycStatus'][] = ['Verified', 'Pending', 'Rejected'];

function mapProfile(raw: BackendProfile): CustomerProfile {
  return {
    id: raw.id,
    tenantId: raw.tenant_id,
    tenantName: raw.tenant_name,
    name: raw.name,
    email: raw.email ?? '',
    phone: raw.phone ?? '',
    kycStatus: KYC_STATUSES.find((s) => s === raw.kyc_status) ?? 'Pending',
    memberSince: raw.member_since ?? '',
    avatarUrl: raw.avatar_url,
  };
}

/** Shape of the `profile` object returned by GET/PUT /admin/tenant/profile. */
interface BackendTenantProfile {
  id: string;
  name: string;
  slug: string;
  status: string;
  contact_email: string | null;
  contact_phone: string | null;
  gst_number: string | null;
  brand_color: string | null;
  logo_url: string | null;
}

export interface TenantProfile {
  id: string;
  name: string;
  slug: string;
  status: string;
  contactEmail: string;
  contactPhone: string;
  gstNumber: string;
  brandColor: string;
  logoUrl: string;
}

/** Only the fields Admin can actually edit — id/name/slug/status are read-only here. */
export interface UpdateTenantProfileData {
  contact_email?: string;
  contact_phone?: string;
  gst_number?: string;
  brand_color?: string;
  logo_url?: string;
}

function mapTenantProfile(raw: BackendTenantProfile): TenantProfile {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    status: raw.status,
    contactEmail: raw.contact_email ?? '',
    contactPhone: raw.contact_phone ?? '',
    gstNumber: raw.gst_number ?? '',
    brandColor: raw.brand_color ?? '',
    logoUrl: raw.logo_url ?? '',
  };
}

/** Shape of an item in the paginated GET /admin/customers list. */
interface BackendAdminCustomerListItem {
  id: string;
  customer_code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  kyc_status: string;
  member_since: string | null;
  date_of_birth: string | null;
  is_active: boolean;
  customer_type: string | null;
}

export interface AdminCustomerListItem {
  id: string;
  /** Human-readable tenant-scoped code, e.g. DFX-CUST-000001. Backend
   * generated and immutable; staff never type it in. */
  customerCode: string;
  name: string;
  email: string;
  phone: string;
  kycStatus: string;
  memberSince: string;
  /** YYYY-MM-DD or '' — used to preload the Edit form. */
  dateOfBirth: string;
  isActive: boolean;
  customerType: string;
}

function mapAdminCustomerListItem(raw: BackendAdminCustomerListItem): AdminCustomerListItem {
  return {
    id: raw.id,
    customerCode: raw.customer_code ?? '',
    name: raw.name,
    email: raw.email ?? '',
    phone: raw.phone ?? '',
    kycStatus: raw.kyc_status,
    memberSince: raw.member_since ?? '',
    dateOfBirth: raw.date_of_birth ?? '',
    isActive: raw.is_active,
    // NEW (no purchase, no enrollment) is the honest default, not WALK-IN —
    // matches the backend's derived classification.
    customerType: raw.customer_type ?? 'NEW',
  };
}

/* --- Customer 360 (Phase 1) -------------------------------------------------
 * Read-only composition served by GET /admin/customers/{id}/overview. Every
 * money figure below is produced by the backend authoritative services; this
 * layer maps names only and must never compute a balance or a total. */

interface BackendCustomerOverview {
  profile: {
    id: string;
    customer_code: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
    is_active: boolean;
    member_since: string | null;
    date_of_birth: string | null;
    created_at: string | null;
    customer_type: string;
  };
  kyc: {
    status: string;
    doc_type: string | null;
    record_status: string | null;
    verified_at: string | null;
    rejection_reason: string | null;
    document_count: number;
  };
  totals: {
    enrollment_count: number;
    scheme_total_paid: number;
    scheme_total_redeemed: number;
    scheme_available_balance: number;
    purchase_count: number;
    purchase_total: number;
    purchase_paid: number;
    purchase_outstanding: number;
    return_count: number;
    refund_total: number;
  };
  enrollments: Array<{
    id: string; enrollment_number: string; scheme_name: string; status: string;
    joined_date: string | null; maturity_date: string | null;
    total_paid: number; total_redeemed: number; available_balance: number; can_redeem: boolean;
  }>;
  contributions: Array<{
    id: string; enrollment_id: string; entry_number: number | null;
    entry_date: string | null; amount: number; description: string | null;
  }>;
  redemptions: Array<{
    id: string; enrollment_id: string; enrollment_number: string | null;
    invoice_number: string | null; amount: number; redeemed_at: string | null;
  }>;
  purchases: Array<{
    id: string; invoice_number: string; product_name: string; product_code: string | null;
    sale_timestamp: string | null; final_amount: number; amount_paid: number;
    amount_refunded: number; outstanding: number; payment_status: string; sale_status: string;
  }>;
  payments: Array<{
    id: string; sale_id: string; invoice_number: string | null; amount: number;
    payment_date: string | null; payment_method: string | null; source: string;
    reference_no: string | null;
  }>;
  returns: Array<{
    sale_id: string; invoice_number: string | null; reason: string | null;
    refund_amount: number; written_off_amount: number; scheme_restored: number;
    inspection_outcome: string | null; returned_at: string | null;
  }>;
}

export interface CustomerOverviewProfile {
  id: string; customerCode: string; name: string; email: string; phone: string;
  avatarUrl: string | null; isActive: boolean; memberSince: string;
  dateOfBirth: string | null;
  createdAt: string | null;
  /** WALK-IN | SCHEME CUSTOMER | HYBRID - derived by the backend from the
   * customer own enrollments and sales, never a stored column. */
  customerType: string;
}
export interface CustomerOverviewKyc {
  status: string; docType: string; recordStatus: string; verifiedAt: string | null;
  rejectionReason: string; documentCount: number;
}
export interface CustomerOverviewTotals {
  enrollmentCount: number; schemeTotalPaid: number; schemeTotalRedeemed: number;
  schemeAvailableBalance: number; purchaseCount: number; purchaseTotal: number;
  purchasePaid: number; purchaseOutstanding: number; returnCount: number; refundTotal: number;
}
export interface CustomerOverviewEnrollment {
  id: string; enrollmentNumber: string; schemeName: string; status: string;
  joinedDate: string; maturityDate: string; totalPaid: number; totalRedeemed: number;
  availableBalance: number; canRedeem: boolean;
}
export interface CustomerOverviewContribution {
  id: string; enrollmentId: string; entryNumber: number | null; entryDate: string;
  amount: number; description: string;
}
export interface CustomerOverviewRedemption {
  id: string; enrollmentId: string; enrollmentNumber: string; invoiceNumber: string;
  amount: number; redeemedAt: string;
}
export interface CustomerOverviewPurchase {
  id: string; invoiceNumber: string; productName: string; productCode: string;
  saleTimestamp: string; finalAmount: number; amountPaid: number; amountRefunded: number;
  outstanding: number; paymentStatus: string; saleStatus: string;
}
export interface CustomerOverviewPayment {
  id: string; saleId: string; invoiceNumber: string; amount: number; paymentDate: string;
  paymentMethod: string; source: string; referenceNo: string;
}
export interface CustomerOverviewReturn {
  saleId: string; invoiceNumber: string; reason: string; refundAmount: number;
  writtenOffAmount: number; schemeRestored: number; inspectionOutcome: string;
  returnedAt: string;
}
export interface CustomerOverview {
  profile: CustomerOverviewProfile;
  kyc: CustomerOverviewKyc;
  totals: CustomerOverviewTotals;
  enrollments: CustomerOverviewEnrollment[];
  contributions: CustomerOverviewContribution[];
  redemptions: CustomerOverviewRedemption[];
  purchases: CustomerOverviewPurchase[];
  payments: CustomerOverviewPayment[];
  returns: CustomerOverviewReturn[];
}

function mapCustomerOverview(raw: BackendCustomerOverview): CustomerOverview {
  return {
    profile: {
      id: raw.profile.id,
      customerCode: raw.profile.customer_code ?? '',
      name: raw.profile.name,
      email: raw.profile.email ?? '',
      phone: raw.profile.phone ?? '',
      avatarUrl: raw.profile.avatar_url,
      isActive: raw.profile.is_active,
      memberSince: raw.profile.member_since ?? '',
      dateOfBirth: raw.profile.date_of_birth,
      createdAt: raw.profile.created_at,
      customerType: raw.profile.customer_type,
    },
    kyc: {
      status: raw.kyc.status,
      docType: raw.kyc.doc_type ?? '',
      recordStatus: raw.kyc.record_status ?? '',
      verifiedAt: raw.kyc.verified_at,
      rejectionReason: raw.kyc.rejection_reason ?? '',
      documentCount: raw.kyc.document_count,
    },
    totals: {
      enrollmentCount: raw.totals.enrollment_count,
      schemeTotalPaid: raw.totals.scheme_total_paid,
      schemeTotalRedeemed: raw.totals.scheme_total_redeemed,
      schemeAvailableBalance: raw.totals.scheme_available_balance,
      purchaseCount: raw.totals.purchase_count,
      purchaseTotal: raw.totals.purchase_total,
      purchasePaid: raw.totals.purchase_paid,
      purchaseOutstanding: raw.totals.purchase_outstanding,
      returnCount: raw.totals.return_count,
      refundTotal: raw.totals.refund_total,
    },
    enrollments: raw.enrollments.map((e) => ({
      id: e.id,
      enrollmentNumber: e.enrollment_number,
      schemeName: e.scheme_name,
      status: e.status,
      joinedDate: e.joined_date ?? '',
      maturityDate: e.maturity_date ?? '',
      totalPaid: e.total_paid,
      totalRedeemed: e.total_redeemed,
      availableBalance: e.available_balance,
      canRedeem: e.can_redeem,
    })),
    contributions: raw.contributions.map((c) => ({
      id: c.id,
      enrollmentId: c.enrollment_id,
      entryNumber: c.entry_number,
      entryDate: c.entry_date ?? '',
      amount: c.amount,
      description: c.description ?? '',
    })),
    redemptions: raw.redemptions.map((r) => ({
      id: r.id,
      enrollmentId: r.enrollment_id,
      enrollmentNumber: r.enrollment_number ?? '',
      invoiceNumber: r.invoice_number ?? '',
      amount: r.amount,
      redeemedAt: r.redeemed_at ?? '',
    })),
    purchases: raw.purchases.map((p) => ({
      id: p.id,
      invoiceNumber: p.invoice_number,
      productName: p.product_name,
      productCode: p.product_code ?? '',
      saleTimestamp: p.sale_timestamp ?? '',
      finalAmount: p.final_amount,
      amountPaid: p.amount_paid,
      amountRefunded: p.amount_refunded,
      outstanding: p.outstanding,
      paymentStatus: p.payment_status,
      saleStatus: p.sale_status,
    })),
    payments: raw.payments.map((p) => ({
      id: p.id,
      saleId: p.sale_id,
      invoiceNumber: p.invoice_number ?? '',
      amount: p.amount,
      paymentDate: p.payment_date ?? '',
      paymentMethod: p.payment_method ?? '',
      source: p.source,
      referenceNo: p.reference_no ?? '',
    })),
    returns: raw.returns.map((r) => ({
      saleId: r.sale_id,
      invoiceNumber: r.invoice_number ?? '',
      reason: r.reason ?? '',
      refundAmount: r.refund_amount,
      writtenOffAmount: r.written_off_amount,
      schemeRestored: r.scheme_restored,
      inspectionOutcome: r.inspection_outcome ?? '',
      returnedAt: r.returned_at ?? '',
    })),
  };
}

interface BackendAdminCustomerDetail extends BackendAdminCustomerListItem {
  avatar_url: string | null;
  enrollment_count: number;
  total_invested: number;
}

export interface AdminCustomerDetail extends AdminCustomerListItem {
  avatarUrl: string | null;
  enrollmentCount: number;
  totalInvested: number;
}

function mapAdminCustomerDetail(raw: BackendAdminCustomerDetail): AdminCustomerDetail {
  return {
    ...mapAdminCustomerListItem(raw),
    avatarUrl: raw.avatar_url,
    enrollmentCount: raw.enrollment_count,
    totalInvested: raw.total_invested,
  };
}

/** Shape of the `customer` object returned by POST /admin/customers. */
interface BackendAdminCustomerCreateResult {
  id: string;
  customer_code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  enrollment_id: string | null;
  enrollment_number: string | null;
}

export interface AdminCustomerCreateResult {
  id: string;
  customerCode: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  enrollmentId: string | null;
  enrollmentNumber: string | null;
}

function mapAdminCustomerCreateResult(raw: BackendAdminCustomerCreateResult): AdminCustomerCreateResult {
  return {
    id: raw.id,
    customerCode: raw.customer_code ?? '',
    name: raw.name,
    email: raw.email ?? '',
    phone: raw.phone ?? '',
    isActive: raw.is_active,
    enrollmentId: raw.enrollment_id,
    enrollmentNumber: raw.enrollment_number,
  };
}

/** Admin manual customer creation — walk-in supported (phone/email both
 * optional). Mirrors AdminCustomerCreateRequest on the backend. */
export interface AdminCustomerCreateData {
  name: string;
  phone?: string;
  email?: string;
  password: string;
  schemeId?: string;
  /** YYYY-MM-DD. Required by the backend (AdminCustomerCreateRequest). */
  dateOfBirth: string;
}

/** Admin edit of an existing customer — all fields optional (partial update). */
export interface AdminCustomerUpdateData {
  name?: string;
  phone?: string;
  email?: string;
  password?: string;
  isActive?: boolean;
  /** YYYY-MM-DD. */
  dateOfBirth?: string;
}

export interface AdminCustomerPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

function mapAdminCustomerPagination(raw: { page: number; page_size: number; total_items: number; total_pages: number }): AdminCustomerPagination {
  return { page: raw.page, pageSize: raw.page_size, totalItems: raw.total_items, totalPages: raw.total_pages };
}

export type AddressType = 'Home' | 'Work' | 'Other';

/** Shape of an `address` object returned by the FastAPI backend. */
interface BackendAddress {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  house: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  type: string;
  is_default: boolean;
}

export interface Address {
  id: string;
  name: string;
  phone: string;
  house: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  type: AddressType;
  isDefault: boolean;
}

export interface AddressFormData {
  name: string;
  phone: string;
  house: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  type: AddressType;
  isDefault?: boolean;
}

const ADDRESS_TYPES: AddressType[] = ['Home', 'Work', 'Other'];

function mapAddress(raw: BackendAddress): Address {
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone,
    house: raw.house,
    street: raw.street,
    area: raw.area,
    city: raw.city,
    state: raw.state,
    pincode: raw.pincode,
    country: raw.country,
    type: ADDRESS_TYPES.find((t) => t === raw.type) ?? 'Home',
    isDefault: raw.is_default,
  };
}

function toBackendPayload(data: Partial<AddressFormData>) {
  return {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.phone !== undefined && { phone: data.phone }),
    ...(data.house !== undefined && { house: data.house }),
    ...(data.street !== undefined && { street: data.street }),
    ...(data.area !== undefined && { area: data.area }),
    ...(data.city !== undefined && { city: data.city }),
    ...(data.state !== undefined && { state: data.state }),
    ...(data.pincode !== undefined && { pincode: data.pincode }),
    ...(data.type !== undefined && { type: data.type }),
    ...(data.isDefault !== undefined && { is_default: data.isDefault }),
  };
}

export type KYCDocType = 'PAN' | 'Aadhaar' | 'Passport';
export type KYCStatus = 'Pending' | 'Verified' | 'Rejected';

/** Shape of the `kyc` object returned by the FastAPI backend. */
interface BackendKYC {
  id: string;
  user_id: string;
  doc_type: string;
  doc_number: string;
  status: string;
  verified_at: string | null;
  rejection_reason: string | null;
}

export interface KYCRecord {
  id: string;
  docType: string;
  docNumber: string;
  status: KYCStatus;
  verifiedAt: string | null;
  rejectionReason: string | null;
}

export interface KYCSubmitData {
  docType: KYCDocType;
  docNumber: string;
}

const KYC_RECORD_STATUSES: KYCStatus[] = ['Pending', 'Verified', 'Rejected'];

function mapKYC(raw: BackendKYC): KYCRecord {
  return {
    id: raw.id,
    docType: raw.doc_type,
    docNumber: raw.doc_number,
    status: KYC_RECORD_STATUSES.find((s) => s === raw.status) ?? 'Pending',
    verifiedAt: raw.verified_at,
    rejectionReason: raw.rejection_reason,
  };
}

/** Shape of an admin-facing `kyc_record` object returned by the FastAPI backend. */
interface BackendAdminKYC {
  id: string;
  tenant_id: string;
  user_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  doc_type: string;
  doc_number: string;
  status: string;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface AdminKYCRecord {
  id: string;
  tenantId: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  docType: string;
  docNumber: string;
  status: KYCStatus;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

function mapAdminKYC(raw: BackendAdminKYC): AdminKYCRecord {
  return {
    id: raw.id,
    tenantId: raw.tenant_id,
    userId: raw.user_id,
    customerName: raw.customer_name,
    customerEmail: raw.customer_email ?? '',
    customerPhone: raw.customer_phone ?? '',
    docType: raw.doc_type,
    docNumber: raw.doc_number,
    status: KYC_RECORD_STATUSES.find((s) => s === raw.status) ?? 'Pending',
    verifiedAt: raw.verified_at,
    rejectionReason: raw.rejection_reason,
    createdAt: raw.created_at,
  };
}

/** Shape of a `branch` object returned by the FastAPI backend. */
interface BackendBranch {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  /** Google Maps link built from lat/lng — backend provides no separate URL field. */
  mapsUrl: string;
}

function mapBranch(raw: BackendBranch): Branch {
  return {
    id: raw.id,
    name: raw.name,
    address: raw.address,
    phone: raw.phone,
    latitude: raw.latitude,
    longitude: raw.longitude,
    isActive: raw.is_active,
    mapsUrl: `https://www.google.com/maps?q=${raw.latitude},${raw.longitude}`,
  };
}

export const customerService = {
  /** GET /api/v1/customer/profile */
  async getProfile(): Promise<CustomerProfile> {
    const res = await apiClient.get<{ profile: BackendProfile }>('/customer/profile', { auth: true });
    return mapProfile(res.data.profile);
  },

  /** PUT /api/v1/customer/profile — only send fields the user actually changed. */
  async updateProfile(data: UpdateProfileData): Promise<CustomerProfile> {
    const res = await apiClient.put<{ profile: BackendProfile }>('/customer/profile', data, { auth: true });
    return mapProfile(res.data.profile);
  },

  /** GET /api/v1/admin/tenant/profile */
  async getTenantProfile(): Promise<TenantProfile> {
    const res = await apiClient.get<{ profile: BackendTenantProfile }>('/admin/tenant/profile', { auth: true });
    return mapTenantProfile(res.data.profile);
  },

  /** PUT /api/v1/admin/tenant/profile — only send fields the user actually changed. */
  async updateTenantProfile(data: UpdateTenantProfileData): Promise<TenantProfile> {
    const res = await apiClient.put<{ profile: BackendTenantProfile }>('/admin/tenant/profile', data, { auth: true });
    return mapTenantProfile(res.data.profile);
  },

  /** GET /api/v1/customer/addresses */
  async getAddresses(): Promise<Address[]> {
    const res = await apiClient.get<{ addresses: BackendAddress[] }>('/customer/addresses', { auth: true });
    return res.data.addresses.map(mapAddress);
  },

  /** POST /api/v1/customer/addresses */
  async addAddress(data: AddressFormData): Promise<Address> {
    const res = await apiClient.post<{ address: BackendAddress }>(
      '/customer/addresses',
      toBackendPayload(data),
      { auth: true }
    );
    return mapAddress(res.data.address);
  },

  /** PUT /api/v1/customer/addresses/{id} */
  async updateAddress(id: string, data: Partial<AddressFormData>): Promise<Address> {
    const res = await apiClient.put<{ address: BackendAddress }>(
      `/customer/addresses/${id}`,
      toBackendPayload(data),
      { auth: true }
    );
    return mapAddress(res.data.address);
  },

  /** DELETE /api/v1/customer/addresses/{id} */
  async deleteAddress(id: string): Promise<void> {
    await apiClient.delete(`/customer/addresses/${id}`, { auth: true });
  },

  /** PUT /api/v1/customer/addresses/{id}/default */
  async setDefaultAddress(id: string): Promise<Address> {
    const res = await apiClient.put<{ address: BackendAddress }>(
      `/customer/addresses/${id}/default`,
      undefined,
      { auth: true }
    );
    return mapAddress(res.data.address);
  },

  /** GET /api/v1/customer/kyc — returns null if nothing has been submitted yet. */
  async getKYC(): Promise<KYCRecord | null> {
    const res = await apiClient.get<{ kyc: BackendKYC | null }>('/customer/kyc', { auth: true });
    return res.data.kyc ? mapKYC(res.data.kyc) : null;
  },

  /** POST /api/v1/customer/kyc */
  async submitKYC(data: KYCSubmitData): Promise<KYCRecord> {
    const res = await apiClient.post<{ kyc: BackendKYC }>(
      '/customer/kyc',
      { doc_type: data.docType, doc_number: data.docNumber },
      { auth: true }
    );
    return mapKYC(res.data.kyc);
  },

  /** GET /api/v1/kyc (Admin) */
  async getAdminKYCRecords(): Promise<AdminKYCRecord[]> {
    const res = await apiClient.get<{ kyc_records: BackendAdminKYC[] }>('/kyc', { auth: true });
    return res.data.kyc_records.map(mapAdminKYC);
  },

  /** GET /api/v1/kyc/{id} (Admin) */
  async getAdminKYCRecordById(id: string): Promise<AdminKYCRecord> {
    const res = await apiClient.get<{ kyc_record: BackendAdminKYC }>(`/kyc/${id}`, { auth: true });
    return mapAdminKYC(res.data.kyc_record);
  },

  /** PUT /api/v1/kyc/{id}/approve (Admin) */
  async approveKYC(id: string): Promise<AdminKYCRecord> {
    const res = await apiClient.put<{ kyc_record: BackendAdminKYC }>(`/kyc/${id}/approve`, undefined, { auth: true });
    return mapAdminKYC(res.data.kyc_record);
  },

  /** PUT /api/v1/kyc/{id}/reject (Admin) */
  async rejectKYC(id: string, reason: string): Promise<AdminKYCRecord> {
    const res = await apiClient.put<{ kyc_record: BackendAdminKYC }>(
      `/kyc/${id}/reject`,
      { reason },
      { auth: true }
    );
    return mapAdminKYC(res.data.kyc_record);
  },

  /** GET /api/v1/customer/branches */
  async getBranches(): Promise<Branch[]> {
    const res = await apiClient.get<{ branches: BackendBranch[] }>('/customer/branches', { auth: true });
    return res.data.branches.map(mapBranch);
  },

  /** GET /api/v1/admin/customers */
  async getAdminCustomers(
    page: number,
    limit: number,
    search?: string,
    customerType?: string
  ): Promise<{ customers: AdminCustomerListItem[]; pagination: AdminCustomerPagination }> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    if (customerType) params.set('customer_type', customerType);
    const res = await apiClient.get<{ customers: BackendAdminCustomerListItem[] }>(
      `/admin/customers?${params.toString()}`,
      { auth: true }
    );
    return {
      customers: res.data.customers.map(mapAdminCustomerListItem),
      pagination: mapAdminCustomerPagination(res.meta.pagination),
    };
  },

  /** GET /api/v1/admin/customers/{id}/overview - Customer 360. */
  async getCustomerOverview(id: string): Promise<CustomerOverview> {
    const res = await apiClient.get<{ overview: BackendCustomerOverview }>(
      `/admin/customers/${id}/overview`,
      { auth: true }
    );
    return mapCustomerOverview(res.data.overview);
  },

  /** GET /api/v1/admin/customers/{id} */
  async getAdminCustomerDetail(id: string): Promise<AdminCustomerDetail> {
    const res = await apiClient.get<{ customer: BackendAdminCustomerDetail }>(`/admin/customers/${id}`, { auth: true });
    return mapAdminCustomerDetail(res.data.customer);
  },

  /** POST /api/v1/admin/customers — manual/walk-in create; scheme_id optional. */
  async createCustomerAdmin(data: AdminCustomerCreateData): Promise<AdminCustomerCreateResult> {
    const res = await apiClient.post<{ customer: BackendAdminCustomerCreateResult }>(
      '/admin/customers',
      {
        name: data.name,
        password: data.password,
        date_of_birth: data.dateOfBirth,
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.email ? { email: data.email } : {}),
        ...(data.schemeId ? { scheme_id: data.schemeId } : {}),
      },
      { auth: true }
    );
    return mapAdminCustomerCreateResult(res.data.customer);
  },

  /** PUT /api/v1/admin/customers/{id} — partial update; only send changed fields. */
  async updateCustomerAdmin(id: string, data: AdminCustomerUpdateData): Promise<AdminCustomerDetail> {
    const res = await apiClient.put<{ customer: BackendAdminCustomerDetail }>(
      `/admin/customers/${id}`,
      {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.password !== undefined && { password: data.password }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
        ...(data.dateOfBirth !== undefined && { date_of_birth: data.dateOfBirth }),
      },
      { auth: true }
    );
    return mapAdminCustomerDetail(res.data.customer);
  },

  /** POST /api/v1/admin/customers/{id}/enroll — enrol an EXISTING customer into a
   * scheme; no new customer is created (WALK-IN becomes HYBRID under one ID). */
  async enrollExistingCustomer(id: string, schemeId: string): Promise<AdminCustomerCreateResult> {
    const res = await apiClient.post<{ customer: BackendAdminCustomerCreateResult }>(
      `/admin/customers/${id}/enroll`,
      { scheme_id: schemeId },
      { auth: true }
    );
    return mapAdminCustomerCreateResult(res.data.customer);
  },

  /** GET /api/v1/admin/branches — includes inactive branches, unlike getBranches(). */
  async getAdminBranches(): Promise<Branch[]> {
    const res = await apiClient.get<{ branches: BackendBranch[] }>('/admin/branches', { auth: true });
    return res.data.branches.map(mapBranch);
  },

  /** POST /api/v1/admin/branches */
  async createBranch(data: { name: string; address: string; phone: string; latitude: number; longitude: number }): Promise<Branch> {
    const res = await apiClient.post<{ branch: BackendBranch }>('/admin/branches', data, { auth: true });
    return mapBranch(res.data.branch);
  },

  /** PUT /api/v1/admin/branches/{id} */
  async updateBranch(id: string, data: Partial<{ name: string; address: string; phone: string; latitude: number; longitude: number }>): Promise<Branch> {
    const res = await apiClient.put<{ branch: BackendBranch }>(`/admin/branches/${id}`, data, { auth: true });
    return mapBranch(res.data.branch);
  },

  /** PUT /api/v1/admin/branches/{id}/status */
  async setBranchStatus(id: string, isActive: boolean): Promise<Branch> {
    const res = await apiClient.put<{ branch: BackendBranch }>(`/admin/branches/${id}/status`, { is_active: isActive }, { auth: true });
    return mapBranch(res.data.branch);
  },
};
