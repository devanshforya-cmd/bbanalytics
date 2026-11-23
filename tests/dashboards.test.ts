import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPrefs, cleanTemplates, defaultTemplates, DEFAULTS_VERSION, fromTemplate, templateFor, TEMPLATES, newId, withDefaults } from '../src/lib/metrics/dashboards.ts';
import { computeWidget } from '../src/lib/metrics/widget-data.ts';
import { prepare, type MetricData } from '../src/lib/metrics/sources.ts';
import { DEFAULT_FOLLOW_UP_PLAN } from '../src/lib/follow-ups.ts';
import { metricByKey } from '../src/lib/metrics/catalog.ts';
import { FakeDatabase } from './fake-supabase.ts';
import { setTestDatabaseClient } from '../src/lib/db/supabase-server.ts';
import { saveWorkspaceMutation } from '../src/lib/db/server-workspace.ts';

const admin: any = { id: 'admin', fullName: 'Devansh', role: 'SUPER_ADMIN', isSuperAdmin: true, active: true, assignedBrands: ['ALL'], permissions: {}, customPermissions: {} };
const officer: any = { id: 'o', fullName: 'Rajan', role: 'CUSTOM', active: true, assignedBrands: ['ALL'], permissions: {}, customPermissions: { _v: 2, dashboard: { access: 'VIEW_ONLY', scope: 'OWN', actions: ['VIEW'] }, beat_plans: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE'] } } };
const desk: any = { id: 'd', fullName: 'Sita', role: 'CUSTOM', active: true, assignedBrands: ['ALL'], permissions: {}, customPermissions: { _v: 2, dashboard: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] }, orderflow: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] }, 's.money': { access: 'VIEW_ONLY', scope: null, actions: ['VIEW'] } } };

test('every ready-made dashboard is valid and only uses numbers that exist', () => {
  for (const t of TEMPLATES) {
    const d = fromTemplate(t.key, admin);
    assert.ok(d.widgets.length >= 8, `${t.key} has enough charts`);
    assert.doesNotThrow(() => cleanPrefs({ list: [d], activeId: d.id }), t.key);
    for (const w of t.widgets) {
      if (typeof w.metric === 'string') assert.ok(metricByKey(w.metric), `${t.key}: ${w.metric}`);
      for (const c of w.columns || []) assert.ok(metricByKey(c), `${t.key}: ${c}`);
    }
  }
});

test('each person starts from the dashboard that fits their job, with only what they may see', () => {
  assert.equal(templateFor(admin), 'online');
  assert.equal(templateFor(officer), 'field_officer');
  assert.equal(templateFor(desk), 'online');
  assert.deepEqual(defaultTemplates(admin), ['online', 'field_manager'], 'Super Admin starts with Online and Offline');
  assert.deepEqual(defaultTemplates(officer), ['field_officer']);
  assert.deepEqual(defaultTemplates(desk), ['online']);
  const mine = fromTemplate('owner', officer);
  assert.ok(mine.widgets.every((w) => typeof w.metric === 'string' && !w.metric.startsWith('online')), 'no online numbers for a field officer');
  assert.ok(!mine.widgets.some((w) => w.metric === 'store_order_value'), 'no money without Money access');
});

test('people who saved dashboards before Online and Offline existed get them once', () => {
  const saved = { list: [{ ...fromTemplate('owner', admin), id: 'dash_old', name: 'Mine' }], activeId: 'dash_old' };
  const upgraded = withDefaults(saved, admin)!;
  assert.deepEqual(upgraded.list.map((d) => d.template), ['owner', 'online', 'field_manager']);
  assert.equal(upgraded.activeId, 'dash_old', 'the open dashboard stays the same');
  assert.equal(upgraded.seeded, DEFAULTS_VERSION);
  assert.equal(withDefaults(cleanPrefs(upgraded), admin), null, 'only once, even after deleting one');
  const deleted = cleanPrefs({ ...upgraded, list: upgraded.list.filter((d) => d.template !== 'online') });
  assert.equal(withDefaults(deleted, admin), null);
});

test('saved dashboards are checked: bad parts are refused or cleaned', () => {
  const base = { id: 'dash_1', name: 'Mine', filters: { range: 'last7', compare: 'off', calendar: 'AD', brand: 'forya' }, widgets: [{ id: 'w_1', metric: 'online_orders', view: 'pie', size: 'XL', where: { brand: ['FORYA', 5], nonsense: ['x'] }, split: 'nope', target: -1 }] };
  const clean = cleanPrefs({ list: [base], activeId: 'missing' });
  assert.equal(clean.activeId, undefined);
  assert.deepEqual(clean.list[0].filters, { range: 'last7', compare: 'off', calendar: 'AD', brand: 'FORYA' });
  assert.deepEqual(clean.list[0].widgets[0], { id: 'w_1', metric: 'online_orders', view: 'number', size: 'S', where: { brand: ['FORYA'] } });
  assert.throws(() => cleanPrefs({ list: [{ ...base, widgets: [{ id: 'w', metric: 'gone', view: 'number', size: 'S' }] }] }), /no longer exists/);
  assert.throws(() => cleanPrefs({ list: [{ ...base, name: ' ' }] }), /name/);
  assert.throws(() => cleanPrefs({ list: Array.from({ length: 13 }, (_, i) => ({ ...base, id: `d${i}` })) }), /12 dashboards/);
  assert.throws(() => cleanPrefs({ list: [{ ...base, widgets: Array.from({ length: 31 }, (_, i) => ({ id: `w${i}`, metric: 'online_orders', view: 'number', size: 'S' })) }] }), /30 charts/);
  const formula = cleanPrefs({ list: [{ ...base, widgets: [{ id: 'w', metric: { a: 'complaints', op: 'percent', b: 'online_orders', label: '' }, view: 'number', size: 'S' }] }] });
  assert.equal((formula.list[0].widgets[0].metric as any).label, 'Complaints ÷ (as %) Online orders');
  assert.throws(() => cleanTemplates([{ id: 'x', name: '', dashboard: base }]), /name/);
});

