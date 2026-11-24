import { DEFAULT_SUPER_ADMIN } from './fixtures';
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshGpsFix, parseNativeFix, validGpsCoordinates, geolocationMessage } from '../src/lib/gps-validation.ts';
import { DatabaseService } from '../src/lib/db/db-service.ts';

const now = Date.parse('2026-10-29T12:00:00.000Z');
test('only fresh bounded device fixes qualify for check-in and browser retry', () => {
  const fix = { lat: 27.7, lng: 85.3, capturedAt: new Date(now).toISOString() };
  assert.equal(freshGpsFix(fix, now), true);
  assert.equal(freshGpsFix({ ...fix, capturedAt: new Date(now - 120001).toISOString() }, now), false);
  assert.equal(freshGpsFix({ ...fix, capturedAt: new Date(now + 5001).toISOString() }, now), false);
  assert.equal(freshGpsFix({ ...fix, lat: Infinity }, now), false);
  assert.equal(validGpsCoordinates(0, 0), true);
  assert.equal(validGpsCoordinates(91, 85), false);
  assert.equal(validGpsCoordinates(27, NaN), false);
  assert.match(geolocationMessage(1), /browser settings/);
});

test('OsmAnd receiver handles seconds, milliseconds and ISO device timestamps', () => {
  for (const value of [String(now / 1000), String(now), new Date(now).toISOString()]) {
    const fix = parseNativeFix(new URLSearchParams({ lat: '27.7', lon: '85.3', timestamp: value, accuracy: '12', batt: '80' }), now);
    assert.equal(fix.capturedAt, new Date(now).toISOString());
    assert.equal(fix.batteryLevel, 80);
    assert.equal(fix.accuracy, 12);
  }
});

test('native receiver rejects invalid fixes, missing coordinates and stale/future device data', () => {
  const values = { lat: '27.7', lon: '85.3', timestamp: String(now) };
  const invalid: Record<string, string>[] = [{ lat: '' }, { lat: '100' }, { lon: 'NaN' }, { valid: 'false' }, { timestamp: '' }, { timestamp: String(now + 120001) }, { timestamp: String(now - 86400001) }, { batt: '101' }, { accuracy: '-1' }];
  for (const changes of invalid) {
    const params = new URLSearchParams({ ...values, ...changes });
    assert.throws(() => parseNativeFix(params, now));
  }
});

test('beat assignment never invents store pins, does not require one, and validates all stops before making changes', () => {
  const db = new DatabaseService({ server: true });
  db.hydrateSnapshot({ retailers: [
    { id: 'pinned', name: 'Pinned store', lat: 27.7, lng: 85.3, contacts: [], brandsStocked: [] },
    { id: 'zero', name: 'Saved without a pin', lat: 0, lng: 0, contacts: [], brandsStocked: [] },
    { id: 'unpinned', name: 'Unpinned store', contacts: [], brandsStocked: [] },
  ] }, DEFAULT_SUPER_ADMIN);
  assert.deepEqual(db.getUnifiedStoreById('pinned')?.coordinates, { lat: 27.7, lng: 85.3 });
  assert.equal(db.getUnifiedStoreById('zero')?.coordinates, undefined, '(0, 0) means no pin');
  assert.throws(() => db.createAndAssignBeatRoute({ officerId: DEFAULT_SUPER_ADMIN.id, dateAd: '2026-10-29', storeIds: ['pinned', 'missing'] }), /no longer exists/);
  assert.equal(db.getBeatItems().length, 0, 'nothing is saved when one stop is wrong');
  const stops = db.createAndAssignBeatRoute({ officerId: DEFAULT_SUPER_ADMIN.id, dateAd: '2026-10-29', storeIds: ['pinned', 'unpinned', 'zero'] });
  assert.deepEqual(stops.map((stop) => [stop.lat, stop.lng]), [[27.7, 85.3], [undefined, undefined], [undefined, undefined]]);
  const single = db.addOneTimeBeatOverride(DEFAULT_SUPER_ADMIN.id, 'unpinned', '2026-10-29');
  assert.equal(single.lat, undefined);
});
