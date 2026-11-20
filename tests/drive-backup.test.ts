import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKUPS_KEPT, backupFileName, backupsToTrash } from '../src/lib/backup-plan.ts';

test('backup file is dated in Nepal time', () => {
  // 18:20 UTC Saturday is 00:05 Sunday in Kathmandu.
  assert.equal(backupFileName(new Date('2026-11-21T18:20:00Z')), 'Brand-Bucket_Full-backup_2026-11-22.xlsx');
  assert.equal(backupFileName(new Date('2026-11-21T10:00:00Z')), 'Brand-Bucket_Full-backup_2026-11-21.xlsx');
});

test('only backups beyond the newest twelve are trashed, whatever order Drive lists them in', () => {
  const files = Array.from({ length: 15 }, (_, i) => ({ id: `f${i}`, createdTime: new Date(Date.UTC(2026, 0, 1 + i * 7)).toISOString() }));
  const shuffled = [...files].reverse().sort((a, b) => (a.id < b.id ? -1 : 1));
  const trash = backupsToTrash(shuffled).map((f) => f.id).sort();
  assert.equal(BACKUPS_KEPT, 12);
  assert.deepEqual(trash, ['f0', 'f1', 'f2']);
  assert.deepEqual(backupsToTrash(files.slice(0, 5)), []);
});

test('weekly backup is scheduled and both routes are locked down', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.ok(vercel.crons.some((c: { path: string; schedule: string }) => c.path === '/api/cron/weekly-backup' && c.schedule === '20 18 * * 6'));
  const cron = readFileSync('src/app/api/cron/weekly-backup/route.ts', 'utf8');
  assert.match(cron, /requireCronAuth\(request\)/);
  const manual = readFileSync('src/app/api/backups/drive/route.ts', 'utf8');
  assert.equal((manual.match(/isSuperAdmin\(auth\.user\)/g) || []).length, 2);
  assert.match(manual, /isSameOriginGoogleMutation\(request\)/);
});

test('backup includes every data set and only trashes, never deletes', () => {
  const source = readFileSync('src/lib/drive-backup.ts', 'utf8');
  assert.match(source, /DATASETS\.map\(\(d\) => d\.key\)/);
  assert.match(source, /trashed: true/);
  assert.doesNotMatch(source, /files\.delete/);
});
