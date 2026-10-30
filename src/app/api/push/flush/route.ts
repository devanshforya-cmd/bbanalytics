import { isSameOriginRequest } from '@/lib/request-origin';
import { after, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { flushUserPush } from '@/lib/push-server';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const auth = await requireAuth(request); if (auth.response) return auth.response;
  if (request.headers.has('X-Workspace-User') && request.headers.get('X-Workspace-User') !== auth.user.id) return NextResponse.json({ error: 'Account changed. Refresh before changing notifications.' }, { status: 409 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  after(async () => { await flushUserPush(auth.user); });
  return NextResponse.json({ success: true });
}
