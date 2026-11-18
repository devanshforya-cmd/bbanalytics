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
  // The cancelled order is still an order placed, shown apart, but its 4 units are not sold.
  assert.equal(data.cancelledCount,1); assert.equal(data.days[1].cancelled,1);
  assert.equal(data.items.find(item=>item.id==='p')?.quantity,4); assert.equal(data.items.find(item=>item.id==='c')?.quantity,1);
});
test('uses recorded discounted line totals, keeps deleted items and does not manufacture a historical price', () => {
  const data=report(); assert.equal(data.salesCents,59200); assert.equal(data.items.find(item=>item.id==='p')?.salesCents,38000);
  assert.deepEqual([data.items.find(item=>item.id==='removed')?.kind,data.items.find(item=>item.id==='removed')?.currentPrice],['Historical item',null]);
});

test('splits MRP, offers, customer discounts and net; gifts and exchanges stay out of sales; sale days are marked', () => {
  const sale = { id:'s1', name:'Dashain Sale', brandCodes:['B'], channels:[], startsAt:'2026-06-02T00:00', endsAt:'2026-06-02T23:59', status:'SCHEDULED', offers:[], createdAt:'' } as any;
  const priced = {...order('x','2026-06-02','Instagram','DELIVERED',[
    {productId:'p',productName:'Wash',quantity:2,catalogUnitPrice:100,offerDiscount:20,customerDiscount:10,discountAmount:30,unitPrice:85,totalPrice:170},
    {productId:'p',productName:'Wash',quantity:1,catalogUnitPrice:100,unitPrice:0,totalPrice:0,isGift:true}]),
    appliedOffers:[{offerId:'o',offerName:'10%',campaignId:'s1',campaignName:'Dashain Sale',amount:20},{offerId:'g',offerName:'Gift',campaignId:'s1',campaignName:'Dashain Sale',amount:0,giftQuantity:1}], customerDiscount:10, customerDiscountReason:'Loyal customer'} as Order;
  const legacy = order('y','2026-06-01','Website','DELIVERED',[{productId:'p',productName:'Wash',quantity:1,catalogUnitPrice:100,discountAmount:5,unitPrice:95,totalPrice:95}]);
  const exchange = {...order('z','2026-06-02','Instagram','PENDING',[{productId:'p',quantity:1,totalPrice:0}]),exchangeRequested:true} as Order;
  const data = buildMonthlySalesReport([priced, legacy, exchange],[product],[combo],'B','2026-06-01','2026-06-03',[sale]);
  const wash = data.items.find(item=>item.id==='p')!;
  assert.deepEqual([wash.quantity,wash.mrpCents,wash.offerCents,wash.customerCents,wash.salesCents,wash.giftUnits,wash.giftCents],[3,30000,2000,1500,26500,1,10000]);
  assert.equal(data.orderCount,2,'the exchange replacement is not an order placed');
  assert.deepEqual(data.days.map(day=>day.sales),[[],['Dashain Sale'],[]]);
  assert.deepEqual(data.discountReasons,[{reason:'Loyal customer',orders:1,cents:1000},{reason:'Not given',orders:1,cents:500}]);
  assert.deepEqual(data.sales.map(row=>[row.name,row.orders,row.offerCents,row.netCents,row.giftUnits]),[['Dashain Sale',1,2000,17000,1]]);
  assert.equal(data.channelSales.Instagram,17000); assert.equal(data.channelSales.Website,9500);
});
