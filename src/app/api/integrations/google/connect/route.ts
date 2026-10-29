import { NextRequest, NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { AUTH_SESSION_COOKIE, AUTH_SESSION_MAX_AGE_SECONDS, getAuthSessionSecret, secureSessionCookie } from '@/lib/auth-session';
import { isSuperAdmin } from '@/lib/permissions';
import { createGoogleOAuthClient, googleOAuthConfiguration, GOOGLE_SCOPES, logGoogleFailure } from '@/lib/google-workspace';
import { createGoogleState, GOOGLE_STATE_COOKIE, GOOGLE_STATE_TTL_SECONDS, isSameOriginGoogleMutation } from '@/lib/google-workspace-security';

export async function POST(request: NextRequest) {
  const auth = await requireFeatureAccess(request, 'settings', 'EDIT');
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!isSameOriginGoogleMutation(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const config = googleOAuthConfiguration();
  if (!config.ready) return NextResponse.json({ error: 'Google OAuth setup is incomplete.', missing: config.missing }, { status: 503 });
  if (new URL(config.redirectUri!).origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Open the application on the origin configured in GOOGLE_REDIRECT_URI before connecting.' }, { status: 409 });
  try {
    const state = createGoogleState(auth.user.id, getAuthSessionSecret()!);
    const authorizationUrl = createGoogleOAuthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: GOOGLE_SCOPES, state: state.state });
    const response = NextResponse.json({ authorizationUrl }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(GOOGLE_STATE_COOKIE, state.cookie, { httpOnly: true, secure: secureSessionCookie(request), sameSite: 'lax', path: '/api/integrations/google', maxAge: GOOGLE_STATE_TTL_SECONDS });
    // Existing sessions issued before OAuth support may still carry SameSite=Strict.
    const sessionCookie = request.cookies.get(AUTH_SESSION_COOKIE)?.value;
    if (sessionCookie) response.cookies.set(AUTH_SESSION_COOKIE, sessionCookie, { httpOnly: true, secure: secureSessionCookie(request), sameSite: 'lax', path: '/', maxAge: AUTH_SESSION_MAX_AGE_SECONDS });
    return response;
  } catch (error) {
    logGoogleFailure('connect', error);
    return NextResponse.json({ error: 'Google authorization could not be started.' }, { status: 503 });
  }
}
