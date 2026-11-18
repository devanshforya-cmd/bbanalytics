import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSingleOrder, extractedOrderTotal, extractOrdersDynamically, parseStatedPrice, splitMessageBlocks, validateExtractedOrder } from '../src/lib/whatsapp-extractor';
import { saveExtractedOrders } from '../src/lib/db/extractor-service';
import { DatabaseService } from '../src/lib/db/db-service';
import { DEFAULT_SUPER_ADMIN } from './fixtures';
import type { Product, Combo, Brand } from '../src/lib/types';
const product = (id: string, name: string, mrp: number, keywords: string[] = []): Product => ({ id, name, mrp, brandId: 'b', brandCode: 'BRAND', sku: `SKU-${id}`, category: 'Care', unitPrice: mrp, thresholdQty: 0, keywords, active: true });
const shampoo = product('shampoo','Rosemary Shampoo 200ml',799);
const conditioner = product('conditioner','Rosemary Conditioner 200ml',799);
const serum = product('serum','Hair Growth Serum 30ml',1119);
const aqua = product('aqua','Underarm Deodorant Roll On Aqua 40ml',399);
const pair: Combo = { id:'pair', brandCode:'BRAND', name:'Hair Care Pair', sku:'PAIR-1', description:'', items:[{productId:'shampoo',productName:shampoo.name,quantity:1,mrp:799},{productId:'conditioner',productName:conditioner.name,quantity:1,mrp:799}], componentProductIds:['shampoo','conditioner'], totalOriginalMrp:1598, comboPrice:1518, comboMrp:1518, savingsPct:5, extractorKeywords:['hair pair'], priceDetectionEnabled:true, active:true, createdAt:'2026-01-01' };
const brand = { id:'b', code:'BRAND', name:'Brand', isActive:true, status:'ACTIVE', color:'#000' } as Brand;
const options = { products:[shampoo,conditioner,serum,aqua], combos:[pair], brands:[brand] };

test('V6-style messages extract customer, two phones, date, address, location, channel, quantities and decimal price', () => {
  const text = '[16/11/26, 10:32] Sales Team: Binita\nContact: +977 984 123 4567\nAlternate: 9812345678\nAddress: Lakeside Road, Pokhara\nProduct: shampu 2 pcs\nCOD- Rs. 1,500.00\nInstagram';
  const order = extractSingleOrder(text, options);
  assert.equal(order.customerName.value,'Binita'); assert.equal(order.customerPhone.value,'9841234567'); assert.equal(order.alternatePhone.value,'9812345678');
  assert.equal(order.orderDateAd.value,'2026-11-16'); assert.equal(order.city.value,'Pokhara'); assert.equal(order.province.value,'Gandaki Province');
  assert.equal(order.address.value,'Lakeside Road, Pokhara'); assert.equal(order.salesChannel,'Instagram'); assert.equal(order.paymentTerms.value,'COD');
  assert.deepEqual(order.products.map(item => [item.productId,item.quantity]),[['shampoo',2]]);
  assert.equal(order.statedPrice.value,1500); assert.equal(order.totalAmount.value,1500); assert.deepEqual(order.extractionErrors,[]);
});

test('splits V6 date-first, time-first, no-year headers and explicit separators without discarding text', () => {
  const text = '[16/11, 10:30] Staff: One\nProduct: shampoo\n[10:31 AM, 16/11/2026] Staff: Two\nProduct: serum\n---\nName: Three\nProduct: aqua';
  const blocks = splitMessageBlocks(text); assert.equal(blocks.length,3); assert.match(blocks[0],/One/); assert.match(blocks[1],/Two/); assert.match(blocks[2],/Three/);
  assert.equal(extractOrdersDynamically(text, options).length,3);
});

