'use client';

import React, { useEffect, useState } from 'react';
import { MapPin, Smartphone } from 'lucide-react';
import { gpsActions, useGpsSharing } from '@/lib/gps-sharing-store';

/** GPS sharing controls, shown in the profile and duty drawer under the duty status. */
export default function GpsSharingPanel({ userId }: { userId: string }) {
  const { allowed, enabled, onDuty, message, lastSaved } = useGpsSharing();
  const [nativeOpen, setNativeOpen] = useState(false);
  const [nativeStatus, setNativeStatus] = useState('');
  const [device, setDevice] = useState<{ identifier: string; expiresAt: string; serverUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!nativeOpen || !allowed) return;
    let disposed = false;
    void fetch('/api/gps/devices', { cache: 'no-store', headers: { 'X-Workspace-User': userId } }).then(async (response) => {
      const result = await response.json();
      if (!disposed) setNativeStatus(response.ok ? result.paired ? `Paired until ${new Date(result.expiresAt).toLocaleDateString()}. Regenerating disconnects the previous identifier.` : 'No phone tracker paired yet.' : result.error || 'Phone setup is unavailable.');
    }).catch(() => { if (!disposed) setNativeStatus('Phone setup could not be reached.'); });
    return () => { disposed = true; };
  }, [nativeOpen, allowed, userId]);

  const changePairing = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    try {
      const response = await fetch('/api/gps/devices', { method, headers: { 'X-Workspace-User': userId } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Phone setup failed.');
      setDevice(method === 'POST' ? result : null);
      setNativeStatus(method === 'POST' ? 'Copy this private identifier now; it is shown only once. Anyone with it can report your GPS until it is disconnected or expires.' : 'Phone tracker disconnected.');
    } catch (error) { setNativeStatus(error instanceof Error ? error.message : 'Phone setup failed.'); }
    finally { setBusy(false); }
  };

  if (!allowed) return null;
  const live = enabled && onDuty;
  return (
    <section aria-label="GPS sharing" className="space-y-3">
      <div>
        <h4 className="text-xs font-medium text-slate-500">GPS sharing</h4>
        <p className="text-[11px] text-slate-500">Shares your location with the office while you are on duty.</p>
      </div>
      <div className="rounded-xl border border-black/[0.08] bg-white p-3">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${live ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1" role="status">
            <p className="text-[13px] font-medium text-slate-900">{!enabled ? 'Not sharing' : !onDuty ? 'Paused, you are off duty' : 'Sharing your location'}</p>
            <p className="mt-0.5 text-xs leading-snug text-slate-500">
              {!enabled ? 'Turn on to share your location while this app is open.' : !onDuty ? 'It resumes when you go on duty above.' : message}
              {lastSaved && live ? ` · last confirmed ${lastSaved}` : ''}
            </p>
          </div>
          <button type="button" role="switch" aria-checked={enabled} aria-label="Share GPS from this device" onClick={() => gpsActions.setEnabled(!enabled)}
            className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-slate-300'}`}>
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        {live && <button type="button" onClick={gpsActions.retry} className="mt-2 ml-11 text-xs font-medium text-blue-700 hover:underline">Find my position again</button>}
      </div>

      <details onToggle={(event) => setNativeOpen(event.currentTarget.open)} className="text-xs">
        <summary className="w-fit cursor-pointer py-1 text-slate-500 hover:text-slate-800"><Smartphone className="mr-1 inline h-3.5 w-3.5" />Background tracking on your phone</summary>
        <div className="space-y-2 pt-2 text-slate-600">
          <p>Browsers can pause GPS when the app is closed or the phone is locked. For background updates, install the free <a className="text-blue-700 underline" href="https://www.traccar.org/client/" target="_blank" rel="noreferrer">Traccar client</a>. Use the OsmAnd protocol with the server address and private identifier below, set a 30–60 second interval, allow location “Always” and battery use, then turn on its tracking service and stay on duty here.</p>
          <p role="status">{nativeStatus}</p>
          {device && <div className="space-y-2">
            <label className="block">Server address<input readOnly value={device.serverUrl} className="mt-1 block w-full rounded-lg border p-2" /></label>
            <label className="block">Private device identifier<input readOnly value={device.identifier} className="mt-1 block w-full rounded-lg border p-2 font-mono" /></label>
            <p>Expires {new Date(device.expiresAt).toLocaleDateString()}. Keep the identifier only in the tracker app and never share it in screenshots.</p>
            {device.serverUrl.startsWith('http:') && <p className="text-amber-800">Pair from the live website for phone tracking. This local address only works on this computer.</p>}
          </div>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void changePairing('POST')} className="btn btn-secondary disabled:opacity-50">{busy ? <><span className="bb-spinner" aria-hidden="true" />Updating…</> : 'Create device identifier'}</button>
            <button type="button" disabled={busy} onClick={() => void changePairing('DELETE')} className="btn btn-secondary text-rose-700 disabled:opacity-50">Disconnect phone tracker</button>
          </div>
          <p>The switch above stops this browser only. To stop the phone tracker, disconnect it here, stop its service, or go off duty.</p>
        </div>
      </details>
    </section>
  );
}
