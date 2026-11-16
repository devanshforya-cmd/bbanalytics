import test from 'node:test';
import assert from 'node:assert/strict';
import { editProduct, editCombo } from '../src/lib/catalog-edit';
import type { Product, Combo } from '../src/lib/types';

const first: Product = { id:'p1', brandId:'b', brandCode:'BB', name:'Wash', sku:'P1', category:'Care', unitPrice:100, mrp:100, thresholdQty:0, keywords:[], active:true };
const second: Product = { ...first, id:'p2', sku:'P2', name:'Serum', mrp:200, unitPrice:150 };
const combo: Combo = { id:'c1', brandCode:'BB', name:'Care Duo', sku:'C1', description:'', items:[{productId:'p1',productName:'Wash',quantity:1,mrp:100},{productId:'p2',productName:'Serum',quantity:1,mrp:200}], totalOriginalMrp:300, comboPrice:250, savingsPct:16.7, active:true, createdAt:'2026-01-01' };
const productUpdates = { name:'Wash New', sku:'P1', category:'Care', mrp:120, caseSize:'', thresholdQty:0, orderUnitMode:'BOTH', keywords:[], extractorKeywords:['wash'] };
const comboUpdates = { name:'Care Duo', sku:'C1', description:'', items:[{productId:'p1',quantity:2},{productId:'p2',quantity:1}], comboPrice:350, extractorKeywords:['care duo'], priceDetectionEnabled:true };

test('product MRP changes without mutating prior catalogue objects', () => {
  const updated = editProduct(first, productUpdates, [first, second, combo]);
  assert.equal(updated.mrp,120); assert.equal(updated.unitPrice,120); assert.equal(first.mrp,100);
  assert.equal(editProduct(second, {...productUpdates,sku:'P2'}, [first,second,combo]).unitPrice,150);
  assert.throws(() => editProduct(first, {...productUpdates,mrp:0}, [first]));
  assert.throws(() => editProduct(first, {...productUpdates,sku:'P2'}, [first,second]));
});

test('combo editing uses current product prices, recalculates its discount and retains history', () => {
  const edited = editCombo(combo,comboUpdates,[{...first,mrp:120},second],[first,second,combo],'Admin');
  assert.equal(edited.totalOriginalMrp,440); assert.equal(edited.comboPrice,350); assert.equal(edited.savingsPct,20.5);
  assert.deepEqual(edited.items.map(item => item.mrp),[120,200]); assert.equal(combo.comboPrice,250); assert.equal(edited.editHistory?.[0].previousMrp,250);
  assert.throws(() => editCombo(combo,{...comboUpdates,comboPrice:500},[first,second],[first,second,combo],'Admin'));
  assert.throws(() => editCombo(combo,{...comboUpdates,items:[{productId:'p1',quantity:1},{productId:'p1',quantity:1}]},[first,second],[first,second,combo],'Admin'));
  assert.throws(() => editCombo(combo,comboUpdates,[{...first,active:false},second],[first,second,combo],'Admin'));
  assert.throws(() => editCombo(combo,comboUpdates,[{...first,brandCode:'OTHER'},second],[first,second,combo],'Admin'));
});
