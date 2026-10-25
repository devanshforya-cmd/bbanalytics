import { NextResponse } from 'next/server';
import { User, UserRole } from '@/lib/types';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { AUTH_SESSION_COOKIE, getAuthSessionSecret, verifySessionToken } from '@/lib/auth-session';
import { canPerform, hasAccess, isSuperAdmin, type FeatureKey } from '@/lib/permissions';
import { isLocalPreviewAuthEnabled, LOCAL_PREVIEW_USER } from '@/lib/local-preview-auth';

export interface AuthContext {
  user: User;
  error?: never;
  response?: never;
}

export interface AuthError {
  user?: never;
  error: string;
  response: NextResponse;
}

export type AuthResult = AuthContext | AuthError;

function unauthorized(error = 'Unauthorized. Please sign in again.'): AuthError {
  return {
    error,
    response: NextResponse.json({ success: false, error }, { status: 401 }),
  };
}

function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    fullName: row.full_name || row.name || 'Staff User',
    role: (row.role || (row.is_super_admin ? 'SUPER_ADMIN' : 'SALES_OFFICER')) as UserRole,
    isSuperAdmin: !!row.is_super_admin || row.role === 'SUPER_ADMIN',
    dutyStatus: row.duty_status || 'ONLINE',
    assignedBrands: row.assigned_brands || ['ALL'],
    territory: row.territory || row.assigned_territory,
    reportsToId: row.reports_to_id,
    permissions: row.permissions || {},
    customPermissions: row.custom_permissions || {},
    active: row.is_active !== false && row.active !== false,
    calendarPreference: row.calendar_preference || 'BS',
  };
}

function readCookie(request: Request, name: string): string | null {
  const rawCookies = request.headers.get('cookie') || '';
  for (const cookie of rawCookies.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export async function requireAuth(request: Request, allowedRoles?: UserRole[]): Promise<AuthResult> {
  const secret = getAuthSessionSecret();
  const localPreviewEnabled = isLocalPreviewAuthEnabled();
  if (!secret || (!localPreviewEnabled && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY))) {
    return {
      error: 'Authentication is not configured for this deployment.',
      response: NextResponse.json(
        { success: false, error: 'Authentication is not configured for this deployment.' },
        { status: 503 }
      ),
    };
  }

  const token = readCookie(request, AUTH_SESSION_COOKIE);
  const claims = token ? verifySessionToken(token, secret) : null;
  if (!claims) return unauthorized();

  if (localPreviewEnabled && claims.sub === LOCAL_PREVIEW_USER.id) {
    return { user: LOCAL_PREVIEW_USER };
  }

  let row: any;
  try {
    const { data, error } = await supabaseAdmin.from('users').select('*').eq('id', claims.sub).maybeSingle();
    if (error) throw error;
    row = data;
  } catch {
    return {
      error: 'Authentication service is temporarily unavailable.',
      response: NextResponse.json(
        { success: false, error: 'Authentication service is temporarily unavailable.' },
        { status: 503 }
      ),
    };
  }

  if (!row) return unauthorized();
  if (row.is_active === false || row.active === false) {
    return {
      error: 'Account is deactivated. Contact your administrator.',
      response: NextResponse.json(
        { success: false, error: 'Account is deactivated. Contact your administrator.' },
        { status: 403 }
      ),
    };
  }

  const user = mapUser(row);
  const hasAllowedRole = typeof user.role === 'string' && allowedRoles?.includes(user.role as UserRole);
  if (allowedRoles?.length && !isSuperAdmin(user) && !hasAllowedRole) {
    return {
      error: `Forbidden: Role ${user.role} does not have access to this resource.`,
      response: NextResponse.json(
        { success: false, error: `Access denied. Requires one of: ${allowedRoles.join(', ')}.` },
        { status: 403 }
      ),
    };
  }

  return { user };
}

/** Enforce the same per-feature access configured by Super Admin on server routes. */
export async function requireFeatureAccess(
  request: Request,
  feature: FeatureKey,
  action: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' = 'VIEW'
): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (auth.response) return auth;

  if (!hasAccess(auth.user, feature)) {
    const error = 'Not found.';
    return { error, response: NextResponse.json({ success: false, error }, { status: 404 }) };
  }
  if (!canPerform(auth.user, feature, action)) {
    const error = 'You do not have permission to perform this action.';
    return { error, response: NextResponse.json({ success: false, error }, { status: 403 }) };
  }

  return auth;
}
