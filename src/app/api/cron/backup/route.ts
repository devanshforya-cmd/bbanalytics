import { NextResponse } from 'next/server';
import { openSystemWorkspace } from '@/lib/db/server-workspace';
import { requireCronAuth } from '@/lib/cron-auth';
import { isBackupTriggerToken, runDriveBackup } from '@/lib/drive-backup';
import { moveInlinePhotosToDrive, type PhotoMoveResult } from '@/lib/drive-photos';
import { getGoogleWorkspace, logGoogleFailure } from '@/lib/google-workspace';
import { apiFailure } from '../../_workspace';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Scheduled backup to Google Drive. The database scheduler calls it every hour with its own
 * token; Vercel's daily cron calls it with CRON_SECRET as a back-up in case that stops.
 * Runs with nothing new since the last backup do not make a new file.
 * First, photos taken with no signal are moved off their records into Drive.
 */
export async function GET(request: Request) {
  const viaVercel = requireCronAuth(request) === null;
  if (!viaVercel && !(await isBackupTriggerToken(request).catch(() => false))) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    let photos: PhotoMoveResult | null = null;
    try {
      const workspace = await getGoogleWorkspace();
      if (workspace.folderId) photos = await moveInlinePhotosToDrive(workspace.auth, workspace.folderId, 25);
    } catch (error) { logGoogleFailure('inline photo move', error); }
    const { db } = await openSystemWorkspace();
    const run = await runDriveBackup(db, 'schedule');
    return NextResponse.json({ success: run.ok, at: run.at, unchanged: !!run.unchanged, rows: run.rows, error: run.error, photos }, { status: run.ok ? 200 : 502 });
  } catch (error) {
    return apiFailure(error, 'The backup could not run.');
  }
}
