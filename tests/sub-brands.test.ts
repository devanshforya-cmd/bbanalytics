import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSubBrands, subBrandIdFor, lineSubBrandId, matchesBrandFilter, productLabel, NO_SUB_BRAND } from '../src/lib/sub-brands.ts';
import { editProduct } from '../src/lib/catalog-edit.ts';

test('sub-brand lists are cleaned: trimmed, unique, stable ids, archived kept', () => {
  const list = normalizeSubBrands('PEESAFE', [{ name: '  FURR ' }, { name: 'furr' }, { name: 'Comfort', isActive: false }, { name: '' }, { id: 'sb_peesafe_domina', name: 'Domina' }, 'junk']);
  assert.deepEqual(list.map((s) => s.name), ['FURR', 'Comfort', 'Domina']);
  assert.equal(list[0].id, subBrandIdFor('PEESAFE', 'FURR'));
  assert.equal(list[0].id, 'sb_peesafe_furr');
  assert.equal(list[1].isActive, false);
  assert.deepEqual(normalizeSubBrands('X', null), []);
});

test('order lines use the sub-brand stamped at the time, else the product’s current one', () => {
  const products = [{ id: 'p1', subBrandId: 'sb_peesafe_comfort' }, { id: 'p2' }];
  assert.equal(lineSubBrandId({ productId: 'p1', subBrandId: 'sb_peesafe_furr' }, products), 'sb_peesafe_furr');
  assert.equal(lineSubBrandId({ productId: 'p1' }, products), 'sb_peesafe_comfort');
  assert.equal(lineSubBrandId({ productId: 'p2' }, products), undefined);
  assert.ok(matchesBrandFilter('PEESAFE/sb_peesafe_furr', { brandCode: 'PEESAFE', productId: 'p1', subBrandId: 'sb_peesafe_furr' }, products));
  assert.ok(!matchesBrandFilter('PEESAFE/sb_peesafe_furr', { brandCode: 'PEESAFE', productId: 'p1' }, products));
  assert.ok(matchesBrandFilter(`PEESAFE/${NO_SUB_BRAND}`, { brandCode: 'PEESAFE', productId: 'p2' }, products));
  assert.ok(!matchesBrandFilter('FORYA', { brandCode: 'PEESAFE', productId: 'p2' }, products));
  assert.ok(matchesBrandFilter('ALL', { brandCode: 'PEESAFE', productId: 'p2' }, products));
});

test('field forms show the short name; editing keeps or clears the new fields', () => {
  assert.equal(productLabel({ name: 'Forya Underarm Deodorant Roll On - Aqua', alias: 'Aqua roll-on' }), 'Aqua roll-on');
  assert.equal(productLabel({ name: 'Full name', alias: '  ' }), 'Full name');
  const current = { id: 'p1', name: 'Roll On', sku: 'RO-1', category: 'Care', mrp: 399, unitPrice: 399, thresholdQty: 10, keywords: [], brandCode: 'FORYA', brandId: 'b', orderUnitMode: 'BOTH' } as any;
  const base = { name: 'Roll On', sku: 'RO-1', category: 'Care', mrp: 399, thresholdQty: 10, orderUnitMode: 'BOTH', keywords: [], extractorKeywords: [] };
  const edited = editProduct(current, { ...base, alias: ' Aqua  roll-on ', barcode: '8 901234 567890', subBrandId: 'sb_forya_body' }, []);
  assert.equal(edited.alias, 'Aqua roll-on');
  assert.equal(edited.barcode, '8901234567890');
  assert.equal(edited.subBrandId, 'sb_forya_body');
  const cleared = editProduct(edited, { ...base, alias: '', barcode: '', subBrandId: '' }, []);
  assert.ok(!('alias' in cleared) && !('barcode' in cleared) && !('subBrandId' in cleared));
  const untouched = editProduct(edited, base, []);
  assert.equal(untouched.alias, 'Aqua roll-on', 'fields not sent stay as they were');
  assert.throws(() => editProduct(current, { ...base, barcode: '12$4' }, []), /barcode/i);
});
