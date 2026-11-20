// Brand Bucket Command Center — access checks. Page-level roles live in roles.ts and access-catalog.ts.
import { PAGES, isPageKey, isSensitiveKey, pageDefinition, pageForPath, type PageKey, type SensitiveKey } from './access-catalog';

export type FeatureKey =
  | 'beat_plans'
  | 'stores'
  | 'distributors'
  | 'dispatches'
  | 'gps_tracking'
  | 'shelf_photos'
  | 'stock_counts'
  | 'call_tracker'
  | 'cheque_tracker'
  | 'document_handover'
  | 'staff_scorecards'
  | 'dashboard'
  | 'settings'
  | 'orderflow'
  | 'order_desk'
  | 'reviews'
  | 'customers'
  | 'marketing'
  | 'products'
  | 'tasks'
  | 'activity'
  | 'export';

export type FeatureAccess = 'HIDDEN' | 'VIEW_ONLY' | 'VIEW_EDIT' | 'FULL';
export type DataScope = 'OWN' | 'TEAM' | 'ALL';
export type ActionPermission = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE';

export interface FeaturePermission {
  access: FeatureAccess;
  scope: DataScope | null;
  actions: ActionPermission[];
}

export type UserCustomPermissions = Record<string, FeaturePermission>;

export const ALL_FEATURE_KEYS: FeatureKey[] = [
  'beat_plans',
  'stores',
  'distributors',
  'dispatches',
  'gps_tracking',
  'shelf_photos',
  'stock_counts',
  'call_tracker',
  'cheque_tracker',
  'document_handover',
  'staff_scorecards',
  'dashboard',
  'settings',
  'orderflow',
  'order_desk',
  'reviews',
  'customers',
  'marketing',
  'products',
  'tasks',
  'activity',
  'export',
];

export const FEATURE_METADATA: Record<FeatureKey, { label: string; group: 'OFFLINE_SALES' | 'PLATFORM'; description: string }> = {
  beat_plans: { label: 'Beat Plans & Routes', group: 'OFFLINE_SALES', description: 'Store visit scheduling, daily checklist, route sequencing' },
  stores: { label: 'Stores & Branches', group: 'OFFLINE_SALES', description: 'Retailers, chain branches, contacts, commercial terms' },
  distributors: { label: 'Distributors & Chains', group: 'OFFLINE_SALES', description: 'Primary distribution accounts and retail chain headquarters' },
  dispatches: { label: 'Warehouse Dispatches', group: 'OFFLINE_SALES', description: 'Dispatch orders, challan documentation, payment terms' },
  gps_tracking: { label: 'Live GPS Tracking', group: 'OFFLINE_SALES', description: 'Real-time field officer geolocations, arrival map' },
  shelf_photos: { label: 'Shelf Photos', group: 'OFFLINE_SALES', description: 'Before and after visual merchandising evidence' },
  stock_counts: { label: 'Stock counts', group: 'OFFLINE_SALES', description: 'Shelf stock counts at stores and what is running low' },
  call_tracker: { label: 'Call Tracker', group: 'OFFLINE_SALES', description: 'Field and office call logs with outcome categorization' },
  cheque_tracker: { label: 'Cheque Tracker', group: 'OFFLINE_SALES', description: 'Cheque leaf collection, custody handover, banking clearance' },
  document_handover: { label: 'Document Handover', group: 'OFFLINE_SALES', description: 'VAT bills, challans, signed purchase orders' },
  staff_scorecards: { label: 'Staff Scorecards', group: 'OFFLINE_SALES', description: 'Daily compliance and field performance scorecards' },
  dashboard: { label: 'Dashboard', group: 'PLATFORM', description: 'Executive operational KPIs and multi-brand metrics' },
  settings: { label: 'System Settings', group: 'PLATFORM', description: 'Staff onboarding, permissions, holiday calendar, categories' },
  orderflow: { label: 'OrderFlow (Online)', group: 'PLATFORM', description: 'WhatsApp Extractor, manual entry, daily orders, delivery failures' },
  order_desk: { label: 'Order Desk (All Orders)', group: 'PLATFORM', description: 'Search every order, update delivery status, log failures, returns and exchanges. No sales metrics' },
  reviews: { label: 'Reviews & Feedback', group: 'PLATFORM', description: 'Customer complaints, separated returns, dynamic categories' },
  customers: { label: 'Customer Intelligence', group: 'PLATFORM', description: 'Customer 360 directory, Karma score, cohort insights' },
  marketing: { label: 'Marketing & Influencers', group: 'PLATFORM', description: 'Influencer directory, seeding sends, collaboration metrics' },
  products: { label: 'Products & Combos', group: 'PLATFORM', description: 'Catalog SKUs, prices, margins, combo configurations' },
  tasks: { label: 'Tasks & Calendar To-Do', group: 'PLATFORM', description: 'Calendar to-do list, operational follow-ups' },
  activity: { label: 'Activity Trail', group: 'PLATFORM', description: 'System audit logs, field submissions' },
  export: { label: 'Google Sheets Export', group: 'PLATFORM', description: 'Live operational sheet synchronization and CSV exports' },
};

