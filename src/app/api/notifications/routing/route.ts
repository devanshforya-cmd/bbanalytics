import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { isSuperAdmin } from '@/lib/permissions';
import { readRouting, saveRouting } from '@/lib/notify-server';
import { isSameOriginGoogleMutation } from '@/lib/google-workspace-security';

export const dynamic = 'force-dynamic';

/** Who gets which automatic notification. Super Admins only. */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ success: true, routing: await readRouting(true) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!isSameOriginGoogleMutation(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ success: true, routing: await saveRouting(body.routing) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Not saved.' }, { status: 503 });
  }
}
