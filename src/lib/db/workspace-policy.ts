import { canPerform, getAssignedBrandCodes, getScope, hasAccess, isSuperAdmin, type FeatureKey } from '../permissions';
import type { User } from '../types';
import type { WorkspaceCollection, WorkspaceRecord } from './workspace-types';

export interface StoredWorkspaceRecord {
  collection: WorkspaceCollection;
  id: string;
  data: WorkspaceRecord;
  created_by: string;
  version: number;
  last_mutation_id?: string;
}

const FEATURES: Record<WorkspaceCollection, FeatureKey[]> = {
  products: ['products'], combos: ['products'], secondaryOrders: ['beat_plans'],
  facingAudits: ['beat_plans'], distributors: ['distributors'], branches: ['stores', 'distributors'],
  retailers: ['stores'], beatItems: ['beat_plans'], visits: ['beat_plans'], dispatches: ['dispatches'],
  stockCounts: ['beat_plans'], shelfPhotos: ['shelf_photos'], callLogs: ['call_tracker'],
  cheques: ['cheque_tracker'], documents: ['document_handover'], orders: ['orderflow'],
  deliveryFailures: ['orderflow'], returns: ['reviews'], reviewCategories: ['reviews'],
  feedbackEntries: ['reviews'], customers: ['customers', 'orderflow'], tasks: ['tasks'],
  notifications: [], activityLogs: ['activity'], staffLiveLocations: ['gps_tracking'],
  holidays: ['settings'], seasonalPatterns: ['dashboard'], taskTemplates: ['settings'],
  promotions: ['settings'], dailySummaries: ['beat_plans', 'staff_scorecards'], importHistory: ['settings'],
  influencers: ['marketing'], influencerContent: ['marketing'], sharedAccessLinks: ['settings'],
  documentTypes: ['settings'], storeCategories: ['settings'], recurringSchedules: ['beat_plans'],
  workspaceConfig: ['settings'],
};

const GLOBAL_CATALOG = new Set<WorkspaceCollection>([
  'products', 'combos', 'reviewCategories', 'holidays', 'seasonalPatterns', 'taskTemplates',
  'promotions', 'documentTypes', 'storeCategories', 'workspaceConfig',
]);

export function collectionFeatures(collection: WorkspaceCollection, read = false): FeatureKey[] {
  if (read && (collection === 'products' || collection === 'combos')) return ['products', 'beat_plans', 'orderflow', 'dispatches'];
  if (read && ['documentTypes', 'storeCategories', 'workspaceConfig', 'promotions'].includes(collection)) return ['settings', 'beat_plans', 'stores', 'document_handover', 'orderflow'];
  if (read && collection === 'holidays') return ['settings', 'beat_plans', 'tasks'];
  if (read && collection === 'stockCounts') return ['beat_plans', 'dispatches'];
  if (read && (collection === 'retailers' || collection === 'branches')) return ['stores', 'beat_plans', 'cheque_tracker', 'shelf_photos', 'call_tracker', 'document_handover', 'dispatches'];
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

export function canReadWorkspaceRecord(user: User, row: StoredWorkspaceRecord, users: User[], records: StoredWorkspaceRecord[]): boolean {
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
  const owner = recordOwner(row);
  return features.some((feature) => {
    const scope = getScope(user, feature);
    return scope === 'ALL' || (scope === 'OWN' ? owner === user.id : teamMemberIds(user, users).has(owner));
  });
}

export function canWriteWorkspaceRecord(user: User, row: StoredWorkspaceRecord, action: 'CREATE' | 'EDIT' | 'DELETE', users: User[], records: StoredWorkspaceRecord[]): boolean {
  // Audit and GPS records have dedicated trusted server writers.
  if (row.collection === 'activityLogs' || row.collection === 'staffLiveLocations') return false;
  if (isSuperAdmin(user)) return true;
  if (row.collection === 'sharedAccessLinks' || row.collection === 'importHistory') return false;
  if (row.collection === 'notifications') return action !== 'CREATE' && row.data.userId === user.id;
  const writeFeatures = collectionFeatures(row.collection).filter((feature) => canPerform(user, feature, action));
  const owner = recordOwner(row);
  if (!writeFeatures.some((feature) => {
    const scope = getScope(user, feature);
    return scope === 'ALL' || scope === 'OWN' && owner === user.id || scope === 'TEAM' && teamMemberIds(user, users).has(owner);
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
