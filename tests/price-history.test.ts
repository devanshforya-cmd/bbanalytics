import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../src/lib/db/db-service';
import { saveExtractedOrders } from '../src/lib/db/extractor-service';
import { buildMonthlySalesReport } from '../src/lib/monthly-sales-report';
import { buildGoogleReportTabs } from '../src/lib/google-workspace-reports';
import { DEFAULT_SUPER_ADMIN } from './fixtures';
import type { Brand, Product } from '../src/lib/types';

const brand = { id: 'b', code: 'BRAND', name: 'Brand', isActive: true, status: 'ACTIVE', color: '#000' } as Brand;
const productA = (mrp: number): Product => ({ id: 'a', name: 'Product A', mrp, brandId: 'b', brandCode: 'BRAND', sku: 'A', category: 'Care', unitPrice: mrp, thresholdQty: 0, keywords: [], active: true });
const row = (id: string, date: string, mrp: number, extra = {}) => ({ clientId: id, customerName: 'Asha', customerPhone: '9800000001', address: 'Baneshwor', province: '', city: '', orderDateAd: date, platform: 'Instagram', deliveryMethod: 'Pathao', paymentTerms: 'COD', statedPrice: null, discountPercent: null, items: [{ productId: 'a', quantity: 2, expectedUnitPrice: mrp }], ...extra });

test('a later MRP change never changes orders saved at the old price; new orders use the new price', async () => {
  const db = new DatabaseService({ server: true }); db.replaceBrands([brand]);
  db.hydrateSnapshot({ products: [productA(100)], combos: [], orders: [], customers: [], influencers: [] } as any, DEFAULT_SUPER_ADMIN);
  const ws = { db, commit: async () => {} };
  await saveExtractedOrders({ orders: [row('ext_00000001-aaaa-bbbb-cccc-dddddddddddd', '2026-08-10', 100), row('ext_00000002-aaaa-bbbb-cccc-dddddddddddd', '2026-08-11', 100, { statedPrice: 180 })] }, ws);

  // Three months later the MRP goes from 100 to 120.
  db.hydrateSnapshot({ ...db.exportSnapshot(), products: [productA(120)] } as any, DEFAULT_SUPER_ADMIN);
  const august = buildMonthlySalesReport(db.getOrders('ALL'), db.getProducts('ALL'), [], 'BRAND', '2026-08-01', '2026-08-31');
  const a = august.items.find((item) => item.id === 'a')!;
  assert.deepEqual([a.quantity, a.mrpCents, a.customerCents, a.salesCents], [4, 40000, 2000, 38000], 'August stays at MRP 100: 4 units, NPR 400 at MRP, NPR 20 discount, NPR 380 sold');
  assert.equal(a.currentPrice, 120, 'only the "current MRP" row shows today’s price');
  assert.deepEqual(db.getOrders('ALL').map((order) => order.totalAmount).sort(), [180, 200]);

  // A save still carrying the old price is refused, so nobody books new orders at the old MRP by mistake.
  await assert.rejects(saveExtractedOrders({ orders: [row('ext_00000003-aaaa-bbbb-cccc-dddddddddddd', '2026-11-18', 100)] }, ws), /changed or invalid catalogue price/);
  await saveExtractedOrders({ orders: [row('ext_00000004-aaaa-bbbb-cccc-dddddddddddd', '2026-11-18', 120)] }, ws);
  const november = buildMonthlySalesReport(db.getOrders('ALL'), db.getProducts('ALL'), [], 'BRAND', '2026-11-01', '2026-11-30');
  assert.deepEqual([november.items[0].mrpCents, november.items[0].salesCents], [24000, 24000]);
  // The Google Sheets export reads the saved amounts too.
  const tab = buildGoogleReportTabs({ getFilteredStores: () => [], getOrders: () => db.getOrders('ALL'), getUsers: () => [], getCheques: () => [], getVisits: () => [], getStockCounts: () => [] } as any, '2026-08').find((entry) => entry.title === 'Orders-2026-08')!;
  assert.deepEqual(tab.values.slice(1).map((r) => [r[7], r[11]]).sort(), [[180, 200], [200, 200]]);
});
