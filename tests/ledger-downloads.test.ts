import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStoreLedger } from '../src/lib/store-ledger.ts';
import { canDownload } from '../src/lib/download-access.ts';
import { DATASETS } from '../src/lib/export/datasets.ts';
import { stockCountWorkbookSheets, storeOrderWorkbookSheets } from '../src/lib/export/record-downloads.ts';

const store = { id: 'r1', name: 'Shrestha Kirana', kind: 'RETAILER' as const };
const delivery = (id: string, day: string, qty: number, extra: Record<string, unknown> = {}): any => ({ id, dispatchNumber: id.toUpperCase(), storeId: 'r1', distributorId: 'r1', distributorName: 'Shrestha Kirana', status: 'DELIVERED', deliveredDateAd: day, dispatchDateAd: day, dispatchDateBs: '', createdBy: '', createdAt: `${day}T05:00:00Z`, items: [{ productId: 'p1', productName: 'Roll-On', brandCode: 'FORYA', quantity: qty, unitPrice: 400 }], ...extra });
const count = (id: string, day: string, shelf: number, damaged = 0): any => ({ id, officerId: 'u', officerName: 'Rajan', entityType: 'RETAILER', entityId: 'r1', storeName: 'Shrestha Kirana', dateAd: day, dateBs: '', createdAt: `${day}T10:00:00Z`,
  items: [{ productId: 'p1', productName: 'Roll-On', brandCode: 'FORYA', shelfQty: shelf, previousQty: 0, flaggedDrop: false, damagedQty: damaged }] });

test('ledger: opening count, deliveries in, sales out at each count, balance is the shelf', () => {
  const { entries, summary } = buildStoreLedger([store], [delivery('dp1', '2026-11-05', 24), delivery('dp2', '2026-11-12', 12)], [count('c0', '2026-11-01', 10), count('c1', '2026-11-10', 20), count('c2', '2026-11-15', 25, 1)]);
  assert.deepEqual(entries.map((e) => [e.date, e.kind, e.in, e.out, e.balance]), [
    ['2026-11-01', 'OPENING', 0, 0, 10],
    ['2026-11-05', 'DELIVERY', 24, 0, 34],
    ['2026-11-10', 'COUNT', 0, 14, 20],
    ['2026-11-12', 'DELIVERY', 12, 0, 32],
    ['2026-11-15', 'COUNT', 0, 6, 25],
  ]);
  assert.deepEqual({ received: summary[0].received, sold: summary[0].sold, damaged: summary[0].damaged, onShelf: summary[0].onShelf, receivedValue: summary[0].receivedValue, soldValue: summary[0].soldValue },
    { received: 36, sold: 20, damaged: 1, onShelf: 25, receivedValue: 14400, soldValue: 8000 });
});

test('ledger: goods not yet delivered are in transit, cancelled ones are ignored, a surplus is not counted as negative sales', () => {
  const { entries, summary } = buildStoreLedger([store], [delivery('dp1', '2026-11-05', 24, { status: 'DISPATCHED', deliveredDateAd: undefined }), delivery('dp2', '2026-11-06', 50, { status: 'CANCELLED' })], [count('c0', '2026-11-01', 10), count('c1', '2026-11-10', 14)]);
  assert.equal(summary[0].inTransit, 24);
  assert.equal(summary[0].received, 0);
  assert.equal(entries[1].out, 0);
  assert.equal(entries[1].adjustment, 4);
});

test('the ledger sheet downloads per store', () => {
  const source: any = { retailers: [{ id: 'r1', name: 'Shrestha Kirana' }], branches: [], distributors: [], products: [{ id: 'p1', name: 'Roll-On', alias: 'RO', brandCode: 'FORYA' }], combos: [], brands: [],
    dispatches: [delivery('dp1', '2026-11-05', 24)], stockCounts: [count('c0', '2026-11-01', 10), count('c1', '2026-11-10', 20)] };
  const sheet = DATASETS.find((d) => d.key === 'store_ledger')!.build(source, { storeId: 'r1' });
  assert.equal(sheet.rows.length, 3);
  assert.equal(sheet.rows[0][3], 'RO');
  assert.equal(sheet.rows[2][6], 14);
});

test('download permission: off for field staff by default, on for office roles, a role switch otherwise', () => {
  assert.equal(canDownload({ role: 'SUPER_ADMIN', isSuperAdmin: true } as any), true);
  assert.equal(canDownload({ role: 'SALES_OFFICER', customPermissions: {} } as any), false);
  assert.equal(canDownload({ role: 'STAFF', customPermissions: {} } as any), true);
  assert.equal(canDownload({ role: 'CUSTOM', customPermissions: { _v: 2, 's.download': { access: 'VIEW_ONLY', scope: null, actions: ['VIEW'] } } } as any), true);
  assert.equal(canDownload({ role: 'CUSTOM', customPermissions: { _v: 2 } } as any), false);
  assert.match(readFileSync('src/components/common/DownloadButton.tsx', 'utf8'), /if \(!canDownload\(db\.getCurrentUser\(\)\)\) return null;/);
  assert.match(readFileSync('src/app/opscore/reports/page.tsx', 'utf8'), /if \(!canDownload\(user\)\)/);
});

test('online and offline data sets live behind separate choices on the reports page', () => {
  const page = readFileSync('src/app/opscore/reports/page.tsx', 'utf8');
  assert.match(page, /key: 'ONLINE'/);
  assert.match(page, /key: 'OFFLINE'/);
  const online = page.slice(page.indexOf("key: 'ONLINE'"), page.indexOf("key: 'OFFLINE'"));
  assert.doesNotMatch(online, /store_orders|dispatch_|stock_counts/);
});

test('one store order and one shelf count download as their own sheets', () => {
  const order: any = { id: 'so1', orderNumber: 'SO-0001', storeName: 'Shrestha Kirana', contactName: 'Ram', contactPhone: '9841', officerName: 'Rajan', orderDateAd: '2026-11-20', orderDateBs: 'Mangsir 4', status: 'PENDING_DISPATCH', totalAmount: 9600, totalUnits: 24,
    items: [{ productId: 'p1', productName: 'Roll-On', brandCode: 'FORYA', cases: 1, unitsPerCase: 24, totalUnits: 24, unitPrice: 400, totalAmount: 9600 }] };
  const [orderSheet] = storeOrderWorkbookSheets(order, [{ id: 'p1', name: 'Roll-On', alias: 'RO' } as any], [], true);
  assert.equal(orderSheet.intro?.[0][1], 'SO-0001');
  assert.equal(orderSheet.rows[0][1], 'RO');
  const withoutMoney = storeOrderWorkbookSheets(order, [], [], false)[0];
  assert.ok(!withoutMoney.columns.some((c) => /NPR/.test(c.header)));
  const [countSheet] = stockCountWorkbookSheets(count('c1', '2026-11-10', 20, 2), [], []);
  assert.equal(countSheet.rows.at(-1)?.[5], 20);
});
