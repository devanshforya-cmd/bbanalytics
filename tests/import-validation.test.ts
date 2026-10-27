import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_COLUMNS, parseImportCsv, validateCsvImport, type CsvImportInput, type CsvImportType, type ImportCatalog } from '../src/lib/import-validation.ts';
import { generateCSV } from '../src/lib/csv.ts';
import { DatabaseService, DEFAULT_SUPER_ADMIN } from '../src/lib/db/db-service.ts';
import { processCsvImport } from '../src/lib/db/import-service.ts';

const batchId = 'ba8ad376-5ea7-4d34-a4cb-486de85a90a7';
const product = { id: 'product-real', name: 'Actual catalog product', sku: 'REAL-1', brandCode: 'BRAND', active: true, mrp: 200 };
const brand = { id: 'brand-real', code: 'BRAND', name: 'Real brand', isActive: true, status: 'ACTIVE' };
const ordered = { id: 'order-real', orderNumber: 'REAL-101', brandCode: 'BRAND', customerName: 'Existing buyer', customerPhone: '9841111111', platform: 'Website', items: [{ productId: product.id, quantity: 3 }] };
const catalog = (changes: Partial<ImportCatalog> = {}): ImportCatalog => ({ brands: [brand], products: [product], orders: [ordered], returns: [], customers: [], dispatches: [], distributors: [{ id: 'dist-real', name: 'Real distributor', brandsCarried: ['BRAND'] }], branches: [{ id: 'branch-real', name: 'Real branch', distributorId: 'dist-real', brandsAvailable: ['BRAND'] }], ...changes } as ImportCatalog);
const orderRow = (changes: Record<string, string> = {}) => ({ 'Order Number': 'NEW-102', Date: '2026-10-26', 'Customer Name': 'CSV buyer', Phone: '9842222222', Province: 'Bagmati', District: 'Kathmandu', Address: 'Actual customer address', Platform: 'Website', 'Delivery Method': 'Standard', 'Payment Terms': 'COD', 'Order Type': 'NEW', Status: 'PENDING', 'Product ID': product.id, Quantity: '2', 'Unit Price': '125.50', Notes: 'File note', ...changes });
const returnRow = (changes: Record<string, string> = {}) => ({ 'Order ID': ordered.id, Date: '2026-10-26', 'Product ID': product.id, Quantity: '2', Reason: 'Damage', Resolution: 'Returned', Valley: 'Inside', Remarks: '', ...changes });
const dispatchRow = (changes: Record<string, string> = {}) => ({ 'Dispatch ID': 'dispatch-exact', 'Distributor ID': 'dist-real', 'Branch ID': 'branch-real', Date: '2026-10-26', 'Product ID': product.id, Quantity: '24', 'Amount Due': '8400.50', 'Payment Terms': 'Credit 15 days', Notes: 'Actual delivery note', ...changes });
function input(sourceType: CsvImportType, rows: Record<string, string>[]): CsvImportInput {
  return { sourceType, brandCode: 'BRAND', fileName: 'actual.csv', batchId, csv: generateCSV(IMPORT_COLUMNS[sourceType].map((label) => ({ key: label, label })), rows) };
}
function workspace(extra: Record<string, any[]> = {}) {
  const db = new DatabaseService({ server: true });
  db.hydrateSnapshot({ products: [product], distributors: catalog().distributors, branches: catalog().branches, orders: [], ...extra } as any, DEFAULT_SUPER_ADMIN);
  db.replaceBrands([brand] as any);
  return db;
}

test('strict CSV preserves quoted notes but rejects unclosed quotes, duplicate headers and shifted cells', () => {
  assert.equal(parseImportCsv('A,B\n"first, second","line one\nline two"').rows[0].B, 'line one\nline two');
  assert.throws(() => parseImportCsv('A,A\n1,2'), /unique/);
  assert.throws(() => parseImportCsv('A,B\n"unclosed,2'), /unclosed/);
  assert.throws(() => parseImportCsv('A,B\n1,2,3'), /expected 2 cells/);
  assert.throws(() => parseImportCsv('A,B\n"ok"unexpected,2'), /closing quote/);
});