// Pre-defined Templates for creation form in Settings
export const FIELD_SALES_OFFICER_TEMPLATE: UserCustomPermissions = {
  beat_plans: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] },
  stores: { access: 'VIEW_EDIT', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] },
  distributors: { access: 'HIDDEN', scope: null, actions: [] },
  dispatches: { access: 'HIDDEN', scope: null, actions: [] },
  gps_tracking: { access: 'HIDDEN', scope: null, actions: [] },
  shelf_photos: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE'] },
  call_tracker: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] },
  cheque_tracker: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] },
  document_handover: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE'] },
  staff_scorecards: { access: 'VIEW_ONLY', scope: 'OWN', actions: ['VIEW'] },
  dashboard: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  settings: { access: 'HIDDEN', scope: null, actions: [] },
  orderflow: { access: 'HIDDEN', scope: null, actions: [] },
  order_desk: { access: 'HIDDEN', scope: null, actions: [] },
  reviews: { access: 'HIDDEN', scope: null, actions: [] },
  customers: { access: 'HIDDEN', scope: null, actions: [] },
  marketing: { access: 'HIDDEN', scope: null, actions: [] },
  products: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  tasks: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] },
  activity: { access: 'HIDDEN', scope: null, actions: [] },
  export: { access: 'HIDDEN', scope: null, actions: [] },
};

export const D2C_OFFICER_TEMPLATE: UserCustomPermissions = {
  ...Object.fromEntries(ALL_FEATURE_KEYS.map(key => [key, { access: 'HIDDEN', scope: null, actions: [] }])),
  orderflow: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] },
  order_desk: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] },
  products: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
} as UserCustomPermissions;

export const OFFICE_STAFF_TEMPLATE: UserCustomPermissions = {
  beat_plans: { access: 'HIDDEN', scope: null, actions: [] },
  stores: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  distributors: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  dispatches: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  gps_tracking: { access: 'HIDDEN', scope: null, actions: [] },
  shelf_photos: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  call_tracker: { access: 'HIDDEN', scope: null, actions: [] },
  cheque_tracker: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  document_handover: { access: 'VIEW_EDIT', scope: 'ALL', actions: ['VIEW', 'EDIT'] },
  staff_scorecards: { access: 'HIDDEN', scope: null, actions: [] },
  dashboard: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  settings: { access: 'HIDDEN', scope: null, actions: [] },
  orderflow: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  order_desk: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  reviews: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  customers: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  marketing: { access: 'HIDDEN', scope: null, actions: [] },
  products: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  tasks: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  activity: { access: 'HIDDEN', scope: null, actions: [] },
  export: { access: 'HIDDEN', scope: null, actions: [] },
};

