import { apiClient } from '@/lib/apiClient';

/** Shape of an `enrollment` object returned to admins — includes derived names. */
interface BackendAdminEnrollment {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  scheme_id: string;
  scheme_name: string;
  enrollment_number: string;
  joined_date: string;
  status: string;
  maturity_date: string;
  months_paid: number;
  next_due_date: string | null;
  remarks: string | null;
  // Frozen financial terms (monthly x duration = base maturity, no bonus).
  monthly_amount: number;
  duration_months: number;
  maturity_amount: number;
  created_at: string;
  updated_at: string;
}

/** Shape of an `enrollment` object returned to the enrolled customer — lean. */
interface BackendCustomerEnrollment {
  id: string;
  scheme_id: string;
  scheme_name: string;
  enrollment_number: string;
  joined_date: string;
  status: string;
  maturity_date: string;
  months_paid: number;
  next_due_date: string | null;
}

/* COMPLETED keeps its existing maturity meaning. CLOSED means the customer
 * stopped contributing but the balance already paid in is still redeemable;
 * REDEEMED means that balance has been fully consumed by purchases. */
export type EnrollmentStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'CLOSED'
  | 'REDEEMED';

export interface AdminEnrollment {
  id: string;
  customerId: string;
  customerName: string;
  schemeId: string;
  schemeName: string;
  enrollmentNumber: string;
  joinedDate: string;
  status: EnrollmentStatus;
  maturityDate: string;
  monthsPaid: number;
  nextDueDate: string | null;
  remarks: string;
  monthlyAmount: number;
  durationMonths: number;
  maturityAmount: number;
}

export interface CustomerEnrollment {
  id: string;
  schemeId: string;
  schemeName: string;
  enrollmentNumber: string;
  joinedDate: string;
  status: EnrollmentStatus;
  maturityDate: string;
  monthsPaid: number;
  nextDueDate: string | null;
}

function mapAdminEnrollment(raw: BackendAdminEnrollment): AdminEnrollment {
  return {
    id: raw.id,
    customerId: raw.customer_id,
    customerName: raw.customer_name,
    schemeId: raw.scheme_id,
    schemeName: raw.scheme_name,
    enrollmentNumber: raw.enrollment_number,
    joinedDate: raw.joined_date,
    status: raw.status as EnrollmentStatus,
    maturityDate: raw.maturity_date,
    monthsPaid: raw.months_paid ?? 0,
    nextDueDate: raw.next_due_date,
    remarks: raw.remarks ?? '',
    monthlyAmount: raw.monthly_amount ?? 0,
    durationMonths: raw.duration_months ?? 0,
    maturityAmount: raw.maturity_amount ?? 0,
  };
}

function mapCustomerEnrollment(raw: BackendCustomerEnrollment): CustomerEnrollment {
  return {
    id: raw.id,
    schemeId: raw.scheme_id,
    schemeName: raw.scheme_name,
    enrollmentNumber: raw.enrollment_number,
    joinedDate: raw.joined_date,
    status: raw.status as EnrollmentStatus,
    maturityDate: raw.maturity_date,
    monthsPaid: raw.months_paid ?? 0,
    nextDueDate: raw.next_due_date,
  };
}