test('catalogue names, aliases and new products match without treating pack sizes or phones as quantities', () => {
  const order = extractSingleOrder('Name: Asha\nPhone: 9841234567\nAddress: Kathmandu Road\nProduct: Rosemary Shampoo 200ml\nProduct: 3 x AQ', options);
  assert.deepEqual(order.products.map(item => [item.productId,item.quantity]),[['shampoo',1],['aqua',3]]);
  const newlyAdded = product('new','Vitamin C Face Wash',450);
  assert.equal(extractSingleOrder('Product: Vitamin C Face Wash', {...options,products:[...options.products,newlyAdded]}).products[0]?.productId,'new');
  assert.equal(extractSingleOrder('Product: Vitamin C Face Wash', options).products.length,0);
});

test('explicit combos are matched, but component-price combinations remain separate products', () => {
  const direct = extractSingleOrder('Product: hair pair 2 sets\nserum 1 pc',options);
  assert.deepEqual(direct.products.map(item=>[item.productId,item.quantity]),[['pair',2],['serum',1]]);
  const collapse = extractSingleOrder('Product: shampoo 2 pcs\nconditioner 2 pcs\nTotal: Rs. 3,036.00',options);
  assert.deepEqual(collapse.products.map(item=>[item.productId,item.quantity]),[['shampoo',2],['conditioner',2]]);
  assert(collapse.flags.some(flag => flag.includes('select the combo manually')));
  const almost = extractSingleOrder('Product: shampoo 1 pc\nconditioner 1 pc\nTotal: Rs. 1,550',options);
  assert.deepEqual(almost.products.map(item=>item.productId),['shampoo','conditioner']);
  const disabled = extractSingleOrder('Product: shampoo 1 pc\nconditioner 1 pc\nTotal: Rs. 1518',{...options,combos:[{...pair,priceDetectionEnabled:false}]});
  assert.equal(disabled.products.length,2);
});

test('generic combo keywords never turn separate dash-quantity products into a bundle', () => {
  const wash = {...product('wash','Exfoliating Body Wash',719), extractorKeywords:['body','wash','exfoliating body wash']};
  const bodyCombo: Combo = {...pair, id:'body-combo', name:'Body Care Duo', sku:'BODY-DUO', extractorKeywords:['body','care','brand','combo','kit','pack','body care duo'], items:[{productId:'wash',productName:wash.name,quantity:1,mrp:719},{productId:'aqua',productName:aqua.name,quantity:1,mrp:399}]};
  const current = {...options,products:[...options.products,wash],combos:[bodyCombo]};
  const message = 'Name: Rina\nPhone: 9800001011\nAddress: Chabahil Road\nConditioner- 2 units\nExfoliating body wash -2 units';
  const order = extractSingleOrder(message,current);
  assert.deepEqual(order.products.map(item=>[item.productId,item.quantity]),[['conditioner',2],['wash',2]]);
  assert(!order.products.some(item=>item.isCombo)); assert.equal(order.salesChannel,'Instagram');
  assert.equal(extractSingleOrder('Product: body care duo',current).products[0]?.productId,'body-combo');
  assert(!extractSingleOrder('Product: shampoo kit',current).products.some(item=>item.isCombo));
  const noConditioner = extractSingleOrder(message,{...current,products:current.products.filter(item=>item.id!=='conditioner')});
  assert.deepEqual(noConditioner.products.map(item=>item.productId),['wash']);
  assert(noConditioner.extractionErrors.some(error=>error.includes('unrecognized item')));
  assert(!noConditioner.address.value.includes('Conditioner'));
});

