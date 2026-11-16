import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { isSameOriginRequest } from '@/lib/request-origin';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { saveExtractedOrders } from '@/lib/db/extractor-service';
import { apiFailure, readBody, ApiInputError } from '../../_workspace';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'orderflow', 'CREATE'); if (auth.response) return auth.response;
  if (request.headers.get('x-workspace-user') !== auth.user.id) return NextResponse.json({ success:false, error:'The signed-in account changed. Refresh and sign in again.' }, { status:409 });
  if (!isSameOriginRequest(request, true)) return NextResponse.json({ success:false, error:'Invalid request origin.' }, { status:403 });
  try {
    if (Number(request.headers.get('content-length') || 0) > 250000) throw new ApiInputError('The order batch is too large.', 413);
    const body = await readBody(request);
    if (Buffer.byteLength(JSON.stringify(body)) > 250000) throw new ApiInputError('The order batch is too large.', 413);
    const result = await saveExtractedOrders(body, await openServerWorkspace(auth.user));
    return NextResponse.json({ success:true, ...result }, { headers:{'Cache-Control':'no-store'} });
  } catch (error) { return apiFailure(error, 'Orders could not be saved.'); }
}
