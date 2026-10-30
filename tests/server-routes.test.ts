import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiInputError, apiFailure, dateAd, ownsRecord, positiveNumber, readBody, scopeOfficerIds, visibleOrders } from '../src/app/api/_workspace.ts';
import { projectSharedPortal, validateSharedLink } from '../src/app/api/shared/[token]/projection.ts';
import type { DatabaseService } from '../src/lib/db/db-service.ts';
import type { SharedAccessLink, User } from '../src/lib/types.ts';

const user = {
  id: 'officer-a', fullName: 'Sam Smith', role: 'SALES_OFFICER', assignedBrands: ['FORYA'],
  customPermissions: { orderflow: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE'] }, tasks: { access: 'FULL', scope: 'TEAM', actions: ['VIEW', 'CREATE'] } },
} as User;
const users = [user, { id: 'report-a', fullName: 'Real Report', reportsToId: user.id }, { id: 'nested-a', fullName: 'Nested Report', reportsToId: 'report-a' }, { id: 'other', fullName: 'Sam Smith' }];
const orders = [
  { id: 'own', brandCode: 'FORYA', createdById: user.id, orderDateAd: '2026-10-20', items: [{ productId: 'p1' }], customerPhone: '9800000001' },
  { id: 'other', brandCode: 'FORYA', createdById: 'other', orderDateAd: '2026-10-21', items: [{ productId: 'p1' }], customerPhone: '9800000002' },
  { id: 'other-brand', brandCode: 'RENEE', createdById: user.id, orderDateAd: '2026-10-20', items: [], customerPhone: '9800000003' },
  { id: 'marketing', brandCode: 'FORYA', createdById: user.id, isMarketing: true, orderDateAd: '2026-10-20', items: [] },
  { id: 'outside-date', brandCode: 'FORYA', createdById: user.id, orderDateAd: '2025-10-20', items: [] },
];
const database = {
  getUsers: () => users,
  getOrders: () => orders,
  getProducts: () => [{ id: 'p1', name: 'Product name', sku: 'INTERNALSKU', category: 'Hygiene', brandCode: 'FORYA', purchaseCost: 15, margin: 80 }],
  getDeliveryFailures: () => [{ id: 'failure-1', brandCode: 'FORYA', dateAd: '2026-10-20', dateBs: '', customerName: 'Customer Private', customerPhone: '9841234567', valley: 'Inside', reason: 'Call not received', remarks: 'Private internal note' }],
  getReturns: () => [{ id: 'return-1', productId: 'p1', productName: 'Product name', brandCode: 'FORYA', dateAd: '2026-10-20', dateBs: '', customerName: 'Customer Private', customerPhone: '9841234567', reasonCategory: 'Damage', orderStatus: 'Returned', evidenceUrl: 'private-document' }],
} as unknown as DatabaseService;
const link = {
  id: 'link-1', token: `bb_${'a'.repeat(64)}`, name: 'Agency', createdById: 'admin',
  isActive: true, brandScope: ['FORYA'], brandFilter: ['FORYA'],
  allowedPages: ['dashboard', 'products', 'delivery-failures', 'returns'],
  dateRangeType: 'FIXED', dateFrom: '2026-10-01', dateTo: '2026-10-31',
  showCustomerDetails: false, showProductNames: true, showOrderRows: true,
  passcode: 'never-return-this-passcode', accessCount: 9,
} as SharedAccessLink;

test('request parsing rejects non-object payloads and invalid positive numbers', async () => {
  await assert.rejects(readBody(new Request('https://example.test', { method: 'POST', body: '[]' })), ApiInputError);
  for (const value of [null, false, '', ' ', NaN, Infinity, -1, 0, 'not-a-number']) assert.throws(() => positiveNumber(value, 'quantity'), ApiInputError);
  assert.throws(() => positiveNumber(1.5, 'quantity', true), ApiInputError);
  assert.equal(positiveNumber('2', 'quantity', true), 2);
  assert.equal(dateAd('2028-02-29', 'date'), '2028-02-29');
  for (const value of ['2026-02-29', '2026-13-01', '2026-10-32', '26-10-01', null, true]) assert.throws(() => dateAd(value, 'date'), ApiInputError);
});

test('API errors preserve storage conflict and unavailability status without successful acknowledgement', async () => {
  const conflict = Object.assign(new Error('A newer version already exists.'), { status: 409 });
  const response = apiFailure(conflict, 'fallback');
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { success: false, error: conflict.message });
  assert.equal(apiFailure(Object.assign(new Error('Storage unavailable.'), { status: 503 }), 'fallback').status, 503);
  assert.equal(apiFailure(new SyntaxError('Malformed JSON'), 'fallback').status, 400);
});

