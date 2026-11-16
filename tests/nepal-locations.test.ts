import test from 'node:test';
import assert from 'node:assert/strict';
import { NEPAL_LOCATIONS, NEPAL_PROVINCES, cityMatchesProvince, filterLocationOptions, locationsForProvince, provinceByName } from '../src/lib/nepal-locations';

test('offline Nepal reference includes seven provinces, all districts and 753 local levels', () => {
  assert.equal(NEPAL_PROVINCES.length, 7);
  assert.equal(NEPAL_LOCATIONS.filter(item => item.type === 'District').length, 77);
  assert.equal(NEPAL_LOCATIONS.filter(item => item.type !== 'District').length, 753);
  assert.equal(new Set(NEPAL_LOCATIONS.map(item => item.id)).size, 830);
  assert.equal(new Set(NEPAL_LOCATIONS.filter(item => item.type !== 'District').map(item => `${item.province}:${item.district}:${item.name.toLowerCase()}`)).size, 753);
  assert.deepEqual(NEPAL_PROVINCES.map(province => locationsForProvince(province.name).filter(item => item.type !== 'District').length), [137,136,119,85,109,79,88]);
});

test('province selection filters city and district choices without leaking other provinces', () => {
  const bagmati = locationsForProvince('Bagmati Province');
  assert(bagmati.some(item => item.name === 'Kathmandu'));
  assert(!bagmati.some(item => item.name === 'Pokhara'));
  assert(cityMatchesProvince('Pokhara', 'Gandaki Province'));
  assert(!cityMatchesProvince('Pokhara', 'Bagmati Province'));
  assert(cityMatchesProvince('Ghorahi', 'Lumbini Province'));
  assert(cityMatchesProvince('Dhurkot', 'Lumbini Province'));
  assert.equal(provinceByName('bagmati')?.name, 'Bagmati Province');
  assert.equal(locationsForProvince('unrecognized province').length, 0);
  assert.equal(locationsForProvince('').length, 830);
});

test('typeahead filters and prioritizes matching names, including Nepali text', () => {
  const options = locationsForProvince('Gandaki Province').map(item => ({ title:item.name, detail:item.district, search:`${item.name} ${item.nepali} ${item.district}` }));
  const latin = filterLocationOptions(options, 'pOKH');
  assert.equal(latin[0]?.title, 'Pokhara');
  assert(latin.every(item => /pokh/i.test(item.search)));
  assert(filterLocationOptions(options, 'पोखरा').some(item => item.title === 'Pokhara'));
  assert.equal(filterLocationOptions(options, 'no-such-place-123').length, 0);
});

test('same-named local areas in one province retain distinct selectable values', () => {
  const groups = new Map<string, typeof NEPAL_LOCATIONS>();
  for (const item of NEPAL_LOCATIONS.filter(item => item.type !== 'District')) {
    const key = `${item.province}:${item.name.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  const duplicates = [...groups.values()].filter(group => group.length > 1);
  assert(duplicates.length > 0);
  for (const group of duplicates) assert.equal(new Set(group.map(item => item.value)).size, group.length);
});
