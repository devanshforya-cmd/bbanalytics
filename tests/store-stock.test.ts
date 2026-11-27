import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceSheet, buildSalesItems, currentStock, mergeSheets, onOrder, stockMovements } from '../src/lib/store-stock.ts';
import { cleanBrandList, productsForStore, storeBrandCodes } from '../src/lib/store-brands.ts';
import { countSheet } from '../src/lib/stock-count-sheet.ts';

const dispatch = (over: Record<string, unknown>) => ({ id: 'd1', distributorId: 'ret1', distributorName: 'Shop', dispatchDateAd: '', dispatchDateBs: '', createdBy: 'x', createdAt: '2026-11-01T05:00:00Z', items: [], ...over }) as any;
const count = (over: Record<string, unknown>) => ({ id: 'c', officerId: 'u', officerName: 'Rep', entityType: 'RETAILER', entityId: 'ret1', storeName: 'Shop', dateBs: '', items: [], createdAt: '2026-11-01T10:00:00Z', ...over }) as any;
const item = (productId: string, extra: Record<string, unknown>) => ({ productId, productName: productId, brandCode: 'BB_FOR', previousQty: 0, flaggedDrop: false, shelfQty: 0, ...extra });

const input = {
  storeId: 'ret1',
  dispatches: [
    dispatch({ id: 'd1', dispatchNumber: 'DP-1', storeId: 'ret1', status: 'DELIVERED', deliveredDateAd: '2026-11-05', items: [{ productId: 'p1', productName: 'p1', brandCode: 'BB_FOR', quantity: 24 }] }),
    dispatch({ id: 'd2', dispatchNumber: 'DP-2', storeId: 'ret1', status: 'DISPATCHED', items: [{ productId: 'p1', productName: 'p1', brandCode: 'BB_FOR', quantity: 12 }] }),
    dispatch({ id: 'd3', storeId: 'other', status: 'DELIVERED', deliveredDateAd: '2026-11-05', items: [{ productId: 'p1', productName: 'p1', brandCode: 'BB_FOR', quantity: 99 }] }),
  ],
  secondaryOrders: [],
  stockCounts: [
    count({ id: 'c1', dateAd: '2026-11-01', items: [item('p1', { shelfQty: 10 })] }),
    count({ id: 's1', mode: 'SALES', dateAd: '2026-11-07', items: [item('p1', { soldQty: 6, shelfQty: 28 })] }),
    count({ id: 'c2', dateAd: '2026-11-10', items: [item('p1', { shelfQty: 25 })] }),
  ],
};

test('stock runs like an account: opening count, delivery in, sales out, count corrects', () => {
  const moves = stockMovements(input);
  assert.deepEqual(moves.map((m) => [m.kind, m.change, m.balanceAfter]), [['COUNT', 10, 10], ['RECEIVED', 24, 34], ['SOLD', -6, 28], ['COUNT', -3, 25]]);
  assert.equal(moves[0].opening, true);
  assert.equal(currentStock(input).get('p1'), 25);
  assert.equal(onOrder(input).get('p1'), 12, 'a dispatch not delivered yet is on order, not in stock');
});

test('balance sheet: opening + received − sold + found = closing; a count below the records is sold', () => {
  const sheet = balanceSheet(input, '2026-11-03', '2026-11-12');
  const row = sheet.rows[0];
  assert.equal(row.opening, 10);
  assert.equal(row.received, 24);
  assert.equal(row.soldEntered, 6);
  assert.equal(row.soldByCount, 3);
  assert.equal(row.sold, 9);
  assert.equal(row.found, 0);
  assert.equal(row.countDifference, -3);
  assert.equal(row.closing, row.opening + row.received - row.sold + row.found);
  assert.equal(row.closing, 25);
  assert.equal(row.onOrder, 12);
  assert.equal(row.perDay, 0.9, '9 units gone (6 sold + 3 found missing) over 10 days');
  assert.equal(row.lastCountAd, '2026-11-10');
});

test('an opening count is found stock, not a sale', () => {
  const sheet = balanceSheet(input, '2026-11-01', '2026-11-01');
  assert.equal(sheet.rows[0].found, 10);
  assert.equal(sheet.rows[0].sold, 0);
  assert.equal(sheet.rows[0].perDay, 0);
});

test('older dispatches without a status count as delivered on their dispatch date, not on order', () => {
  const older = { storeId: 'ret1', dispatches: [dispatch({ storeId: 'ret1', dispatchDateAd: '2026-10-01', items: [{ productId: 'p9', productName: 'p9', brandCode: 'BB_FOR', quantity: 7 }] })], secondaryOrders: [], stockCounts: [] };
  assert.equal(currentStock(older).get('p9'), 7);
  assert.equal(onOrder(older).get('p9'), undefined);
});