test('a shortened body duo name and a separate roll-on are recognized independently', () => {
  const wash = product('wash','Exfoliating Body Wash',719);
  const bodyCombo: Combo = {...pair,id:'body-duo',name:'Brand Body Care Duo',sku:'BD-01',extractorKeywords:['body care duo'],items:[{productId:'wash',productName:wash.name,quantity:1,mrp:719},{productId:'conditioner',productName:conditioner.name,quantity:1,mrp:799}],comboPrice:1366};
  const current = {...options, products:[...options.products,wash],combos:[bodyCombo],channels:['Instagram','Messenger']};
  const message = 'Name: Rina\nAddress: Garden Road, near school\nPhone: 9800001011\nInside ringroad\n\nBrand body duo\n\n1 unit\nRs 1366\n\nAqua Rollon\n1 unit\nPaid Fonepay\nMessenger';
  const result = extractSingleOrder(message,current);
  assert.deepEqual(result.products.map(item=>[item.productId,item.quantity]),[['body-duo',1],['aqua',1]]);
  assert.equal(result.paymentTerms.value,'Prepaid'); assert.equal(result.salesChannel,'Messenger');
  assert.equal(result.statedPrice.provided,false); assert.equal(result.totalAmount.value,1765);
  assert.equal(result.products[0].saleUnitPrice,1366); assert(!result.extractionErrors.some(error=>error.includes('Review the price')));
  const labelled = extractSingleOrder(message.replace('Rs 1366','Total: Rs 1500'),current);
  assert.equal(labelled.statedPrice.value,1500); assert.equal(labelled.totalAmount.value,1500);
  const ambiguous = {...bodyCombo,id:'other-duo',name:'Other Body Care Duo',sku:'BD-02'};
  const collision = extractSingleOrder('Product: body duo', {...current,combos:[bodyCombo,ambiguous]});
  assert.equal(collision.products.length,0); assert(collision.flags.some(flag=>flag.includes('multiple catalogue items')));
  const combined = extractSingleOrder(message.replace('1 unit\nRs 1366','2 units - Rs 1366'),current);
  assert.equal(combined.products[0].quantity,2); assert(combined.extractionErrors.some(error=>error.includes('Review the price')));
  const each = extractSingleOrder(message.replace('1 unit\nRs 1366','2 units\nRs 1300 each'),current);
  assert.equal(each.products[0].quantity,2); assert.equal(each.products[0].saleUnitPrice,1300); assert.equal(each.totalAmount.value,2999);
  const discounted = extractSingleOrder(message.replace('Rs 1366','Rs 1200'),current);
  assert.equal(discounted.products[0].saleUnitPrice,1200); assert.equal(discounted.totalAmount.value,1599);
  const endPrice = extractSingleOrder(message.replace('Rs 1366\n\n','').replace('Paid Fonepay','Rs 1200\nPaid Fonepay'),current);
  assert(endPrice.extractionErrors.some(error=>error.includes('Review the price')));
  const twoPrices = extractSingleOrder(message.replace('Rs 1366','Rs 1200').replace('Aqua Rollon\n1 unit','Aqua Rollon Rs 350\n1 unit'),current);
  assert.deepEqual(twoPrices.products.map(item=>item.saleUnitPrice),[1200,350]); assert.equal(twoPrices.totalAmount.value,1550);
  const missing = extractSingleOrder(message.replace('Brand body duo','Unknown hair mask'),current);
  assert(missing.flags.some(flag=>flag.startsWith('Unrecognized order item: Unknown hair mask')));
  assert(missing.extractionErrors.some(error=>error.includes('unrecognized item')));
  assert(!missing.address.value.includes('Unknown hair mask'));
});

test('item prices save with catalogue snapshots and flow into monthly product sales', async () => {
  const ws = workspace();
  const input = {...row('ext_12345678-1234-1234-1234-123456789abc'),statedPrice:null,items:[{productId:'pair',quantity:1,expectedUnitPrice:1518,saleUnitPrice:1400},{productId:'aqua',quantity:2,expectedUnitPrice:399}]};
  await saveExtractedOrders({orders:[input]},ws);
  const order = ws.db.getOrders()[0];
  assert.equal(order.totalAmount,2198); assert.deepEqual(order.items.map(item=>[item.catalogUnitPrice,item.totalPrice,item.discountAmount]),[[1518,1400,118],[399,798,0]]);
  const { buildMonthlySalesReport } = await import('../src/lib/monthly-sales-report');
  const report = buildMonthlySalesReport([order],options.products,options.combos,'BRAND','2026-11-01','2026-11-30');
  assert.equal(report.salesCents,219800); assert.equal(report.items.find(item=>item.id==='pair')?.salesCents,140000); assert.equal(report.items.find(item=>item.id==='aqua')?.salesCents,79800);
  await assert.rejects(saveExtractedOrders({orders:[{...input,clientId:'ext_87654321-1234-1234-1234-123456789abc',items:[{...input.items[0],saleUnitPrice:1600}]}]},workspace()),/selling price/i);
  const free=workspace(); await saveExtractedOrders({orders:[{...input,clientId:'ext_abcdef12-1234-1234-1234-123456789abc',items:[{...input.items[0],saleUnitPrice:0}]}]},free); assert.equal(free.db.getOrders()[0].totalAmount,0);
  const { extractorCSV } = await import('../src/lib/extractor-export');
  const { parseCSV } = await import('../src/lib/csv');
  const preview = extractSingleOrder('Name: Rina\nPhone: 9800001011\nAddress: Kathmandu Road\nhair pair\n1 unit\nRs 1400\naqua\n2 units',options);
  const rows = parseCSV(extractorCSV([preview],options.products,'Instagram')).rows;
  assert.deepEqual(rows.map(item=>Number(item['Line Revenue (Rs.)'])),[1400,798]);
});

