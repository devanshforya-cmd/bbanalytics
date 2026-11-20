import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEEP_ALL_HOURS, KEEP_DAILY_DAYS, backupFileName, backupsToTrash } from '../src/lib/backup-plan.ts';

test('backup file is named with the Nepal date and time', () => {
  assert.equal(backupFileName(new Date('2026-11-21T18:20:00Z')), 'Brand-Bucket_Backup_2026-11-22_0005.xlsx');
  assert.equal(backupFileName(new Date('2026-11-20T08:20:00Z')), 'Brand-Bucket_Backup_2026-11-20_1405.xlsx');
});

test('keeps every backup for 48 hours, then the last one of each day for 30 days', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  // One backup an hour for 40 days, listed oldest first.
  const files = Array.from({ length: 40 * 24 }, (_, i) => ({ id: `f${i}`, createdTime: new Date(now.getTime() - (40 * 24 - i) * 3_600_000 + 60_000).toISOString() }));
  const trash = new Set(backupsToTrash([...files].reverse(), now).map((f) => f.id));
  const kept = files.filter((f) => !trash.has(f.id));
  const recent = kept.filter((f) => now.getTime() - Date.parse(f.createdTime) <= KEEP_ALL_HOURS * 3_600_000);
  assert.equal(recent.length, KEEP_ALL_HOURS);
  const older = kept.filter((f) => now.getTime() - Date.parse(f.createdTime) > KEEP_ALL_HOURS * 3_600_000);
  assert.ok(older.length >= KEEP_DAILY_DAYS - 3 && older.length <= KEEP_DAILY_DAYS);
  assert.ok(older.every((f) => now.getTime() - Date.parse(f.createdTime) <= KEEP_DAILY_DAYS * 86_400_000));
  // One per Nepal day, and it is the last backup of that day.
  const day = (iso: string) => new Date(Date.parse(iso) + 345 * 60_000).toISOString().slice(0, 10);
  assert.equal(new Set(older.map((f) => day(f.createdTime))).size, older.length);
  for (const f of older) {
    const sameDay = files.filter((g) => day(g.createdTime) === day(f.createdTime));
    assert.equal(f.createdTime, sameDay.map((g) => g.createdTime).sort().at(-1));
  }
  assert.deepEqual(backupsToTrash(files.slice(-5), now), []);
});

test('backup runs hourly from the database and daily from Vercel, and both routes are locked down', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.ok(vercel.crons.some((c: { path: string; schedule: string }) => c.path === '/api/cron/backup' && c.schedule === '20 18 * * *'));
  const cron = readFileSync('src/app/api/cron/backup/route.ts', 'utf8');
  assert.match(cron, /requireCronAuth\(request\)/);
  assert.match(cron, /isBackupTriggerToken\(request\)/);
  const manual = readFileSync('src/app/api/backups/drive/route.ts', 'utf8');
  assert.equal((manual.match(/isSuperAdmin\(auth\.user\)/g) || []).length, 2);
  assert.match(manual, /isSameOriginGoogleMutation\(request\)/);
});

test('backup includes every data set, skips unchanged hours, and only trashes', () => {
  const source = readFileSync('src/lib/drive-backup.ts', 'utf8');
  assert.match(source, /DATASETS\.map\(\(d\) => d\.key\)/);
  assert.match(source, /status\.lastHash === book\.hash/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /trashed: true/);
  assert.doesNotMatch(source, /files\.delete/);
});
