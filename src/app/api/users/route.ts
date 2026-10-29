import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { isSuperAdmin } from '@/lib/permissions';
import { hashPassword } from '@/lib/password-utils';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { mapStoredUser, readStoredUsers } from '@/lib/db/server-workspace';
import { staffPatch } from '@/lib/staff-validation';

export const dynamic = 'force-dynamic';
const failure = (message: string, status = 400) => NextResponse.json({ success: false, error: message }, { status });

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'settings', 'VIEW');
  if (auth.response) return auth.response;
  try { const data = await readStoredUsers(); return NextResponse.json({ success: true, count: data.length, data }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return failure('Staff records are temporarily unavailable.', 503); }
}

async function save(request: Request, creating: boolean) {
  const auth = await requireFeatureAccess(request, 'settings', creating ? 'CREATE' : 'EDIT');
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return failure('Only the Super Admin can manage staff accounts.', 403);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return failure('Invalid request origin.', 403);
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return failure('Invalid staff request.');
    const id = creating ? (body.id || `user_${randomUUID()}`) : body.id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_:-]{1,180}$/.test(id)) return failure('A valid staff ID is required.');
    let patch: Record<string, any>;
    try { patch = staffPatch(body, creating); } catch (error) { return failure(error instanceof Error ? error.message : 'Invalid staff details.'); }
    const users = await readStoredUsers();
    if (!creating && !users.some((user) => user.id === id)) return failure('Staff account not found.', 404);
    if (patch.email && users.some((user) => user.id !== id && user.email.toLowerCase() === patch.email)) return failure('This email is already assigned to another account.', 409);
    if (patch.phone && users.some((user) => user.id !== id && user.phone === patch.phone)) return failure('This mobile number is already assigned to another account.', 409);
    if (patch.reports_to_id && (patch.reports_to_id === id || !users.some((user) => user.id === patch.reports_to_id && user.active !== false))) return failure('Choose an active reporting manager.');
    if (patch.reports_to_id) {
      const seen = new Set([id]);
      let manager: string | undefined = patch.reports_to_id;
      while (manager) {
        if (seen.has(manager)) return failure('The reporting hierarchy cannot contain a cycle.');
        seen.add(manager); manager = users.find((user) => user.id === manager)?.reportsToId;
      }
    }
    if (body.password) patch.password_hash = await hashPassword(body.password);
    const result = creating
      ? await supabaseAdmin.from('users').insert({ ...patch, id }).select('*').single()
      : await supabaseAdmin.rpc('update_staff_user', { p_actor: auth.user.id, p_id: id, p_patch: patch });
    if (result.error) {
      if (result.error.code === '23505') return failure('This email or mobile number is already in use.', 409);
      if (result.error.code === '22023') return failure(result.error.message);
      console.error('[Staff] Save failed:', result.error.code);
      return failure('The staff account was not saved. Please retry.', 503);
    }
    return NextResponse.json({ success: true, data: mapStoredUser(result.data) }, { status: creating ? 201 : 200 });
  } catch (error) {
    return failure(error instanceof SyntaxError ? 'Invalid JSON request.' : 'The staff account was not saved. Please retry.', error instanceof SyntaxError ? 400 : 503);
  }
}
export const POST = (request: Request) => save(request, true);
export const PATCH = (request: Request) => save(request, false);
