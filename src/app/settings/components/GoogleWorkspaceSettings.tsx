'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2 } from 'lucide-react';

interface GoogleStatus {
  oauthReady: boolean;
  missing: string[];
  redirectUri: string | null;
  connected: boolean;
  mode: 'oauth' | 'service-account' | null;
  driveReady: boolean;
  sheetsReady: boolean;
  identity: { email: string; displayName: string; connectedAt: string } | null;
  spreadsheetUrl: string | null;
  lastExport: { exportedAt: string; totalRows: number; tabsUpdated: string[]; spreadsheetUrl: string } | null;
}

function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`;
}

export default function GoogleWorkspaceSettings({ showExport = false }: { showExport?: boolean }) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [month, setMonth] = useState(currentMonth);

  async function load() {
    const response = await fetch('/api/integrations/google', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Google status could not be loaded.');
    setStatus(data);
  }

  useEffect(() => {
    load().catch((cause: Error) => setError(cause.message));
    const result = new URLSearchParams(window.location.search).get('google');
    const messages: Record<string, string> = {
      connected: 'Google is connected. The app folder and report workbook are ready.',
      session_required: 'Sign in as an administrator and connect again.',
      invalid_state: 'The connection request expired or could not be verified. Start Connect Google again.',
      consent_denied: 'Google consent was cancelled. No new connection was completed.',
      connection_failed: 'Google setup could not finish. If the account is connected below, retry Prepare resources; otherwise reconnect and grant access.',
    };
    if (result && messages[result]) {
      if (result === 'connected') setMessage(messages[result]);
      else setError(messages[result]);
    }
  }, []);

  async function act(action: 'connect' | 'prepare' | 'disconnect' | 'export') {
    setBusy(action); setError(''); setMessage('');
    try {
      const url = action === 'connect' ? '/api/integrations/google/connect' : action === 'export' ? '/api/sheets/export' : '/api/integrations/google';
      const response = await fetch(url, { method: action === 'disconnect' ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: action === 'export' ? JSON.stringify({ month }) : undefined });
      const data = await response.json();
      if (!response.ok || data.success === false) throw new Error(data.error || 'Google request failed.');
      if (action === 'connect') { window.location.assign(data.authorizationUrl); return; }
      if (action === 'export') setMessage(`Exported ${data.totalRows.toLocaleString()} rows to ${data.tabsUpdated.length} tabs at ${new Date(data.exportedAt).toLocaleString()}.`);
      else if (action === 'disconnect') setMessage('App connection removed. Existing Google files are retained. You can also revoke access in your Google account.');
      else setMessage('The Google folder and report workbook are ready.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Google request failed.'); }
    finally { setBusy(''); }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs" aria-label="Google Workspace integration">
    <div>
      <h2 className="text-base font-bold text-slate-900">Google Workspace</h2>
      <p className="text-sm text-slate-600 mt-1">Supabase stores business records. Drive stores documents and photos; Sheets receives reports when an administrator exports them.</p>
    </div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {!status && !error && <p className="text-sm text-slate-500">Loading connection settings…</p>}
    {status && <>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-slate-500">Account</dt><dd className="font-semibold">{status.identity?.email || (status.mode === 'service-account' ? 'Service account configured' : 'Not connected')}</dd></div>
        <div><dt className="text-slate-500">Drive uploads</dt><dd className="font-semibold">{status.driveReady ? 'Configured · max 4 MB per file' : 'Setup required'}</dd></div>
        <div><dt className="text-slate-500">Sheets reports</dt><dd className="font-semibold">{status.sheetsReady ? 'Workbook configured' : 'Setup required'}</dd></div>
      </dl>
      {!status.oauthReady && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
        <p className="font-semibold">Server setup required before connecting Google</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Enable Google Drive API and Google Sheets API in a Google Cloud project.</li>
          <li>Create an OAuth web application client and configure its consent screen.</li>
          <li>Add the exact callback URL: <code className="break-all">{status.redirectUri || `${typeof window === 'undefined' ? 'https://your-app-domain' : window.location.origin}/api/integrations/google/callback`}</code>.</li>
          <li>Add server environment variables and redeploy: <code className="break-all">{status.missing.join(', ')}</code>.</li>
        </ol>
        <p>Secrets belong in hosting environment settings. This app never asks you to paste tokens or private keys into a browser form.</p>
      </div>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!status.oauthReady || !!busy} onClick={() => act('connect')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{status.connected ? 'Reconnect Google' : 'Connect Google'}</button>
        {status.connected && <>
          {(!status.driveReady || !status.sheetsReady) && <button type="button" disabled={!!busy} onClick={() => act('prepare')} className="rounded-lg border px-4 py-2 text-sm">Prepare resources</button>}
          <button type="button" disabled={!!busy} onClick={() => act('disconnect')} className="rounded-lg border px-4 py-2 text-sm">Remove app connection</button>
        </>}
        {status.spreadsheetUrl && <a href={status.spreadsheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700">Open report workbook <ExternalLink className="h-4 w-4" /></a>}
        {busy && <span role="status" className="inline-flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />{busy === 'export' ? 'Writing seven report tabs…' : 'Working…'}</span>}
      </div>
      {status.lastExport && <p className="text-sm text-slate-600">Last completed export: {new Date(status.lastExport.exportedAt).toLocaleString()} · {status.lastExport.totalRows.toLocaleString()} rows · {status.lastExport.tabsUpdated.length} tabs.</p>}
      {showExport && <div className="flex flex-wrap items-end gap-3 border-t pt-4">
        <label className="text-sm text-slate-700">Orders and stock month (AD)<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 block rounded-lg border px-3 py-2" /></label>
        <button type="button" disabled={!status.sheetsReady || !!busy || !/^\d{4}-\d{2}$/.test(month)} onClick={() => act('export')} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Export seven core tabs</button>
        <p className="text-xs text-slate-500">Manual export. Scheduled Sheets exports are not enabled.</p>
      </div>}
      {!showExport && <Link href="/opscore/export" className="inline-block text-sm font-semibold text-blue-700">Open reports and exports</Link>}
      <p className="text-xs text-slate-500">OAuth access is limited to files this app creates. Uploads stay in the configured folder without public sharing. Service accounts can use an existing shared drive folder and report workbook.</p>
    </>}
  </section>;
}