test('a delivered store order without a dispatch counts as received; one with a dispatch does not count twice', () => {
  const orders = [
    { id: 'so1', entityId: 'ret1', status: 'DELIVERED', orderDateAd: '2026-11-02', createdAt: '', orderNumber: 'SO-1', items: [{ productId: 'p2', productName: 'p2', brandCode: 'BB_FOR', totalUnits: 5, freeUnits: 1 }] },
    { id: 'so2', entityId: 'ret1', status: 'DELIVERED', orderDateAd: '2026-11-02', createdAt: '', orderNumber: 'SO-2', items: [{ productId: 'p1', productName: 'p1', brandCode: 'BB_FOR', totalUnits: 24 }] },
  ] as any[];
  const withLink = { ...input, secondaryOrders: orders, dispatches: input.dispatches.map((d: any) => d.id === 'd1' ? { ...d, orderId: 'so2' } : d) };
  const stock = currentStock(withLink);
  assert.equal(stock.get('p2'), 6);
  assert.equal(stock.get('p1'), 25);
});

test('selling more than the records hold shows below zero, so a missing delivery is visible', () => {
  const sheet = balanceSheet({ storeId: 'ret1', dispatches: [], secondaryOrders: [], stockCounts: [count({ mode: 'SALES', dateAd: '2026-11-02', items: [item('p1', { soldQty: 4 })] })] }, '2026-11-01', '2026-11-30');
  assert.equal(sheet.rows[0].closing, -4);
  assert.equal(sheet.rows[0].status, 'NEGATIVE');
});

test('sales entries carry the balance before and after', () => {
  const stock = new Map([['p1', 25]]);
  const items = buildSalesItems([{ productId: 'p1', productName: 'P1', brandCode: 'BB_FOR' }, { productId: 'p2', productName: 'P2', brandCode: 'BB_FOR' }], { p1: 5, p2: 0 }, stock);
  assert.deepEqual(items.map((i) => [i.productId, i.soldQty, i.previousQty, i.shelfQty]), [['p1', 5, 25, 20]]);
});

test('merged sheets add up outlets', () => {
  const a = balanceSheet(input, '2026-11-01', '2026-11-30');
  const merged = mergeSheets([a, a]);
  assert.equal(merged.totals.closing, a.totals.closing * 2);
});

test('store brands: none set means all brands; a list limits products', () => {
  const products = [{ id: 'a', brandCode: 'BB_FOR' }, { id: 'b', brandCode: 'BB_BOR' }];
  assert.equal(storeBrandCodes({ brandsStocked: [] } as any), null);
  assert.equal(productsForStore(products, { brandsStocked: [] } as any).length, 2);
  assert.deepEqual(productsForStore(products, { brandsAvailable: ['bb_bor'] } as any).map((p) => p.id), ['b']);
  assert.deepEqual(cleanBrandList(['bb_for', 'BB_FOR', 'NOPE'], ['BB_FOR', 'BB_BOR']), ['BB_FOR']);
  assert.throws(() => cleanBrandList([], ['BB_FOR']), /at least one brand/);
});

test('a new store with brands lists every product of its brands to count', () => {
  const products = [{ id: 'a', name: 'A', brandCode: 'BB_FOR', active: true }, { id: 'b', name: 'B', brandCode: 'BB_BOR', active: true }] as any[];
  const sheet = countSheet({ storeId: 'new', products, secondaryOrders: [], stockCounts: [], todayAd: '2026-11-27', brandCodes: ['BB_BOR'] });
  assert.deepEqual(sheet.rows.map((r) => r.productId), ['b']);
  assert.deepEqual(sheet.others.map((p) => p.id), []);
});

import { canWriteWorkspaceRecord, canReadWorkspaceRecord } from '../src/lib/db/workspace-policy.ts';
import { DatabaseService } from '../src/lib/db/db-service.ts';
import { DEFAULT_BANKS } from '../src/lib/banks.ts';

