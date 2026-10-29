import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { isSuperAdmin } from '@/lib/permissions';
import { getGoogleStatus, logGoogleFailure, readGoogleConnection, removeGoogleConnection, provisionGoogleResources } from '@/lib/google-workspace';
import { isSameOriginGoogleMutation } from '@/lib/google-workspace-security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'settings');
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  try { return NextResponse.json({ success: true, ...await getGoogleStatus() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    logGoogleFailure('status', error);
    return NextResponse.json({ success: false, error: 'Google connection storage is unavailable. Apply the database migrations and check server configuration.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'settings', 'EDIT');
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!isSameOriginGoogleMutation(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const connection = await readGoogleConnection();
    if (!connection) return NextResponse.json({ error: 'Connect Google first.' }, { status: 409 });
    await provisionGoogleResources(connection);
    return NextResponse.json({ success: true, ...await getGoogleStatus() });
  } catch (error) {
    logGoogleFailure('provision', error);
    return NextResponse.json({ error: 'Google resources could not be prepared. Check the account consent and enabled APIs, then retry.' }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireFeatureAccess(request, 'settings', 'EDIT');
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!isSameOriginGoogleMutation(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    await removeGoogleConnection();
    return NextResponse.json({ success: true });
  } catch (error) {
    logGoogleFailure('disconnect', error);
    return NextResponse.json({ error: 'Google connection could not be removed.' }, { status: 503 });
  }
}
