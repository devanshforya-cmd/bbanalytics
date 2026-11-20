'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CloudUpload, ExternalLink, Loader2 } from 'lucide-react';

interface BackupRun {
  at: string; ok: boolean; trigger: 'schedule' | 'manual'; by?: string;
  fileName?: string; fileUrl?: string; rows?: number; sheets?: number; bytes?: number; trashed?: number; error?: string;
}
interface BackupState { lastRun: BackupRun | null; lastSuccess: BackupRun | null; kept: number; schedule: string }

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const size = (bytes = 0) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Weekly Drive backup: when it last ran, a link to the file, and a button to run it now.
 * Shown to Super Admins only; the server checks that too.
 */
export default function DriveBackupCard({ settingsLink = false }: { settingsLink?: boolean }) {
  const [state, setState] = useState<BackupState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/backups/drive', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Backup status could not be loaded.');
    setState(data);
  }

  useEffect(() => { load().catch((cause: Error) => setError(cause.message)); }, []);

  async function runNow() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/backups/drive', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await response.json().catch(() => ({}));
      await load().catch(() => undefined);
      if (!response.ok || data.success === false) throw new Error(data.error || 'The backup could not be saved to Drive.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The backup could not be saved to Drive.'); }
    finally { setBusy(false); }
  }

  const last = state?.lastRun;
  const good = state?.lastSuccess;
  const failedSince = last && !last.ok;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-label="Weekly backup to Google Drive">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><CloudUpload className="h-4 w-4 text-slate-600" /> Weekly backup to Google Drive</h2>
      <p className="mt-2 text-xs text-slate-600">
        {state?.schedule || 'Every Sunday at about 12:00 AM Nepal time'}: every record in one Excel file, saved to <span className="font-semibold">BB Analytics → Backups</span> in the connected Google account. The newest {state?.kept || 12} are kept; older ones go to Drive&apos;s trash.
      </p>

      {good && (
        <p className="mt-3 text-xs text-slate-700">
          Last saved {when(good.at)} · {(good.rows || 0).toLocaleString()} rows · {size(good.bytes)}
          {good.fileUrl && <> · <a href={good.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-blue-700">Open in Drive <ExternalLink className="h-3 w-3" /></a></>}
        </p>
      )}
      {state && !good && !failedSince && <p className="mt-3 text-xs text-slate-500">No backup has been saved yet.</p>}
      {failedSince && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800">
          The {last.trigger === 'schedule' ? 'scheduled' : 'last'} backup on {when(last.at)} didn&apos;t save. {last.error}
          {settingsLink && <> <Link href="/settings?tab=google" className="font-semibold underline">Open Google settings</Link></>}
        </p>
      )}
      {error && !failedSince && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800">{error}</p>}

      <button type="button" onClick={runNow} disabled={busy}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving to Drive…</> : 'Back up to Drive now'}
      </button>
    </section>
  );
}