test('banks: field reps and cheque staff can add one; others cannot; everyone with cheques reads them', () => {
  const row = { collection: 'banks' as const, id: 'bank_x', data: { id: 'bank_x', name: 'X Bank' }, created_by: 'a', version: 1 };
  const rep: any = { id: 'rep', fullName: 'Rep', customPermissions: { beat_plans: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE'] } } };
  const marketer: any = { id: 'mk', fullName: 'Mk', customPermissions: { marketing: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE'] } } };
  assert.equal(canWriteWorkspaceRecord(rep, row, 'CREATE', [], []), true);
  assert.equal(canWriteWorkspaceRecord(rep, row, 'EDIT', [], []), false, 'renaming is for Settings');
  assert.equal(canWriteWorkspaceRecord(marketer, row, 'CREATE', [], []), false);
  assert.equal(canReadWorkspaceRecord(rep, row, [], []), true);
});

test('banks list: Nepal banks preloaded, an added bank stays, names are not repeated', () => {
  const db = new DatabaseService({ server: true });
  assert.equal(DEFAULT_BANKS.length >= 20, true);
  assert.equal(db.getBanks().some((bank) => bank.name === 'Nabil Bank'), true);
  const added = db.addBank('  Bhargav   Bikash Bank ');
  assert.equal(added.name, 'Bhargav Bikash Bank');
  assert.equal(db.addBank('bhargav bikash bank').id, added.id);
  assert.equal(db.addBank('nabil bank').name, 'Nabil Bank');
  assert.equal(db.getBanks().filter((bank) => bank.name.toLowerCase() === 'nabil bank').length, 1);
});

import { targetLabel, targetOptions } from '../src/lib/store-target.ts';

test('a field rep can see MT chains so a cheque or document can be for the whole chain, but cannot change them', () => {
  const rep: any = { id: 'rep', fullName: 'Rep', assignedBrands: ['ALL'], customPermissions: { beat_plans: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE'] }, cheque_tracker: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE'] } } };
  const chain = { collection: 'distributors' as const, id: 'd1', data: { id: 'd1', name: 'Chain', brandsCarried: [] }, created_by: 'admin', version: 1 };
  assert.equal(canReadWorkspaceRecord(rep, chain, [], []), true);
  assert.equal(canWriteWorkspaceRecord(rep, chain, 'EDIT', [], []), false);
  const cheque = { collection: 'cheques' as const, id: 'c1', data: { id: 'c1', entityType: 'DISTRIBUTOR', entityId: 'd1', officerId: 'rep' }, created_by: 'rep', version: 1 };
  assert.equal(canWriteWorkspaceRecord(rep, cheque, 'CREATE', [], [chain]), true);
});

test('store targets: chains, outlets and stores, with clear labels', () => {
  const options = targetOptions([{ id: 'r1', name: 'Kirana', storeType: 'RETAIL' } as any], [{ id: 'b1', name: 'Kupondole', distributorId: 'd1', distributorName: 'Bhatbhateni' } as any], [{ id: 'd1', name: 'Bhatbhateni', storeType: 'CHAIN_STORE' } as any]);
  assert.deepEqual(options.map((o) => [o.value, o.type, o.chainId ?? null]), [['d1', 'DISTRIBUTOR', 'd1'], ['b1', 'BRANCH', 'd1'], ['r1', 'RETAILER', null]]);
  assert.equal(targetLabel({ entityType: 'DISTRIBUTOR', entityId: 'd1', name: 'Bhatbhateni', chainId: 'd1' }), 'Bhatbhateni (whole chain)');
  assert.equal(targetLabel({ entityType: 'BRANCH', entityId: 'b1', name: 'Kupondole', chainId: 'd1', chainName: 'Bhatbhateni' }), 'Kupondole (Bhatbhateni)');
});

test('document types: defaults until changed, then add, rename, mark not-for-store and delete', () => {
  const db = new DatabaseService({ server: true });
  assert.equal(db.getDocumentTypes().some((t) => t.name === 'Purchase order' && t.storeBased), true);
  const added = db.addDocumentType('Tax clearance', false);
  assert.equal(db.getDocumentTypes().length > 5, true, 'the starting list is kept when the first type is added');
  assert.throws(() => db.addDocumentType('tax CLEARANCE'), /already/);
  db.updateDocumentType(added.id, { name: 'Tax clearance certificate', storeBased: true });
  assert.equal(db.getDocumentTypes().find((t) => t.id === added.id)?.storeBased, true);
  db.deleteDocumentType(added.id);
  assert.equal(db.getDocumentTypes().some((t) => t.id === added.id), false);
});

import { hiddenByBrandFilter } from '../src/lib/brand-filter.ts';

test('the brand filter says what it hides', () => {
  assert.equal(hiddenByBrandFilter({ orders: [1, 2], tickets: [1] }, { orders: [], tickets: [] }), '2 orders and 1 return or ticket');
  assert.equal(hiddenByBrandFilter({ orders: [1], tickets: [] }, { orders: [1], tickets: [] }), '');
});
