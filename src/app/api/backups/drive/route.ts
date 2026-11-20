import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { isSuperAdmin } from '@/lib/permissions';
import { openSystemWorkspace } from '@/lib/db/server-workspace';
import { readBackupStatus, runDriveBackup, BACKUPS_KEPT } from '@/lib/drive-backup';
import { isSameOriginGoogleMutation } from '@/lib/google-workspace-security';
import { apiFailure } from '../../_workspace';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Last backup and when the next one runs. Super Admins only, like the backup itself. */
export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'p.settings_google');
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  try {
    const status = await readBackupStatus();
    return NextResponse.json({ success: true, lastRun: status.lastRun || null, lastSuccess: status.lastSuccess || null, kept: BACKUPS_KEPT, schedule: 'Every Sunday at about 12:00 AM Nepal time' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiFailure(error, 'The backup could not run.'); }
}

/** Back up now. The whole workspace goes in, whoever presses it, so this stays with Super Admins. */
export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'p.settings_google', 'EDIT');
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!isSameOriginGoogleMutation(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const { db } = await openSystemWorkspace();
    const run = await runDriveBackup(db, 'manual', auth.user.fullName || auth.user.email);
    return NextResponse.json({ success: run.ok, ...run }, { status: run.ok ? 200 : 502 });
  } catch (error) { return apiFailure(error, 'The backup could not run.'); }
}
