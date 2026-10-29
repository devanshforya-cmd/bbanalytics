'use client';

import { User } from './types';
import { db } from './db/db-service';
import { hasAccess, isSuperAdmin } from './permissions';
import { normalizePhoneNumber } from './auth-utils';

const SESSION_KEY = 'bb_auth_user_session_v3';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export { normalizePhoneNumber };

export interface UserSessionData {
  user: Omit<User, 'password'>;
  createdAt: number;
  expiresAt: number;
}

export function setAuthSession(user: User): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const { password: _password, passwordHash: _hash, ...safeUser } = user;
  delete (safeUser as any).password_hash;
  const sessionData: UserSessionData = {
    user: safeUser,
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_MS,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
}

export async function loginWithMobile(
  identifier: string,
  password: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.user) {
      return {
        success: false,
        error: result?.error || 'Sign-in is temporarily unavailable. Please try again.',
      };
    }

    setAuthSession(result.user as User);
    db.setSessionUser(result.user as User);
    return { success: true, user: result.user as User };
  } catch {
    return { success: false, error: 'Could not reach the sign-in service. Check your connection and try again.' };
  }
}

export function getSessionUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<UserSessionData>;
    const user = parsed.user;
    if (
      !user ||
      typeof user !== 'object' ||
      typeof user.id !== 'string' ||
      !Number.isFinite(parsed.expiresAt) ||
      (parsed.expiresAt as number) <= Date.now()
    ) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    const currentDbUser = db.getUserById?.(user.id);
    if (currentDbUser?.active === false) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return (currentDbUser || user) as User;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
  db.setSessionUser(null);
  void fetch('/api/auth/logout', { method: 'POST', keepalive: true })
    .catch(() => undefined)
    .finally(() => window.location.replace('/login'));
}

export function getRedirectPathForUser(user: any): string {
  if (!user) return '/login';
  if (isSuperAdmin(user)) return '/dashboard';
  if (user?.role === 'SALES_OFFICER' && hasAccess(user, 'beat_plans')) return '/offline-sales/beat-plan';
  if (hasAccess(user, 'dashboard')) return '/dashboard';
  if (hasAccess(user, 'beat_plans')) return '/offline-sales/beat-plan';
  if (hasAccess(user, 'orderflow')) return '/orderflow/manual-entry';
  if (hasAccess(user, 'stores')) return '/offline-sales/stores';
  if (hasAccess(user, 'products')) return '/products';
  if (hasAccess(user, 'tasks')) return '/opscore/tasks';
  if (hasAccess(user, 'cheque_tracker')) return '/offline-sales/cheques';
  if (hasAccess(user, 'gps_tracking')) return '/offline-sales/live-tracking';
  if (hasAccess(user, 'settings')) return '/settings';
  if (hasAccess(user, 'activity')) return '/opscore/activity';
  if (hasAccess(user, 'customers')) return '/customers';
  if (hasAccess(user, 'marketing')) return '/marketing/influencers';
  if (hasAccess(user, 'reviews')) return '/reviews/feedback';
  if (hasAccess(user, 'dispatches')) return '/offline-sales/dispatch';
  if (hasAccess(user, 'shelf_photos')) return '/offline-sales/shelf-photos';
  if (hasAccess(user, 'call_tracker')) return '/offline-sales/calls';
  if (hasAccess(user, 'document_handover')) return '/offline-sales/documents';
  return '/no-access';
}

export function getRedirectPathForRole(role?: any, user?: any): string {
  if (user) return getRedirectPathForUser(user);
  if (typeof role === 'object' && role !== null) return getRedirectPathForUser(role);
  if (role === 'SALES_OFFICER') return '/offline-sales/beat-plan';
  if (role === 'DATA_ENTRY') return '/orderflow/manual-entry';
  return '/dashboard';
}
