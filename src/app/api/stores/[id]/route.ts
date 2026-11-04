import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { isSuperAdmin } from '@/lib/permissions';
import { isSameOriginRequest } from '@/lib/request-origin';
import { readWorkspaceContext, saveWorkspaceMutation, WorkspaceError } from '@/lib/db/server-workspace';
import { STORE_COLLECTIONS, storeDeletionPlan } from '@/lib/store-deletion';
import { apiFailure, readBody } from '../../_workspace';
export const dynamic = 'force-dynamic';
async function authorize(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth;
  if (!isSuperAdmin(auth.user)) return { response: NextResponse.json({ success: false, error: 'Super Admin access is required.' }, { status: 403 }) };
  if (request.headers.get('x-workspace-user') !== auth.user.id) return { response: NextResponse.json({ success: false, error: 'The signed-in account changed. Refresh first.' }, { status: 409 }) };
  if (request.method !== 'GET' && !isSameOriginRequest(request)) return { response: NextResponse.json({ success: false, error: 'Invalid request origin.' }, { status: 403 }) };
  return auth;
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request); if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const context = await readWorkspaceContext();
    const store = context.records.find(row => (STORE_COLLECTIONS as readonly string[]).includes(row.collection) && row.id === id);
    if (!store) throw new WorkspaceError(404, 'Store not found.');
    const plan = storeDeletionPlan(store, context.records);
    return NextResponse.json({ success: true, collection: store.collection, version: store.version, children: plan.children.map(row => ({ id: row.id, name: row.data.name })), pendingCount: plan.pending.length }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiFailure(error, 'Could not check store.'); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request); if (auth.response) return auth.response;
  try {
    const { id } = await params; const body = await readBody(request);
    if (!(STORE_COLLECTIONS as readonly string[]).includes(body.collection) || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) throw new WorkspaceError(400, 'Refresh the store before deleting.');
    const result = await saveWorkspaceMutation(auth.user!, { collection: body.collection, id, operation: 'delete', expectedVersion: body.expectedVersion, mutationId: `store_delete_${crypto.randomUUID()}` });
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return apiFailure(error, 'Store was not deleted.'); }
}
