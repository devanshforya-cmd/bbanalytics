import { DEFAULT_SUPER_ADMIN } from './fixtures';
import test from 'node:test';
import assert from 'node:assert/strict';
import { storeDeletionPlan } from '../src/lib/store-deletion';
import { canWriteWorkspaceRecord, type StoredWorkspaceRecord } from '../src/lib/db/workspace-policy';
const row = (collection: any, id: string, data: any = {}): StoredWorkspaceRecord => ({ collection, id, data: { id, ...data }, created_by: 'admin', version: 1 });
test('store deletion finds linked stores, removes pending routes and preserves completed history', () => {
  const distributor = row('distributors', 'd'); const branch = row('branches', 'b', { distributorId: 'd' }); const retailer = row('retailers', 'r', { branchId: 'b' });
  const records = [distributor, branch, retailer, row('beatItems', 'pending', { storeId: 'r', status: 'PENDING' }), row('beatItems', 'done', { storeId: 'r', status: 'COMPLETED' }), row('recurringSchedules', 'schedule', { storeId: 'r' }), row('orders', 'order', { storeId: 'r' })];
  assert.deepEqual(storeDeletionPlan(distributor, records).children.map(r => r.id), ['b']);
  assert.deepEqual(storeDeletionPlan(branch, records).children.map(r => r.id), ['r']);
  assert.deepEqual(storeDeletionPlan(retailer, records).pending.map(r => r.id), ['pending', 'schedule']);
});
test('store deletion requires Super Admin even if a staff member has DELETE grants', () => {
  const staff = { ...DEFAULT_SUPER_ADMIN, id: 'staff', role: 'ADMIN', isSuperAdmin: false, customPermissions: { stores: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'DELETE'] } } } as any;
  for (const collection of ['retailers', 'branches', 'distributors']) {
    assert.equal(canWriteWorkspaceRecord(staff, row(collection, 's'), 'DELETE', [], []), false);
    assert.equal(canWriteWorkspaceRecord(DEFAULT_SUPER_ADMIN, row(collection, 's'), 'DELETE', [], []), true);
  }
});
