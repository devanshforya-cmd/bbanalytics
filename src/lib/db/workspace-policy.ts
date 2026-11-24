import { canPerform, getAssignedBrandCodes, getScope, hasAccess, isSuperAdmin, type FeatureKey } from '../permissions';
import type { User } from '../types';
import type { PageKey } from '../access-catalog';
import { isLookupCollection, type WorkspaceCollection, type WorkspaceRecord } from './workspace-types';

export interface StoredWorkspaceRecord {
  collection: WorkspaceCollection;
  id: string;
  data: WorkspaceRecord;
  created_by: string;
  version: number;
  last_mutation_id?: string;
}

/** Older feature keys and page keys ("p.settings_holidays") both work: every person carries both. */
type AccessKey = FeatureKey | PageKey;

const FEATURES: Record<WorkspaceCollection, AccessKey[]> = {
  products: ['products'], combos: ['products'], secondaryOrders: ['beat_plans', 'dispatches'],
  facingAudits: ['beat_plans'], distributors: ['distributors'], branches: ['stores', 'distributors'],
  retailers: ['stores'], beatItems: ['beat_plans'], visits: ['beat_plans'], dispatches: ['dispatches'],
  stockCounts: ['beat_plans', 'stock_counts'], shelfPhotos: ['shelf_photos'], callLogs: ['call_tracker'],
  cheques: ['cheque_tracker'], documents: ['document_handover'], orders: ['orderflow', 'order_desk'],
  deliveryFailures: ['orderflow', 'order_desk'], returns: ['reviews', 'order_desk', 'orderflow'], reviewCategories: ['reviews'],
  feedbackEntries: ['reviews'], customers: ['customers', 'orderflow', 'order_desk'], tasks: ['tasks'],
  notifications: [], activityLogs: ['activity'], staffLiveLocations: ['gps_tracking'],
  holidays: ['p.settings_holidays'], seasonalPatterns: ['dashboard'], taskTemplates: ['p.settings_task_templates'],
  promotions: ['p.settings_promotions'], dailySummaries: ['beat_plans', 'staff_scorecards'], importHistory: ['p.settings_import'],
  influencers: ['marketing'], influencerContent: ['marketing'], sharedAccessLinks: ['p.settings_shared_links'],
  documentTypes: ['p.settings_lists'], storeCategories: ['p.settings_lists'], recurringSchedules: ['beat_plans'],
  workspaceConfig: ['p.settings_channels', 'p.settings_brands', 'p.settings_alerts', 'p.settings_beats', 'p.settings_follow_ups'],
  marketingSends: ['marketing'], influencerNiches: ['marketing', 'p.settings_lists'], marketingOptions: ['marketing', 'p.settings_lists'],
  failureReasons: ['orderflow', 'order_desk', 'p.settings_lists'], userPreferences: [],
  campaigns: ['p.sales_offers'],
  customerCalls: ['customer_calls'],
};

const GLOBAL_CATALOG = new Set<WorkspaceCollection>([
  'products', 'combos', 'reviewCategories', 'holidays', 'seasonalPatterns', 'taskTemplates',
  'promotions', 'documentTypes', 'storeCategories', 'workspaceConfig',
  'influencerNiches', 'marketingOptions', 'failureReasons', 'campaigns',
]);

export function collectionFeatures(collection: WorkspaceCollection, read = false): AccessKey[] {
  if (read && (collection === 'products' || collection === 'combos')) return ['products', 'beat_plans', 'orderflow', 'order_desk', 'dispatches', 'stock_counts'];
  if (read && collection === 'reviewCategories') return ['reviews', 'order_desk'];
  if (read && ['documentTypes', 'storeCategories', 'workspaceConfig', 'promotions'].includes(collection)) return ['settings', 'beat_plans', 'stores', 'document_handover', 'orderflow', 'order_desk', 'customer_calls', 'dashboard'];
  // Callers need the orders and customers they phone about.
  if (read && (collection === 'orders' || collection === 'customers')) return [...FEATURES[collection], 'customer_calls'];
  if (read && collection === 'holidays') return ['settings', 'beat_plans', 'tasks'];
  // Everyone who takes or reviews online orders sees the running sales; the Sales & offers page manages them.
  if (read && collection === 'campaigns') return ['p.sales_offers', 'settings', 'marketing', 'orderflow', 'order_desk', 'dashboard'];
  if (read && collection === 'failureReasons') return ['orderflow', 'order_desk', 'settings', 'reviews', 'dashboard'];
  if (read && collection === 'stockCounts') return ['beat_plans', 'dispatches', 'stock_counts', 'stores'];
  if (read && collection === 'secondaryOrders') return ['beat_plans', 'stock_counts'];
  if (read && (collection === 'retailers' || collection === 'branches')) return ['stores', 'beat_plans', 'cheque_tracker', 'shelf_photos', 'call_tracker', 'document_handover', 'dispatches', 'stock_counts'];
  return FEATURES[collection];
}

export function teamMemberIds(user: User, users: User[]): Set<string> {
  const result = new Set([user.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const member of users) {
      if (member.reportsToId && result.has(member.reportsToId) && !result.has(member.id)) {
        result.add(member.id); changed = true;
      }
    }
  }
  return result;
}

export function recordOwner(row: StoredWorkspaceRecord): string {
  const d = row.data;
  if (row.collection === 'tasks') return d.assignedTo || d.assignedToId || row.created_by;
  if (row.collection === 'retailers' || row.collection === 'branches') return d.assignedOfficerId || row.created_by;
  if (row.collection === 'notifications') return d.userId || row.created_by;
  return d.officerId || (row.collection === 'activityLogs' ? d.userId : undefined) || row.created_by;
}

