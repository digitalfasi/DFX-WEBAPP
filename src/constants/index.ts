import { TenantBranding, GoldRate, SilverRate } from '@/types';

/**
 * Fallback branding shown until a tenant's own white-label branding is
 * available (there is no branding data on the Tenant model in the backend
 * yet — see SESSION_HANDOFF.md §14/§19 — so this is always what renders
 * today). Deliberately neutral platform branding, not a fabricated business
 * identity, since it's shown to every real admin regardless of their actual
 * tenant.
 */
export const DEFAULT_BRANDING: TenantBranding = {
  brandName: 'DFX Solution',
  brandColor: '#60A3E6',
  fontFamily: 'Golos Text / Inter',
  logoText: 'DF',
  tagline: 'Powered by DFX Solution',
};

export const INITIAL_GOLD_RATE: GoldRate = {
  price24k: 9820,
  price22k: 9003,
  price18k: 7365,
  change24h: 1.25,
  up: true,
  history: [38, 44, 40, 55, 49, 62, 58],
};

export const INITIAL_SILVER_RATE: SilverRate = {
  price999: 118,
  price925: 109,
  change24h: -0.4,
  up: false,
  history: [50, 46, 52, 44, 48, 42, 40],
};

export const CUSTOMER_NAV_ITEMS = [
  { key: 'home', icon: 'Home', label: 'Home', path: '/customer' },
  { key: 'schemes', icon: 'Diamond', label: 'Schemes', path: '/customer/schemes', badge: true },
  { key: 'passbook', icon: 'BookOpen', label: 'Passbook', path: '/customer/enrollments' },
  { key: 'catalogue', icon: 'ShoppingBag', label: 'Catalogue', path: '/customer/catalogue' },
  { key: 'profile', icon: 'User', label: 'Profile', path: '/customer/profile' },
];

// `staffModule` maps a nav item to the granular Staff permission that gates
// it (see staffService.ts's STAFF_MODULES / backend's ALL_STAFF_MODULES).
// Admin/SuperAdmin always see and can reach every item regardless. Items
// with no staffModule (Dashboard, Staff Users, Settings) are
// never shown to Staff, matching the backend's require_admin_only there.
export const ADMIN_NAV_ITEMS = [
  { key: 'dashboard', icon: 'LayoutDashboard', label: 'Dashboard', path: '/admin', ready: true, staffModule: null, group: null },
  { key: 'gold-rate', icon: 'Gem', label: 'Gold Rate', path: '/admin/gold-rate', ready: true, staffModule: 'gold_rate', group: null },
  { key: 'customers', icon: 'Users', label: 'Customers', path: '/admin/customers', ready: true, staffModule: 'customers', group: null },
  { key: 'kyc', icon: 'ShieldCheck', label: 'KYC Review', path: '/admin/kyc', ready: true, staffModule: 'kyc', group: null },
  // Scheme System — Schemes + Enrollments + Collections share group: 'Scheme'
  // (consecutive same-group items) so AdminSidebar renders them under one
  // collapsible "Scheme" section. Payments stays a separate top-level item, NOT
  // nested under Scheme. Each keeps its own real route so StaffAccessGuard's
  // path-prefix match is unaffected. Scheme Requests removed per requirements
  // (its route/page remain in the codebase, only the sidebar link is dropped).
  { key: 'schemes', icon: 'Coins', label: 'Schemes', path: '/admin/schemes', ready: true, staffModule: 'schemes', group: 'Scheme' },
  { key: 'enrollments', icon: 'UserPlus', label: 'Enrollments', path: '/admin/enrollments', ready: true, staffModule: 'enrollments', group: 'Scheme' },
  { key: 'collections', icon: 'AlarmClock', label: 'Collections', path: '/admin/collections', ready: true, staffModule: 'reports', group: 'Scheme' },
  { key: 'payments', icon: 'CreditCard', label: 'Payments', path: '/admin/payments', ready: true, staffModule: 'payments', group: null },
  // Billing System — Inventory (Product Master) + Selling + Sales History.
  // Three flat entries sharing group: 'Billing' so AdminSidebar renders them
  // under one collapsible section; StaffAccessGuard's longest-path-prefix
  // match works unchanged since each has its own real, distinct route.
  { key: 'billing-inventory', icon: 'Boxes', label: 'Inventory', path: '/admin/billing/inventory', ready: true, staffModule: 'billing', group: 'Billing' },
  { key: 'billing-sell', icon: 'Calculator', label: 'New Sale', path: '/admin/billing/sell', ready: true, staffModule: 'billing', group: 'Billing' },
  { key: 'billing-history', icon: 'Receipt', label: 'Sales History', path: '/admin/billing/history', ready: true, staffModule: 'billing', group: 'Billing' },
  { key: 'catalogue', icon: 'Tag', label: 'Catalogue Studio', path: '/admin/catalogue', ready: true, staffModule: 'catalogue', group: null },
  { key: 'marketing', icon: 'Megaphone', label: 'Marketing', path: '/admin/marketing', ready: true, staffModule: 'marketing', group: null },
  { key: 'reports', icon: 'TrendingUp', label: 'Reports & Analytics', path: '/admin/reports', ready: true, staffModule: 'reports', group: null },
  { key: 'branches', icon: 'Store', label: 'Branches', path: '/admin/branches', ready: true, staffModule: 'branches', group: null },
  { key: 'users', icon: 'UserCheck', label: 'Staff Users', path: '/admin/users', ready: true, staffModule: null, group: null },
  { key: 'support', icon: 'LifeBuoy', label: 'Support', path: '/admin/support', ready: true, staffModule: 'support', group: null },
  { key: 'notifications', icon: 'Bell', label: 'Notifications', path: '/admin/notifications', ready: true, staffModule: 'notifications', group: null },
  { key: 'settings', icon: 'Settings', label: 'Settings', path: '/admin/settings', ready: true, staffModule: null, group: null },
] as const;

export const SUPER_ADMIN_NAV_ITEMS = [
  { key: 'dashboard', icon: 'LayoutDashboard', label: 'Dashboard', path: '/superadmin', ready: true },
  { key: 'tenants', icon: 'Building2', label: 'Tenants', path: '/superadmin/tenants', ready: true },
  { key: 'branding', icon: 'Palette', label: 'Branding', path: '/superadmin/branding', ready: true },
  { key: 'audit', icon: 'ShieldCheck', label: 'Audit Logs', path: '/superadmin/audit', ready: true },
  { key: 'integrations', icon: 'Plug', label: 'Integrations', path: '/superadmin/integrations', ready: true },
  { key: 'settings', icon: 'Settings', label: 'Platform Settings', path: '/superadmin/settings', ready: true },
];
