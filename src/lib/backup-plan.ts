/** Naming and tidy-up rules for the hourly Drive backup. No Google or database code here. */

const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
/** Every backup from the last two days is kept. */
export const KEEP_ALL_HOURS = 48;
/** After that, the last backup of each day is kept for this many days. */
export const KEEP_DAILY_DAYS = 30;

const nepal = (time: Date) => new Date(time.getTime() + NEPAL_OFFSET_MS).toISOString();

/** Brand-Bucket_Backup_2026-11-20_1405.xlsx, in Nepal time. */
export function backupFileName(now = new Date()): string {
  const iso = nepal(now);
  return `Brand-Bucket_Backup_${iso.slice(0, 10)}_${iso.slice(11, 13)}${iso.slice(14, 16)}.xlsx`;
}

/**
 * Which backups go to Drive's trash: anything older than 48 hours that is not the last
 * backup of its Nepal day, and anything older than 30 days.
 */
export function backupsToTrash<T extends { id?: string | null; createdTime?: string | null }>(files: T[], now = new Date()): T[] {
  const newestFirst = [...files].sort((a, b) => String(b.createdTime || '').localeCompare(String(a.createdTime || '')));
  const keptDays = new Set<string>();
  const trash: T[] = [];
  for (const file of newestFirst) {
    const created = new Date(file.createdTime || 0);
    const ageHours = (now.getTime() - created.getTime()) / 3_600_000;
    if (ageHours <= KEEP_ALL_HOURS) { keptDays.add(nepal(created).slice(0, 10)); continue; }
    const day = nepal(created).slice(0, 10);
    if (ageHours <= KEEP_DAILY_DAYS * 24 && !keptDays.has(day)) { keptDays.add(day); continue; }
    trash.push(file);
  }
  return trash;
}
