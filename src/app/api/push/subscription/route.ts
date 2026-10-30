import { isSameOriginRequest } from '@/lib/request-origin';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { pushConfig, pushSubscriptionId } from '@/lib/push-server';
import { validatePushSubscription } from '@/lib/push-validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request); if (auth.response) return auth.response;
  if (request.headers.has('X-Workspace-User') && request.headers.get('X-Workspace-User') !== auth.user.id) return NextResponse.json({ error: 'Account changed. Refresh before changing notifications.' }, { status: 409 });
  const config = pushConfig();
  const { data, error } = await supabaseAdmin.from('push_subscriptions').select('id').eq('user_id', auth.user.id).limit(10);
  if (error) return NextResponse.json({ success: false, error: 'Push storage is unavailable.' }, { status: 503 });
  return NextResponse.json({ success: true, configured: !!config, publicKey: config?.publicKey || null, deviceIds: (data || []).map(row => row.id) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request); if (auth.response) return auth.response;
  if (request.headers.has('X-Workspace-User') && request.headers.get('X-Workspace-User') !== auth.user.id) return NextResponse.json({ error: 'Account changed. Refresh before changing notifications.' }, { status: 409 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (!pushConfig()) return NextResponse.json({ error: 'Push delivery is not configured.' }, { status: 503 });
  try {
    const text = await request.text(); if (text.length > 8192) throw new Error('Subscription is too large.');
    const subscription = validatePushSubscription(JSON.parse(text));
    const id = pushSubscriptionId(subscription.endpoint);
    const { data: prior, error: readError } = await supabaseAdmin.from('push_subscriptions').select('user_id').eq('id', id).maybeSingle();
    if (readError) return NextResponse.json({ error: 'Push storage is unavailable.' }, { status: 503 });
    if (prior && prior.user_id !== auth.user.id) return NextResponse.json({ error: 'This browser is registered to another account. Disable its notifications before switching accounts.' }, { status: 409 });
    if (!prior) {
      const { count } = await supabaseAdmin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id);
      if ((count || 0) >= 5) return NextResponse.json({ error: 'Five devices are already registered. Remove another device first.' }, { status: 409 });
    }
    const payload = { id, user_id: auth.user.id, subscription, updated_at: new Date().toISOString() };
    const { error } = prior
      ? await supabaseAdmin.from('push_subscriptions').update(payload).eq('id', id).eq('user_id', auth.user.id)
      : await supabaseAdmin.from('push_subscriptions').insert(payload);
    if (error?.code === '23505') return NextResponse.json({ error: 'This device registration changed. Refresh and register it again.' }, { status: 409 });
    if (error) return NextResponse.json({ error: 'Subscription was not saved.' }, { status: 503 });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Invalid subscription. Use a supported browser and try again.' }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(request); if (auth.response) return auth.response;
  if (request.headers.has('X-Workspace-User') && request.headers.get('X-Workspace-User') !== auth.user.id) return NextResponse.json({ error: 'Account changed. Refresh before changing notifications.' }, { status: 409 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.endpoint !== 'string' || body.endpoint.length > 2048) throw new Error();
    const { error } = await supabaseAdmin.from('push_subscriptions').delete().eq('id', pushSubscriptionId(body.endpoint)).eq('user_id', auth.user.id);
    if (error) return NextResponse.json({ error: 'Subscription could not be removed.' }, { status: 503 });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
}
