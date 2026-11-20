/**
 * Hourly full backup: every data set in one Excel workbook, saved to a "Backups" folder
 * inside the app's own "BB Analytics" Google Drive folder. Scheduled runs skip the upload
 * when nothing has changed since the last saved backup.
 *
 * The app only has drive.file access, so it can only see and write files it created itself.
 * That is why the backups live in a folder the app makes, not one picked elsewhere in Drive.
 */
import { Readable } from 'node:stream';
import { createHash, timingSafeEqual } from 'node:crypto';
import { google, type drive_v3 } from 'googleapis';
import { supabaseAdmin } from './db/supabase-server';
import { getGoogleWorkspace, logGoogleFailure } from './google-workspace';
import { buildSheets, DATASETS } from './export/datasets';
import { buildWorkbook } from './export/xlsx';
import { exportSourceFrom } from './export/client-source';
import type { DatabaseService } from './db/db-service';
import { backupFileName, backupsToTrash } from './backup-plan';
export { KEEP_ALL_HOURS, KEEP_DAILY_DAYS } from './backup-plan';

const STATUS_KEY = 'drive_backup_status_v1';
const TRIGGER_KEY = 'backup_trigger_v1';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface BackupRun {
  at: string;
  ok: boolean;
  trigger: 'schedule' | 'manual';
  by?: string;
  fileName?: string;
  fileId?: string;
  fileUrl?: string;
  rows?: number;
  sheets?: number;
  bytes?: number;
  trashed?: number;
  error?: string;
  /** Nothing changed since the last saved backup, so no new file was made. */
  unchanged?: boolean;
}

export interface BackupStatus { folderId?: string; lastRun?: BackupRun; lastSuccess?: BackupRun; lastHash?: string; lastCheckedAt?: string }

/**
 * The database's scheduler (pg_cron) calls the backup with its own token. Only a hash of
 * that token is stored here; the token itself stays in the database vault.
 */
export async function isBackupTriggerToken(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ') || header.length < 40) return false;
  const { data, error } = await supabaseAdmin.from('system_settings').select('value').eq('key', TRIGGER_KEY).maybeSingle();
  const stored = (data?.value as { sha256?: string } | null)?.sha256;
  if (error || !stored || !/^[0-9a-f]{64}$/.test(stored)) return false;
  const received = createHash('sha256').update(header.slice(7)).digest();
  return timingSafeEqual(received, Buffer.from(stored, 'hex'));
}

export async function readBackupStatus(): Promise<BackupStatus> {
  const { data, error } = await supabaseAdmin.from('system_settings').select('value').eq('key', STATUS_KEY).maybeSingle();
  if (error) throw new Error('Backup status is unavailable.');
  return (data?.value as BackupStatus) || {};
}

async function saveBackupStatus(status: BackupStatus) {
  const { error } = await supabaseAdmin.from('system_settings').upsert({ key: STATUS_KEY, value: status, updated_at: new Date().toISOString() });
  if (error) throw new Error('Backup status could not be saved.');
}

/** The Backups folder, made again if someone deleted or trashed it. */
async function backupFolder(drive: drive_v3.Drive, parentId: string, knownId?: string): Promise<string> {
  if (knownId) {
    try {
      const found = await drive.files.get({ fileId: knownId, fields: 'id,trashed', supportsAllDrives: true });
      if (found.data.id && !found.data.trashed) return found.data.id;
    } catch { /* gone: make a new one below */ }
  }
  const made = await drive.files.create({
    requestBody: { name: 'Backups', mimeType: 'application/vnd.google-apps.folder', parents: [parentId], appProperties: { app: 'bb-analytics', kind: 'backups' } },
    fields: 'id', supportsAllDrives: true,
  });
  if (!made.data.id) throw new Error('Backups folder could not be created.');
  return made.data.id;
}

/** Build the full workbook from a workspace. Kept separate so it can be checked without Google. */
export function buildBackupWorkbook(store: DatabaseService, now = new Date()) {
  const sheets = buildSheets(exportSourceFrom(store), DATASETS.map((d) => d.key), {});
  // Fingerprint of the data itself (not the file, which carries a timestamp) to skip unchanged hours.
  const hash = createHash('sha256').update(JSON.stringify(sheets.map((sheet) => [sheet.name, sheet.rows]))).digest('hex');
  const bytes = buildWorkbook(sheets, { title: `Brand Bucket full backup ${now.toISOString().slice(0, 10)}`, author: 'BB Analytics' });
  return { bytes, hash, sheets: sheets.length, rows: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) };
}

/**
 * Make the backup and save it to Drive. Always records how the run went, so Settings can
 * show the last backup and any problem, even when nobody was watching the scheduled run.
 */
export async function runDriveBackup(store: DatabaseService, trigger: BackupRun['trigger'], by?: string): Promise<BackupRun> {
  const now = new Date();
  const status = await readBackupStatus().catch(() => ({} as BackupStatus));
  let run: BackupRun = { at: now.toISOString(), ok: false, trigger, by };
  try {
    const workspace = await getGoogleWorkspace();
    if (!workspace.folderId) throw new Error('Google Drive is connected but its BB Analytics folder is not ready. Open Settings → Google Workspace and prepare it.');
    const drive = google.drive({ version: 'v3', auth: workspace.auth });
    const folderId = await backupFolder(drive, workspace.folderId, status.folderId);
    status.folderId = folderId;

    const book = buildBackupWorkbook(store, now);
    if (trigger === 'schedule' && status.lastHash === book.hash && status.lastSuccess) {
      status.lastCheckedAt = now.toISOString();
      try { await saveBackupStatus(status); } catch (error) { logGoogleFailure('backup status save', error); }
      return { ...status.lastSuccess, at: now.toISOString(), trigger, unchanged: true };
    }
    const fileName = backupFileName(now);
    const uploaded = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId], appProperties: { app: 'bb-analytics', kind: 'backup' } },
      media: { mimeType: XLSX_MIME, body: Readable.from(Buffer.from(book.bytes)) },
      fields: 'id,webViewLink', supportsAllDrives: true,
    });
    if (!uploaded.data.id) throw new Error('Drive did not return the saved file.');

    // Keep the folder tidy: older backups go to Drive's trash, where they stay restorable for 30 days.
    let trashed = 0;
    try {
      const list = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false and mimeType = '${XLSX_MIME}'`,
        fields: 'files(id,createdTime)', pageSize: 1000, orderBy: 'createdTime desc', supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      for (const old of backupsToTrash(list.data.files || [], now)) {
        if (!old.id) continue;
        await drive.files.update({ fileId: old.id, requestBody: { trashed: true }, supportsAllDrives: true });
        trashed += 1;
      }
    } catch (error) { logGoogleFailure('backup tidy-up', error); }

    run = { ...run, ok: true, fileName, fileId: uploaded.data.id, fileUrl: uploaded.data.webViewLink || `https://drive.google.com/file/d/${uploaded.data.id}/view`,
      rows: book.rows, sheets: book.sheets, bytes: book.bytes.length, trashed };
    status.lastSuccess = run;
    status.lastHash = book.hash;
  } catch (error) {
    logGoogleFailure('backup', error);
    const message = error instanceof Error && /^(Connect Google|Google Drive is connected|Google OAuth setup)/.test(error.message)
      ? error.message
      : 'Saving to Google Drive failed. Check the Google connection in Settings → Google Workspace, then try again.';
    run = { ...run, error: message };
  }
  status.lastRun = run;
  status.lastCheckedAt = now.toISOString();
  try { await saveBackupStatus(status); } catch (error) { logGoogleFailure('backup status save', error); }
  return run;
}