test('orders use exact catalog product and explicit price/quantity without placeholder data', () => {
  const result = validateCsvImport(input('ORDERS', [orderRow()]), catalog(), 'Admin');
  assert.equal(result.orders?.[0].items[0].productId, product.id);
  assert.equal(result.orders?.[0].items[0].productName, product.name);
  assert.equal(result.orders?.[0].totalAmount, 251);
  assert.equal(result.orders?.[0].orderDateAd, '2026-10-26');
  assert.equal(validateCsvImport(input('ORDERS', [orderRow({ 'Order Number': '  new-lowercase  ' })]), catalog(), 'Admin').orders?.[0].orderNumber, 'NEW-LOWERCASE');
  assert.equal(result.orders?.[0].customerName, 'CSV buyer');
  assert.equal(validateCsvImport(input('ORDERS', [orderRow({ 'Unit Price': '0' })]), catalog(), 'Admin').orders?.[0].totalAmount, 0);
  for (const [field, value] of [['Phone', ''], ['Unit Price', ''], ['Quantity', '0'], ['Date', '2026-02-31'], ['Status', 'CONFIRMED'], ['Product ID', 'unknown']]) {
    assert.throws(() => validateCsvImport(input('ORDERS', [orderRow({ [field]: value })]), catalog(), 'Admin'), /Row 2:/);
  }
});

test('duplicates, ambiguous IDs, mismatched brand and multiple customer matches reject the entire file', () => {
  assert.throws(() => validateCsvImport(input('ORDERS', [orderRow({ 'Order Number': 'real-101' })]), catalog(), 'Admin'), /already exists/);
  assert.throws(() => validateCsvImport(input('ORDERS', [orderRow(), orderRow()]), catalog(), 'Admin'), /Row 3:.*repeated/);
  assert.throws(() => validateCsvImport(input('ORDERS', [orderRow()]), catalog({ products: [product, product] as any }), 'Admin'), /exactly one/);
  assert.throws(() => validateCsvImport(input('ORDERS', [orderRow()]), catalog({ products: [{ ...product, brandCode: 'OTHER' }] as any }), 'Admin'), /different brand/);
  assert.throws(() => validateCsvImport(input('ORDERS', [orderRow()]), catalog({ customers: [{ phone: '9842222222' }, { phone: '+977 9842222222' }] as any }), 'Admin'), /multiple customer/);
});

test('returns derive the real order customer and platform and enforce product and remaining quantity', () => {
  const entry = validateCsvImport(input('RETURNS', [returnRow()]), catalog(), 'Admin').returns![0];
  assert.equal(entry.orderId, ordered.id); assert.equal(entry.customerName, ordered.customerName); assert.equal(entry.platform, ordered.platform);
  assert.throws(() => validateCsvImport(input('RETURNS', [returnRow({ 'Order ID': ordered.orderNumber })]), catalog(), 'Admin'), /existing record ID/);
  assert.throws(() => validateCsvImport(input('RETURNS', [returnRow({ Quantity: '4' })]), catalog(), 'Admin'), /remaining quantity/);
  assert.throws(() => validateCsvImport(input('RETURNS', [returnRow()]), catalog({ returns: [{ orderId: ordered.id, productId: product.id, quantity: 2, orderStatus: 'Returned' }] as any }), 'Admin'), /remaining quantity/);
  assert.throws(() => validateCsvImport(input('RETURNS', [returnRow(), returnRow()]), catalog(), 'Admin'), /repeated/);
});

test('dispatches retain exact distributor and branch IDs and reject unrelated or fabricated entities', () => {
  const dispatch = validateCsvImport(input('OFFLINE_SALES', [dispatchRow()]), catalog(), 'Admin').dispatches![0];
  assert.equal(dispatch.id, 'dispatch-exact'); assert.equal(dispatch.distributorId, 'dist-real'); assert.equal(dispatch.branchId, 'branch-real');
  assert.equal(dispatch.items[0].productName, product.name); assert.equal(dispatch.amountDue, 8400.50);
  assert.throws(() => validateCsvImport(input('OFFLINE_SALES', [dispatchRow({ 'Distributor ID': 'fabricated' })]), catalog(), 'Admin'), /existing record ID/);
  assert.throws(() => validateCsvImport(input('OFFLINE_SALES', [dispatchRow()]), catalog({ branches: [{ ...catalog().branches[0], distributorId: 'other' }] }), 'Admin'), /does not belong/);
  assert.throws(() => validateCsvImport(input('OFFLINE_SALES', [dispatchRow({ 'Amount Due': 'not money' })]), catalog(), 'Admin'), /non-negative amount/);
});