export function recordBrandCodes(row: StoredWorkspaceRecord, records: StoredWorkspaceRecord[]): string[] {
  const d = row.data;
  const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
  const itemBrands = list(d.items).flatMap((item: any) => {
    const product = records.find((record) => record.collection === 'products' && record.id === item?.productId);
    return [item?.brandCode, product?.data.brandCode];
  });
  const direct = [d.brandCode, ...list(d.brandCodes), ...list(d.brandsStocked), ...list(d.brandsAvailable), ...list(d.brandsCarried), ...list(d.brandsPurchased), ...itemBrands]
    .filter((code) => typeof code === 'string').map((code: string) => code.trim().toUpperCase());
  if (direct.length) return direct;
  const storeId = d.storeId || d.entityId;
  const store = storeId && records.find((item) => ['retailers', 'branches', 'distributors'].includes(item.collection) && item.id === storeId);
  if (store) return recordBrandCodes(store, []);
  return [];
}

/** People whose scope decides who may see or change a record. */
function recordOwners(row: StoredWorkspaceRecord): string[] {
  if (row.collection === 'orders') return [row.created_by, row.data.assignedToId].filter(Boolean);
  if (row.collection === 'marketingSends') return [row.created_by, row.data.responsibleId].filter(Boolean);
  return [recordOwner(row)];
}

export function canReadWorkspaceRecord(user: User, row: StoredWorkspaceRecord, users: User[], records: StoredWorkspaceRecord[]): boolean {
  // Personal preferences belong to one account, including for administrators.
  if (row.collection === 'userPreferences') return row.id === user.id;
  if (isSuperAdmin(user)) return true;
  if (row.collection === 'sharedAccessLinks' || row.collection === 'importHistory') return false;
  if (row.collection === 'notifications') {
    if (row.data.userId !== user.id) return false;
    const relatedFeatures = FEATURES[row.data.entityType as WorkspaceCollection];
    return !relatedFeatures?.length || relatedFeatures.some((feature) => hasAccess(user, feature));
  }
  const features = collectionFeatures(row.collection, true).filter((feature) => hasAccess(user, feature));
  if (!features.length) return false;
  const assigned = getAssignedBrandCodes(user);
  const brands = recordBrandCodes(row, records);
  if (!assigned.includes('ALL') && brands.length && !brands.every((code) => assigned.includes(code))) return false;
  if (!assigned.length && ['products', 'combos', 'orders', 'secondaryOrders', 'retailers', 'branches', 'distributors', 'cheques'].includes(row.collection)) return false;
  if (GLOBAL_CATALOG.has(row.collection)) return true;
  const owners = recordOwners(row);
  return features.some((feature) => {
    const scope = getScope(user, feature);
    return scope === 'ALL' || (scope === 'OWN' ? owners.includes(user.id) : owners.some(owner => teamMemberIds(user, users).has(owner)));
  });
}

export function canWriteWorkspaceRecord(user: User, row: StoredWorkspaceRecord, action: 'CREATE' | 'EDIT' | 'DELETE', users: User[], records: StoredWorkspaceRecord[]): boolean {
  // Audit and GPS records have dedicated trusted server writers.
  if (row.collection === 'activityLogs' || row.collection === 'staffLiveLocations') return false;
  if (row.collection === 'userPreferences') return row.id === user.id && action !== 'DELETE';
  if (isSuperAdmin(user)) return true;
  // Staff may add to a shared list while filling a form; renaming, merging and archiving are admin work.
  if (isLookupCollection(row.collection) && action !== 'CREATE' && !canPerform(user, 'p.settings_lists', 'EDIT')) return false;
  if (isLookupCollection(row.collection) && action === 'DELETE') return false;
  if (['products', 'combos', 'retailers', 'branches', 'distributors'].includes(row.collection) && action === 'DELETE') return false;
  if (row.collection === 'sharedAccessLinks' || row.collection === 'importHistory') return false;
  if (row.collection === 'notifications') return action !== 'CREATE' && row.data.userId === user.id;
  const writeFeatures = collectionFeatures(row.collection).filter((feature) => canPerform(user, feature, action)
    // The Order Desk works existing orders. The only order it creates is a replacement for an exchange; it never deletes one.
    && !(feature === 'order_desk' && row.collection === 'orders' && (action === 'DELETE' || (action === 'CREATE' && !row.data.exchangeReturnId))));
  const owners = recordOwners(row);
  if (isLookupCollection(row.collection)) return writeFeatures.length > 0;
  if (!writeFeatures.some((feature) => {
    const scope = getScope(user, feature);
    return scope === 'ALL' || scope === 'OWN' && owners.includes(user.id) || scope === 'TEAM' && owners.some(owner => teamMemberIds(user, users).has(owner));
  })) return false;
  if (!canReadWorkspaceRecord(user, row, users, records)) return false;
  const storeId = row.data.storeId || row.data.entityId;
  if (storeId && !['retailers', 'branches', 'distributors'].includes(row.collection)) {
    const store = records.find((record) => ['retailers', 'branches', 'distributors'].includes(record.collection) && record.id === storeId);
    if (store && !canReadWorkspaceRecord(user, store, users, records)) return false;
  }
  const assigned = getAssignedBrandCodes(user);
  const brands = recordBrandCodes(row, records);
  return assigned.includes('ALL') || !brands.length || brands.every((code) => assigned.includes(code));
}
