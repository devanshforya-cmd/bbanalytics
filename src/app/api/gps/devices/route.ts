import { isSameOriginRequest, requestOrigin } from '@/lib/request-origin';
import { randomBytes, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/db/supabase-server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'beat_plans');
  if (auth.response) return auth.response;
  if (request.headers.has('X-Workspace-User') && request.headers.get('X-Workspace-User') !== auth.user.id) return NextResponse.json({ success: false, error: 'Account changed. Refresh before pairing a device.' }, { status: 409, headers });
  try {
    const { data, error } = await supabaseAdmin.from('system_settings').select('value').eq('key', `gps_device_v1_${auth.user.id}`).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ success: true, paired: Boolean(data?.value && Date.parse(data.value.expiresAt) > Date.now()), expiresAt: data?.value?.expiresAt || null }, { headers });
  } catch { return NextResponse.json({ success: false, error: 'GPS device settings could not be loaded.' }, { status: 503, headers }); }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ success: false, error: 'Same-origin request required.' }, { status: 403, headers });
  const auth = await requireFeatureAccess(request, 'beat_plans');
  if (auth.response) return auth.response;
  if (request.headers.has('X-Workspace-User') && request.headers.get('X-Workspace-User') !== auth.user.id) return NextResponse.json({ success: false, error: 'Account changed. Refresh before pairing a device.' }, { status: 409, headers });
  try {
    const identifier = `${auth.user.id}.${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
    const { error } = await supabaseAdmin.from('system_settings').upsert({ key: `gps_device_v1_${auth.user.id}`, value: { hash: createHash('sha256').update(identifier).digest('hex'), expiresAt }, updated_at: new Date().toISOString() });
    if (error) throw error;
    return NextResponse.json({ success: true, identifier, expiresAt, serverUrl: new URL('/api/gps/native', requestOrigin(request)!).href }, { headers });
  } catch { return NextResponse.json({ success: false, error: 'GPS device could not be paired.' }, { status: 503, headers }); }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ success: false, error: 'Same-origin request required.' }, { status: 403, headers });
  const auth = await requireFeatureAccess(request, 'beat_plans');
  if (auth.response) return auth.response;
  if (request.headers.has('X-Workspace-User') && request.headers.get('X-Workspace-User') !== auth.user.id) return NextResponse.json({ success: false, error: 'Account changed. Refresh before pairing a device.' }, { status: 409, headers });
  try {
    const { error } = await supabaseAdmin.from('system_settings').delete().eq('key', `gps_device_v1_${auth.user.id}`);
    if (error) throw error;
    return NextResponse.json({ success: true }, { headers });
  } catch { return NextResponse.json({ success: false, error: 'GPS device could not be disconnected.' }, { status: 503, headers }); }
}
