// Its own file: the fetch guard installs once per page load, so it needs a fresh process.
import test from 'node:test';
import assert from 'node:assert/strict';

test('a first visit (a shared-link viewer with no account) is never reset or sent to sign-in', async () => {
  const { installWorkspaceFetch } = await import('../src/lib/workspace-reset-client');
  const saved = ['window', 'localStorage', 'sessionStorage', 'indexedDB'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const storage = (data: Record<string, string>) => {
    const target: any = { ...data };
    Object.defineProperties(target, { getItem: { value: (key: string) => target[key] ?? null }, setItem: { value: (key: string, value: string) => { target[key] = value; } }, removeItem: { value: (key: string) => { delete target[key]; } } });
    return target;
  };
  const local = storage({});
  let destination = '';
  const fakeWindow: any = { fetch: async (url: string) => Response.json(url === '/api/workspace-state' ? { epoch: 'fresh', resetting: false } : { success: true }), addEventListener() {}, dispatchEvent() {},
    location: { origin: 'https://app.example.test', pathname: '/shared/bb_token', href: 'https://app.example.test/shared/bb_token', replace: (url: string) => { destination = url; } } };
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage({}) });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { deleteDatabase: () => ({}) } });
    installWorkspaceFetch();
    const response = await fakeWindow.fetch('/api/shared/bb_token');
    assert.equal((await response.json()).success, true);
    assert.equal(destination, '');
    assert.equal(local.bb_workspace_epoch, 'fresh');
  } finally {
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; }
  }
});
