import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

/** The signed-in person as the server sees them now, so the app shows only what they are given. */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  return NextResponse.json({ success: true, user: auth.user }, { headers: { 'Cache-Control': 'private, no-store' } });
}