test('server scopes use actual IDs and recursive reports without matching names', () => {
  assert.deepEqual([...scopeOfficerIds(database, user, 'tasks')!].sort(), ['nested-a', 'officer-a', 'report-a']);
  assert.equal(ownsRecord({ assignedTo: 'other', assignedToName: 'Sam Smith' }, new Set([user.id])), false);
  assert.deepEqual(visibleOrders(database, user).map(order => order.id), ['own', 'marketing', 'outside-date']);
});

test('public share projection enforces brand/date filters and exposes no token, passcode, customer PII, costs, or internal notes', () => {
  const data = projectSharedPortal(database, link);
  assert.equal(data.summary?.totalOrders, 2);
  assert.equal(data.products?.[0].orderCount, 2);
  assert.equal(data.deliveryFailures?.[0].customerName, 'Hidden');
  assert.equal(data.returns?.[0].customerPhone, 'Hidden');
  const serialized = JSON.stringify(data);
  for (const secret of [link.token, link.passcode!, 'Customer Private', '9841234567', 'Private internal note', 'private-document', 'purchaseCost', 'margin', 'accessCount', 'createdById']) assert.equal(serialized.includes(secret), false, secret);
});

test('public share respects each module, row visibility, product-name visibility and customer masking flags', () => {
  const onlyProducts = projectSharedPortal(database, { ...link, allowedPages: ['products'], showProductNames: false });
  assert.deepEqual(onlyProducts.link.allowedPages, ['products']);
  assert.equal(onlyProducts.summary, undefined);
  assert.equal(onlyProducts.deliveryFailures, undefined);
  assert.equal(onlyProducts.returns, undefined);
  assert.equal(onlyProducts.products?.[0].name, 'Hidden product');
  assert.equal(onlyProducts.products?.[0].sku, 'Hidden');
  const noRows = projectSharedPortal(database, { ...link, showOrderRows: false });
  assert.deepEqual(noRows.deliveryFailures, []);
  assert.deepEqual(noRows.returns, []);
  const masked = projectSharedPortal(database, { ...link, showCustomerDetails: true });
  assert.equal(masked.deliveryFailures?.[0].customerName, 'C*** P***');
  assert.equal(masked.deliveryFailures?.[0].customerPhone, '98******67');
});

test('shared access rejects revoked, expired, malformed dates, empty brands and unsupported module links', () => {
  assert.throws(() => validateSharedLink(undefined));
  assert.throws(() => validateSharedLink({ ...link, isActive: false }));
  assert.throws(() => validateSharedLink({ ...link, expiresAt: '2020-01-01' }), { status: 410 });
  assert.throws(() => validateSharedLink({ ...link, expiresAt: 'invalid' }), { status: 410 });
  assert.throws(() => validateSharedLink({ ...link, dateFrom: '2026-12-01', dateTo: '2026-01-01' }));
  assert.throws(() => validateSharedLink({ ...link, dateFrom: '2026-02-30' }));
  assert.throws(() => projectSharedPortal(database, { ...link, brandScope: [] }));
  assert.throws(() => projectSharedPortal(database, { ...link, allowedPages: ['CUSTOMER_360'] }));
  assert.throws(() => projectSharedPortal(database, { ...link, allowedPages: ['DAILY_ORDER_COUNTS'] }));
});

// Load the real route source with boundary services stubbed; persistence itself has separate tests.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as nextServer from 'next/server';
import * as permissions from '../src/lib/permissions.ts';
import * as calendar from '../src/lib/nepali-calendar.ts';
import * as routeHelpers from '../src/app/api/_workspace.ts';
import * as sharedProjection from '../src/app/api/shared/[token]/projection.ts';
import * as crypto from 'node:crypto';
import * as gpsValidation from '../src/lib/gps-validation.ts';
function loadGpsServer(storage: unknown) {
  const source = readFileSync(new URL('../src/lib/gps-server.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const routeModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name: string) => {
    if (name === './db/supabase-server') return { supabaseAdmin: storage };
    throw new Error(`Unexpected GPS dependency: ${name}`);
  }, routeModule, routeModule.exports);
  return routeModule.exports;
}

