import { apiClient } from '@/lib/apiClient';

/** One selectable tier plan inside a scheme, as returned by the backend.
 *  maturity_amount is derived server-side (monthly_amount x duration_months). */
interface BackendSchemeTier {
  id: string;
  scheme_id: string;
  monthly_amount: number;
  duration_months: number;
  bonus_percentage: number;
  is_active: boolean;
  // All derived server-side. maturity_amount == base_maturity_amount (bonus-free).
  base_maturity_amount: number;
  bonus_amount: number;
  final_maturity_amount: number;
  maturity_amount: number;
}

/** Shape of a `scheme` object returned by the FastAPI backend (Admin view). */
interface BackendScheme {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  monthly_amount: number;
  duration_months: number;
  bonus_description: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  tiers?: BackendSchemeTier[];
}

/** Shape of a `scheme` object returned to customers — active-only, no internal IDs. */
interface BackendCustomerScheme {
  id: string;
  name: string;
  description: string | null;
  monthly_amount: number;
  duration_months: number;
  bonus_description: string | null;
  tiers?: BackendSchemeTier[];
}

/** One selectable tier plan, mapped to camelCase. maturityAmount is derived by
 *  the backend (monthlyAmount x durationMonths) — never computed here. */
export interface SchemeTier {
  id: string;
  schemeId: string;
  monthlyAmount: number;
  durationMonths: number;
  /** Bonus as a percentage of base maturity (0 = none). */
  bonusPercentage: number;
  isActive: boolean;
  /** Derived server-side. baseMaturityAmount = monthly x duration (bonus-free). */
  baseMaturityAmount: number;
  bonusAmount: number;
  finalMaturityAmount: number;
  /** == baseMaturityAmount, kept for backward compatibility. */
  maturityAmount: number;
}

/** A tier as supplied on scheme create/update. Maturity is derived server-side,
 *  so only bonus_percentage is sent — never the money amounts of maturity. */
export interface SchemeTierInput {
  monthlyAmount: number;
  durationMonths: number;
  bonusPercentage?: number;
  isActive?: boolean;
}

export interface AdminScheme {
  id: string;
  name: string;
  description: string;
  monthlyAmount: number;
  durationMonths: number;
  bonusDescription: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  tiers: SchemeTier[];
}

export interface CustomerScheme {
  id: string;
  name: string;
  description: string;
  monthlyAmount: number;
  durationMonths: number;
  bonusDescription: string;
  tiers: SchemeTier[];
}

export interface SchemeFormData {
  name: string;
  description?: string;
  monthlyAmount: number;
  durationMonths: number;
  bonusDescription?: string;
  isActive?: boolean;
  tiers?: SchemeTierInput[];
}

function mapSchemeTier(raw: BackendSchemeTier): SchemeTier {
  return {
    id: raw.id,
    schemeId: raw.scheme_id,
    monthlyAmount: raw.monthly_amount,
    durationMonths: raw.duration_months,
    bonusPercentage: raw.bonus_percentage ?? 0,
    isActive: raw.is_active,
    baseMaturityAmount: raw.base_maturity_amount ?? raw.maturity_amount,
    bonusAmount: raw.bonus_amount ?? 0,
    finalMaturityAmount: raw.final_maturity_amount ?? raw.maturity_amount,
    maturityAmount: raw.maturity_amount,
  };
}

function mapAdminScheme(raw: BackendScheme): AdminScheme {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    monthlyAmount: raw.monthly_amount,
    durationMonths: raw.duration_months,
    bonusDescription: raw.bonus_description ?? '',
    isActive: raw.is_active,
    createdBy: raw.created_by,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    tiers: (raw.tiers ?? []).map(mapSchemeTier),
  };
}

function mapCustomerScheme(raw: BackendCustomerScheme): CustomerScheme {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    monthlyAmount: raw.monthly_amount,
    durationMonths: raw.duration_months,
    bonusDescription: raw.bonus_description ?? '',
    tiers: (raw.tiers ?? []).map(mapSchemeTier),
  };
}

function toBackendPayload(data: Partial<SchemeFormData>) {
  return {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.monthlyAmount !== undefined && { monthly_amount: data.monthlyAmount }),
    ...(data.durationMonths !== undefined && { duration_months: data.durationMonths }),
    ...(data.bonusDescription !== undefined && { bonus_description: data.bonusDescription }),
    ...(data.isActive !== undefined && { is_active: data.isActive }),
    ...(data.tiers !== undefined && {
      tiers: data.tiers.map((t) => ({
        monthly_amount: t.monthlyAmount,
        duration_months: t.durationMonths,
        bonus_percentage: t.bonusPercentage ?? 0,
        is_active: t.isActive ?? true,
      })),
    }),
  };
}

// ─── Phase 2 — Scheme Request lifecycle ───

export type SchemeRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED';

interface BackendSchemeRequest {
  id: string;
  customer_id: string;
  customer_name: string | null;
  customer_code: string | null;
  scheme_id: string;
  scheme_name: string | null;
  status: string;
  kyc_status_at_request: string | null;
  kyc_status_current: string | null;
  enrollment_id: string | null;
  enrollment_number: string | null;
  rejection_reason: string | null;
  requested_by: string | null;
  approved_by: string | null;
  rejected_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string | null;
}