test('empty files, unsupported daily counts, wrong headers and batches over 50 rows are rejected', () => {
  assert.throws(() => validateCsvImport({ ...input('ORDERS', [orderRow()]), sourceType: 'DAILY_COUNTS' as any }, catalog(), 'Admin'), /Only orders/);
  assert.throws(() => validateCsvImport(input('ORDERS', Array.from({ length: 51 }, (_, index) => orderRow({ 'Order Number': `NEW-${index}` }))), catalog(), 'Admin'), /1 and 50/);
  assert.throws(() => validateCsvImport({ ...input('ORDERS', []), csv: '' }, catalog(), 'Admin'), /non-empty CSV/);
  assert.throws(() => validateCsvImport({ ...input('ORDERS', [orderRow()]), csv: 'Order ID,Items,Amount\nOLD,anything,100' }, catalog(), 'Admin'), /current orders template/);
});

test('an invalid later row changes no records, counters, history or pending mutations', async () => {
  const db = workspace(); let commits = 0;
  await assert.rejects(processCsvImport(input('ORDERS', [orderRow(), orderRow({ 'Order Number': 'NEW-103', 'Product ID': 'missing' })]), { db, commit: async () => { commits++; } }, 'commit'), /Row 3:/);
  assert.equal(commits, 0); assert.equal(db.getOrders().length, 0); assert.equal(db.getCustomers().length, 0); assert.equal(db.getImportHistory().length, 0); assert.deepEqual(db.getPendingMutations(), []);
});

test('preview does not mutate state and confirmation waits for one transaction with orders, customer aggregates and history', async () => {
  const db = workspace(); const csvInput = input('ORDERS', [orderRow(), orderRow({ 'Order Number': 'NEW-103' })]);
  await processCsvImport(csvInput, { db, commit: async () => { throw new Error('Preview must not commit.'); } }, 'preview');
  assert.deepEqual(db.getPendingMutations(), []);
  let acknowledge!: () => void; let committed = false; let transactionCalls = 0;
  const running = processCsvImport(csvInput, { db, commit: async () => {
    transactionCalls++;
    const mutations = db.getPendingMutations();
    assert.equal(mutations.filter((mutation) => mutation.collection === 'orders').length, 2);
    assert.equal(mutations.filter((mutation) => mutation.collection === 'customers').length, 1);
    assert.equal(mutations.find((mutation) => mutation.collection === 'customers')?.data?.totalOrders, 2);
    assert.equal(mutations.filter((mutation) => mutation.collection === 'importHistory').length, 1);
    await new Promise<void>((resolve) => { acknowledge = resolve; });
    committed = true;
  } }, 'commit');
  let returned = false; void running.then(() => { returned = true; });
  await Promise.resolve(); assert.equal(returned, false); assert.equal(committed, false);
  acknowledge(); const result = await running;
  assert.equal(transactionCalls, 1); assert.equal(result.record?.importedCount, 2); assert.equal(result.record?.persistence, 'CONFIRMED');
  assert.deepEqual(result.record?.importedRecordIds?.map((entry) => entry.id).sort(), db.getOrders().map((entry) => entry.id).sort());
  let retriedCommit = false;
  const freshRequestDb = workspace(); freshRequestDb.hydrateSnapshot(db.exportSnapshot(), DEFAULT_SUPER_ADMIN);
  const retry = await processCsvImport(csvInput, { db: freshRequestDb, commit: async () => { retriedCommit = true; } }, 'commit');
  assert.equal(retry.alreadyImported, true); assert.equal(retriedCommit, false); assert.equal(db.getCustomers()[0].totalOrders, 2);
});

test('existing customer formatting resolves to the real Customer360 record and failed persistence never returns success', async () => {
  const customer = { id: 'customer-real', phone: '+977-9842222222', name: 'Existing', totalOrders: 3, totalDelivered: 0, totalReturns: 0, totalDeliveryFailures: 0, totalCancellations: 0, totalComplaints: 0, totalReviews: 0, brandsPurchased: [], karmaScore: 70, activeFlags: [], segment: 'REGULAR' };
  const db = workspace({ customers: [customer] });
  await assert.rejects(processCsvImport(input('ORDERS', [orderRow()]), { db, commit: async () => { throw new Error('Storage rejected the atomic transaction'); } }, 'commit'), /Storage rejected/);
  assert.equal(db.getCustomers().length, 1); assert.equal(db.getCustomers()[0].id, customer.id); assert.equal(db.getCustomers()[0].totalOrders, 4);
});

test('unsupported rollback returns false and leaves the batch and entities unchanged', async () => {
  const db = workspace();
  const result = await processCsvImport(input('ORDERS', [orderRow()]), { db, commit: async () => {} }, 'commit');
  const before = db.exportSnapshot();
  assert.equal(db.rollbackImport(result.record!.id), false);
  assert.deepEqual(db.exportSnapshot(), before);
});
