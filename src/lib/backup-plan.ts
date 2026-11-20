/** Naming and tidy-up rules for the weekly Drive backup. No Google or database code here. */

/** How many weekly backups stay in the folder. Older ones go to Drive's trash (kept 30 days there). */
export const BACKUPS_KEPT = 12;

/** Brand-Bucket_Full-backup_2026-11-22.xlsx, dated in Nepal time. */
export function backupFileName(now = new Date()): string {
  const nepal = new Date(now.getTime() + (5 * 60 + 45) * 60 * 1000);
  return `Brand-Bucket_Full-backup_${nepal.toISOString().slice(0, 10)}.xlsx`;
}

/** The backups beyond the newest `keep`, whatever order they arrive in. */
export function backupsToTrash<T extends { id?: string | null; createdTime?: string | null }>(files: T[], keep = BACKUPS_KEPT): T[] {
  return [...files].sort((a, b) => String(b.createdTime || '').localeCompare(String(a.createdTime || ''))).slice(keep);
}

