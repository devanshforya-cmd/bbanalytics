import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_SALES_OFFICER_TEMPLATE, MANAGER_TEMPLATE } from '../src/lib/permissions.ts';
import { canReadWorkspaceRecord, canWriteWorkspaceRecord, type StoredWorkspaceRecord } from '../src/lib/db/workspace-policy.ts';
import { mapStoredUser, validateWorkspaceMutation, visibleWorkspace } from '../src/lib/db/server-workspace.ts';
import { staffPatch } from '../src/lib/staff-validation.ts';
import { runtimeReadiness } from '../src/lib/runtime-config.ts';

const admin: any = { id: 'admin', fullName: 'Admin', email: '', phone: '', isSuperAdmin: true, assignedBrands: ['ALL'] };
const alice: any = { id: 'alice', fullName: 'Alice', email: '', phone: '', role: 'SALES_OFFICER', assignedBrands: ['A'], customPermissions: { ...FIELD_SALES_OFFICER_TEMPLATE, orderflow: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] } }, reportsToId: 'manager' };
const bob: any = { ...alice, id: 'bob', fullName: 'Bob', reportsToId: 'other_manager' };
const manager: any = { ...alice, id: 'manager', customPermissions: MANAGER_TEMPLATE };
const users = [admin, alice, bob, manager];
const row = (collection: any, id: string, data: any = {}, creator = 'alice'): StoredWorkspaceRecord => ({ collection, id, data: { id, ...data }, created_by: creator, version: 1 });

test('canonical policy enforces own, recursive team, hidden features and every brand in a mixed record', () => {
  const own = row('orders', 'o1', { brandCode: 'A' });
  const other = row('orders', 'o2', { brandCode: 'A' }, 'bob');
  assert.equal(canReadWorkspaceRecord(alice, own, users, [own, other]), true);
  assert.equal(canReadWorkspaceRecord(alice, other, users, [own, other]), false);
  assert.equal(canReadWorkspaceRecord({ ...alice, customPermissions: { orderflow: { access: 'HIDDEN', actions: [], scope: null } } }, own, users, [own]), false);
  const teamVisit = row('visits', 'v1', { officerId: 'alice' });
  const outsideVisit = row('visits', 'v2', { officerId: 'bob' }, 'bob');
  assert.equal(canReadWorkspaceRecord(manager, teamVisit, users, [teamVisit]), true);
  assert.equal(canReadWorkspaceRecord(manager, outsideVisit, users, [outsideVisit]), false);
  assert.equal(canReadWorkspaceRecord(alice, row('orders', 'mixed', { brandCode: 'A', items: [{ brandCode: 'B' }] }), users, []), false);
  assert.equal(canReadWorkspaceRecord(alice, row('customers', 'customer', { brandsPurchased: ['A', 'B'] }), users, []), false);
});

test('generic writes cannot spoof GPS/audit or operate on another officer’s store', () => {
  assert.equal(canWriteWorkspaceRecord(admin, row('staffLiveLocations', 'alice', { officerId: 'alice' }), 'CREATE', users, []), false);
  assert.equal(canWriteWorkspaceRecord(admin, row('activityLogs', 'audit'), 'CREATE', users, []), false);
  const store = row('retailers', 'r1', { assignedOfficerId: 'bob', brandsStocked: ['A'] }, 'bob');
  const visit = row('visits', 'visit', { officerId: 'alice', entityId: 'r1' });
  assert.equal(canWriteWorkspaceRecord(alice, visit, 'CREATE', users, [store]), false);
  assert.equal(canWriteWorkspaceRecord(alice, row('notifications', 'n1', { userId: 'bob' }), 'EDIT', users, []), false);
});

test('a notification for a hidden feature is excluded even when addressed to the current user', () => {
  const notification = row('notifications', 'n1', { userId: 'alice', entityType: 'tasks', message: 'Private task' });
  const user = { ...alice, customPermissions: { ...alice.customPermissions, tasks: { access: 'HIDDEN', scope: null, actions: [] } } };
  assert.equal(canReadWorkspaceRecord(user, notification, users, []), false);
});

