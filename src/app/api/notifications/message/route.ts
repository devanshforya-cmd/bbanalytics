import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '@/lib/auth-guard';
import { canPerform, isSuperAdmin } from '@/lib/permissions';
import { deliverNotifications } from '@/lib/notify-server';
import { readStoredUsers } from '@/lib/db/server-workspace';
import { isSameOriginGoogleMutation } from '@/lib/google-workspace-security';

export const dynamic = 'force-dynamic';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

/**
 * Send a written message to chosen people (or everyone). It arrives in their bell, pops up
 * in the app and goes to their phone; clicking it shows the message.
 * Super Admins, and roles allowed to edit Alerts & notifications, can send.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user) && !canPerform(auth.user, 'p.settings_alerts', 'EDIT')) return NextResponse.json({ error: 'Your role cannot send messages.' }, { status: 403 });
  if (!isSameOriginGoogleMutation(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const message = String(body.message || '').trim();
  const priority = PRIORITIES.includes(body.priority) ? body.priority : 'MEDIUM';
  if (!title || title.length > 120) return NextResponse.json({ error: 'Write a subject of up to 120 characters.' }, { status: 400 });
  if (!message || message.length > 2000) return NextResponse.json({ error: 'Write a message of up to 2,000 characters.' }, { status: 400 });
  const users = (await readStoredUsers()).filter((user) => user.active !== false && user.id !== auth.user.id);
  const ids = body.everyone === true ? null : Array.isArray(body.userIds) ? new Set(body.userIds.filter((id: unknown) => typeof id === 'string')) : new Set<string>();
  const recipients = ids ? users.filter((user) => ids.has(user.id)) : users;
  if (!recipients.length) return NextResponse.json({ error: 'Choose at least one person.' }, { status: 400 });
  const sent = await deliverNotifications(auth.user.id, recipients, `message:${randomUUID()}`, {
    title, message, priority, kind: 'MESSAGE', entityType: 'message', senderId: auth.user.id, senderName: auth.user.fullName,
  });
  return NextResponse.json({ success: true, sent });
}