export interface SchemeRequest {
  id: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  schemeId: string;
  schemeName: string;
  status: SchemeRequestStatus;
  kycStatusAtRequest: string;
  kycStatusCurrent: string;
  enrollmentId: string;
  enrollmentNumber: string;
  rejectionReason: string;
  approvedAt: string;
  rejectedAt: string;
  createdAt: string;
}

function mapSchemeRequest(raw: BackendSchemeRequest): SchemeRequest {
  return {
    id: raw.id,
    customerId: raw.customer_id,
    customerName: raw.customer_name ?? '',
    customerCode: raw.customer_code ?? '',
    schemeId: raw.scheme_id,
    schemeName: raw.scheme_name ?? '',
    status: (raw.status as SchemeRequestStatus),
    kycStatusAtRequest: raw.kyc_status_at_request ?? '',
    kycStatusCurrent: raw.kyc_status_current ?? '',
    enrollmentId: raw.enrollment_id ?? '',
    enrollmentNumber: raw.enrollment_number ?? '',
    rejectionReason: raw.rejection_reason ?? '',
    approvedAt: raw.approved_at ?? '',
    rejectedAt: raw.rejected_at ?? '',
    createdAt: raw.created_at ?? '',
  };
}

export const schemeService = {
  /** GET /api/v1/schemes (Admin) — all schemes, active + inactive. */
  async getAdminSchemes(): Promise<AdminScheme[]> {
    const res = await apiClient.get<{ schemes: BackendScheme[] }>('/schemes', { auth: true });
    return res.data.schemes.map(mapAdminScheme);
  },

  /** GET /api/v1/schemes/{id} (Admin) */
  async getSchemeById(id: string): Promise<AdminScheme> {
    const res = await apiClient.get<{ scheme: BackendScheme }>(`/schemes/${id}`, { auth: true });
    return mapAdminScheme(res.data.scheme);
  },

  /** POST /api/v1/schemes (Admin) */
  async createScheme(data: SchemeFormData): Promise<AdminScheme> {
    const res = await apiClient.post<{ scheme: BackendScheme }>('/schemes', toBackendPayload(data), { auth: true });
    return mapAdminScheme(res.data.scheme);
  },

  /** PUT /api/v1/schemes/{id} (Admin) — partial update, can also reactivate via isActive: true. */
  async updateScheme(id: string, data: Partial<SchemeFormData>): Promise<AdminScheme> {
    const res = await apiClient.put<{ scheme: BackendScheme }>(`/schemes/${id}`, toBackendPayload(data), { auth: true });
    return mapAdminScheme(res.data.scheme);
  },

  /** DELETE /api/v1/schemes/{id} (Admin) — soft delete (sets is_active=false, row is preserved). */
  async deactivateScheme(id: string): Promise<void> {
    await apiClient.delete(`/schemes/${id}`, { auth: true });
  },

  /** GET /api/v1/customer/schemes — active-only, read-only. */
  async getCustomerSchemes(): Promise<CustomerScheme[]> {
    const res = await apiClient.get<{ schemes: BackendCustomerScheme[] }>('/customer/schemes', { auth: true });
    return res.data.schemes.map(mapCustomerScheme);
  },

  // ─── Phase 2 — Scheme Request lifecycle ───

  /** POST /api/v1/scheme-requests (Customer) — file a request to join a scheme. */
  async createRequest(schemeId: string): Promise<SchemeRequest> {
    const res = await apiClient.post<{ request: BackendSchemeRequest }>(
      '/scheme-requests', { scheme_id: schemeId }, { auth: true },
    );
    return mapSchemeRequest(res.data.request);
  },

  /** GET /api/v1/customer/scheme-requests (Customer) — own request history. */
  async getMyRequests(): Promise<SchemeRequest[]> {
    const res = await apiClient.get<{ requests: BackendSchemeRequest[] }>(
      '/customer/scheme-requests', { auth: true },
    );
    return res.data.requests.map(mapSchemeRequest);
  },

  /** GET /api/v1/scheme-requests (Admin/Staff) — tenant queue, optional status filter. */
  async getAdminRequests(status?: SchemeRequestStatus): Promise<SchemeRequest[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await apiClient.get<{ requests: BackendSchemeRequest[] }>(
      `/scheme-requests${query}`, { auth: true },
    );
    return res.data.requests.map(mapSchemeRequest);
  },

  /** POST /api/v1/scheme-requests/{id}/approve (Admin/Staff) — creates enrollment atomically.
   *  schemeTierId selects the ACTIVE tier whose terms are snapshotted into the
   *  enrollment. Required by the backend when the scheme offers active tiers;
   *  omit only for a legacy scheme with none. */
  async approveRequest(id: string, schemeTierId?: string): Promise<SchemeRequest> {
    const res = await apiClient.post<{ request: BackendSchemeRequest }>(
      `/scheme-requests/${id}/approve`,
      { scheme_tier_id: schemeTierId ?? null },
      { auth: true },
    );
    return mapSchemeRequest(res.data.request);
  },

  /** POST /api/v1/scheme-requests/{id}/reject (Admin/Staff) — reason mandatory. */
  async rejectRequest(id: string, reason: string): Promise<SchemeRequest> {
    const res = await apiClient.post<{ request: BackendSchemeRequest }>(
      `/scheme-requests/${id}/reject`, { reason }, { auth: true },
    );
    return mapSchemeRequest(res.data.request);
  },
};