function loadHandlerRoute(route: string, workspace: Record<string, unknown>, storage?: Record<string, unknown>, authUser: User = user) {
  const source = readFileSync(new URL(`../src/app/api/${route}/route.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const routeModule = { exports: {} as Record<string, (...args: any[]) => Promise<Response>> };
  const dependencies: Record<string, unknown> = {
    'next/server': nextServer,
    'node:crypto': crypto,
    './projection': sharedProjection,
    '@/lib/auth-guard': { requireAuth: async () => ({ user: authUser }), requireFeatureAccess: async () => ({ user: authUser }) },
    '@/lib/db/server-workspace': { openServerWorkspace: async () => workspace, openSystemWorkspace: async () => workspace,
      readSharedAccessLink: async (token: string) => (workspace.db as any).getSharedAccessByToken(token), recordSharedAccess: async () => {} },
    '@/lib/db/supabase-server': { supabaseAdmin: storage },
    '@/lib/permissions': permissions,
    '@/lib/gps-validation': gpsValidation,
    '@/lib/gps-server': loadGpsServer(storage),
    '@/lib/nepali-calendar': calendar,
    '../_workspace': routeHelpers,
    '../../_workspace': routeHelpers,
  };
  const requireDependency = (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected route dependency: ${name}`);
    return dependencies[name];
  };
  new Function('require', 'module', 'exports', compiled)(requireDependency, routeModule, routeModule.exports);
  return routeModule.exports;
}

function taskRequest(body: Record<string, unknown>) {
  return new Request('https://example.test/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('GPS save retries concurrent insert/update races and refuses acknowledgement after exhausted retries', async () => {
  let reads = 0;
  let inserts = 0;
  let updates = 0;
  const previousAt = '2026-10-29T10:00:00.000Z';
  const fix = { lat: 27.7, lng: 85.3, capturedAt: '2026-10-29T10:01:00.000Z' };
  const storage = { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ++reads === 1 ? null : { created_at: previousAt }, error: null }) }) }),
    insert: () => ({ select: async () => { inserts++; return { data: null, error: { code: '23505' } }; } }),
    update: () => ({ eq: () => ({ eq: () => ({ select: async () => { updates++; return { data: updates === 1 ? [] : [{ id: 'ping', created_at: fix.capturedAt }], error: null }; } }) }) }),
  }) };
  const gps = loadGpsServer(storage) as { saveTrustedGps: (...args: any[]) => Promise<{ saved: boolean }> };
  assert.equal((await gps.saveTrustedGps(user, fix, 'IN_TRANSIT')).saved, true);
  assert.equal(reads, 3); assert.equal(inserts, 1); assert.equal(updates, 2);
  const alwaysRacing = { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { created_at: previousAt }, error: null }) }) }),
    update: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }),
  }) };
  const retryGps = loadGpsServer(alwaysRacing) as typeof gps;
  await assert.rejects(retryGps.saveTrustedGps(user, fix, 'IN_TRANSIT'), { status: 503 });
});

test('task POST rejects nonexistent, inactive and out-of-scope assignees without substituting the caller', async () => {
  let writes = 0;
  const db = { ...database, getUsers: () => [...users, { id: 'inactive', active: false }], addTask: () => { writes++; } };
  const route = loadHandlerRoute('tasks', { db, commit: async () => { writes++; } });
  for (const [assignedTo, status] of [['missing-user', 400], ['inactive', 400], ['other', 404]] as const) {
    const response = await route.POST(taskRequest({ title: 'Real task', assignedTo }));
    assert.equal(response.status, status);
    assert.equal((await response.json()).success, false);
  }
  assert.equal(writes, 0);
});

