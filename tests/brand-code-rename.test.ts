import test from 'node:test';
import assert from 'node:assert/strict';
import { renameBrandCodeInData } from '../src/lib/brand-code-rename';

test('changing a brand code moves every reference to the new code and leaves ids alone', () => {
  assert.deepEqual(renameBrandCodeInData({ id: 'prod_bb_bor_1', brandCode: 'BB_BOR', subBrandId: 'sb_bb_bor_olive' }, 'BB_BOR', 'BOR'), { id: 'prod_bb_bor_1', brandCode: 'BOR', subBrandId: 'sb_bb_bor_olive' });
  const order = renameBrandCodeInData({ brandCode: 'BB_FOR', items: [{ productId: 'a', brandCode: 'BB_BOR' }, { productId: 'b', brandCode: 'BB_FOR' }] }, 'BB_BOR', 'BOR')!;
  assert.deepEqual(order.items.map((i: any) => i.brandCode), ['BOR', 'BB_FOR']);
  assert.equal(order.brandCode, 'BB_FOR');
  assert.deepEqual(renameBrandCodeInData({ brandsStocked: ['BB_BOR', 'BOR', 'BB_FOR'] }, 'BB_BOR', 'BOR')!.brandsStocked, ['BOR', 'BB_FOR'], 'no duplicates');
  assert.deepEqual(renameBrandCodeInData({ id: 'workspace', brandPrefixes: { BB_BOR: 'BO', BB_PS: 'PS' } }, 'bb_bor', 'BOR')!.brandPrefixes, { BOR: 'BO', BB_PS: 'PS' });
  assert.equal(renameBrandCodeInData({ brandCode: 'BB_PS', name: 'BB_BOR in a note' }, 'BB_BOR', 'BOR'), null, 'untouched records are not rewritten');
  assert.equal(renameBrandCodeInData({ brandCode: 'BB_BOR' }, 'BB_BOR', 'BB_BOR'), null);
});
