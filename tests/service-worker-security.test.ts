import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker(network: () => Promise<Response>) {
  const handlers: Record<string, (event: any) => void> = {};
  let cacheReads = 0;
  runInNewContext(source, { self: { location: { origin: 'https://bb.example' }, addEventListener(type: string, handler: any) { handlers[type] = handler; } },
    URL, Response, fetch: network, caches: { async match() { cacheReads++; return undefined; } } });
  return { handlers, get cacheReads() { return cacheReads; } };
}

test('PWA never caches private APIs, private image proxies, RSC or third-party database responses', () => {
  const sw = worker(async () => Response.json({ private: true }));
  for (const [url, headers] of [
    ['https://bb.example/api/sync', {}], ['https://bb.example/api/drive/files/private.png', {}],
    ['https://project.supabase.co/rest/v1/users', {}], ['https://bb.example/dashboard', { RSC: '1' }],
  ] as const) {
    let intercepted = false;
    sw.handlers.fetch({ request: { method: 'GET', url, headers: new Headers(headers), mode: 'cors' }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
  }
  assert.equal(sw.cacheReads, 0);
});

test('an uncached offline navigation returns an honest offline page instead of a different route shell', async () => {
  const sw = worker(async () => { throw new Error('offline'); });
  let response!: Promise<Response>;
  sw.handlers.fetch({ request: { method: 'GET', url: 'https://bb.example/settings', headers: new Headers(), mode: 'navigate' }, respondWith(value: Promise<Response>) { response = value; } });
  const result = await response;
  assert.equal(result.status, 503);
  assert.match(await result.text(), /pending changes are saved/);
});
