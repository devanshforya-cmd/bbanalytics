import type { StoredWorkspaceRecord } from './db/workspace-policy';
export const STORE_COLLECTIONS = ['retailers', 'branches', 'distributors'] as const;
export function storeDeletionPlan(store: StoredWorkspaceRecord, records: StoredWorkspaceRecord[]) {
  const children = records.filter(row => store.collection === 'distributors'
    ? ['branches', 'retailers'].includes(row.collection) && row.data.distributorId === store.id
    : store.collection === 'branches' && row.collection === 'retailers' && row.data.branchId === store.id);
  const pending = records.filter(row => row.data.storeId === store.id &&
    (row.collection === 'recurringSchedules' || row.collection === 'beatItems' && ['PENDING', 'ASSIGNED', 'UPCOMING'].includes(row.data.status || 'PENDING')));
  return { children, pending };
}
