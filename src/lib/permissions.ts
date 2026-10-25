// Brand Bucket Command Center — Granular Custom Permission System (Section 1)
import { supabase } from './db/supabase-client';

export type FeatureKey =
  | 'beat_plans'
  | 'stores'
  | 'distributors'
  | 'dispatches'
  | 'gps_tracking'
  | 'shelf_photos'
  | 'call_tracker'
  | 'cheque_tracker'
  | 'document_handover'
  | 'staff_scorecards'
  | 'dashboard'
  | 'settings'
  | 'orderflow'
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
  'call_tracker',
  'cheque_tracker',
  'document_handover',
  'staff_scorecards',
  'dashboard',
  'settings',
  'orderflow',
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
  call_tracker: { label: 'Call Tracker', group: 'OFFLINE_SALES', description: 'Field and office call logs with outcome categorization' },
  cheque_tracker: { label: 'Cheque Tracker', group: 'OFFLINE_SALES', description: 'Cheque leaf collection, custody handover, banking clearance' },
  document_handover: { label: 'Document Handover', group: 'OFFLINE_SALES', description: 'VAT bills, challans, signed purchase orders' },
  staff_scorecards: { label: 'Staff Scorecards', group: 'OFFLINE_SALES', description: 'Daily compliance and field performance scorecards' },
  dashboard: { label: 'Dashboard', group: 'PLATFORM', description: 'Executive operational KPIs and multi-brand metrics' },
  settings: { label: 'System Settings', group: 'PLATFORM', description: 'Staff onboarding, permissions, holiday calendar, categories' },
  orderflow: { label: 'OrderFlow (Online)', group: 'PLATFORM', description: 'WhatsApp Extractor, manual entry, daily orders, delivery failures' },
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
  reviews: { access: 'HIDDEN', scope: null, actions: [] },
  customers: { access: 'HIDDEN', scope: null, actions: [] },
  marketing: { access: 'HIDDEN', scope: null, actions: [] },
  products: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] },
  tasks: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] },
  activity: { access: 'HIDDEN', scope: null, actions: [] },
  export: { access: 'HIDDEN', scope: null, actions: [] },
};

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

export function getEffectivePermission(
  user: UserWithPermissions | null | undefined,
  feature: string
): FeaturePermission | undefined {
  if (!user) return undefined;

  // 1. Check customPermissions first (where granular permissions are stored)
  const custom = user.customPermissions || user.custom_permissions;
  if (custom && custom[feature]) {
    const p = custom[feature];
    if (p && typeof p === 'object' && p.access) {
      return {
        access: p.access as FeatureAccess,
        scope: (p.scope ?? null) as DataScope | null,
        actions: (p.actions ?? []) as ActionPermission[],
      };
    }
  }

  // 2. Check permissions if structured as FeaturePermission
  const perms = user.permissions;
  if (perms && perms[feature]) {
    const p = perms[feature];
    if (p && typeof p === 'object' && p.access) {
      return {
        access: p.access as FeatureAccess,
        scope: (p.scope ?? null) as DataScope | null,
        actions: (p.actions ?? []) as ActionPermission[],
      };
    }
  }

  // 3. Fallback to pre-defined role templates based on user.role
  const role = (user.role || '').toUpperCase();
  let template: UserCustomPermissions | undefined;
  if (role === 'SUPER_ADMIN') {
    template = SUPER_ADMIN_TEMPLATE;
  } else if (role === 'SALES_OFFICER') {
    template = FIELD_SALES_OFFICER_TEMPLATE;
  } else if (role === 'DATA_ENTRY' || role === 'OFFICE_STAFF') {
    template = OFFICE_STAFF_TEMPLATE;
  } else if (role === 'ADMIN' || role === 'MANAGER' || role === 'BRAND_MANAGER') {
    template = MANAGER_TEMPLATE;
  } else if (role === 'VIEWER') {
    template = VIEWER_TEMPLATE;
  }

  if (template && template[feature]) {
    return template[feature];
  }

  return undefined;
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
  return (perm?.scope as 'OWN' | 'TEAM' | 'ALL') || 'OWN';
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

  try {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('reports_to_id', userId)
      .eq('is_active', true);

    const directReports = data?.map((u: any) => u.id) || [];
    const nestedReports = await Promise.all(
      directReports.map((id: string) => getTeamMemberIds(id))
    );

    return [...directReports, ...nestedReports.flat()];
  } catch (err) {
    console.warn('getTeamMemberIds error:', err);
    return [];
  }
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
