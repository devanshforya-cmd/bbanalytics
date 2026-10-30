import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db/db-service.ts';
import { recordGpsPing, retryPendingGps } from '../src/lib/db/gps-service.ts';

test('GPS retries preserve only the latest fix and never send a different account’s cached location', async () => {
  const previousFetch = globalThis.fetch;
  const oldWindow = (globalThis as any).window;
  const oldStorage = (globalThis as any).localStorage;
  const oldUser = db.getCurrentUser;
  const oldUpdate = db.updateStaffPing;
  const cache = new Map<string, string>();
  let owner = 'officer-one';
  const requests: any[] = [];
  try {
    (globalThis as any).window = {};
    (globalThis as any).localStorage = { getItem: (key: string) => cache.get(key) || null, setItem: (key: string, value: string) => cache.set(key, value), removeItem: (key: string) => cache.delete(key) };
    db.getCurrentUser = (() => ({ id: owner })) as typeof db.getCurrentUser;
    db.updateStaffPing = () => {};
    globalThis.fetch = async (_url, options) => { requests.push(JSON.parse(String(options?.body))); throw new Error('offline'); };
    assert.equal(await recordGpsPing(owner, 'One', 27.7, 85.3), false);
    assert.equal(await recordGpsPing(owner, 'One', 27.8, 85.4), false);
    assert.equal(cache.size, 1);
    assert.equal(JSON.parse([...cache.values()][0]).lat, 27.8);
    const count = requests.length;
    owner = 'officer-two';
    assert.equal(await retryPendingGps('officer-one'), false);
    assert.equal(await recordGpsPing('officer-one', 'One', 28, 85), false);
    assert.equal(requests.length, count);
    owner = 'officer-one';
    globalThis.fetch = async (_url, options) => { requests.push(JSON.parse(String(options?.body))); return Response.json({ success: true }); };
    assert.equal(await retryPendingGps(owner), true);
    assert.equal(requests.at(-1).officerId, 'officer-one');
    assert.equal(requests.at(-1).lat, 27.8);
    assert.equal(cache.size, 0);
  } finally {
    globalThis.fetch = previousFetch; db.getCurrentUser = oldUser; db.updateStaffPing = oldUpdate;
    if (oldWindow === undefined) delete (globalThis as any).window; else (globalThis as any).window = oldWindow;
    if (oldStorage === undefined) delete (globalThis as any).localStorage; else (globalThis as any).localStorage = oldStorage;
  }
});