export const MANAGER_TEMPLATE: UserCustomPermissions = {
  beat_plans: { access: 'FULL', scope: 'TEAM', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  stores: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  distributors: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  dispatches: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  gps_tracking: { access: 'FULL', scope: 'TEAM', actions: ['VIEW'] },
  shelf_photos: { access: 'FULL', scope: 'TEAM', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  call_tracker: { access: 'FULL', scope: 'TEAM', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  cheque_tracker: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  document_handover: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  staff_scorecards: { access: 'FULL', scope: 'TEAM', actions: ['VIEW'] },
  dashboard: { access: 'FULL', scope: 'ALL', actions: ['VIEW'] },
  settings: { access: 'HIDDEN', scope: null, actions: [] },
  orderflow: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  order_desk: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  reviews: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  customers: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  marketing: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  products: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] },
  tasks: { access: 'FULL', scope: 'TEAM', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  activity: { access: 'VIEW_ONLY', scope: 'TEAM', actions: ['VIEW'] },
  export: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
};

export const VIEWER_TEMPLATE: UserCustomPermissions = {
  beat_plans: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  stores: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  distributors: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  dispatches: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  gps_tracking: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  shelf_photos: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  call_tracker: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  cheque_tracker: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  document_handover: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  staff_scorecards: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  dashboard: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  settings: { access: 'HIDDEN', scope: null, actions: [] },
  orderflow: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  order_desk: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  reviews: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  customers: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  marketing: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  products: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  tasks: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  activity: { access: 'HIDDEN', scope: null, actions: [] },
  export: { access: 'HIDDEN', scope: null, actions: [] },
};

export const SUPER_ADMIN_TEMPLATE: UserCustomPermissions = {
  beat_plans: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  stores: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  distributors: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  dispatches: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  gps_tracking: { access: 'FULL', scope: 'ALL', actions: ['VIEW'] },
  shelf_photos: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  call_tracker: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  cheque_tracker: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  document_handover: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  staff_scorecards: { access: 'FULL', scope: 'ALL', actions: ['VIEW'] },
  dashboard: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  settings: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  orderflow: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  order_desk: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  reviews: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  customers: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  marketing: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  products: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  tasks: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  activity: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  export: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
};

export interface UserWithPermissions {
  id?: string;
  role?: string;
  is_super_admin?: boolean;
  isSuperAdmin?: boolean;
  permissions?: Record<string, any>;
  customPermissions?: Record<string, any>;
  custom_permissions?: Record<string, any>;
  reports_to_id?: string | null;
  reportsToId?: string | null;
  assignedBrands?: string[];
  assigned_brands?: string[];
}

/**
 * Super Admin check: ONLY checks is_super_admin / isSuperAdmin boolean.
 */
export function isSuperAdmin(user?: UserWithPermissions | null): boolean {
  if (!user) return false;
  return Boolean(user.is_super_admin || user.isSuperAdmin);
}

/** Missing assignments retain legacy all-brand access; an explicit empty list means no brands. */
export function getAssignedBrandCodes(user?: UserWithPermissions | null): string[] {
  if (!user) return [];
  if (isSuperAdmin(user)) return ['ALL'];
  const assignments = user.assignedBrands ?? user.assigned_brands;
  if (!Array.isArray(assignments)) return ['ALL'];
  return assignments.map((code) => String(code).trim().toUpperCase()).filter(Boolean);
}

export function canAccessBrand(user: UserWithPermissions | null | undefined, brandCode: string): boolean {
  const assigned = getAssignedBrandCodes(user);
  return assigned.includes('ALL') || assigned.includes(String(brandCode).trim().toUpperCase());
}

export function canAssignD2C(user: UserWithPermissions & { active?: boolean; orderflowAssignable?: boolean; orderflowBrands?: string[] }, brandCode?: string): boolean {
  if (user.active === false || !(user.orderflowAssignable ?? hasAccess(user, 'orderflow'))) return false;
  const brands = user.orderflowBrands ?? getAssignedBrandCodes(user);
  return !brandCode || brandCode === 'ALL' || brands.includes('ALL') || brands.includes(brandCode.toUpperCase());
}

export function d2cAssignees<T extends UserWithPermissions & { active?: boolean; orderflowAssignable?: boolean; orderflowBrands?: string[] }>(actor: UserWithPermissions, users: T[], brandCode?: string): T[] {
  const ids = new Set([actor.id]);
  if (canPerform(actor, 'orderflow', 'EDIT') && getScope(actor, 'orderflow') === 'TEAM') {
    let changed = true;
    while (changed) { changed = false; for (const user of users) if (user.id && ids.has(user.reportsToId || user.reports_to_id || '') && !ids.has(user.id)) { ids.add(user.id); changed = true; } }
  }
  const all = canPerform(actor, 'orderflow', 'EDIT') && getScope(actor, 'orderflow') === 'ALL';
  return users.filter(user => (all || ids.has(user.id)) && canAssignD2C(user, brandCode));
}

const DENIED: FeaturePermission = { access: 'HIDDEN', scope: null, actions: [] };

function readPermission(value: any): FeaturePermission | undefined {
  if (!value || typeof value !== 'object' || !value.access) return undefined;
  return { access: value.access as FeatureAccess, scope: (value.scope ?? null) as DataScope | null, actions: (Array.isArray(value.actions) ? value.actions : []) as ActionPermission[] };
}

/**
 * In the browser, the page or Settings tab on screen. Older checks name a feature ("orderflow");
 * on a page that answers for that feature, the page's own setting decides, so View on
 * "All orders" never inherits Edit from "Manual entry".
 */
let explicitPage: { key: string; path: string } | null = null;
export function setActivePage(key: string | null): void {
  explicitPage = key && typeof window !== 'undefined' ? { key, path: window.location.pathname } : null;
}
export function activePageKey(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  if (explicitPage && explicitPage.path === window.location.pathname) return explicitPage.key;
  return pageForPath(window.location.pathname)?.key;
}

function accessMap(user: UserWithPermissions): Record<string, any> | undefined {
  const custom = user.customPermissions || user.custom_permissions;
  return custom && typeof custom === 'object' ? custom : undefined;
}

/** True once a person has been given a role or page-level access. */
export function usesPageAccess(user: UserWithPermissions | null | undefined): boolean {
  return !!user && accessMap(user)?._v === 2;
}

/**
 * The permission that applies. Nothing is granted unless it is written on the person:
 * there is no fallback to a template or a job title.
 */
export function getEffectivePermission(
  user: UserWithPermissions | null | undefined,
  feature: string
): FeaturePermission | undefined {
  if (!user) return undefined;
  const custom = accessMap(user);

  if (custom?._v === 2) {
    if (!isPageKey(feature) && !isSensitiveKey(feature)) {
      const active = activePageKey();
      const def = active ? pageDefinition(active) : undefined;
      if (def && def.answers.includes(feature as FeatureKey)) {
        const page = readPermission(custom[def.key]);
        if (!page) return DENIED;
        return page.access !== 'HIDDEN' && !page.scope ? { ...page, scope: 'ALL' } : page;
      }
    }
    return readPermission(custom[feature]);
  }

  // Accounts saved before page-level access: pages follow their feature; sensitive details stay visible.
  if (isPageKey(feature)) return getEffectivePermission(user, pageDefinition(feature)!.feature);
  if (isSensitiveKey(feature)) return { access: 'VIEW_ONLY', scope: null, actions: ['VIEW'] };
  return readPermission(custom?.[feature]) || readPermission(user.permissions?.[feature]);
}

/** Can this person see money, customer or influencer details? */
export function canSeeSensitive(user: UserWithPermissions | null | undefined, key: SensitiveKey): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const perm = getEffectivePermission(user, key);
  return !!perm && perm.access !== 'HIDDEN';
}

/** Can this person open a page (by page key)? */
export function canOpenPage(user: UserWithPermissions | null | undefined, key: PageKey | string): boolean {
  return hasAccess(user, key);
}

/** The first page this person may open, for landing after sign-in or a refused page. */
export function firstAllowedPath(user: UserWithPermissions | null | undefined): string {
  if (!user) return '/login';
  if (isSuperAdmin(user)) return '/dashboard';
  const def = PAGES.find((entry) => entry.href && hasAccess(user, entry.key));
  if (def?.href) return def.href;
  if (PAGES.some((entry) => entry.settingsTab && hasAccess(user, entry.key))) return '/settings';
  return '/no-access';
}

/**
 * Can the user SEE this feature at all?
 * Reads ONLY from permissions / customPermissions JSONB with role template fallback.
 */
export function hasAccess(user: UserWithPermissions | null | undefined, feature: string): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const perm = getEffectivePermission(user, feature);
  return perm != null && perm.access != null && perm.access !== 'HIDDEN';
}

