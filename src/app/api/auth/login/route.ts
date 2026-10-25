import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { normalizePhoneNumber } from '@/lib/auth-utils';
import { verifyPassword } from '@/lib/password-utils';
import { createSessionToken, AUTH_SESSION_COOKIE, AUTH_SESSION_MAX_AGE_SECONDS, getAuthSessionSecret } from '@/lib/auth-session';
import { rateLimitCheck, rateLimitRecordFailure, rateLimitReset } from '@/lib/rate-limit';
import { isLocalPreviewAuthEnabled, LOCAL_PREVIEW_USER, matchesLocalPreviewCredentials } from '@/lib/local-preview-auth';

export const dynamic = 'force-dynamic';

function mapUser(row: any) {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    fullName: row.full_name || row.name || 'Staff User',
    role: row.role || (row.is_super_admin ? 'SUPER_ADMIN' : 'SALES_OFFICER'),
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

export async function POST(request: NextRequest) {
  const secret = getAuthSessionSecret();
  const localPreviewEnabled = isLocalPreviewAuthEnabled();
  if (!secret || (!localPreviewEnabled && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY))) {
    return NextResponse.json({ success: false, error: 'Sign-in is not configured for this deployment.' }, { status: 503 });
  }

  let body: { identifier?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid sign-in request.' }, { status: 400 });
  }

  const rawIdentifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const email = rawIdentifier.toLowerCase();
  const isEmail = email.includes('@');
  const phone = normalizePhoneNumber(rawIdentifier);
  const validEmail = isEmail && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPhone = !isEmail && /^9[78]\d{8}$/.test(phone);

  if ((!validEmail && !validPhone) || !password || password.length > 1024) {
    return NextResponse.json({ success: false, error: 'Invalid email/mobile number or password.' }, { status: 401 });
  }

  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateKey = `login:${ip}`;
  const limit = rateLimitCheck(rateKey);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many sign-in attempts. Try again in 15 minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds || 900) } }
    );
  }


  if (localPreviewEnabled) {
    if (!matchesLocalPreviewCredentials(rawIdentifier, password)) {
      rateLimitRecordFailure(rateKey);
      return NextResponse.json({ success: false, error: 'Invalid email/mobile number or password.' }, { status: 401 });
    }

    rateLimitReset(rateKey);
    const response = NextResponse.json({ success: true, user: LOCAL_PREVIEW_USER });
    response.cookies.set(AUTH_SESSION_COOKIE, createSessionToken(LOCAL_PREVIEW_USER.id, secret), {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
      maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    });
    return response;
  }

  try {
    const query = supabaseAdmin.from('users').select('*');
    const { data, error } = validEmail
      ? await query.eq('email', email).limit(2)
      : await query.ilike('phone', `%${phone}`).limit(20);
    if (error) throw error;

    const row = (data || []).find((candidate: any) => {
      const active = candidate.is_active !== false && candidate.active !== false;
      const identifierMatches = validEmail
        ? String(candidate.email || '').toLowerCase() === email
        : normalizePhoneNumber(String(candidate.phone || '')) === phone;
      return active && identifierMatches;
    });

    if (!row || !(await verifyPassword(password, row.password_hash))) {
      rateLimitRecordFailure(rateKey);
      return NextResponse.json({ success: false, error: 'Invalid email/mobile number or password.' }, { status: 401 });
    }

    const user = mapUser(row);
    const token = createSessionToken(String(row.id), secret);
    rateLimitReset(rateKey);
    const response = NextResponse.json({ success: true, user });
    response.cookies.set(AUTH_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error('[Auth] Sign-in lookup failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