export const enrollmentService = {
  /** GET /api/v1/enrollments (Admin, read-only) */
  async getAdminEnrollments(): Promise<AdminEnrollment[]> {
    const res = await apiClient.get<{ enrollments: BackendAdminEnrollment[] }>('/enrollments', { auth: true });
    return res.data.enrollments.map(mapAdminEnrollment);
  },

  /** PATCH /api/v1/enrollments/{id}/remarks (Admin/Staff) — metadata only. */
  async updateRemarks(enrollmentId: string, remarks: string | null): Promise<AdminEnrollment> {
    const res = await apiClient.patch<{ enrollment: BackendAdminEnrollment }>(
      `/enrollments/${enrollmentId}/remarks`,
      { remarks },
      { auth: true }
    );
    return mapAdminEnrollment(res.data.enrollment);
  },

  /** POST /api/v1/customer/enrollments — enroll in an active scheme. */
  async enroll(schemeId: string): Promise<CustomerEnrollment> {
    const res = await apiClient.post<{ enrollment: BackendCustomerEnrollment }>(
      '/customer/enrollments',
      { scheme_id: schemeId },
      { auth: true }
    );
    return mapCustomerEnrollment(res.data.enrollment);
  },

  /** GET /api/v1/customer/enrollments — the caller's own enrollments. */
  async getMyEnrollments(): Promise<CustomerEnrollment[]> {
    const res = await apiClient.get<{ enrollments: BackendCustomerEnrollment[] }>('/customer/enrollments', { auth: true });
    return res.data.enrollments.map(mapCustomerEnrollment);
  },

  /* Scheme credit. Every figure comes from the backend, which derives it from
   * the contribution and redemption ledgers — this client never computes a
   * balance of its own. */
  async getEnrollmentBalance(enrollmentId: string): Promise<EnrollmentBalance> {
    const res = await apiClient.get<{ balance: BackendEnrollmentBalance }>(
      `/enrollments/${enrollmentId}/balance`,
      { auth: true }
    );
    return mapBalance(res.data.balance);
  },

  /** Stops future contributions. Never refunds or forfeits the balance. */
  async closeEnrollment(enrollmentId: string, reason: string): Promise<EnrollmentBalance> {
    const res = await apiClient.post<{ balance: BackendEnrollmentBalance }>(
      `/enrollments/${enrollmentId}/close`,
      { reason },
      { auth: true }
    );
    return mapBalance(res.data.balance);
  },

  /** Settles one invoice from SEVERAL scheme balances in a single backend
   *  transaction. Never chain redeemScheme calls for a multi-scheme bill: this
   *  endpoint validates every enrollment first and rolls the whole settlement
   *  back if any one of them fails. */
  async redeemSchemes(
    saleId: string,
    items: { enrollmentId: string; amount: number }[],
    otpCode: string
  ): Promise<MultiSchemeSettlement> {
    const res = await apiClient.post<{ settlement: BackendMultiSchemeSettlement }>(
      `/billing/sales/${saleId}/redeem-schemes`,
      {
        items: items.map((i) => ({ enrollment_id: i.enrollmentId, amount: i.amount })),
        otp_code: otpCode,
      },
      { auth: true }
    );
    const d = res.data.settlement;
    return {
      saleId: d.sale_id,
      invoiceNumber: d.invoice_number,
      totalRedeemed: d.total_redeemed,
      saleFinalAmount: d.sale_final_amount,
      saleAmountPaid: d.sale_amount_paid,
      saleOutstanding: d.sale_outstanding,
      salePaymentStatus: d.sale_payment_status,
      balances: d.balances.map(mapBalance),
    };
  },

  /** Phase 5: sends a one-time verification code to the customer's app for a
   *  sensitive scheme redemption. The code must be passed back to redeemSchemes
   *  as otpCode. Returns metadata only — never the code. */
  async requestRedemptionOtp(
    saleId: string
  ): Promise<{ challengeId: string; expiresAt: string }> {
    const res = await apiClient.post<{ otp: { challenge_id: string; expires_at: string } }>(
      `/billing/sales/${saleId}/redeem-schemes/request-otp`,
      {},
      { auth: true }
    );
    return { challengeId: res.data.otp.challenge_id, expiresAt: res.data.otp.expires_at };
  },

  /** Applies scheme credit to an existing invoice. The backend validates the
   *  amount against both the available balance and the invoice's outstanding. */
  async redeemScheme(
    enrollmentId: string,
    saleId: string,
    amount: number
  ): Promise<EnrollmentBalance> {
    const res = await apiClient.post<{ balance: BackendEnrollmentBalance }>(
      `/enrollments/${enrollmentId}/redeem`,
      { sale_id: saleId, amount },
      { auth: true }
    );
    return mapBalance(res.data.balance);
  },
};

