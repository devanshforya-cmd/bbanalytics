import { createHash, timingSafeEqual } from 'node:crypto';
import { normalizePhoneNumber } from './auth-utils';
import type { User } from './types';

export const LOCAL_PREVIEW_USER: User = {
  id: 'user_devansh',
  fullName: 'Devansh Agarwal (Local Preview)',
  email: 'admin@brandbucket.com',
  phone: '9800000001',
  role: 'SUPER_ADMIN',
  isSuperAdmin: true,
  active: true,
  dutyStatus: 'ONLINE',
  assignedBrands: ['ALL'],
  territory: 'ALL',
  permissions: {},
};

// This path is available only on a development server with an explicit password.
export function isLocalPreviewAuthEnabled(): boolean {
  return process.env.NODE_ENV === 'development'
    && process.env.LOCAL_PREVIEW_AUTH === 'true'
    && Boolean(process.env.LOCAL_PREVIEW_PASSWORD)
    && Buffer.byteLength(process.env.LOCAL_PREVIEW_PASSWORD || '') >= 16;
}

export function matchesLocalPreviewCredentials(identifier: string, password: string): boolean {
  const configuredPassword = process.env.LOCAL_PREVIEW_PASSWORD;
  if (!isLocalPreviewAuthEnabled() || !configuredPassword) return false;

  const normalizedIdentifier = identifier.trim().toLowerCase();
  const isAllowedIdentifier = normalizedIdentifier === LOCAL_PREVIEW_USER.email
    || normalizePhoneNumber(identifier) === normalizePhoneNumber(LOCAL_PREVIEW_USER.phone);
  if (!isAllowedIdentifier) return false;

  const expected = createHash('sha256').update(configuredPassword).digest();
  const received = createHash('sha256').update(password).digest();
  return timingSafeEqual(expected, received);
}
