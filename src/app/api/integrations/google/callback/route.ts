import { requestOrigin } from '@/lib/request-origin';
import { NextRequest, NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { getAuthSessionSecret } from '@/lib/auth-session';
import { isSuperAdmin } from '@/lib/permissions';
import { connectGoogleAccount, googleOAuthConfiguration, logGoogleFailure } from '@/lib/google-workspace';
import { GOOGLE_STATE_COOKIE, verifyGoogleState } from '@/lib/google-workspace-security';

export async function GET(request: NextRequest) {
  const config = googleOAuthConfiguration();
  if (!config.ready || `${requestOrigin(request)}${request.nextUrl.pathname}` !== config.redirectUri) return NextResponse.json({ error: 'Invalid Google callback configuration.' }, { status: 400 });
  const finish = (result: string) => {
    const response = NextResponse.redirect(new URL(`/settings?tab=google&google=${result}`, config.redirectUri!));
    response.cookies.set(GOOGLE_STATE_COOKIE, '', { path: '/api/integrations/google', maxAge: 0 });
    return response;
  };
  const auth = await requireFeatureAccess(request, 'settings', 'EDIT');
  if (auth.response || !isSuperAdmin(auth.user)) return finish('session_required');
  const state = request.nextUrl.searchParams.get('state') || '';
  const cookie = request.cookies.get(GOOGLE_STATE_COOKIE)?.value || '';
  if (!verifyGoogleState(cookie, state, auth.user.id, getAuthSessionSecret()!)) return finish('invalid_state');
  const code = request.nextUrl.searchParams.get('code');
  if (request.nextUrl.searchParams.has('error') || !code) return finish('consent_denied');
  try {
    await connectGoogleAccount(code, auth.user.id);
    return finish('connected');
  } catch (error) {
    logGoogleFailure('callback', error);
    return finish('connection_failed');
  }
}
