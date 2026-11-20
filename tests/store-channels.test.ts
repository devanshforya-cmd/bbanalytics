import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STORE_CHANNELS, channelLabel, channelOfDistributor, channelOfRetailer, missingDistributor, storeChannel } from '../src/lib/store-channels.ts';
import { DATASETS } from '../src/lib/export/datasets.ts';

test('four store types: MT needs no distributor, the rest should name one', () => {
  assert.deepEqual(STORE_CHANNELS.map((c) => c.label), ['MT', 'SAMT', 'Distributor', 'Retail store']);
  assert.equal(storeChannel('CHAIN_STORE').wantsDistributor, false);
  for (const type of ['SAMT', 'DISTRIBUTOR', 'STANDALONE_RETAILER'] as const) assert.equal(storeChannel(type).wantsDistributor, true, type);
  assert.equal(missingDistributor('SAMT', ''), true);
  assert.equal(missingDistributor('SAMT', 'dist_1'), false);
  assert.equal(missingDistributor('CHAIN_STORE', ''), false);
});

test('older records read as the right type', () => {
  assert.equal(channelOfDistributor({ type: 'Retail Chain' }), 'CHAIN_STORE');
  assert.equal(channelOfDistributor({ type: 'Pharmacy Chain' }), 'CHAIN_STORE');
  assert.equal(channelOfDistributor({ type: 'Distributor' }), 'DISTRIBUTOR');
  assert.equal(channelOfDistributor({ storeType: 'DISTRIBUTOR', type: 'Retail Chain' }), 'DISTRIBUTOR');
  assert.equal(channelOfRetailer({}), 'STANDALONE_RETAILER');
  assert.equal(channelOfRetailer({ storeType: 'SAMT' }), 'SAMT');
  assert.equal(channelLabel('STANDALONE_RETAILER'), 'Retail store');
});

test('the stores sheet shows type, chain and supplying distributor', () => {
  const empty: any = { distributors: [{ id: 'd1', name: 'Himal Mart', type: 'Retail Chain', storeType: 'CHAIN_STORE', city: 'Kathmandu', contactName: '', contactPhone: '', contacts: [], brandsCarried: [] }],
    branches: [{ id: 'b1', distributorId: 'd1', distributorName: 'Himal Mart', name: 'Himal Mart Naxal', address: 'Naxal', lat: 0, lng: 0, assignedOfficerId: '', assignedOfficerName: '', contactName: '', contactRole: '', contactPhone: '', contacts: [], brandsAvailable: [] }],
    retailers: [{ id: 'r1', name: 'Sagun Cosmetics', type: 'Cosmetics', storeType: 'SAMT', city: 'Kathmandu', area: 'Baneshwor', address: '', lat: 27.7, lng: 85.3, assignedOfficerId: '', assignedOfficerName: '', contactName: '', contactRole: '', contactPhone: '', contacts: [], brandsStocked: [] }] };
  const sheet = DATASETS.find((d) => d.key === 'stores')!.build(empty, {});
  assert.deepEqual(sheet.columns.slice(0, 4).map((c) => c.header), ['Name', 'Store type', 'Chain (for MT outlets)', 'Supplied by distributor']);
  assert.deepEqual(sheet.rows.map((r) => r.slice(0, 4)), [['Himal Mart', 'MT chain (head office)', 'Himal Mart', ''], ['Himal Mart Naxal', 'MT outlet', 'Himal Mart', ''], ['Sagun Cosmetics', 'SAMT', '', 'Not assigned']]);
});

test('store details never invent phone numbers, credit limits or names', () => {
  const source = readFileSync('src/lib/db/db-service.ts', 'utf8');
  const fn = source.slice(source.indexOf('public getUnifiedStoreById'), source.indexOf('public getStoresUnified'));
  assert.doesNotMatch(fn, /\+977-98/);
  assert.doesNotMatch(fn, /500000|85000/);
  assert.doesNotMatch(fn, /'Field Officer'|'Store Manager'|'Proprietor'|'Operations Lead'|'Central Distributor'/);
});

test('adding distributors and MT chains follows its own Add permission', () => {
  const page = readFileSync('src/app/offline-sales/stores/page.tsx', 'utf8');
  assert.match(page, /canCreateAccounts = canPerform\(currentUser, 'distributors', 'CREATE'\)/);
  assert.match(page, /c\.account === 'distributors' \? canCreateAccounts : canCreateStores/);
  assert.doesNotMatch(page, /\+977-9800000000|accounts@distributor\.np|procurement@chain\.np/);
  assert.match(readFileSync('src/app/settings/page.tsx', 'utf8'), /<StoreCategoriesSettings \/>/);
});