/* ------------------------------------------------------------------ */
/* Scheme balance, closure and redemption                              */
/* ------------------------------------------------------------------ */

interface BackendSchemeRedemption {
  id: string;
  enrollment_id: string;
  customer_id: string;
  sale_id: string;
  invoice_number: string;
  amount: number;
  redeemed_at: string;
  recorded_by: string;
  recorded_by_name: string | null;
}

interface BackendEnrollmentBalance {
  enrollment_id: string;
  enrollment_number: string;
  customer_id: string;
  customer_name: string;
  scheme_name: string;
  monthly_amount: number;
  duration_months: number;
  successful_payment_count: number;
  total_paid: number;
  total_redeemed: number;
  available_balance: number;
  status: string;
  joined_date: string;
  maturity_date: string;
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  closure_reason: string | null;
  can_contribute: boolean;
  can_redeem: boolean;
  redemptions: BackendSchemeRedemption[];
}

export interface SchemeRedemption {
  id: string;
  enrollmentId: string;
  customerId: string;
  saleId: string;
  invoiceNumber: string;
  amount: number;
  redeemedAt: string;
  recordedBy: string;
  recordedByName: string | null;
}

interface BackendMultiSchemeSettlement {
  sale_id: string;
  invoice_number: string;
  total_redeemed: number;
  sale_final_amount: number;
  sale_amount_paid: number;
  sale_outstanding: number;
  sale_payment_status: string;
  balances: BackendEnrollmentBalance[];
}

/** Post-settlement position after a multi-scheme redemption. */
export interface MultiSchemeSettlement {
  saleId: string;
  invoiceNumber: string;
  totalRedeemed: number;
  saleFinalAmount: number;
  saleAmountPaid: number;
  saleOutstanding: number;
  salePaymentStatus: string;
  balances: EnrollmentBalance[];
}

export interface EnrollmentBalance {
  enrollmentId: string;
  enrollmentNumber: string;
  customerId: string;
  customerName: string;
  schemeName: string;
  monthlyAmount: number;
  durationMonths: number;
  successfulPaymentCount: number;
  totalPaid: number;
  totalRedeemed: number;
  availableBalance: number;
  status: EnrollmentStatus;
  joinedDate: string;
  maturityDate: string;
  closedAt: string | null;
  closedBy: string | null;
  closedByName: string | null;
  closureReason: string | null;
  canContribute: boolean;
  canRedeem: boolean;
  redemptions: SchemeRedemption[];
}

function mapBalance(raw: BackendEnrollmentBalance): EnrollmentBalance {
  return {
    enrollmentId: raw.enrollment_id,
    enrollmentNumber: raw.enrollment_number,
    customerId: raw.customer_id,
    customerName: raw.customer_name,
    schemeName: raw.scheme_name,
    monthlyAmount: raw.monthly_amount,
    durationMonths: raw.duration_months,
    successfulPaymentCount: raw.successful_payment_count,
    totalPaid: raw.total_paid,
    totalRedeemed: raw.total_redeemed,
    availableBalance: raw.available_balance,
    status: raw.status as EnrollmentStatus,
    joinedDate: raw.joined_date,
    maturityDate: raw.maturity_date,
    closedAt: raw.closed_at,
    closedBy: raw.closed_by,
    closedByName: raw.closed_by_name,
    closureReason: raw.closure_reason,
    canContribute: raw.can_contribute,
    canRedeem: raw.can_redeem,
    redemptions: raw.redemptions.map((r) => ({
      id: r.id,
      enrollmentId: r.enrollment_id,
      customerId: r.customer_id,
      saleId: r.sale_id,
      invoiceNumber: r.invoice_number,
      amount: r.amount,
      redeemedAt: r.redeemed_at,
      recordedBy: r.recorded_by,
      recordedByName: r.recorded_by_name,
    })),
  };
}
