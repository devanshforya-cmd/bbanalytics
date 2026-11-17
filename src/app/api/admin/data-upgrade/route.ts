import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { isSuperAdmin } from '@/lib/permissions';
import { isSameOriginRequest } from '@/lib/request-origin';
import { planDataUpgrade, runDataUpgrade } from '@/lib/db/data-upgrade';
import { WorkspaceError } from '@/lib/db/server-workspace';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const headers = { 'Cache-Control': 'private, no-store' };
function failure(error: unknown) {
  if (!(error instanceof WorkspaceError)) console.error('[Upgrade] Failed:', error instanceof Error ? error.message : 'unknown');
  return NextResponse.json({ success: false, error: error instanceof Error && (error instanceof WorkspaceError || 'status' in error) ? error.message : 'The data upgrade could not run. Nothing was half-saved; try again.' },
    { status: error instanceof WorkspaceError ? error.status : 503, headers });
}

/** What still needs upgrading. Super Admin only. */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ success: false, error: 'Only a Super Admin can view the data upgrade.' }, { status: 403, headers });
  try { return NextResponse.json({ success: true, plan: await planDataUpgrade() }, { headers }); }
  catch (error) { return failure(error); }
}

/** Run the upgrade. Safe to repeat: finished records are skipped. */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ success: false, error: 'Only a Super Admin can run the data upgrade.' }, { status: 403, headers });
  if (!isSameOriginRequest(request, true)) return NextResponse.json({ success: false, error: 'Invalid request origin.' }, { status: 403, headers });
  try { return NextResponse.json({ success: true, ...(await runDataUpgrade(auth.user)) }, { headers }); }
  catch (error) { return failure(error); }
}
