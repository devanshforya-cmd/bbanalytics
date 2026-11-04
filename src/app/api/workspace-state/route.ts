import { NextResponse } from 'next/server';
import { readWorkspaceResetState } from '@/lib/db/workspace-reset-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json(await readWorkspaceResetState(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Workspace status is unavailable.' }, { status: 503 }); }
}