export const hasFeatureAccess = hasAccess;

/**
 * Is this feature read-only for the user?
 */
export function isViewOnly(user: UserWithPermissions | null | undefined, feature: string): boolean {
  if (!user) return true;
  if (isSuperAdmin(user)) return false;
  const perm = getEffectivePermission(user, feature);
  return perm?.access === 'VIEW_ONLY';
}

/**
 * Can the user perform a specific action? (VIEW, CREATE, EDIT, DELETE)
 */
export function canPerform(
  user: UserWithPermissions | null | undefined,
  feature: string,
  action: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE'
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const perm = getEffectivePermission(user, feature);
  if (!perm || perm.access === 'HIDDEN') return false;
  if (perm.access === 'VIEW_ONLY' && action !== 'VIEW') return false;
  return Array.isArray(perm.actions) && perm.actions.includes(action);
}

export const canPerformAction = canPerform;

/**
 * What data scope does the user have? ('OWN' | 'TEAM' | 'ALL')
 */
export function getScope(user: UserWithPermissions | null | undefined, feature: string): 'OWN' | 'TEAM' | 'ALL' {
  if (!user) return 'OWN';
  if (isSuperAdmin(user)) return 'ALL';
  const perm = getEffectivePermission(user, feature);
  if (perm?.scope) return perm.scope as 'OWN' | 'TEAM' | 'ALL';
  // Pages with no "whose records" choice (Settings tabs, catalogue lists) cover everything once granted.
  return perm && perm.access !== 'HIDDEN' && isPageKey(feature) ? 'ALL' : 'OWN';
}

