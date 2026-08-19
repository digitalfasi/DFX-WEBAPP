/**
 * Unfinished-bill draft for the Sell screen.
 *
 * A draft is NOT a sale. It exists only so an Admin who leaves the Sell screen
 * mid-bill does not lose the work: nothing here reaches the backend, so a draft
 * can never appear in Sales History, mark inventory SOLD, create a payment
 * ledger row, or move a dashboard/report figure. Only "Save Bill" creates the
 * real sale, and only a successful save (or an explicit discard) clears the
 * draft — a failed save deliberately keeps it.
 *
 * Storage is localStorage, keyed per tenant AND per user, because this is a
 * single-device counter workflow: two Admins on the same browser profile, or
 * the same Admin across two tenants, must never see each other's half-written
 * bill. No draft is written without both ids.
 *
 * Only the editable inputs are stored — never a computed money figure. Every
 * amount is recalculated by the backend on restore, so a stale draft can never
 * resurrect a stale price.
 */

const KEY_PREFIX = 'dfx.billDraft';

/** Schema version. A draft written by an older build is discarded rather than
 *  half-restored into a changed form. */
const DRAFT_VERSION = 1;

export interface BillDraft {
  version: number;
  /** Product code identifies the item; the item itself is re-read from the
   *  backend on restore so stock status and pricing are never stale. */
  productCode: string;
  customerPrice: string;
  gstApplied: boolean;
  makingValue: string;
  wastageValue: string;
  goldProfitPct: string;
  customerName: string;
  customerPhone: string;
  customerId: string;
  customerQuery: string;
  paymentMethod: string;
  paymentStatus: string;
  initialPayment: string;
  /** Per-enrollment scheme amounts the Admin entered (enrollmentId -> amount
   *  string). Balances/eligibility are always re-read from the backend on
   *  restore; only the Admin's chosen amounts come from the draft. Optional so
   *  a v1 draft written before this field still restores (defaults to {}). */
  schemeAmounts?: Record<string, string>;
  savedAt: string;
}

export type BillDraftInput = Omit<BillDraft, 'version' | 'savedAt'>;

function keyFor(tenantId?: string, userId?: string): string | null {
  if (!tenantId || !userId) return null;
  return `${KEY_PREFIX}.${tenantId}.${userId}`;
}

export function saveBillDraft(
  tenantId: string | undefined,
  userId: string | undefined,
  draft: BillDraftInput
): void {
  const key = keyFor(tenantId, userId);
  if (!key || typeof window === 'undefined') return;
  if (!draft.productCode) return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...draft, version: DRAFT_VERSION, savedAt: new Date().toISOString() })
    );
  } catch {
    /* Storage full or blocked — a lost draft is an inconvenience, never a
     * reason to break the billing screen. */
  }
}

export function loadBillDraft(
  tenantId: string | undefined,
  userId: string | undefined
): BillDraft | null {
  const key = keyFor(tenantId, userId);
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BillDraft;
    if (parsed?.version !== DRAFT_VERSION || !parsed.productCode) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearBillDraft(tenantId: string | undefined, userId: string | undefined): void {
  const key = keyFor(tenantId, userId);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
