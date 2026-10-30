import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultOrderOptions, validateOrderOptions, requiredOrderOptionActions, activeOrderOptionNames, assertActiveOrderOption } from '../src/lib/order-options.ts';
import { DatabaseService, DEFAULT_SUPER_ADMIN } from '../src/lib/db/db-service.ts';
import { canReadWorkspaceRecord, canWriteWorkspaceRecord } from '../src/lib/db/workspace-policy.ts';
import { validateWorkspaceMutation } from '../src/lib/db/server-workspace.ts';
import { validateCsvImport, IMPORT_COLUMNS } from '../src/lib/import-validation.ts';
import { generateCSV } from '../src/lib/csv.ts';

const custom = () => {
  const options = defaultOrderOptions();
  options.channels.push({ id: 'counter', name: 'Partner Counter', active: true });
  options.deliveryMethods.push({ id: 'localvan', name: 'Local Van', active: true });
  return options;
};

test('channel configuration validates duplicates, bounds and the final active option', () => {
  const options = custom();
  assert.deepEqual(validateOrderOptions(options), options);
  assert.throws(() => validateOrderOptions({ ...options, channels: [{ id: 'one', name: 'Shop', active: true }, { id: 'two', name: ' shop ', active: true }] }), /unique/);
  assert.throws(() => validateOrderOptions({ ...options, channels: options.channels.map(row => ({ ...row, active: false })) }), /at least one active/);
  assert.throws(() => validateOrderOptions({ ...options, channels: [{ id: 'x', name: '\n', active: true }] }), /name/);
  const mutation = { collection: 'workspaceConfig', id: 'workspace', operation: 'upsert', data: { id: 'workspace', orderOptions: { channels: [], deliveryMethods: [] } }, mutationId: 'test-option-mutation', expectedVersion: 1 };
  assert.throws(() => validateWorkspaceMutation(mutation), /at least one active/);
});

test('configuration deltas distinguish adding, renaming, restoring and deleting even inside an upsert', () => {
  const before = defaultOrderOptions(); const after = custom();
  assert.deepEqual(requiredOrderOptionActions(before, after), ['CREATE']);
  after.channels[0].name = 'Instagram Store'; after.deliveryMethods[0].active = false;
  assert.deepEqual(new Set(requiredOrderOptionActions(before, after)), new Set(['CREATE', 'EDIT', 'DELETE']));
  assert.deepEqual(requiredOrderOptionActions(after, { ...after, deliveryMethods: after.deliveryMethods.map(row => ({ ...row, active: true })) }), ['EDIT']);
  assert.deepEqual(requiredOrderOptionActions(before, { ...before, channels: before.channels.slice(1) }), ['DELETE']);
});

test('new selections reject archived choices while an unchanged historical order stays editable', () => {
  const options = custom(); options.channels[0].active = false;
  assert.equal(activeOrderOptionNames(options, 'channels').includes('Instagram'), false);
  assert.equal(assertActiveOrderOption(options, 'channels', 'Partner Counter'), 'Partner Counter');
  assert.throws(() => assertActiveOrderOption(options, 'channels', 'Instagram'), /active/);
  assert.equal(assertActiveOrderOption(options, 'channels', 'Instagram', 'Instagram'), 'Instagram');
  assert.equal(activeOrderOptionNames(options, 'channels', 'Old Name')[0], 'Old Name');
});

test('configured lists survive database snapshot/reload without rewriting historical orders', () => {
  const db = new DatabaseService({ server: true });
  const historical: any = { id: 'old', platform: 'Instagram', deliveryMethod: 'Old Courier', items: [], customerName: 'Old Customer', customerPhone: '9800000000' };
  db.hydrateSnapshot({ orders: [historical] }, DEFAULT_SUPER_ADMIN);
  const options = custom(); options.channels[0].name = 'New Instagram Label';
  db.setOrderOptions(options);
  const reloaded = new DatabaseService({ server: true }); reloaded.hydrateSnapshot(db.exportSnapshot(), DEFAULT_SUPER_ADMIN);
  assert.deepEqual(reloaded.getOrderOptions(), options);
  assert.equal(reloaded.getOrders()[0].platform, 'Instagram');
  assert.equal(reloaded.getOrders()[0].deliveryMethod, 'Old Courier');
  reloaded.updateOrder('old', { notes: 'Historical order is editable' });
  assert.throws(() => reloaded.updateOrder('old', { platform: 'Unknown New Channel' }), /active/);
  const returned = reloaded.getOrderOptions(); returned.channels[0].name = 'Tampered copy';
  assert.equal(reloaded.getOrderOptions().channels[0].name, 'New Instagram Label');
});

test('orderflow can read configured choices but cannot write settings without a grant', () => {
  const user: any = { id: 'officer', role: 'SALES_OFFICER', assignedBrands: ['A'], customPermissions: { orderflow: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] }, settings: { access: 'HIDDEN', scope: null, actions: [] } } };
  const row: any = { collection: 'workspaceConfig', id: 'workspace', created_by: 'admin', version: 1, data: { id: 'workspace', orderOptions: custom() } };
  assert.equal(canReadWorkspaceRecord(user, row, [user], [row]), true);
  assert.equal(canWriteWorkspaceRecord(user, row, 'EDIT', [user], [row]), false);
});

test('CSV order imports accept configured custom choices and reject archived names', () => {
  const options = custom();
  const product: any = { id: 'product', name: 'Product', brandCode: 'A', active: true };
  const catalog: any = { brands: [{ id: 'a', code: 'A', isActive: true }], products: [product], orders: [], returns: [], customers: [], dispatches: [], distributors: [], branches: [], orderOptions: options };
  const row: any = { 'Order Number': 'CUSTOM-1', Date: '2026-10-29', 'Customer Name': 'Buyer', Phone: '9800000000', Province: 'Bagmati', District: 'Kathmandu', Address: 'Store', Platform: 'Partner Counter', 'Delivery Method': 'Local Van', 'Payment Terms': 'COD', 'Order Type': 'NEW', Status: 'PENDING', 'Product ID': 'product', Quantity: '1', 'Unit Price': '100', Notes: '' };
  const input: any = { sourceType: 'ORDERS', brandCode: 'A', fileName: 'orders.csv', batchId: 'ba8ad376-5ea7-4d34-a4cb-486de85a90a7', csv: generateCSV(IMPORT_COLUMNS.ORDERS.map(label => ({ key: label, label })), [row]) };
  assert.equal(validateCsvImport(input, catalog, 'Admin').orders?.[0].deliveryMethod, 'Local Van');
  options.deliveryMethods.find(row => row.id === 'localvan')!.active = false;
  assert.throws(() => validateCsvImport(input, catalog, 'Admin'), /Delivery Method must be/);
});
