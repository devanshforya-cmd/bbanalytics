import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { isSuperAdmin } from '@/lib/permissions';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { processCsvImport } from '@/lib/db/import-service';
import { ApiInputError, apiFailure, readBody } from '../_workspace';
import type { CsvImportInput } from '@/lib/import-validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'settings', 'CREATE');
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ success: false, error: 'Only a Super Admin can import workspace batches.' }, { status: 403 });
  if (request.headers.get('x-workspace-user') !== auth.user.id) return NextResponse.json({ success: false, error: 'The signed-in account changed. Sign in again before importing.' }, { status: 409 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ success: false, error: 'Invalid request origin.' }, { status: 403 });
  try {
    if (Number(request.headers.get('content-length') || 0) > 400000) throw new ApiInputError('The import request is too large.', 413);
    const body = await readBody(request);
    if (!['preview', 'commit'].includes(body.action)) throw new ApiInputError('Select preview or commit.');
    const workspace = await openServerWorkspace(auth.user);
    const result = await processCsvImport(body as CsvImportInput, workspace, body.action);
    return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiFailure(error, 'The CSV batch was not saved.'); }
}
