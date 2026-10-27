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
] as const;

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
