import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlySalesReport } from '../src/lib/monthly-sales-report';
import type { Combo, Order, Product } from '../src/lib/types';

const product = {id:'p',name:'Wash',brandCode:'B',mrp:100,active:true} as Product;
const combo = {id:'c',name:'Duo',brandCode:'B',comboPrice:150,active:true} as Combo;
const order = (id:string, date:string, platform:string, status:string, items:unknown[], brandCode='B') => ({id,orderDateAd:date,platform,status,brandCode,items}) as Order;
const report = () => buildMonthlySalesReport([
  order('a','2026-06-01','Messenger','PENDING',[{productId:'p',productName:'Wash',quantity:2,unitPrice:90,totalPrice:180},{productId:'c',productName:'Duo',quantity:1,unitPrice:135,totalPrice:135}]),
  order('b','2026-06-01','Facebook','DELIVERED',[{productId:'p',productName:'Wash',quantity:1,unitPrice:100,totalPrice:100}]),
  order('c','2026-06-02','Instagram','CANCELLED',[{productId:'p',quantity:4,totalPrice:400}]),
  order('d','2026-06-02','WhatsApp','RETURNED',[{productId:'p',quantity:1,totalPrice:100}]),
  order('e','2026-06-03','New platform','FAILED',[{productId:'removed',productName:'Old item',quantity:1,totalPrice:77}]),
  order('f','2026-06-03','Website','PENDING',[{productId:'p',quantity:1,totalPrice:100}],'OTHER'),
  {...order('m','2026-06-03','Instagram','PENDING',[{productId:'p',quantity:1,totalPrice:0}]),isMarketing:true},
], [product], [combo], 'B','2026-06-01','2026-06-03');

test('counts original orders separately from units, excludes marketing sends and merges Facebook and Messenger', () => {
  const data=report(); assert.equal(data.orderCount,5); assert.equal(data.channels['Facebook / Messenger'],2); assert.equal(data.channels.Other,1);
  assert.equal(data.days[0].orderCount,2); assert.equal(data.days[0].quantities.p,3); assert.equal(data.days[0].quantities.c,1); assert.equal(data.days[1].orderCount,2);
  assert.equal(data.items.find(item=>item.id==='p')?.quantity,8); assert.equal(data.items.find(item=>item.id==='c')?.quantity,1);
});
test('uses recorded discounted line totals, keeps deleted items and does not manufacture a historical price', () => {
  const data=report(); assert.equal(data.salesCents,99200); assert.equal(data.items.find(item=>item.id==='p')?.salesCents,78000);
  assert.deepEqual([data.items.find(item=>item.id==='removed')?.kind,data.items.find(item=>item.id==='removed')?.currentPrice],['Historical item',null]);
});
