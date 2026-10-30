import { isSameOriginRequest } from '@/lib/request-origin';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { readWorkspaceContext, visibleWorkspace, saveWorkspaceMutation, WorkspaceError } from '@/lib/db/server-workspace';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { canPerform, getScope, isSuperAdmin } from '@/lib/permissions';
import { teamMemberIds } from '@/lib/db/workspace-policy';

export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (!(error instanceof WorkspaceError)) console.error('[Workspace] Request failed:', error instanceof Error ? error.message : 'unknown');
  return NextResponse.json({ success: false, error: error instanceof WorkspaceError ? error.message : 'Workspace storage is temporarily unavailable.',
    ...(error instanceof WorkspaceError && error.currentVersion !== undefined ? { currentVersion: error.currentVersion } : {}),
  }, { status: error instanceof WorkspaceError ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (request.headers.has('x-workspace-user') && request.headers.get('x-workspace-user') !== auth.user.id) return NextResponse.json({ success: false, error: 'The signed-in account changed. Sign in again before syncing.' }, { status: 409 });
  try {
    const view = visibleWorkspace(auth.user, await readWorkspaceContext());
    return NextResponse.json({ success: true, data: view.data, versions: view.versions, errors: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (request.headers.has('x-workspace-user') && request.headers.get('x-workspace-user') !== auth.user.id) return NextResponse.json({ success: false, error: 'The signed-in account changed. Pending work has been kept on this device.' }, { status: 409 });
  if (!isSameOriginRequest(request, true)) return NextResponse.json({ success: false, error: 'Invalid request origin.' }, { status: 403 });
  try {
    const body = await request.json();
    if (body.type === 'DUTY_STATUS') {
      const statuses = ['ONLINE', 'IN_FIELD', 'ON_BREAK', 'OFFLINE', 'ON_LEAVE'];
      if (!statuses.includes(body.status) || typeof body.officerId !== 'string') throw new WorkspaceError(400, 'A valid officer and duty status are required.');
      const own = body.officerId === auth.user.id;
      if (!own && !canPerform(auth.user, 'gps_tracking', 'EDIT')) throw new WorkspaceError(403, 'You cannot change this officer’s duty status.');
      if (!own && !isSuperAdmin(auth.user)) {
        const scope = getScope(auth.user, 'gps_tracking');
        const context = await readWorkspaceContext();
        if (scope === 'OWN' || (scope === 'TEAM' && !teamMemberIds(auth.user, context.users).has(body.officerId))) throw new WorkspaceError(404, 'Officer not found.');
      }
      const { data, error } = await supabaseAdmin.from('users').update({ duty_status: body.status }).eq('id', body.officerId).select('id').maybeSingle();
      if (error) throw new WorkspaceError(503, 'Duty status was not saved.');
      if (!data) throw new WorkspaceError(404, 'Officer not found.');
      return NextResponse.json({ success: true, version: 0 });
    }
    const result = await saveWorkspaceMutation(auth.user, body);
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return failure(error instanceof SyntaxError ? new WorkspaceError(400, 'Invalid JSON request.') : error); }
}
