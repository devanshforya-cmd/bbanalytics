// Brand Bucket Command Center — Granular Custom Permission System (Section 1)
import { User, UserRole } from './types';

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
  | 'marketing';

export type FeatureAccess = 'HIDDEN' | 'VIEW_ONLY' | 'VIEW_EDIT' | 'FULL';
export type DataScope = 'OWN' | 'TEAM' | 'ALL';
export type ActionPermission = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE';

export interface FeaturePermission {
  access: FeatureAccess;
  scope: DataScope | null;
  actions: ActionPermission[];
}

export type UserCustomPermissions = Record<FeatureKey, FeaturePermission>;

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
};

// 1f. Pre-defined Templates
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
  orderflow: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  reviews: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  customers: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  marketing: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
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
  dashboard: { access: 'FULL', scope: 'ALL', actions: ['VIEW'] },
  settings: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  orderflow: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  reviews: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  customers: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
  marketing: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] },
};

/**
 * Super Admin bypasses all checks.
 */
export function isSuperAdmin(user?: User | null): boolean {
  if (!user) return false;
  return Boolean(user.isSuperAdmin || user.role === 'SUPER_ADMIN' || user.id === 'user_devansh');
}

/**
 * 1e. Check feature access (HIDDEN vs VIEW_ONLY vs VIEW_EDIT vs FULL)
 */
export function hasFeatureAccess(user: User | null | undefined, feature: FeatureKey): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  if (user.customPermissions && user.customPermissions[feature]) {
    return user.customPermissions[feature].access !== 'HIDDEN';
  }

  // Graceful fallback to legacy roles
  const role = user.role;
  switch (feature) {
    case 'beat_plans':
    case 'stores':
    case 'shelf_photos':
    case 'call_tracker':
    case 'cheque_tracker':
    case 'document_handover':
      return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'SALES_OFFICER';
    case 'distributors':
    case 'dispatches':
    case 'gps_tracking':
    case 'staff_scorecards':
      return role === 'SUPER_ADMIN' || role === 'ADMIN';
    case 'dashboard':
      return role !== 'DATA_ENTRY';
    case 'settings':
      return role === 'SUPER_ADMIN' || role === 'ADMIN';
    case 'orderflow':
    case 'reviews':
      return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'DATA_ENTRY' || role === 'BRAND_MANAGER';
    case 'customers':
    case 'marketing':
      return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'BRAND_MANAGER';
    default:
      return false;
  }
}

/**
 * 1e. Check action permission (VIEW, CREATE, EDIT, DELETE)
 */
export function canPerformAction(
  user: User | null | undefined,
  feature: FeatureKey,
  action: ActionPermission
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  if (user.customPermissions && user.customPermissions[feature]) {
    const perm = user.customPermissions[feature];
    if (perm.access === 'HIDDEN') return false;
    if (perm.access === 'VIEW_ONLY' && action !== 'VIEW') return false;
    return perm.actions.includes(action);
  }

  // Legacy role fallback
  const role = user.role;
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true;
  if (role === 'SALES_OFFICER') {
    if (action === 'DELETE') return false;
    return ['beat_plans', 'stores', 'shelf_photos', 'call_tracker', 'cheque_tracker', 'document_handover'].includes(feature);
  }
  if (role === 'DATA_ENTRY') {
    return action !== 'DELETE' && ['orderflow', 'reviews'].includes(feature);
  }
  return action === 'VIEW';
}

/**
 * 1e. Get data scope for feature (OWN, TEAM, ALL)
 */
export function getDataScope(user: User | null | undefined, feature: FeatureKey): DataScope {
  if (!user) return 'OWN';
  if (isSuperAdmin(user)) return 'ALL';

  if (user.customPermissions && user.customPermissions[feature]?.scope) {
    return user.customPermissions[feature].scope as DataScope;
  }

  // Legacy role fallback
  if (user.role === 'SALES_OFFICER') return 'OWN';
  return 'ALL';
}

/**
 * 1b. Recursive reports-to tree traversal to find all subordinate team IDs
 */
export function getTeamMemberIds(userId: string, allUsers: User[]): string[] {
  const result: string[] = [];

  function traverse(currentId: string) {
    const directReports = allUsers.filter((u) => u.reportsToId === currentId && u.id !== currentId);
    for (const report of directReports) {
      if (!result.includes(report.id)) {
        result.push(report.id);
        traverse(report.id);
      }
    }
  }

  traverse(userId);
  return result;
}

/**
 * 1e. Scope Filter Helper: Determines if a record owned by `recordOwnerId` is visible to `user`
 */
export function isRecordVisibleToUser(
  user: User | null | undefined,
  feature: FeatureKey,
  recordOwnerId: string | undefined,
  allUsers: User[] = []
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (!recordOwnerId) return true;

  const scope = getDataScope(user, feature);
  if (scope === 'ALL') return true;
  if (scope === 'OWN') return recordOwnerId === user.id;
  if (scope === 'TEAM') {
    const teamIds = [user.id, ...getTeamMemberIds(user.id, allUsers)];
    return teamIds.includes(recordOwnerId);
  }
  return false;
}