test('unmentioned channels default to Instagram, while explicitly named channels remain distinct', () => {
  assert.equal(extractSingleOrder('Product: shampoo', {...options,channels:['Instagram','WhatsApp']}).salesChannel,'Instagram');
  assert.equal(extractSingleOrder('Product: shampoo\nMessenger', {...options,channels:['Instagram','Messenger']}).salesChannel,'Messenger');
  assert.equal(extractSingleOrder('Product: shampoo\nPlatform: NewSocial', {...options,channels:['Instagram','WhatsApp']}).salesChannel,'NewSocial');
  assert.equal(extractSingleOrder('Product: shampoo', {...options,channels:['WhatsApp']}).salesChannel,undefined);
});

test('ambiguous aliases, missing customer fields, invalid dates and archived items require review', () => {
  const other = product('other','Second Aqua Roll On',450);
  const order = extractSingleOrder('[31/02/2026, 10:30] Staff: aqua', {...options,products:[...options.products,other]});
  assert.equal(order.products.length,0); assert(order.flags.some(flag=>flag.includes('multiple catalogue items')));
  assert(order.flags.some(flag=>flag.includes('invalid'))); assert(validateExtractedOrder(order).length >= 4);
  assert.equal(extractSingleOrder('Product: serum',{...options,products:options.products.map(p=>p.id==='serum'?{...p,active:false}:p)}).products.length,0);
  assert.equal(parseStatedPrice('COD- Rs.517'),517); assert.equal(parseStatedPrice('Phone 9841234567\n200ml'),null);
});

function workspace(products = options.products, combos = options.combos) {
  const db = new DatabaseService({server:true}); db.replaceBrands([brand]); db.hydrateSnapshot({products,combos,orders:[],customers:[],influencers:[]},DEFAULT_SUPER_ADMIN);
  let commits=0; return {db, commit:async()=>{commits++}, get commits(){return commits}};
}
const row = (id:string) => ({ clientId:id, customerName:'Asha', customerPhone:'+977 984-123-4567', alternatePhone:'9812345678', province:'Bagmati Province', city:'Kathmandu', address:'Thamel Road', orderDateAd:'2026-11-16', platform:'WhatsApp', deliveryMethod:'Pathao', paymentTerms:'COD', statedPrice:1500, isMarketing:false, influencerId:'', items:[{productId:'shampoo',quantity:1,expectedUnitPrice:799},{productId:'conditioner',quantity:1,expectedUnitPrice:799}] });

test('server confirms an atomic order/customer save, retains both phones, allocates discount exactly and retries idempotently', async () => {
  const ws=workspace(); const input={orders:[row('ext_12345678-1234-1234-1234-123456789abc')]};
  const result=await saveExtractedOrders(input,ws); assert.equal(ws.commits,1); assert.equal(result.alreadySaved,0);
  const order=ws.db.getOrders()[0]; assert.equal(order.customerPhone,'9841234567'); assert.equal(order.alternatePhone,'9812345678');
  assert.equal(order.totalAmount,1500); assert.equal(order.items.reduce((sum,item)=>sum+item.totalPrice,0),1500); assert.equal(order.items.reduce((sum,item)=>sum+(item.discountAmount||0),0),98);
  assert.equal(ws.db.getCustomers().length,1); assert.equal(ws.db.getCustomers()[0].totalOrders,1);
  const retry=await saveExtractedOrders(input,ws); assert.equal(retry.alreadySaved,1); assert.equal(ws.db.getOrders().length,1); assert.equal(ws.commits,1);
  await assert.rejects(saveExtractedOrders({orders:[{...input.orders[0],customerName:'Different'}]},ws),/already saved with different details/);
});

