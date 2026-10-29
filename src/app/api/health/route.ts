import { NextResponse } from 'next/server';
import { runtimeReadiness } from '@/lib/runtime-config';
import { supabaseAdmin } from '@/lib/db/supabase-server';

export const dynamic = 'force-dynamic';
export async function GET() {
  const config = runtimeReadiness();
  if (!config.ready) return NextResponse.json({ status: 'unconfigured', message: 'Server configuration is incomplete.' }, { status: 503 });
  try {
    const [workspace, users, gps] = await Promise.all([
      supabaseAdmin.from('workspace_records').select('id', { head: true, count: 'exact' }),
      supabaseAdmin.from('users').select('id').eq('is_active', true).limit(1),
      supabaseAdmin.from('gps_pings').select('officer_id', { head: true, count: 'exact' }),
    ]);
    const ready = !workspace.error && !users.error && !!users.data?.length && !gps.error;
    return NextResponse.json({ status: ready ? 'ok' : 'unavailable', database: ready ? 'ready' : 'unavailable', authentication: 'configured' },
      { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ status: 'unavailable', database: 'unavailable' }, { status: 503 }); }
}
