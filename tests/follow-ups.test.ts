import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFollowUps, DEFAULT_FOLLOW_UP_PLAN, validateFollowUpPlan, addDays } from '../src/lib/follow-ups.ts';
import { FakeDatabase } from './fake-supabase.ts';
import { setTestDatabaseClient } from '../src/lib/db/supabase-server.ts';
import { saveWorkspaceMutation } from '../src/lib/db/server-workspace.ts';

const plan = { ...DEFAULT_FOLLOW_UP_PLAN, startFromAd: '2026-11-01' }; // calls on day 3, 10 and 25 after the order
const order = (id: string, extra: any = {}): any => ({ id, orderNumber: `FY-${id}`, brandCode: 'FORYA', orderDateAd: '2026-11-10', customerName: `Customer ${id}`, customerPhone: '9841000001', status: 'PENDING', items: [{ productName: 'Roll-on', quantity: 1 }], ...extra });
let n = 0;
const call = (orderId: string, stepId: string, outcome: string, dateAd: string, extra: any = {}): any => ({ id: `c${++n}`, orderId, followUpStepId: stepId, outcome, dateAd, createdAt: `${dateAd}T0${n % 10}:00:00Z`, customerPhone: '9841000001', customerName: 'x', purpose: 'Follow-up', officerId: 'u', officerName: 'U', dateBs: '', ...extra });
const at = (items: any[], stepId: string) => items.find((item) => item.step.id === stepId);

test('calls fall due on the planned days, one at a time', () => {
  const before = buildFollowUps([order('1')], [], plan, '2026-11-12');
  assert.equal(at(before, 'fu_check').status, 'UPCOMING');
  assert.equal(at(before, 'fu_check').dueAd, '2026-11-13');
  assert.equal(at(before, 'fu_feedback').status, 'QUEUED');
  const late = buildFollowUps([order('1')], [], plan, '2026-11-21');
  assert.equal(at(late, 'fu_check').status, 'DUE');
  assert.equal(at(late, 'fu_check').overdueDays, 8);
  assert.equal(at(late, 'fu_feedback').status, 'QUEUED', 'the next call waits for the earlier one');
  const done = buildFollowUps([order('1')], [call('1', 'fu_check', 'HAPPY', '2026-11-13')], plan, '2026-11-21');
  assert.equal(at(done, 'fu_check').status, 'DONE');
  assert.equal(at(done, 'fu_feedback').status, 'DUE');
});

test('unanswered calls come back next day until the tries run out; call-backs move the date', () => {
  const once = buildFollowUps([order('1')], [call('1', 'fu_check', 'NO_ANSWER', '2026-11-13')], plan, '2026-11-13');
  assert.equal(at(once, 'fu_check').status, 'UPCOMING');
  assert.equal(at(once, 'fu_check').dueAd, '2026-11-14');
  assert.equal(at(once, 'fu_check').tries, 1);
  const three = buildFollowUps([order('1')], ['2026-11-13', '2026-11-14', '2026-11-15'].map((d) => call('1', 'fu_check', 'NO_ANSWER', d)), plan, '2026-11-16');
  assert.equal(at(three, 'fu_check').status, 'NOT_REACHED');
  assert.equal(at(three, 'fu_feedback').status, 'UPCOMING', 'the next call still happens');
  const back = buildFollowUps([order('1')], [call('1', 'fu_check', 'CALL_BACK', '2026-11-13', { callbackDateAd: '2026-11-18' })], plan, '2026-11-16');
  assert.equal(at(back, 'fu_check').dueAd, '2026-11-18');
  assert.equal(at(back, 'fu_check').tries, 0);
});

test('wrong number stops the order; do-not-call stops the customer everywhere', () => {
  const wrong = buildFollowUps([order('1'), order('2', { customerPhone: '9800000002' })], [call('1', 'fu_check', 'WRONG_NUMBER', '2026-11-13')], plan, '2026-12-30');
  assert.ok(wrong.filter((i) => i.order.id === '1').every((i) => i.status === 'STOPPED'));
  assert.ok(wrong.some((i) => i.order.id === '2' && i.status === 'DUE'));
  const dnc = buildFollowUps([order('1'), order('3', { orderDateAd: '2026-11-20' })], [call('1', 'fu_check', 'DO_NOT_CALL', '2026-11-13')], plan, '2026-12-30');
  assert.ok(dnc.filter((i) => i.order.id === '3').every((i) => i.status === 'STOPPED'), 'same phone, other order');
});

