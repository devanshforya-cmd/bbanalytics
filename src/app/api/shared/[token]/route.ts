import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { openSystemWorkspace, readSharedAccessLink, recordSharedAccess } from '@/lib/db/server-workspace';
import { apiFailure } from '../../_workspace';
import { projectSharedPortal, validateSharedLink } from './projection';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^bb_[A-Za-z0-9_-]{43,128}$/.test(token)) return NextResponse.json({ success: false, error: 'Access link not found or revoked.' }, { status: 404, headers });
  try {
    const link = await readSharedAccessLink(token);
    validateSharedLink(link);
    if (link.passcode) {
      const expected = Buffer.from(link.passcode);
      const supplied = Buffer.from(request.headers.get('x-shared-passcode') || '');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return NextResponse.json({ success: false, requiresPasscode: true, name: link.name, error: 'Enter the shared access passcode.' }, { status: 401, headers });
    }
    const { db } = await openSystemWorkspace();
    await recordSharedAccess(link.id);
    return NextResponse.json({ success: true, data: projectSharedPortal(db, link) }, { headers });
  } catch (error) {
    const response = apiFailure(error, 'Shared data could not be loaded.');
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
}
