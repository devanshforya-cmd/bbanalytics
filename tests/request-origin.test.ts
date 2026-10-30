import test from 'node:test';
import assert from 'node:assert/strict';
import { requestOrigin, isSameOriginRequest } from '../src/lib/request-origin.ts';
import { isSameOriginGoogleMutation } from '../src/lib/google-workspace-security.ts';

const local = (headers: Record<string, string> = {}) => new Request('http://localhost:3000/api/users', { headers: { host: '127.0.0.1:3000', ...headers } });

test('same-origin checks use actual Host when Next exposes an internal hostname', () => {
  const request = local({ origin: 'http://127.0.0.1:3000' });
  assert.equal(requestOrigin(request), 'http://127.0.0.1:3000');
  assert.equal(isSameOriginRequest(request), true);
  assert.equal(isSameOriginGoogleMutation(request), true);
  assert.equal(isSameOriginRequest(local({ origin: 'http://localhost:3000' })), false);
});

test('origin matching rejects other origins, schemes, ports and malformed Origin values', () => {
  for (const origin of ['https://evil.example', 'http://127.0.0.1:3001', 'https://127.0.0.1:3000', 'null', '', 'http://127.0.0.1:3000/path', 'http://127.0.0.1:3000, https://evil.example']) {
    assert.equal(isSameOriginRequest(local({ origin })), false, origin);
  }
});

test('forwarded host and origin headers cannot grant cross-origin access', () => {
  assert.equal(isSameOriginRequest(local({ origin: 'https://evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' })), false);
  assert.equal(isSameOriginRequest(local({ origin: 'http://127.0.0.1:3000', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' })), true);
});

test('missing Origin remains allowed only for legacy callers and missing Host falls back to URL', () => {
  assert.equal(isSameOriginRequest(local()), false);
  assert.equal(isSameOriginRequest(local(), true), true);
  assert.equal(isSameOriginGoogleMutation(local()), false);
  assert.equal(isSameOriginRequest(new Request('https://bb.example/api/users', { headers: { origin: 'https://bb.example' } })), true);
  assert.equal(requestOrigin(new Request('https://bb.example/api/users')), 'https://bb.example');
});

test('malformed Host is rejected and IPv6, HTTPS and default ports are normalized safely', () => {
  for (const host of ['', 'evil.example/path', 'evil.example@127.0.0.1:3000', 'evil.example,127.0.0.1:3000', 'evil.example?x', 'evil.example#x', 'evil.example\\x']) {
    assert.equal(requestOrigin(local({ host })), null, host);
  }
  assert.equal(isSameOriginRequest(new Request('https://internal.invalid/api/users', { headers: { host: 'bb.example:443', origin: 'https://bb.example' } })), true);
  assert.equal(isSameOriginRequest(new Request('http://localhost:3000/api/users', { headers: { host: '[::1]:3000', origin: 'http://[::1]:3000' } })), true);
});
