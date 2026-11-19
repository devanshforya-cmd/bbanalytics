'use client';

import { User } from './types';
import { db } from './db/db-service';
import { firstAllowedPath, hasAccess, isSuperAdmin } from './permissions';
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

/** Ask the server who is signed in and what they may open. Resolves to null when signed out. */
export async function confirmSessionWithServer(timeoutMs = 4000): Promise<{ user: User | null; offline: boolean }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    if (response.status === 401 || response.status === 403) return { user: null, offline: false };
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.user) return { user: getSessionUser(), offline: true };
    const fresh = result.user as User;
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as UserSessionData | null;
    if (stored?.user?.id && stored.user.id !== fresh.id) return { user: null, offline: false };
    if (stored) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...stored, user: fresh }));
    db.setSessionUser(fresh);
    return { user: fresh, offline: false };
  } catch {
    return { user: getSessionUser(), offline: true };
  } finally { window.clearTimeout(timer); }
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
    // Access always comes from the session, which sign-in, the server check and every sync keep current.
    // A copy saved on this device earlier must never widen or narrow what is shown.
    if (!currentDbUser) return user as User;
    return { ...currentDbUser, role: user.role, isSuperAdmin: user.isSuperAdmin, assignedBrands: user.assignedBrands,
      permissions: user.permissions, customPermissions: user.customPermissions, reportsToId: user.reportsToId } as User;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  void (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      // Finish the cookie logout before exposing the next sign-in screen.
      await fetch('/api/auth/logout', { method: 'POST', signal: controller.signal });
    } catch { /* Clear local access even if the server is unreachable. */ }
    finally { window.clearTimeout(timeout); }
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration('/sw.js');
        const subscription = await registration?.pushManager?.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }
    } catch { /* Session logout still completes when the browser push service is unavailable. */ }
    localStorage.removeItem(SESSION_KEY);
    db.setSessionUser(null);
    window.location.replace('/login');
  })();
}

export function getRedirectPathForUser(user: any): string {
  if (!user) return '/login';
  if (isSuperAdmin(user)) return '/dashboard';
  // Field staff land on today's route when they have it.
  if (user?.role === 'SALES_OFFICER' && hasAccess(user, 'p.beat_plan')) return '/offline-sales/beat-plan';
  return firstAllowedPath(user);
}

export function getRedirectPathForRole(role?: any, user?: any): string {
  if (user) return getRedirectPathForUser(user);
  if (typeof role === 'object' && role !== null) return getRedirectPathForUser(role);
  if (role === 'SALES_OFFICER') return '/offline-sales/beat-plan';
  if (role === 'DATA_ENTRY') return '/orderflow/manual-entry';
  return '/dashboard';
}
