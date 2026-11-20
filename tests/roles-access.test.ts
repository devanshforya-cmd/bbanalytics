import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PAGES, OPEN_PATHS, pageForPath, pageForSettingsTab } from '../src/lib/access-catalog.ts';
import { canPerform, canSeeSensitive, firstAllowedPath, getScope, hasAccess } from '../src/lib/permissions.ts';
import { diffAccess, normalizePagePermission, pagesFromFeatures, resolveAccess } from '../src/lib/roles.ts';
import { HIDDEN_TEXT, maskPhone, redactRecord, restoreRedacted } from '../src/lib/sensitive-data.ts';
import { canReadWorkspaceRecord, canWriteWorkspaceRecord } from '../src/lib/db/workspace-policy.ts';
import { STARTER_ROLES } from '../src/lib/starter-roles.ts';

const person = (access: Record<string, any>, overrides: Record<string, any> = {}, extra: Record<string, any> = {}) =>
  ({ id: 'staff', fullName: 'Staff', email: '', phone: '', role: 'STAFF', assignedBrands: ['ALL'], customPermissions: resolveAccess(access, overrides, { id: 'role_x', name: 'Desk' }), ...extra }) as any;
const view: any = { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] };
const full = (scope = 'ALL'): any => ({ access: 'FULL', scope, actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] });

test('every app page belongs to exactly one permission', () => {
  const routes: string[] = [];
  const walk = (dir: string, route: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { if (!name.startsWith('(') && name !== 'api') walk(path, `${route}/${name}`); }
      else if (name === 'page.tsx') routes.push(route || '/');
    }
  };
  walk('src/app', '');
  const exempt = ['/', '/login', '/shared/[token]', '/about', '/privacy', '/terms', '/settings', ...OPEN_PATHS];
  const missing = routes.filter((route) => !exempt.includes(route) && !route.startsWith('/zz-') && !pageForPath(route.replace(/\[[^\]]+\]/g, 'x')));
  assert.deepEqual(missing, []);
  for (const tab of ['BRANDS', 'CHANNELS', 'LISTS', 'PROMOTIONS', 'SHARED_ACCESS', 'RULES', 'FIELD_SALES', 'HOLIDAYS', 'TEMPLATES', 'GOOGLE', 'IMPORT', 'UPGRADE', 'FEATURE_FLAGS']) assert.ok(pageForSettingsTab(tab), tab);
  assert.equal(pageForSettingsTab('STAFF'), undefined, 'Staff & roles is never grantable');
});

test('nothing is granted unless it is written on the person', () => {
  const desk = person({ 'p.orders_all': view });
  assert.equal(hasAccess(desk, 'p.orders_all'), true);
  assert.equal(hasAccess(desk, 'p.orders_extractor'), false);
  assert.equal(hasAccess(desk, 'p.dashboard'), false);
  assert.equal(hasAccess(desk, 'dashboard'), false);
  assert.equal(hasAccess(desk, 'settings'), false);
  // Job titles grant nothing on their own any more.
  assert.equal(hasAccess({ id: 'x', role: 'ADMIN' } as any, 'dashboard'), false);
  assert.equal(firstAllowedPath(desk), '/orderflow/orders');
  assert.equal(firstAllowedPath(person({})), '/no-access');
});

test('All orders can be hidden or shown on its own, apart from the rest of OrderFlow', () => {
  const extractorOnly = person({ 'p.orders_extractor': full() });
  assert.equal(hasAccess(extractorOnly, 'p.orders_all'), false);
  assert.equal(hasAccess(extractorOnly, 'p.orders_extractor'), true);
  const allOrdersOnly = person({ 'p.orders_all': view });
  assert.equal(hasAccess(allOrdersOnly, 'p.orders_monthly'), false);
  assert.equal(hasAccess(allOrdersOnly, 'order_desk'), true, 'server data rules still see the Order Desk');
  assert.equal(canPerform(allOrdersOnly, 'order_desk', 'EDIT'), false);
});

test('a feature is granted at the widest level among its pages', () => {
  const user = person({ 'p.orders_manual': { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] }, 'p.orders_daily': view });
  assert.equal(canPerform(user, 'orderflow', 'CREATE'), true);
  assert.equal(getScope(user, 'orderflow'), 'ALL');
  assert.equal(canPerform(user, 'p.orders_daily', 'EDIT'), false);
});

