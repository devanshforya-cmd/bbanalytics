import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { isSuperAdmin } from '@/lib/permissions';
import { isSameOriginRequest } from '@/lib/request-origin';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { generateSampleData, SAMPLE_USER_PREFIX } from '@/lib/sample-data/generate';
import { resolveAccess, normalizeAccessMap } from '@/lib/roles';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const headers = { 'Cache-Control': 'private, no-store' };
const failure = (message: string, status = 400) => NextResponse.json({ success: false, error: message }, { status, headers });

async function superAdmin(request: Request, writing: boolean) {
  const auth = await requireAuth(request);
  if (auth.response) return auth;
  if (!isSuperAdmin(auth.user)) return { response: failure('Only a Super Admin can load or remove test data.', 403) };
  if (writing && !isSameOriginRequest(request, true)) return { response: failure('Invalid request origin.', 403) };
  return auth;
}

/** Test records per collection, and test staff. */
async function counts() {
  const { data, error } = await supabaseAdmin.rpc('sample_record_counts');
  if (!error && Array.isArray(data)) {
    const byCollection = Object.fromEntries(data.map((row: { collection: string; count: number }) => [row.collection, Number(row.count)]));
    const { count } = await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).like('id', `${SAMPLE_USER_PREFIX}%`);
    return { byCollection, staff: count || 0, total: Object.values(byCollection).reduce((sum: number, value) => sum + (value as number), 0) };
  }
  throw new Error('Test data counts are unavailable.');
}

async function log(user: { id: string; fullName?: string; role?: string }, action: string, details: Record<string, unknown>) {
  const id = `act_sample_${Date.now()}`;
  await supabaseAdmin.from('workspace_records').insert({ collection: 'activityLogs', id, created_by: user.id, version: 1, last_mutation_id: id,
    data: { id, userId: user.id, userName: user.fullName, userRole: user.role, action, entityType: 'workspace', entityId: 'test-data', details, createdAt: new Date().toISOString() } });
}

export async function GET(request: Request) {
  const auth = await superAdmin(request, false);
  if (auth.response) return auth.response;
  try { return NextResponse.json({ success: true, data: await counts() }, { headers }); }
  catch { return failure('Test data counts are unavailable.', 503); }
}

/** Load (or reload) the test data. Existing test records are replaced; real records are never touched. */
export async function POST(request: Request) {
  const auth = await superAdmin(request, true);
  if (auth.response) return auth.response;
  const { data: productRows, error: productError } = await supabaseAdmin.from('workspace_records').select('data').eq('collection', 'products');
  if (productError) return failure('Products are temporarily unavailable.', 503);
  const products = (productRows || []).map((row) => row.data).filter((product: any) => !product.isSample);
  const { data: nicheRows } = await supabaseAdmin.from('workspace_records').select('id').eq('collection', 'influencerNiches');
  const { data: roles } = await supabaseAdmin.from('staff_roles').select('id,name,permissions');
  const role = (name: string) => (roles || []).find((r: any) => String(r.name).trim().toLowerCase() === name);
  const { data: brandRows, error: brandError } = await supabaseAdmin.from('brands').select('id,code');
  if (brandError) return failure('Brands are temporarily unavailable.', 503);
  const realBrands = (brandRows || []).filter((b: any) => !String(b.id).startsWith('sample_')).map((b: any) => ({ id: String(b.id), code: String(b.code || '') }));
  const { data: configRow } = await supabaseAdmin.from('workspace_records').select('data').eq('collection', 'workspaceConfig').eq('id', 'workspace').maybeSingle();

  let set;
  try {
    set = generateSampleData({ todayAd: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' }), products,
      manager: { id: auth.user.id, name: auth.user.fullName || 'Manager' }, existingNiches: (nicheRows || []).map((row) => row.id),
      brands: realBrands, brandPrefixes: (configRow?.data as any)?.brandPrefixes || null });
  } catch (error) { return failure(error instanceof Error ? error.message : 'Could not build test data.'); }

  const removed = await supabaseAdmin.rpc('remove_sample_records');
  if (removed.error) return failure('Could not clear the previous test data.', 503);

  // Test brands first, so products and orders that name them load into a workspace that knows them.
  if (set.brands.length) {
    const { error } = await supabaseAdmin.from('brands').upsert(set.brands.map((b) => ({ id: b.id, code: b.code, name: b.name, color: b.color, category: b.category,
      description: b.description, principal_company: b.principalCompany, is_active: true, sub_brands: b.subBrands, updated_at: new Date().toISOString() })), { onConflict: 'id' });
    if (error) return failure('Could not add the test brands.', 503);
  }

  // Field officers get the field sales role's access; online desk staff get the D2C officer role's.
  const accessOf = (name: string) => { const r = role(name); return r ? resolveAccess(normalizeAccessMap(r.permissions), {}, { id: r.id, name: r.name }) : {}; };
  const fieldAccess = accessOf('field sales officer');
  const deskAccess = accessOf('d2c officer');
  const { error: userError } = await supabaseAdmin.from('users').upsert(set.users.map((user) => ({
    ...user, password_hash: 'test-account-cannot-sign-in', custom_permissions: user.role === 'STAFF' ? deskAccess : fieldAccess, permissions: {},
  })), { onConflict: 'id' });
  if (userError) return failure('Could not add the test staff.', 503);

  // Live tracking reads one GPS row per officer; these go when the test officers are removed.
  const live = set.records.filter((record) => record.collection === 'staffLiveLocations').map((record) => record.data);
  await supabaseAdmin.from('gps_pings').delete().like('officer_id', `${SAMPLE_USER_PREFIX}%`);
  await supabaseAdmin.from('gps_pings').insert(live.map((row, index) => ({ officer_id: row.officerId, officer_name: row.officerName, lat: row.currentLat, lng: row.currentLng,
    status: row.status, current_store_name: row.currentStoreName || null, battery_level: row.batteryLevel, created_at: new Date(Date.now() - (index + 1) * 4 * 60000).toISOString() })));

  const stamp = `sample_${Date.now()}`;
  for (let start = 0; start < set.records.length; start += 400) {
    const chunk = set.records.slice(start, start + 400).map((record) => ({ collection: record.collection, id: record.id, data: record.data, created_by: auth.user.id, version: 1, last_mutation_id: stamp }));
    const { error } = await supabaseAdmin.from('workspace_records').insert(chunk);
    if (error) return failure(`Test data stopped part-way (${start} of ${set.records.length}). Load again to finish.`, 503);
  }
  await log(auth.user, 'TEST_DATA_LOADED', set.summary);
  return NextResponse.json({ success: true, data: { summary: set.summary, total: set.records.length } }, { headers });
}

/** Remove every test record, test brand and test staff account. */
export async function DELETE(request: Request) {
  const auth = await superAdmin(request, true);
  if (auth.response) return auth.response;
  const { data, error } = await supabaseAdmin.rpc('remove_sample_records');
  if (error) return failure('Could not remove the test data. Nothing was changed.', 503);
  await log(auth.user, 'TEST_DATA_REMOVED', { records: data });
  return NextResponse.json({ success: true, data: { removed: data } }, { headers });
}