test('server refuses stale prices, incomplete batches, ambiguous product IDs and failed persistence', async () => {
  const invalid=workspace(); const valid=row('ext_12345678-1234-1234-1234-123456789abc');
  await assert.rejects(saveExtractedOrders({orders:[valid,{...row('ext_87654321-1234-1234-1234-123456789abc'),customerPhone:''}]},invalid),/phone/i);
  assert.equal(invalid.db.getOrders().length,0); assert.equal(invalid.commits,0);
  await assert.rejects(saveExtractedOrders({orders:[{...valid,items:[{productId:'shampoo',quantity:1,expectedUnitPrice:1}]}]},workspace()),/changed or invalid catalogue price/);
  await assert.rejects(saveExtractedOrders({orders:[{...valid,items:[{productId:'unknown',quantity:1,expectedUnitPrice:799}]}]},workspace()),/unavailable item/);
  const failed=workspace(); await assert.rejects(saveExtractedOrders({orders:[valid]},{db:failed.db,commit:async()=>{throw new Error('storage unavailable')}}),/storage unavailable/);
});

test('CSV keeps V6 follow-ups and discount totals while protecting spreadsheet formulas', async () => {
  const { extractorCSV, followUpDates } = await import('../src/lib/extractor-export');
  const { parseCSV } = await import('../src/lib/csv');
  const order = extractSingleOrder('Name: Asha\nPhone: 9841234567\nAddress: Kathmandu Road\nProduct: shampoo 1 pc\nconditioner 1 pc\nTotal: Rs 1500', {...options,dateOverride:'2026-11-16'});
  order.customerName.value = '=unsafe formula'; order.alternatePhone.value = '+9779812345678';
  const csv=extractorCSV([order],options.products,'WhatsApp'); const parsed=parseCSV(csv);
  assert.equal(parsed.rows.length,2); assert.equal(parsed.rows[0]['Customer Name'],"'=unsafe formula");
  assert.equal(parsed.rows[0]['Alternate Phone Number'],"'+9779812345678");
  assert.equal(parsed.rows.reduce((sum,row)=>sum+Number(row['Line Revenue (Rs.)']),0),1500);
  assert.deepEqual(followUpDates('2026-11-16'),['2026-12-07','2027-01-16']);
  assert.deepEqual(followUpDates('2026-12-31'),['2027-01-21','2027-02-28']);
});

test('existing customer is matched across phone formats and updated exactly once; marketing sends do not create customers', async () => {
  const ws=workspace();
  ws.db.addCustomer({phone:'+977-9841234567',name:'Existing',city:'Kathmandu',province:'Bagmati Province',firstOrderDate:'2026-01-01',lastOrderDate:'2026-01-01',totalOrders:1,totalDelivered:0,totalReturns:0,totalDeliveryFailures:0,totalCancellations:0,totalComplaints:0,totalReviews:0,karmaScore:72,segment:'NEW',activeFlags:[],brandsPurchased:['BRAND']});
  await saveExtractedOrders({orders:[row('ext_12345678-1234-1234-1234-123456789abc')]},ws);
  assert.equal(ws.db.getCustomers().length,1); assert.equal(ws.db.getCustomers()[0].totalOrders,2);
  const market=workspace(); assert.throws(() => market.db.addOrder({orderNumber:'TEST-MARKET',brandCode:'BRAND',orderDateAd:'2026-11-16',orderDateBs:'',platform:'WhatsApp',customerName:'Creator',customerPhone:'9812345678',province:'Bagmati',district:'Kathmandu',address:'Thamel',deliveryMethod:'Pathao',paymentTerms:'Advance',orderType:'NEW',items:[{productId:'shampoo',productName:shampoo.name,brandCode:'BRAND',quantity:1,unitPrice:0,totalPrice:0}],totalAmount:0,status:'PENDING',source:'WHATSAPP_EXTRACTOR',isMarketing:true}), /influencer profile/);
  assert.equal(market.db.getCustomers().length,0);
});

