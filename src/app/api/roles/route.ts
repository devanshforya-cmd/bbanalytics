import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { isSuperAdmin } from '@/lib/permissions';
import { isSameOriginRequest } from '@/lib/request-origin';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { readStoredUsers, recordAccessChange } from '@/lib/db/server-workspace';
import { isResolvedAccess, newRoleId, normalizeAccessMap, resolveAccess, type StaffRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';
const failure = (message: string, status = 400) => NextResponse.json({ success: false, error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } });

function mapRole(row: any): StaffRole {
  return { id: row.id, name: row.name, description: row.description || '', color: row.color || '#1470b0', permissions: normalizeAccessMap(row.permissions), createdAt: row.created_at, updatedAt: row.updated_at, createdBy: row.created_by || undefined };
}

async function superAdmin(request: Request, writing: boolean) {
  const auth = await requireAuth(request);
  if (auth.response) return auth;
  if (!isSuperAdmin(auth.user)) return { response: failure('Only a Super Admin can manage roles.', 403) };
  if (writing && !isSameOriginRequest(request, true)) return { response: failure('Invalid request origin.', 403) };
  return auth;
}

export async function GET(request: Request) {
  const auth = await superAdmin(request, false);
  if (auth.response) return auth.response;
  const { data, error } = await supabaseAdmin.from('staff_roles').select('*').order('name');
  if (error) return failure('Roles are temporarily unavailable.', 503);
  return NextResponse.json({ success: true, data: (data || []).map(mapRole) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function save(request: Request, creating: boolean) {
  const auth = await superAdmin(request, true);
  if (auth.response) return auth.response;
  let body: any;
  try { body = await request.json(); } catch { return failure('Invalid JSON request.'); }
  const name = String(body?.name || '').trim();
  if (!name || name.length > 60) return failure('Give the role a name of 1–60 characters.');
  const description = String(body?.description || '').trim().slice(0, 240);
  const color = /^#[0-9a-f]{6}$/i.test(body?.color || '') ? body.color : '#1470b0';
  const id = creating ? newRoleId() : String(body?.id || '');
  if (!/^role_[A-Za-z0-9_-]{6,80}$/.test(id)) return failure('A valid role is required.');
  const permissions = normalizeAccessMap(body?.permissions);

  const { data: existing, error: readError } = await supabaseAdmin.from('staff_roles').select('id,name').order('name');
  if (readError) return failure('Roles are temporarily unavailable.', 503);
  if (!creating && !(existing || []).some((role) => role.id === id)) return failure('Role not found.', 404);
  if ((existing || []).some((role) => role.id !== id && role.name.toLowerCase() === name.toLowerCase())) return failure('Another role already has this name.', 409);

  // Everyone in the role gets the new access now, keeping their own one-off changes.
  let members: { id: string; customPermissions: Record<string, unknown> }[] = [];
  if (!creating) {
    try {
      const users = await readStoredUsers();
      members = users.filter((user) => !isSuperAdmin(user) && isResolvedAccess(user.customPermissions) && user.customPermissions._role?.id === id)
        .map((user) => ({ id: user.id, customPermissions: resolveAccess(permissions, (user.customPermissions as any)._overrides || {}, { id, name }) as Record<string, unknown> }));
    } catch { return failure('Staff records are temporarily unavailable.', 503); }
  }
  const { data, error } = await supabaseAdmin.rpc('save_staff_role', { p_actor: auth.user.id, p_role: { id, name, description, color, permissions }, p_users: members });
  if (error) {
    if (error.code === '23505') return failure('Another role already has this name.', 409);
    if (error.code === '22023') return failure(error.message, 403);
    console.error('[Roles] Save failed:', error.code);
    return failure('The role was not saved. Please retry.', 503);
  }
  await recordAccessChange(auth.user, creating ? 'CREATE' : 'UPDATE', 'staffRoles', id, { name, people: members.length });
  return NextResponse.json({ success: true, data: mapRole(data), updatedPeople: members.length }, { status: creating ? 201 : 200 });
}

export const POST = (request: Request) => save(request, true);
export const PATCH = (request: Request) => save(request, false);

export async function DELETE(request: Request) {
  const auth = await superAdmin(request, true);
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^role_[A-Za-z0-9_-]{6,80}$/.test(id)) return failure('A valid role is required.');
  const { error } = await supabaseAdmin.rpc('delete_staff_role', { p_actor: auth.user.id, p_id: id });
  if (error) return failure(error.code === '22023' ? error.message : 'The role was not deleted. Please retry.', error.code === '22023' ? 409 : 503);
  await recordAccessChange(auth.user, 'DELETE', 'staffRoles', id, {});
  return NextResponse.json({ success: true });
}
