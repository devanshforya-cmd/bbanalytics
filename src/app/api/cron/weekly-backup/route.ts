import { NextResponse } from 'next/server';
import { openSystemWorkspace } from '@/lib/db/server-workspace';
import { requireCronAuth } from '@/lib/cron-auth';
import { runDriveBackup } from '@/lib/drive-backup';
import { apiFailure } from '../../_workspace';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Weekly full backup to Google Drive (Sunday, just after midnight Nepal time). */
export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;
  try {
    const { db } = await openSystemWorkspace();
    const run = await runDriveBackup(db, 'schedule');
    return NextResponse.json({ success: run.ok, ...run }, { status: run.ok ? 200 : 502 });
  } catch (error) {
    return apiFailure(error, 'The backup could not run.');
  }
}