test('broad dependency read grants cannot expand a narrower feature write scope', () => {
  const user = { ...alice, customPermissions: { ...alice.customPermissions,
    stores: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] },
    dispatches: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] }, distributors: { access: 'HIDDEN', scope: null, actions: [] } } };
  const branch = row('branches', 'b1', { assignedOfficerId: 'bob', brandsAvailable: ['A'] }, 'bob');
  assert.equal(canReadWorkspaceRecord(user, branch, users, []), true);
  assert.equal(canWriteWorkspaceRecord(user, branch, 'EDIT', users, []), false);
  assert.equal(canWriteWorkspaceRecord(user, { ...branch, data: { ...branch.data, assignedOfficerId: 'alice' } }, 'EDIT', users, []), true);
  // The server separately checks the original row, preventing reassignment from bypassing the denial.
});

test('workspace projection stamps trusted creator metadata and excludes staff secrets', () => {
  const user = mapStoredUser({ id: 'alice', full_name: 'Alice', email: 'alice@example.com', password_hash: 'secret-hash', is_active: true });
  assert.equal('password' in user, false); assert.equal('password_hash' in user, false);
  const stored = row('orders', 'o1', { brandCode: 'A', createdById: 'forged' });
  const view = visibleWorkspace(admin, { users, brands: [], records: [stored] });
  assert.equal(view.data.orders?.[0].createdById, 'alice');
  assert.equal(view.versions.orders?.o1, 1);
});

test('mutation validation rejects malformed records, negative money and unsafe legacy sharing tokens', () => {
  const mutation: any = { collection: 'products', id: 'p1', operation: 'upsert', data: { id: 'p1', name: 'Product', sku: 'SKU', brandCode: 'A' }, mutationId: 'test-mutation-1', expectedVersion: 0 };
  assert.doesNotThrow(() => validateWorkspaceMutation(mutation));
  assert.throws(() => validateWorkspaceMutation({ ...mutation, expectedVersion: -1 }), /Invalid/);
  assert.throws(() => validateWorkspaceMutation({ ...mutation, data: { ...mutation.data, price: -1 } }), /nonnegative/);
  assert.throws(() => validateWorkspaceMutation({ ...mutation, data: { ...mutation.data, brandsStocked: 'A' } }), /list/);
  assert.throws(() => validateWorkspaceMutation({ ...mutation, collection: 'sharedAccessLinks', data: { id: 'p1', token: 'old-weak-token' } }), /Regenerate/);
});

test('staff writes normalize identities, validate permissions/passwords and ignore caller supplied hash/admin columns', () => {
  const body = { fullName: ' Staff ', email: 'STAFF@EXAMPLE.COM', phone: '+977-9800000002', password: 'strong-temporary-password', role: 'SALES_OFFICER', password_hash: 'forged', is_super_admin: true, customPermissions: FIELD_SALES_OFFICER_TEMPLATE };
  const patch = staffPatch(body, true);
  assert.equal(patch.email, 'staff@example.com'); assert.equal(patch.phone, '9800000002');
  assert.equal(patch.is_super_admin, false); assert.equal(patch.password_hash, undefined);
  assert.throws(() => staffPatch({ ...body, password: 'short' }, true), /16/);
  assert.throws(() => staffPatch({ ...body, customPermissions: { bad: {} } }, true), /Invalid permission/);
});

test('production readiness refuses placeholders without exposing credentials', () => {
  const old = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, secret: process.env.AUTH_SESSION_SECRET };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'placeholder'; process.env.AUTH_SESSION_SECRET = 'generate_a_random_secret_of_at_least_32_bytes';
  try { const result = runtimeReadiness(); assert.equal(result.ready, false); assert.equal(JSON.stringify(result).includes('placeholder'), false); }
  finally {
    for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: old.url, SUPABASE_SERVICE_ROLE_KEY: old.key, AUTH_SESSION_SECRET: old.secret })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