test('one-off changes sit on top of the role and survive a role change', () => {
  const role = { 'p.feedback': full(), 'p.returns': full() };
  const mine = { ...role, 'p.returns': normalizePagePermission('p.returns', null), 'p.customers': view };
  const overrides = diffAccess(role, mine);
  assert.deepEqual(Object.keys(overrides).sort(), ['p.customers', 'p.returns', 's.customers'].filter((key) => key in overrides).sort());
  const user = person(role, overrides);
  assert.equal(hasAccess(user, 'p.returns'), false);
  assert.equal(hasAccess(user, 'p.feedback'), true);
  // The role later gains Issue categories: the person gets it, and keeps their own changes.
  const after = resolveAccess({ ...role, 'p.issue_categories': view }, (user.customPermissions as any)._overrides, { id: 'role_x', name: 'Desk' });
  const updated = { ...user, customPermissions: after };
  assert.equal(hasAccess(updated, 'p.issue_categories'), true);
  assert.equal(hasAccess(updated, 'p.returns'), false);
});

test('pages that take orders bring the money and customer details they need', () => {
  const taker = person({ 'p.orders_extractor': { access: 'VIEW_EDIT', scope: 'OWN', actions: ['VIEW', 'CREATE'] } });
  assert.equal(canSeeSensitive(taker, 's.money'), true);
  assert.equal(canSeeSensitive(taker, 's.customers'), true);
  assert.equal(canSeeSensitive(taker, 's.influencers'), false);
  const viewer = person({ 'p.orders_all': view });
  assert.equal(canSeeSensitive(viewer, 's.money'), false);
});

test('money, customer and influencer details are blanked and put back on save', () => {
  const viewer = person({ 'p.orders_all': { access: 'VIEW_EDIT', scope: 'ALL', actions: ['VIEW', 'EDIT'] } });
  const order = { id: 'o1', customerPhone: '9841234567', address: 'Thamel', totalAmount: 1500, items: [{ productId: 'p1', quantity: 2, unitPrice: 750, totalPrice: 1500 }], status: 'PENDING' };
  const shown = redactRecord('orders', order, viewer);
  assert.equal(shown.totalAmount, 0);
  assert.equal(shown.items[0].unitPrice, 0);
  assert.equal(shown.customerPhone, maskPhone('9841234567'));
  assert.equal(shown.customerPhone.endsWith('567'), true);
  assert.equal(shown.address, HIDDEN_TEXT);
  assert.equal(order.totalAmount, 1500, 'the stored record is untouched');
  // They mark it delivered: the blanked values never overwrite the real ones.
  const saved = restoreRedacted('orders', { ...shown, status: 'DELIVERED' }, order, viewer);
  assert.equal(saved.status, 'DELIVERED');
  assert.equal(saved.totalAmount, 1500);
  assert.equal(saved.items[0].unitPrice, 750);
  assert.equal(saved.customerPhone, '9841234567');
  assert.equal(saved.address, 'Thamel');
  assert.equal('_hidden' in saved, false);
  const owner = { id: 'boss', isSuperAdmin: true } as any;
  assert.equal(redactRecord('orders', order, owner).totalAmount, 1500);
  const influencer = redactRecord('influencers', { id: 'i1', phone: '9800000001', email: 'a@b.c', address: 'Lalitpur' }, viewer);
  assert.equal(influencer.email, HIDDEN_TEXT);
});

test('server data rules read Settings tabs and Sales & offers separately', () => {
  const holidays = person({ 'p.settings_holidays': full() });
  const row = (collection: string) => ({ collection, id: 'r', data: { id: 'r' }, created_by: 'someone', version: 1 }) as any;
  assert.equal(canWriteWorkspaceRecord(holidays, row('holidays'), 'EDIT', [holidays], []), true);
  assert.equal(canWriteWorkspaceRecord(holidays, row('taskTemplates'), 'EDIT', [holidays], []), false);
  assert.equal(canWriteWorkspaceRecord(holidays, row('campaigns'), 'EDIT', [holidays], []), false);
  const sales = person({ 'p.sales_offers': full() });
  assert.equal(canReadWorkspaceRecord(sales, row('campaigns'), [sales], []), true);
});

test('starter roles keep what the older templates gave, page by page', () => {
  const office = STARTER_ROLES.find((role) => role.name === 'Office staff')!;
  const user = person(office.permissions);
  assert.equal(hasAccess(user, 'p.orders_all'), true);
  assert.equal(hasAccess(user, 'p.cheques'), true);
  assert.equal(hasAccess(user, 'p.beat_plan'), false);
  assert.equal(hasAccess(user, 'p.settings_brands'), false);
  const viewer = person(STARTER_ROLES.find((role) => role.name === 'Viewer')!.permissions);
  assert.equal(canPerform(viewer, 'p.stores', 'EDIT'), false);
  assert.equal(canSeeSensitive(viewer, 's.money'), false);
  assert.ok(Object.keys(pagesFromFeatures({ orderflow: full() } as any)).length >= 6);
});
