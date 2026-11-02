import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { isSuperAdmin } from '@/lib/permissions';
import { isSameOriginRequest } from '@/lib/request-origin';
import { readWorkspaceContext, saveWorkspaceMutation, WorkspaceError } from '@/lib/db/server-workspace';
import { productUsage } from '@/lib/product-catalog';
import type { Product } from '@/lib/types';
import type { WorkspaceSnapshot } from '@/lib/db/workspace-types';
import { apiFailure, readBody } from '../../_workspace';

export const dynamic = 'force-dynamic';

async function authorize(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth;
  if (!isSuperAdmin(auth.user)) return { response: NextResponse.json({ success: false, error: 'Super Admin access is required.' }, { status: 403 }) };
  if (request.headers.get('x-workspace-user') !== auth.user.id) return { response: NextResponse.json({ success: false, error: 'The signed-in account changed. Refresh before editing products.' }, { status: 409 }) };
  if (request.method !== 'GET' && !isSameOriginRequest(request)) return { response: NextResponse.json({ success: false, error: 'Invalid request origin.' }, { status: 403 }) };
  return auth;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const context = await readWorkspaceContext();
    const row = context.records.find(record => record.collection === 'products' && record.id === id);
    if (!row) throw new WorkspaceError(404, 'Product not found.');
    const snapshot: WorkspaceSnapshot = {};
    for (const record of context.records) (snapshot[record.collection] ||= []).push(record.data);
    return NextResponse.json({ success: true, product: row.data, version: row.version, ...productUsage(row.data as Product, snapshot) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiFailure(error, 'Could not check product usage.'); }
}

async function change(request: Request, params: Promise<{ id: string }>, operation: 'delete' | 'upsert') {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body = await readBody(request);
    if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) throw new WorkspaceError(400, 'Refresh the product before changing it.');
    let data;
    if (operation === 'upsert') {
      if (typeof body.active !== 'boolean') throw new WorkspaceError(400, 'A product status is required.');
      const context = await readWorkspaceContext();
      const row = context.records.find(record => record.collection === 'products' && record.id === id);
      if (!row) throw new WorkspaceError(404, 'Product not found.');
      data = { ...row.data, active: body.active };
    }
    const result = await saveWorkspaceMutation(auth.user!, { collection: 'products', id, operation, data,
      expectedVersion: body.expectedVersion, mutationId: `catalog_${crypto.randomUUID()}` });
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return apiFailure(error, 'The product was not changed.'); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { return change(request, params, 'delete'); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return change(request, params, 'upsert'); }