const empty = (extra: Partial<MetricData> = {}): MetricData => ({ today: '2026-11-22', brands: [], users: [], products: [], orders: [], deliveryFailures: [], returns: [], feedback: [], customers: [], customerCalls: [], followUpPlan: { ...DEFAULT_FOLLOW_UP_PLAN, enabled: false }, storeOrders: [], dispatches: [], cheques: [], visits: [], beatItems: [], stockCounts: [], storeCalls: [], tasks: [], marketingSends: [], distributors: [], branches: [], retailers: [], ...extra });

test('every chart in every template draws on empty and on real-looking data without errors', () => {
  const order = (id: string, d: string, extra: any = {}): any => ({ id, orderNumber: id, brandCode: 'FORYA', orderDateAd: d, customerName: id, customerPhone: `98${id}`, platform: 'TikTok', paymentTerms: 'COD', status: 'DELIVERED', totalAmount: 900, createdAt: `${d}T01:00:00Z`, items: [{ productId: 'p', productName: 'Roll-on', brandCode: 'FORYA', quantity: 1, totalPrice: 900 }], ...extra });
  const full = empty({ orders: [order('1', '2026-11-03'), order('2', '2026-11-20', { status: 'PENDING' }), order('3', '2026-10-20')], brands: [{ code: 'FORYA', name: 'Forya' } as any] });
  for (const data of [empty(), full]) {
    const p = prepare(data);
    for (const t of TEMPLATES) for (const w of fromTemplate(t.key, admin).widgets) {
      for (const range of ['today', 'last30', 'thisMonth', 'lastMonth', 'thisYear', 'custom'] as const) {
        const result = computeWidget(p, w, { range, compare: 'previous', calendar: 'BS', fromAd: '2026-11-01', toAd: '2026-11-22' }, {}, '2026-11-22');
        assert.ok(result.value === null || Number.isFinite(result.value), `${t.key}/${w.metric}`);
      }
    }
  }
  const p = prepare(full);
  const line = computeWidget(p, { id: 'w', metric: 'online_orders', view: 'line', size: 'M', bucket: 'day' }, { range: 'custom', fromAd: '2026-11-01', toAd: '2026-11-22', compare: 'previous', calendar: 'AD' });
  assert.equal(line.buckets.length, 22);
  assert.equal(line.value, 2);
  assert.equal(line.previous, 1, 'the 22 days before');
  const top = computeWidget(p, { id: 'w', metric: 'online_orders', view: 'number', size: 'S' }, { range: 'custom', fromAd: '2026-11-01', toAd: '2026-11-22', compare: 'off', calendar: 'AD' }, { brand: ['TEORA'] });
  assert.equal(top.value, 0, 'the top-bar brand narrows every chart');
});

const userRow = (u: any) => ({ id: u.id, full_name: u.fullName, role: u.role, is_super_admin: !!u.isSuperAdmin, is_active: true, assigned_brands: u.assignedBrands, custom_permissions: u.customPermissions, permissions: {} });
const mutation = (collection: string, data: any) => ({ collection, id: data.id, operation: 'upsert' as const, data, expectedVersion: 0, mutationId: `mutation_${newId('t')}` });

test('the server keeps dashboards per person and only Super Admins share them', async () => {
  const db = new FakeDatabase();
  db.tables.users = [admin, desk].map(userRow);
  setTestDatabaseClient(db as any);
  const mine = fromTemplate('online', desk);
  await saveWorkspaceMutation(desk, mutation('userPreferences', { id: 'd', dashboards: { list: [mine], activeId: mine.id } }));
  assert.equal(db.records('userPreferences')[0].data.dashboards.list[0].widgets.length, mine.widgets.length);
  await assert.rejects(saveWorkspaceMutation(desk, mutation('userPreferences', { id: 'd2', dashboards: { list: [] } })));
  await assert.rejects(saveWorkspaceMutation(desk, { ...mutation('userPreferences', { id: 'd', dashboards: { list: [{ ...mine, widgets: [{ id: 'w', metric: 'gone', view: 'number', size: 'S' }] }] } }), expectedVersion: 1 }), /no longer exists/);
  await assert.rejects(saveWorkspaceMutation(desk, mutation('workspaceConfig', { id: 'workspace', dashboardTemplates: [{ id: 't', name: 'X', dashboard: mine }] })));
  await saveWorkspaceMutation(admin, mutation('workspaceConfig', { id: 'workspace', dashboardTemplates: [{ id: 't', name: 'Online', dashboard: mine }] }));
  assert.equal(db.records('workspaceConfig')[0].data.dashboardTemplates[0].name, 'Online');
});