test('task POST waits for durable commit and returns storage failure instead of success', async () => {
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let commitStarted = false;
  let committedTask: Record<string, any> | undefined;
  const db = { ...database, addTask: (task: Record<string, any>) => { committedTask = task; return { ...task, id: 'task-new' }; } };
  const route = loadHandlerRoute('tasks', { db, commit: async () => { commitStarted = true; await barrier; throw Object.assign(new Error('Storage unavailable.'), { status: 503 }); } });
  let settled = false;
  const responsePromise = route.POST(taskRequest({ title: 'Real task', assignedTo: 'report-a', assignedToName: 'Forged name' })).then(response => { settled = true; return response; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(commitStarted, true);
  assert.equal(settled, false);
  assert.equal(committedTask?.assignedTo, 'report-a');
  assert.equal(committedTask?.assignedToName, 'Real Report');
  release();
  const response = await responsePromise;
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { success: false, error: 'Storage unavailable.' });
});

test('task GET never includes another officer because their display name matches', async () => {
  const ownUser = { ...user, customPermissions: { tasks: { access: 'FULL', scope: 'OWN', actions: ['VIEW'] } } } as User;
  const db = { ...database, getTasks: () => [{ id: 'mine', assignedTo: user.id }, { id: 'someone-else', assignedTo: 'other', assignedToName: user.fullName }] };
  const route = loadHandlerRoute('tasks', { db }, undefined, ownUser);
  const response = await route.GET(new Request('https://example.test/api/tasks'));
  assert.deepEqual((await response.json()).data.map((task: any) => task.id), ['mine']);
});

test('GPS GET returns a current location for every actual active officer beyond 500 staff', async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  try {
    const staff = Array.from({ length: 1001 }, (_, index) => ({ id: `staff-${index}`, active: true }));
    let queries = 0;
    const storage = { from: (table: string) => {
      assert.equal(table, 'gps_pings');
      return { select: () => ({ in: (key: string, ids: string[]) => {
        assert.equal(key, 'officer_id');
        assert.ok(ids.length <= 500);
        queries++;
        return { order: async () => ({ data: ids.map(id => ({ officer_id: id, lat: 27.7, lng: 85.3, created_at: '2026-10-26T00:00:00Z' })), error: null }) };
      } }) };
    } };
    const superAdmin = { ...user, isSuperAdmin: true };
    const route = loadHandlerRoute('gps/ping', { db: { getUsers: () => staff } }, storage, superAdmin);
    const response = await route.GET(new Request('https://example.test/api/gps/ping'));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.length, 1001);
    assert.equal(new Set(body.data.map((ping: any) => ping.officer_id)).size, 1001);
    assert.equal(queries, 3);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test('shared GET authenticates passcodes on the server and never sends secrets before or after unlock', async () => {
  let reads = 0;
  const route = loadHandlerRoute('shared/[token]', { db: { ...database, getSharedAccessByToken: (token: string) => { reads++; return token === link.token ? link : undefined; } } });
  const context = { params: Promise.resolve({ token: link.token }) };
  const locked = await route.GET(new Request('https://example.test/api/shared/token'), context);
  assert.equal(locked.status, 401);
  const lockedBody = await locked.json();
  assert.equal(lockedBody.requiresPasscode, true);
  assert.equal(lockedBody.data, undefined);
  assert.equal(JSON.stringify(lockedBody).includes(link.passcode!), false);
  const unlocked = await route.GET(new Request('https://example.test/api/shared/token', { headers: { 'x-shared-passcode': link.passcode! } }), context);
  assert.equal(unlocked.status, 200);
  assert.match(unlocked.headers.get('Cache-Control') || '', /no-store/);
  const result = await unlocked.json();
  assert.equal(result.success, true);
  for (const secret of [link.token, link.passcode!, '9841234567']) assert.equal(JSON.stringify(result).includes(secret), false);
  const badToken = await route.GET(new Request('https://example.test/api/shared/weak'), { params: Promise.resolve({ token: 'bb_weak' }) });
  assert.equal(badToken.status, 404);
  assert.equal(reads, 2);
});

test('GPS POST writes only the authenticated officer, rejects null coordinates and updates current position', async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  try {
    const saved: Record<string, any>[] = [];
    const storage = { from: (table: string) => {
      assert.equal(table, 'gps_pings');
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: (row: Record<string, any>) => {
          saved.push(row);
          return { select: async () => ({ data: [{ id: 'ping-id', created_at: row.created_at }], error: null }) };
        },
      };
    } };
    const route = loadHandlerRoute('gps/ping', {}, storage, { ...user, isSuperAdmin: true });
    const request = (body: Record<string, unknown>) => new Request('https://example.test/api/gps/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const invalid = await route.POST(request({ lat: null, lng: 85.3 }));
    assert.equal(invalid.status, 400);
    assert.equal(saved.length, 0);
    const changedAccount = await route.POST(request({ officerId: 'spoofed-other-user', lat: 27.7, lng: 85.3 }));
    assert.equal(changedAccount.status, 409);
    assert.equal(saved.length, 0);
    const valid = await route.POST(request({ officerId: user.id, officer_name: 'Forged name', lat: 27.7, lng: 85.3, batteryLevel: 0 }));
    assert.equal(valid.status, 200);
    assert.equal(saved[0].officer_id, user.id);
    assert.equal(saved[0].officer_name, user.fullName);
    assert.equal(saved[0].battery_level, 0);
    assert.ok(Number.isFinite(Date.parse(saved[0].created_at)));
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});
