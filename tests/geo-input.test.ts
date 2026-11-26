import test from 'node:test';
import assert from 'node:assert/strict';
import { inNepal, parseCoordinates } from '../src/lib/geo-input';

test('store locations are read from typed numbers and Google Maps links', () => {
  assert.deepEqual(parseCoordinates('27.7172, 85.3240'), { lat: 27.7172, lng: 85.324 });
  assert.deepEqual(parseCoordinates('27.7172 85.3240'), { lat: 27.7172, lng: 85.324 });
  assert.deepEqual(parseCoordinates('https://www.google.com/maps/place/Bhatbhateni/@27.7041,85.3311,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d27.7045!4d85.3302'), { lat: 27.7045, lng: 85.3302 });
  assert.deepEqual(parseCoordinates('https://maps.google.com/?q=27.6915,85.3420'), { lat: 27.6915, lng: 85.342 });
  assert.equal(parseCoordinates('Baneshwor, Kathmandu'), null);
  assert.equal(parseCoordinates('127.1, 85'), null);
  assert.equal(inNepal(27.7, 85.3), true);
  assert.equal(inNepal(85.3, 27.7), false, 'swapped values are caught');
});
