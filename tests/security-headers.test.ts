import test from 'node:test';
import assert from 'node:assert/strict';

test('production security headers: strict script and connect rules, no legacy XSS auditor, no powered-by', async () => {
  const previous = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = 'production';
  try {
    const { default: config } = await import(`../next.config.mjs?production=${Date.now()}`);
    const rules = await config.headers();
    const all = rules.find((rule: { source: string }) => rule.source === '/(.*)').headers as { key: string; value: string }[];
    const header = (key: string) => all.find((entry) => entry.key === key)?.value || '';
    const csp = header('Content-Security-Policy');
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.match(csp, /connect-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(header('X-XSS-Protection'), '0');
    assert.equal(header('Referrer-Policy'), 'strict-origin-when-cross-origin');
    assert.equal(header('Cross-Origin-Opener-Policy'), 'same-origin');
    assert.match(header('Strict-Transport-Security'), /max-age=63072000/);
    assert.equal(config.poweredByHeader, false);
  } finally {
    (process.env as Record<string, string>).NODE_ENV = previous as string;
  }
});