test('V6 combo aliases derive from saved names without guessing an ordinary product description', () => {
  const rescue = {...pair, id:'rescue', name:'Hairfall Rescue Kit – Shampoo + Conditioner + Serum', sku:'RESCUE', items:[...pair.items,{productId:'serum',productName:serum.name,quantity:1,mrp:1119}], comboPrice:2580, extractorKeywords:[]};
  const summer = {...pair,id:'summer',name:'Summer Set',sku:'SUMMER',extractorKeywords:[]};
  assert.equal(extractSingleOrder('Product: rescue kit 2 kits',{...options,combos:[rescue,summer]}).products[0]?.productId,'rescue');
  assert.equal(extractSingleOrder('Product: hairfall trio',{...options,combos:[rescue,summer]}).products[0]?.productId,'rescue');
  assert.equal(extractSingleOrder('Product: summer combo',{...options,combos:[rescue,summer]}).products[0]?.productId,'summer');
  assert.equal(extractSingleOrder('Product: hair care shampoo',{...options,combos:[pair]}).products[0]?.productId,'shampoo');
});

test('large and zero quantities or zero prices never silently become a one-item full-price order', () => {
  const big=extractSingleOrder('Name: Asha\nPhone: 9841234567\nAddress: Kathmandu Road\nProduct: shampoo 100 pcs\nTotal: Rs 0',options);
  assert.equal(big.products[0].quantity,100); assert.equal(big.statedPrice.value,0); assert.equal(big.statedPrice.provided,true); assert.equal(big.totalAmount.value,0);
  const zero=extractSingleOrder('Name: Asha\nPhone: 9841234567\nAddress: Kathmandu Road\nProduct: shampoo x 0',options);
  assert.equal(zero.products[0].quantity,0); assert(zero.extractionErrors.some(error=>error.includes('quantities')));
});

test('unlabeled locations and separated quantity lines retain delivery zones', () => {
  const text = '[16/11/2026, 12:58:15] ~ Sales: Rina Limbu\nDang ghorahi\n9800001011\nOUTSIDE VALLEY\n\nUnderarm rollon aqua\n\n2 units\nMessenger';
  const order = extractSingleOrder(text, options);
  assert.equal(order.customerName.value, 'Rina Limbu');
  assert.equal(order.address.value, 'Dang ghorahi, OUTSIDE VALLEY');
  assert.equal(order.city.value, 'Ghorahi'); assert.equal(order.province.value, 'Lumbini Province');
  assert.equal(order.products[0].quantity, 2); assert.equal(order.salesChannel, 'Messenger');
  assert.deepEqual(order.extractionErrors, []);
});

test('unrecognized address text is retained for review without guessing city or province', () => {
  const text = '[16/11/2026, 12:58:15] ~ Sales: Rina Limbu\n9800001011\nSilver Orchard Sector 7\nOutside Valley\n\nunderarm rollon aqua\n\n1 unit\nMessenger';
  const order = extractSingleOrder(text, options);
  assert.equal(order.address.value, 'Silver Orchard Sector 7, Outside Valley');
  assert.equal(order.address.confidence, 'REVIEW');
  assert.equal(order.city.value, ''); assert.equal(order.province.value, '');
  assert.deepEqual(order.extractionErrors, []);
  const multi = extractSingleOrder('[16/11/2026, 12:58:15] ~ Sales: Rina Limbu\n9800001011\nSilver Orchard Sector 7\nnear Blue School\nOutside Valley\nunderarm rollon aqua\n1 unit\nMessenger', options);
  assert.equal(multi.address.value, 'Silver Orchard Sector 7, near Blue School, Outside Valley');
  const missing = extractSingleOrder('[16/11/2026, 12:58:15] ~ Sales: Rina Limbu\n9800001011\nunderarm rollon aqua\n1 unit\nMessenger', options);
  assert.equal(missing.address.value, ''); assert(missing.extractionErrors.some(error => error.includes('delivery address')));
  const noAddress = extractSingleOrder('Name: Rina\nPhone: 9800001011\nAddress:\nProduct: aqua\nQuantity: 1\nML', options);
  assert.equal(noAddress.address.value, '');
});

