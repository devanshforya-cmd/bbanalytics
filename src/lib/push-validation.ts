import { createECDH } from 'node:crypto';

export function validatePushSubscription(value: unknown) {
  const input = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (!input || typeof input.endpoint !== 'string' || input.endpoint.length > 2048) throw new Error('Invalid push subscription.');
  const url = new URL(input.endpoint);
  const host = url.hostname.toLowerCase();
  // Never let a supplied subscription turn the privileged push sender into an arbitrary HTTP client.
  const provider = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host === 'web.push.apple.com' || host.endsWith('.notify.windows.com');
  if (!provider || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) throw new Error('Unsupported push service. Use Chrome, Edge, Firefox or Safari.');
  const p256dh = input.keys?.p256dh;
  const auth = input.keys?.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(auth)) throw new Error('Invalid push encryption keys.');
  const publicKey = Buffer.from(p256dh, 'base64url');
  if (publicKey.length !== 65 || publicKey[0] !== 4 || Buffer.from(auth, 'base64url').length !== 16) throw new Error('Invalid push encryption keys.');
  const check = createECDH('prime256v1'); check.generateKeys(); check.computeSecret(publicKey);
  return { endpoint: url.href, keys: { p256dh, auth } };
}

export function safeNotificationPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value) ? value : '/';
}
