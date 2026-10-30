import { isSameOriginRequest } from '@/lib/request-origin';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { deliverPushNotification, pushConfig } from '@/lib/push-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireAuth(request); if (auth.response) return auth.response;
  if (request.headers.has('X-Workspace-User') && request.headers.get('X-Workspace-User') !== auth.user.id) return NextResponse.json({ error: 'Account changed. Refresh before changing notifications.' }, { status: 409 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (!pushConfig()) return NextResponse.json({ error: 'Push delivery is not configured.' }, { status: 503 });
  const minute = Math.floor(Date.now() / 60000);
  // A unique persisted notification also makes test delivery limited to once per minute/device.
  const notification = { id: `push_test_${auth.user.id}_${minute}`, userId: auth.user.id, title: 'Push delivery test', message: 'Test requested from your device.', priority: 'MEDIUM' as const, read: false, entityType: 'pushTest', createdAt: new Date().toISOString() };
  const result = await deliverPushNotification(auth.user, notification);
  return NextResponse.json({ success: result.sent > 0, ...result, message: result.sent ? 'Accepted by the push service. Check your device notification centre.' : result.failed ? 'Push delivery failed. Re-enable notifications and retry.' : 'No new delivery. Enable this device, or wait one minute before another test.' }, { status: result.failed && !result.sent ? 503 : 200 });
}
