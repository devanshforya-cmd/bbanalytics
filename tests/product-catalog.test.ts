import { DEFAULT_SUPER_ADMIN } from './fixtures';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../src/lib/db/db-service';
import { customerBrandMap, isSellableCombo, matchingCatalogCombo, productUsage, referencesProduct } from '../src/lib/product-catalog';
import { canWriteWorkspaceRecord } from '../src/lib/db/workspace-policy';
import type { Brand, Combo, Customer, Product } from '../src/lib/types';

const product = { id: 'p1', name: 'Orchard item', sku: 'ORCHARD-1', brandCode: 'ORCHARD', mrp: 100, active: true } as Product;
const second = { ...product, id: 'p2', name: 'Second item', mrp: 200 };
const combo = { id: 'c1', brandCode: 'ORCHARD', name: 'Saved pair', active: true, comboPrice: 250,
  items: [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }] } as Combo;

test('empty workspaces do not manufacture product or brand records', () => {
  const db = new DatabaseService({ server: true });
  assert.deepEqual(db.getProducts(), []);
  assert.deepEqual(db.getBrands(), []);
});

test('deletion keeps a precise usage preview even when history and stock no longer block removal', () => {
  for (const reference of [{ items: [{ productId: 'p1' }] }, { componentProductIds: ['p1'] }, { productIds: ['p1'] }, { outer: { comboItems: [{ productId: 'p1' }] } }]) {
    assert.equal(referencesProduct(reference, 'p1'), true);
  }
  assert.equal(referencesProduct({ productName: 'p1', id: 'p1', items: [{ productId: 'p10' }] }, 'p1'), false);
  const usage = productUsage(product, { orders: [{ id: 'order', items: [{ productId: 'p1' }] }] });
  assert.equal(usage.canDelete, true);
  assert.deepEqual(usage.references, [{ collection: 'orders', count: 1 }]);
  assert.equal(productUsage({ ...product, stockQty: 5 }, {}).canDelete, true);
  assert.equal(productUsage({ ...product, stockQty: 5 }, {}).stockQty, 5);
  assert.equal(productUsage(product, { activityLogs: [{ id: 'audit', productId: 'p1' }], products: [product] }).canDelete, true);
});

test('permanent product deletion remains Super Admin only even with a staff DELETE grant', () => {
  const row: any = { collection: 'products', id: 'p1', data: product, created_by: 'staff', version: 1 };
  const staff = { ...DEFAULT_SUPER_ADMIN, id: 'staff', role: 'ADMIN', isSuperAdmin: false,
    customPermissions: { products: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] } } };
  assert.equal(canWriteWorkspaceRecord(staff, row, 'DELETE', [staff], [row]), false);
  assert.equal(canWriteWorkspaceRecord(DEFAULT_SUPER_ADMIN, row, 'DELETE', [], [row]), true);
});

test('bundle prices require an active saved combo and an exact basket with valid live components', () => {
  const basket = [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }];
  assert.equal(matchingCatalogCombo([combo], [product, second], basket, 'ORCHARD')?.savings, 50);
  assert.equal(matchingCatalogCombo([], [product, second], basket, 'ORCHARD'), null);
  assert.equal(matchingCatalogCombo([combo], [product, second], [...basket, { productId: 'extra', quantity: 1 }], 'ORCHARD'), null);
  assert.equal(matchingCatalogCombo([combo], [{ ...product, active: false }, second], basket, 'ORCHARD'), null);
  assert.equal(isSellableCombo(combo, [{ ...product, active: false }, second]), false);
  assert.equal(isSellableCombo(combo, [product]), false);
  assert.equal(matchingCatalogCombo([combo], [product, second], [{ ...basket[0], quantity: 2 }, basket[1]], 'ORCHARD'), null);
  assert.equal(matchingCatalogCombo([combo], [product, second], [{ ...basket[0], overridePrice: 50 }, basket[1]], 'ORCHARD'), null);
});

test('brand overlap and selling prompts follow any saved portfolio and do not invent products', () => {
  const brands = [{ id: 'b1', code: 'ORCHARD', name: 'Orchard', isActive: true }, { id: 'b2', code: 'RIVER', name: 'River', isActive: true }] as Brand[];
  const customers = [{ id: 'one', karmaScore: 80, brandsPurchased: ['RIVER', 'RIVER'] }, { id: 'two', karmaScore: 90, brandsPurchased: ['RIVER', 'ORCHARD'] }, { id: 'three', karmaScore: 10, brandsPurchased: [] }] as Customer[];
  const map = customerBrandMap(customers, brands, [product]);
  assert.equal(map.multiBrand, 1);
  assert.deepEqual(map.segments.map(row => row.label), ['River', 'Orchard + River', 'No brand recorded']);
  assert.equal(map.crossSellOpportunities.length, 1);
  assert.equal(map.crossSellOpportunities[0].targetBrand, 'Orchard');
  assert.deepEqual(customerBrandMap(customers, brands, [{ ...product, active: false }]).crossSellOpportunities, []);
});