test('address text is retained even without catalogue matches and labels can omit punctuation', () => {
  const empty = {...options, products:[], combos:[]};
  const beforePhone = extractSingleOrder('[16/11/2026, 15:29:48] ~ Sales: Mira\nSilver Orchard Police Station\n9800001011\nInside ringroad\n\nUnlisted item - 2 units', empty);
  assert.equal(beforePhone.address.value, 'Silver Orchard Police Station, Inside ringroad');
  assert(beforePhone.extractionErrors.some(error => error.includes('catalogue')));
  const labelled = extractSingleOrder('[16/11/2026, 15:31:06] ~ Sales: Name Rina Karki\nNo 9800001011\nLocation Silver Orchard\nOutside ringroad\nUnlisted item', empty);
  assert.equal(labelled.customerName.value, 'Rina Karki');
  assert.equal(labelled.address.value, 'Silver Orchard, Outside ringroad');
  assert.equal(labelled.city.value, ''); assert.equal(labelled.province.value, '');
});

test('orders can be saved without a city or province and completed later', async () => {
  const ws = workspace();
  await saveExtractedOrders({orders:[{...row('ext_12345678-1234-1234-1234-123456789abc'),city:'',province:'  ',address:'Silver Orchard Sector 7'}]},ws);
  const order = ws.db.getOrders()[0];
  assert.equal(order.district, ''); assert.equal(order.province, ''); assert.equal(order.address, 'Silver Orchard Sector 7');
  ws.db.updateOrder(order.id, {district:'Example City',province:'Example Province'});
  assert.equal(ws.db.getOrders()[0].district, 'Example City');
  assert.equal(ws.db.getOrders()[0].province, 'Example Province');
  assert.equal(ws.db.getOrders()[0].totalAmount, 1500);
  await assert.rejects(saveExtractedOrders({orders:[{...row('ext_87654321-1234-1234-1234-123456789abc'),city:123}]},workspace()), /city/);
});

test('order discounts use the current catalogue, and a written total wins over the percentage', async () => {
  const base = 'Name: Rina\nPhone: 9800001011\nAddress: Kathmandu Road\nProduct: shampoo 2 pcs';
  const discounted = extractSingleOrder(`${base}\n10% off`, options);
  assert.equal(discounted.discountPercent?.value, 10); assert.equal(discounted.totalAmount.value, 1438);
  assert.equal(extractSingleOrder(`${base}\nVAT 13%`, options).totalAmount.value, 1598);
  const written = extractSingleOrder(`${base}\n10% discount\nTotal: Rs 1400`, options);
  assert.equal(written.extractionErrors.length, 0); assert.equal(written.totalAmount.value, 1400);
  assert.ok(written.flags.some((flag) => /Written price NPR 1,400 is used\. It differs from 10% off/.test(flag)));
  const ws = workspace(); const valid = {...row('ext_12345678-1234-1234-1234-123456789abc'), statedPrice: null, discountPercent: 10};
  await saveExtractedOrders({orders:[valid]}, ws);
  assert.equal(ws.db.getOrders()[0].totalAmount, 1438);
  assert.equal(ws.db.getOrders()[0].items.reduce((sum,item)=>sum+Math.round(item.totalPrice*100),0),143800);
  const written2 = workspace(); await saveExtractedOrders({orders:[{...valid, statedPrice:1400}]}, written2);
  assert.equal(written2.db.getOrders()[0].totalAmount, 1400); assert.equal(written2.db.getOrders()[0].discountPercent, 10); assert.equal(written2.db.getOrders()[0].statedPrice, 1400);
});

