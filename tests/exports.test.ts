import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { DATASETS, buildSheets, exportFileName, type ExportSource } from '../src/lib/export/datasets.ts';
import { buildWorkbook, safeSheetNames } from '../src/lib/export/xlsx.ts';
import { resolveRange, bsMonthRange } from '../src/lib/export/ranges.ts';
import { generateSampleData } from '../src/lib/sample-data/generate.ts';

const products = [
  { id: 'p1', name: 'Aqua Roll On', alias: 'Aqua', sku: 'RO-1', brandCode: 'FORYA', subBrandId: 'sb_forya_body', mrp: 399, caseSize: 72, active: true, category: 'Care', thresholdQty: 10 },
  { id: 'p2', name: 'Hair Serum', sku: 'HS-1', brandCode: 'FORYA', subBrandId: 'sb_forya_hair', mrp: 1119, caseSize: 72, active: true, category: 'Care', thresholdQty: 10 },
] as any[];
const set = generateSampleData({ todayAd: '2026-11-20', products, manager: { id: 'admin', name: 'Admin' } });
const of = (c: string) => set.records.filter((r) => r.collection === c).map((r) => r.data) as any[];
const source: ExportSource = {
  brands: [{ id: 'b', code: 'FORYA', name: 'Forya', color: '', description: '', subBrands: [{ id: 'sb_forya_body', name: 'Body', isActive: true }, { id: 'sb_forya_hair', name: 'Hair', isActive: true }] }],
  products, combos: [],
  orders: [
    { id: 'o1', orderNumber: 'FOR-1', brandCode: 'FORYA', orderDateAd: '2026-11-10', orderDateBs: 'Kartik 24, 2083', status: 'DELIVERED', platform: 'Instagram', customerName: 'A', customerPhone: '98', district: 'Kathmandu', province: 'Bagmati', deliveryMethod: 'Pathao', paymentTerms: 'COD', orderType: 'NEW', totalAmount: 1518, items: [{ productId: 'p1', productName: 'Aqua Roll On', brandCode: 'FORYA', quantity: 1, unitPrice: 399, totalPrice: 399 }, { productId: 'p2', productName: 'Hair Serum', brandCode: 'FORYA', subBrandId: 'sb_forya_hair', quantity: 1, unitPrice: 1119, totalPrice: 1119 }] },
    { id: 'o2', orderNumber: 'FOR-2', brandCode: 'FORYA', orderDateAd: '2026-09-01', orderDateBs: '', status: 'DELIVERED', platform: 'Instagram', customerName: 'B', customerPhone: '97', district: '', province: '', deliveryMethod: '', paymentTerms: 'COD', orderType: 'NEW', totalAmount: 399, items: [{ productId: 'p1', productName: 'Aqua Roll On', brandCode: 'FORYA', quantity: 1, unitPrice: 399, totalPrice: 399 }] },
  ] as any[],
  returns: [], feedback: of('feedbackEntries'), deliveryFailures: [], customers: [],
  secondaryOrders: of('secondaryOrders'), dispatches: of('dispatches'), stockCounts: of('stockCounts'), visits: of('visits'), cheques: of('cheques'), shelfPhotos: of('shelfPhotos'),
  callLogs: of('callLogs'), documents: of('documents'), facingAudits: of('facingAudits'),
  retailers: of('retailers'), branches: of('branches'), distributors: of('distributors'),
  tasks: of('tasks'), influencers: of('influencers'), marketingSends: of('marketingSends'),
};

test('every data set builds, with matching column counts and AD + BS dates on dated sheets', () => {
  for (const dataset of DATASETS) {
    const sheet = dataset.build(source, {});
    for (const row of sheet.rows) assert.equal(row.length, sheet.columns.length, `${dataset.key} row width`);
    if (dataset.dated) {
      const headers = sheet.columns.map((c) => c.header).join('|');
      assert.match(headers, /\(AD\)/, `${dataset.key} has an AD date`);
      if (!['dispatch_lines'].includes(dataset.key)) assert.match(headers, /\(BS\)/, `${dataset.key} has a BS date`);
    }
  }
  const b2b = buildSheets(source, ['store_order_lines', 'visits', 'stock_counts', 'cheques', 'dispatch_lines'], {});
  assert.ok(b2b.every((sheet) => sheet.rows.length > 10));
});

test('date, sub-brand and store filters narrow the rows', () => {
  const lines = (f: any) => DATASETS.find((d) => d.key === 'order_lines')!.build(source, f).rows;
  assert.equal(lines({}).length, 3);
  assert.equal(lines({ fromAd: '2026-11-01', toAd: '2026-11-30' }).length, 2);
  assert.deepEqual(lines({ brandCode: 'FORYA', subBrandId: 'sb_forya_hair' }).map((row) => row[9]), ['Hair Serum']);
  assert.equal(lines({ brandCode: 'FORYA', subBrandId: 'sb_forya_body' }).length, 2, 'unstamped lines fall back to the product’s sub-brand');
  assert.equal(lines({ brandCode: 'PEESAFE' }).length, 0);
  const store = source.retailers[1].id;
  const visits = DATASETS.find((d) => d.key === 'visits')!.build(source, { storeId: store }).rows;
  assert.ok(visits.length > 0 && visits.every((row) => row[2] === source.retailers[1].name));
});

test('workbook is a valid zip with one sheet per data set and safe names', () => {
  const sheets = buildSheets(source, ['orders', 'stores'], {});
  const files = unzipSync(buildWorkbook(sheets));
  assert.ok(files['xl/worksheets/sheet1.xml'] && files['xl/worksheets/sheet2.xml'] && files['xl/styles.xml']);
  assert.match(strFromU8(files['xl/workbook.xml']), /name="Online orders"/);
  assert.deepEqual(safeSheetNames(['A/B', 'A B', 'x'.repeat(40)]), ['A B', 'A B 2', 'x'.repeat(31)]);
  assert.equal(exportFileName('Store orders', { brandCode: 'FORYA', subBrandId: 'sb_forya_hair', fromAd: '2026-10-01', toAd: '2026-10-31' }, source), 'Brand-Bucket_Store-orders_FORYA_Hair_2026-10-01_to_2026-10-31');
});

test('date ranges follow the BS calendar and the Shrawan fiscal year', () => {
  assert.deepEqual(bsMonthRange(2083, 7), { fromAd: '2026-10-19', toAd: '2026-11-17' });
  const lastMonth = resolveRange('LAST_BS_MONTH', '2026-11-20');
  assert.equal(lastMonth.label, 'Kartik 2083');
  const fy = resolveRange('LAST_FY', '2026-11-20');
  assert.equal(fy.label, 'FY 2082/83');
  assert.equal(resolveRange('THIS_FY', '2026-11-20').fromAd, fy.toAd ? new Date(Date.parse(`${fy.toAd}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : '');
});