export const getDataScope = getScope;

/**
 * Get all user IDs in this user's team (recursive)
 */
export async function getTeamMemberIds(userId: string, allUsers?: any[]): Promise<string[]> {
  if (!userId) return [];

  if (allUsers && allUsers.length > 0) {
    const result: string[] = [];
    const traverse = (currentId: string) => {
      const reports = allUsers.filter((u) => (u.reports_to_id === currentId || u.reportsToId === currentId) && u.id !== currentId);
      for (const r of reports) {
        if (!result.includes(r.id)) {
          result.push(r.id);
          traverse(r.id);
        }
      }
    };
    traverse(userId);
    return result;
  }

  if (typeof window === 'undefined') return [];
  try {
    const response = await fetch('/api/sync', { credentials: 'same-origin', cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload?.data?.users)) return [];
    return getTeamMemberIds(userId, payload.data.users);
  } catch { return []; }
}

/**
 * Scope Filter Helper: Determines if a record owned by `recordOwnerId` is visible to `user`
 */
export function isRecordVisibleToUser(
  user: UserWithPermissions | null | undefined,
  feature: string,
  recordOwnerId: string | undefined,
  teamIds: string[] = []
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (!recordOwnerId) return true;

  const scope = getScope(user, feature);
  if (scope === 'ALL') return true;
  if (scope === 'OWN') return recordOwnerId === user.id;
  if (scope === 'TEAM') {
    const allTeam = [user.id, ...teamIds];
    return allTeam.includes(recordOwnerId);
  }
  return false;
}

/** Updating orders (status, failures, returns, exchanges) is allowed from OrderFlow or the Order Desk. */
export function canWorkOrders(user: UserWithPermissions, action: ActionPermission = 'EDIT'): boolean {
  return canPerform(user, 'orderflow', action) || canPerform(user, 'order_desk', action);
}

/** Creating and changing online sales and offers: Edit on the Sales & offers page. */
export function canManageSales(user: UserWithPermissions): boolean {
  if (isSuperAdmin(user)) return true;
  if (usesPageAccess(user)) return canPerform(user, 'p.sales_offers', 'EDIT');
  return canPerform(user, 'settings', 'EDIT') || canPerform(user, 'marketing', 'EDIT');
}