test('newly configured channel and logistics names are recognized in pasted messages', () => {
  const order = extractSingleOrder('Name: Rina\nPhone: 9800001011\nAddress: Kathmandu Road\nProduct: aqua\nNewSocial\nQuickCourier', {...options, channels:['NewSocial'], deliveryMethods:['QuickCourier']});
  assert.equal(order.salesChannel, 'NewSocial'); assert.equal(order.deliveryMethod.value, 'QuickCourier');
});

test('generic free shipping and millilitres do not invent a fragrance-free item or Website channel', () => {
  const fragranceFree=product('free','Fragrance Free Underarm Roll On',399);
  const current={...options,products:[...options.products,fragranceFree]};
  const normal=extractSingleOrder('Name: Asha\nPhone: 9841234567\nAddress: Kathmandu Road\nProduct: shampoo 200 ml\nDelivery free',current);
  assert.deepEqual(normal.products.map(item=>item.productId),['shampoo']); assert.equal(normal.salesChannel,'Instagram');
  assert.equal(extractSingleOrder('Product: fragrance free',current).products[0]?.productId,'free');
});

test('two orders for one phone in a batch update one customer twice', async () => {
  const ws=workspace(); const first=row('ext_12345678-1234-1234-1234-123456789abc');
  const second={...row('ext_87654321-1234-1234-1234-123456789abc'),customerPhone:'9841234567'};
  await saveExtractedOrders({orders:[first,second]},ws);
  assert.equal(ws.db.getOrders().length,2); assert.equal(ws.db.getCustomers().length,1); assert.equal(ws.db.getCustomers()[0].totalOrders,2); assert.equal(ws.commits,1);
});

test('a named combo and extra products on the same line are retained without duplicating explanatory components', () => {
  const combined=extractSingleOrder('Product: hair pair + serum 1 pc',options);
  assert.deepEqual(combined.products.map(item=>item.productId),['pair','serum']);
  const extra=extractSingleOrder('Product: hair pair + shampoo 2 pcs',options);
  assert.deepEqual(extra.products.map(item=>[item.productId,item.quantity]),[['pair',1],['shampoo',2]]);
  const explanation=extractSingleOrder('Product: hair pair (shampoo + conditioner)',options);
  assert.deepEqual(explanation.products.map(item=>item.productId),['pair']);
});

test('a written price on its own line wins over the catalogue and the percentage (17 Nov example)', () => {
  const message = 'Name:Ashu rai\nContact No.:9807952036\nLocation: Birtamode jhapa\nOUTSIDE VALLEY \n\nAqua rollon\n\n5 units\n1895\n5% off\n\nTiktok';
  const order = extractSingleOrder(message, options);
  assert.deepEqual(order.products.map((item) => [item.productId, item.quantity]), [['aqua', 5]]);
  assert.equal(order.statedPrice.value, 1895); assert.equal(order.statedPrice.provided, true);
  assert.equal(order.discountPercent?.value, 5);
  assert.equal(extractedOrderTotal(order), 1895);
  assert.deepEqual(validateExtractedOrder(order), []);
  assert.ok(order.flags.some((flag) => flag.startsWith('Written price NPR 1,895 is used (5% off')));
  // A bare amount under one unit is that unit's price; one above every unit price is the order total.
  assert.equal(extractSingleOrder('Name: Sita\nPhone: 9841234567\nAddress: Thamel Kathmandu\nAqua rollon\n350', options).products[0].saleUnitPrice, 350);
  const total = extractSingleOrder('Name: Sita\nPhone: 9841234567\nAddress: Thamel Kathmandu\nAqua rollon 2 pcs\n700', options);
  assert.equal(total.products[0].quantity, 2); assert.equal(extractedOrderTotal(total), 700); assert.deepEqual(validateExtractedOrder(total), []);
  // More than the items are worth is never guessed.
  assert.match(validateExtractedOrder(extractSingleOrder('Name: Sita\nPhone: 9841234567\nAddress: Thamel Kathmandu\nAqua rollon\n2 units\n5000', options)).join(' '), /Review the price/);
});
