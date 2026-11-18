import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../src/lib/db/db-service';
import { projectSharedPortal } from '../src/app/api/shared/[token]/projection';
import { DEFAULT_SUPER_ADMIN } from './fixtures';
import type { Brand, SharedAccessLink } from '../src/lib/types';

const brands = [{ id: 'f', code: 'FOR', name: 'Forya', status: 'ACTIVE' }, { id: 't', code: 'TEO', name: 'Teora', status: 'ACTIVE' }] as Brand[];
const product = (id: string, brandCode: string, mrp: number) => ({ id, name: `${brandCode} item`, mrp, brandId: brandCode, brandCode, sku: id, category: 'Care', unitPrice: mrp, thresholdQty: 0, keywords: [], active: true });
const order = (id: string, brandCode: string, date: string, total: number) => ({ id, orderNumber: id, brandCode, orderDateAd: date, orderDateBs: '', platform: 'Instagram', customerName: 'Asha Rai', customerPhone: '9800000001', province: '', district: '', address: '', deliveryMethod: 'Pathao', paymentTerms: 'COD', orderType: 'NEW', status: 'DELIVERED', source: 'MANUAL', createdAt: '',
  items: [{ productId: brandCode === 'FOR' ? 'p1' : 'p2', productName: 'x', brandCode, quantity: 1, catalogUnitPrice: 1000, unitPrice: total, totalPrice: total, discountAmount: 1000 - total }], totalAmount: total, customerDiscount: 1000 - total, customerDiscountReason: 'Loyal customer' });
function db() {
  const service = new DatabaseService({ server: true }); service.replaceBrands(brands);
  service.hydrateSnapshot({ products: [product('p1', 'FOR', 1000), product('p2', 'TEO', 1000)], combos: [], orders: [order('o1', 'FOR', '2026-10-05', 900), order('o2', 'TEO', '2026-10-06', 800), order('o3', 'FOR', '2026-11-02', 1000)], customers: [], influencers: [] } as any, DEFAULT_SUPER_ADMIN);
  return service;
}
const link = (extra: Partial<SharedAccessLink> = {}): SharedAccessLink => ({ id: 'l', token: 'bb_x', name: 'Agency', brandScope: ['FOR'], brandFilter: ['FOR'], allowedPages: ['monthly-sales'], showCustomerDetails: false, showStaffDetails: false, showOrderRows: true, showProductNames: true, showComboDetails: true, dateRangeType: 'LIVE', isActive: true, accessCount: 0, createdAt: '', ...extra });

test('a shared link can carry the monthly sales sheet for the brands it allows, chosen by brand and month', () => {
  const data = projectSharedPortal(db(), link({ showSalesAmounts: true }), { month: '2026-10' });
  assert.deepEqual(data.link.allowedPages, ['monthly-sales']);
  const sheet = data.monthlySales!;
  assert.deepEqual(sheet.brands.map((brand) => brand.code), ['FOR']); assert.equal(sheet.brand, 'FOR'); assert.equal(sheet.month, '2026-10');
  assert.equal(sheet.report.salesCents, 90000); assert.equal(sheet.report.customerCents, 10000); assert.equal(sheet.report.discountReasons[0].reason, 'Loyal customer');
  // A brand outside the link falls back to an allowed one.
  assert.equal(projectSharedPortal(db(), link(), { brand: 'TEO', month: '2026-10' }).monthlySales!.brand, 'FOR');
  // All brands: the viewer can pick Teora.
  assert.equal(projectSharedPortal(db(), link({ brandScope: 'ALL', showSalesAmounts: true }), { brand: 'TEO', month: '2026-10' }).monthlySales!.report.salesCents, 80000);
});

test('without rupee amounts no money leaves the server, and hidden product names stay hidden', () => {
  const sheet = projectSharedPortal(db(), link({ showProductNames: false }), { month: '2026-10' }).monthlySales!;
  assert.equal(sheet.showMoney, false);
  assert.equal(sheet.report.units, 1); assert.equal(sheet.report.orderCount, 1);
  const json = JSON.stringify(sheet.report);
  assert.ok(!/"salesCents":[1-9]|"mrpCents":[1-9]|"netCents":[1-9]|"currentPrice":[0-9]/.test(json), json.slice(0, 300));
  assert.deepEqual(sheet.report.discountReasons, []);
  assert.ok(sheet.report.items.every((item) => /^(Product|Combo) \d+$/.test(item.name)));
});

test('a fixed-date link keeps the sheet inside its dates', () => {
  const sheet = projectSharedPortal(db(), link({ dateRangeType: 'FIXED', dateFrom: '2026-10-04', dateTo: '2026-10-20', showSalesAmounts: true }), { month: '2026-11' }).monthlySales!;
  assert.equal(sheet.month, '2026-10'); assert.equal(sheet.from, '2026-10-04'); assert.equal(sheet.to, '2026-10-20'); assert.equal(sheet.firstMonth, '2026-10'); assert.equal(sheet.lastMonth, '2026-10');
  assert.equal(sheet.report.days.length, 17);
});
