import { isSameOriginRequest } from './request-origin';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getScope, hasAccess, canPerform, type UserWithPermissions } from './permissions';

export const GOOGLE_STATE_COOKIE = 'bb_google_oauth';
export const GOOGLE_STATE_TTL_SECONDS = 600;
export const DRIVE_UPLOAD_LIMIT = 4 * 1024 * 1024;
export const DRIVE_FEATURES = ['shelf_photos', 'document_handover', 'cheque_tracker', 'dispatches'] as const;
export type DriveFeature = typeof DRIVE_FEATURES[number];

function key(secret: string, purpose: string): Buffer {
  if (Buffer.byteLength(secret) < 32) throw new Error('Google integration encryption is not configured.');
  return createHmac('sha256', secret).update(`bb-google:${purpose}:v1`).digest();
}

export function encryptGoogleToken(token: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret, 'refresh-token'), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptGoogleToken(value: string, secret: string): string {
  const [version, iv, tag, encrypted, extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted || extra) throw new Error('Invalid stored Google connection.');
  const decipher = createDecipheriv('aes-256-gcm', key(secret, 'refresh-token'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export function createGoogleState(userId: string, secret: string, now = Date.now()) {
  const nonce = randomBytes(32).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId, nonce, exp: now + GOOGLE_STATE_TTL_SECONDS * 1000 })).toString('base64url');
  const signature = createHmac('sha256', key(secret, 'oauth-state')).update(payload).digest('base64url');
  return { state: nonce, cookie: `${payload}.${signature}` };
}

export function verifyGoogleState(cookie: string, state: string, userId: string, secret: string, now = Date.now()): boolean {
  try {
    const [payload, signature, extra] = cookie.split('.');
    if (!payload || !signature || extra) return false;
    const expected = createHmac('sha256', key(secret, 'oauth-state')).update(payload).digest();
    const received = Buffer.from(signature, 'base64url');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims.userId === userId && claims.nonce === state && Number.isSafeInteger(claims.exp) && claims.exp > now && claims.exp <= now + GOOGLE_STATE_TTL_SECONDS * 1000;
  } catch { return false; }
}

export function isDriveFeature(value: unknown): value is DriveFeature {
  return typeof value === 'string' && DRIVE_FEATURES.includes(value as DriveFeature);
}

export function canReadDriveFile(user: UserWithPermissions, properties: Record<string, string> | null | undefined, teamIds: string[] = []): boolean {
  if (properties?.app !== 'bb-analytics' || !isDriveFeature(properties.feature) || !properties.uploaderId) return false;
  if (!hasAccess(user, properties.feature) || !canPerform(user, properties.feature, 'VIEW')) return false;
  const scope = getScope(user, properties.feature);
  return scope === 'ALL' || properties.uploaderId === user.id || (scope === 'TEAM' && teamIds.includes(properties.uploaderId));
}

export function detectGoogleUploadType(bytes: Uint8Array, name: string): string | null {
  const hex = Buffer.from(bytes.slice(0, 16)).toString('hex');
  if (/\.jpe?g$/i.test(name) && hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (/\.png$/i.test(name) && hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (/\.webp$/i.test(name) && hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
  if (/\.pdf$/i.test(name) && hex.startsWith('255044462d')) return 'application/pdf';
  return null;
}

export function isSameOriginGoogleMutation(request: Request): boolean {
  return isSameOriginRequest(request);
}
