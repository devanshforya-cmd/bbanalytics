// deletedProducts is private history, excluded from client snapshots and sync writes.
/** Collections stored as individual, versioned records in Supabase. */
export const WORKSPACE_COLLECTIONS = [
  'products', 'combos', 'secondaryOrders', 'facingAudits', 'distributors',
  'branches', 'retailers', 'beatItems', 'visits', 'dispatches', 'stockCounts',
  'shelfPhotos', 'callLogs', 'cheques', 'documents', 'orders', 'deliveryFailures',
  'returns', 'reviewCategories', 'feedbackEntries', 'customers', 'tasks',
  'notifications', 'activityLogs', 'staffLiveLocations', 'holidays',
  'seasonalPatterns', 'taskTemplates', 'promotions', 'dailySummaries',
  'importHistory', 'influencers', 'influencerContent', 'sharedAccessLinks',
  'documentTypes', 'storeCategories', 'recurringSchedules', 'workspaceConfig',
  // November 2026: marketing sends are their own collection, never orders.
  'marketingSends', 'influencerNiches', 'marketingOptions', 'failureReasons', 'userPreferences',
] as const;

/** Shared pick-lists that staff can extend inline and admins manage in Settings. */
export const LOOKUP_COLLECTIONS = ['influencerNiches', 'marketingOptions', 'failureReasons'] as const;
export function isLookupCollection(value: unknown): value is typeof LOOKUP_COLLECTIONS[number] {
  return (LOOKUP_COLLECTIONS as readonly unknown[]).includes(value);
}

export type WorkspaceCollection = typeof WORKSPACE_COLLECTIONS[number];
export type WorkspaceRecord = Record<string, any> & { id: string };
export type WorkspaceSnapshot = Partial<Record<WorkspaceCollection, WorkspaceRecord[]>>;
export type WorkspaceVersions = Partial<Record<WorkspaceCollection, Record<string, number>>>;

export interface WorkspaceMutation {
  collection: WorkspaceCollection;
  id: string;
  operation: 'upsert' | 'delete';
  data?: WorkspaceRecord;
  mutationId: string;
  expectedVersion: number;
}

export function isWorkspaceCollection(value: unknown): value is WorkspaceCollection {
  return typeof value === 'string' && (WORKSPACE_COLLECTIONS as readonly string[]).includes(value);
}
