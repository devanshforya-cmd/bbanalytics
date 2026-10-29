import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { hasAccess, isSuperAdmin } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import type { FeatureFlag, FlagEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';
const fail = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const canManage = (user: any) => isSuperAdmin(user) && hasAccess(user, 'settings');
async function rows(collection: string, flagName?: string) {
  const result: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabaseAdmin.from('workspace_records').select('id,data,version').eq('collection', collection).order('id').range(offset, offset + 999);
    if (flagName) query = query.eq('data->>flagName', flagName);
    const { data, error } = await query;
    if (error) throw new Error('Feature flags could not be loaded.');
    result.push(...(data || []));
    if (!data || data.length < 1000) return result;
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth(request); if (auth.response) return auth.response;
  try {
    const analytics = new URL(request.url).searchParams.get('analytics');
    if (analytics) {
      if (!canManage(auth.user)) return fail('Not found.', 404);
      const events = (await rows('flagEvents', analytics)).map((row) => row.data as FlagEvent);
      const calc = (variant: string) => {
        const data = events.filter((event) => event.variant === variant);
        const pageViews = data.filter((event) => event.action === 'PAGE_VIEW').length;
        const submits = data.filter((event) => ['FORM_SUBMIT', 'ORDER_CREATED'].includes(event.action)).length;
        const errors = data.filter((event) => event.action === 'ERROR').length;
        return { pageViews, submits, errors, conversionRate: pageViews ? Number((submits / pageViews * 100).toFixed(1)) : 0, errorRate: pageViews ? Number((errors / pageViews * 100).toFixed(1)) : 0 };
      };
      return NextResponse.json({ success: true, data: { variantA: calc('A'), variantB: calc('B') } });
    }
    const flags = (await rows('featureFlags')).map((row) => row.data as FeatureFlag);
    const data = canManage(auth.user) ? flags : flags.map((flag) => ({ ...flag, enabledForUsers: [],
      isEnabled: flag.isEnabled && (!flag.enabledForUsers?.length || flag.enabledForUsers.includes(auth.user.id)) }));
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return fail('Feature flags are temporarily unavailable.', 503); }
}

async function change(request: Request) {
  const auth = await requireAuth(request); if (auth.response) return auth.response;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return fail('Invalid request origin.', 403);
  try {
    let body;
    try { body = await request.json(); } catch { return fail('Invalid JSON payload.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('A JSON object is required.');
    if (body.type === 'event') {
      const flags = (await rows('featureFlags')).map((row) => row.data as FeatureFlag);
      const flag = flags.find((item) => item.name === body.flagName);
      if (!flag || (flag.enabledForUsers?.length && !flag.enabledForUsers.includes(auth.user.id))) return fail('Flag not found.', 404);
      if (!['A', 'B'].includes(body.variant) || !['PAGE_VIEW', 'FORM_SUBMIT', 'ORDER_CREATED', 'ERROR', 'CLICK'].includes(body.action)) return fail('Invalid flag event.');
      const id = `event_${randomUUID()}`;
      const data = { id, flagName: flag.name, userId: auth.user.id, variant: body.variant, action: body.action, createdAt: new Date().toISOString() };
      const { error } = await supabaseAdmin.from('workspace_records').insert({ collection: 'flagEvents', id, data, created_by: auth.user.id, version: 1, last_mutation_id: id });
      if (error) return fail('Flag event was not recorded.', 503);
      return NextResponse.json({ success: true });
    }
    if (!canManage(auth.user)) return fail('Not found.', 404);
    const flags = await rows('featureFlags');
    const prior = flags.find((row) => row.id === body.id);
    if (request.method !== 'POST' && !prior) return fail('Flag not found.', 404);
    if (request.method === 'DELETE') {
      const { data, error } = await supabaseAdmin.from('workspace_records').delete().eq('collection', 'featureFlags').eq('id', prior.id).eq('version', prior.version).select('id');
      return error || !data?.length ? fail('The flag was not deleted. Refresh and retry.', 409) : NextResponse.json({ success: true });
    }
    const next = { ...(prior?.data || {}), ...body };
    if (!/^[a-z][a-z0-9_]{0,79}$/.test(next.name || '') || !['A', 'B'].includes(next.variant) || typeof next.isEnabled !== 'boolean'
      || !Array.isArray(next.enabledForUsers) || next.enabledForUsers.length > 10000 || next.enabledForUsers.some((id: unknown) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(id)) || String(next.description || '').length > 1000) return fail('Enter a valid flag name, variant, and user list.');
    if (flags.some((row) => row.id !== prior?.id && row.data.name === next.name)) return fail('This flag name already exists.', 409);
    const id = prior?.id || `flag_${next.name}`;
    const data: FeatureFlag = { id, name: next.name, description: next.description || '', isEnabled: next.isEnabled,
      enabledForUsers: next.enabledForUsers, variant: next.variant, createdAt: prior?.data.createdAt || new Date().toISOString() };
    const payload = { data, version: (prior?.version || 0) + 1, last_mutation_id: randomUUID(), updated_at: new Date().toISOString() };
    const result = prior
      ? await supabaseAdmin.from('workspace_records').update(payload).eq('collection', 'featureFlags').eq('id', id).eq('version', prior.version).select('id')
      : await supabaseAdmin.from('workspace_records').insert({ ...payload, collection: 'featureFlags', id, created_by: auth.user.id }).select('id');
    if (result.error || !result.data?.length) return fail('The flag was not saved. Refresh and retry.', 409);
    return NextResponse.json({ success: true, data });
  } catch { return fail('The flag change was not saved.', 503); }
}
export const POST = change;
export const PATCH = change;
export const DELETE = change;