test('who gets follow-ups, and changing the plan applies straight away', () => {
  const skipped = [order('a', { status: 'CANCELLED' }), order('b', { isMarketing: true }), order('c', { orderDateAd: '2026-10-01' }), order('d', { brandCode: 'TEORA' })];
  assert.equal(buildFollowUps(skipped, [], { ...plan, brandCodes: ['FORYA'] }, '2026-12-30').length, 0);
  const delivery = { ...plan, steps: [{ id: 'after', label: 'After delivery', daysAfter: 2, from: 'DELIVERY' as const }] };
  assert.equal(buildFollowUps([order('1')], [], delivery, '2026-12-30')[0].status, 'WAITING_DELIVERY');
  assert.equal(buildFollowUps([order('1', { deliveredDateAd: '2026-11-15' })], [], delivery, '2026-12-30')[0].dueAd, '2026-11-17');
  const five = { ...plan, steps: [1, 2, 3, 4, 5].map((d) => ({ id: `s${d}`, label: `Call ${d}`, daysAfter: d, from: 'ORDER' as const })) };
  assert.equal(buildFollowUps([order('1')], [], five, '2026-12-30').length, 5);
  assert.equal(buildFollowUps([order('1')], [], { ...plan, enabled: false }, '2026-12-30').length, 0);
});

test('the plan is checked before it is saved', () => {
  assert.throws(() => validateFollowUpPlan({ ...plan, steps: [{ id: 'x', label: '', daysAfter: 1, from: 'ORDER' }] }), /name/);
  assert.throws(() => validateFollowUpPlan({ ...plan, steps: [{ id: 'x', label: 'A', daysAfter: -1, from: 'ORDER' }] }), /days/);
  assert.throws(() => validateFollowUpPlan({ ...plan, maxTries: 0 }), /Tries/);
  assert.equal(validateFollowUpPlan({ ...plan, brandCodes: ['forya', 'forya'] }).brandCodes.join(), 'FORYA');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});

const admin: any = { id: 'admin', fullName: 'Devansh', role: 'SUPER_ADMIN', isSuperAdmin: true, active: true, assignedBrands: ['ALL'], permissions: {}, customPermissions: {} };
const caller: any = { id: 'caller', fullName: 'Sita', role: 'CUSTOM', active: true, assignedBrands: ['ALL'], permissions: {},
  customPermissions: { customer_calls: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] }, 'p.follow_ups': { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] }, 's.customers': { access: 'VIEW_ONLY', scope: null, actions: ['VIEW'] } } };
const userRow = (u: any) => ({ id: u.id, full_name: u.fullName, role: u.role, is_super_admin: !!u.isSuperAdmin, is_active: true, assigned_brands: u.assignedBrands, custom_permissions: u.customPermissions, permissions: {} });
const mutation = (collection: string, data: any) => ({ collection, id: data.id, operation: 'upsert' as const, data, expectedVersion: 0, mutationId: `m_${Math.random().toString(36).slice(2)}` });

test('the server keeps calls honest: caller, order number and brand come from the server', async () => {
  const db = new FakeDatabase();
  db.tables.users = [admin, caller].map(userRow);
  db.tables.brands = [{ id: 'b1', code: 'FORYA', name: 'Forya', is_active: true }];
  db.seed('orders', { ...order('o1'), orderNumber: 'FY-100' });
  setTestDatabaseClient(db as any);
  await saveWorkspaceMutation(caller, mutation('customerCalls', { id: 'cc1', orderId: 'o1', orderNumber: 'FAKE', brandCode: 'TEORA', officerId: 'admin', customerName: 'Customer o1', customerPhone: '9841000001',
    purpose: 'Follow-up', followUpStepId: 'fu_check', followUpStepLabel: 'Delivery check', outcome: 'HAPPY', dateAd: '2026-11-22', dateBs: '', createdAt: '2026-11-22T05:00:00Z' }));
  const saved = db.records('customerCalls')[0].data;
  assert.equal(saved.officerId, 'caller');
  assert.equal(saved.officerName, 'Sita');
  assert.equal(saved.orderNumber, 'FY-100');
  assert.equal(saved.brandCode, 'FORYA');
  await assert.rejects(saveWorkspaceMutation(caller, mutation('customerCalls', { id: 'cc2', customerName: 'A', customerPhone: '1', purpose: 'Follow-up', outcome: 'MAYBE', dateAd: '2026-11-22' })), /how the call went/);
  await assert.rejects(saveWorkspaceMutation(caller, mutation('customerCalls', { id: 'cc3', customerName: 'A', customerPhone: '1', purpose: 'Other', outcome: 'CALL_BACK', dateAd: '2026-11-22' })), /call back/);
  await assert.rejects(saveWorkspaceMutation(caller, mutation('workspaceConfig', { id: 'workspace', followUpPlan: plan })));
  await saveWorkspaceMutation(admin, mutation('workspaceConfig', { id: 'workspace', followUpPlan: { ...plan, maxTries: 5 } }));
  assert.equal(db.records('workspaceConfig')[0].data.followUpPlan.maxTries, 5);
  await assert.rejects(saveWorkspaceMutation(admin, mutation('workspaceConfig', { id: 'workspace', followUpPlan: { ...plan, maxTries: 99 } }), ), /Tries/);
});
