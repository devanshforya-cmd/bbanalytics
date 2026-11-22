'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { clearPendingGps, recordGpsPing, retryPendingGps } from '@/lib/db/gps-service';
import { hasAccess } from '@/lib/permissions';
import { geolocationMessage, freshGpsFix, type GpsFix } from '@/lib/gps-validation';

const consentKey = (id: string) => `bb_gps_enabled_v1_${id}`;

export default function FieldGpsTracker() {
  const [user, setUser] = useState(() => db.getCurrentUser());
  const [enabled, setEnabled] = useState(false);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState('GPS sharing is off on this device.');
  const [lastSaved, setLastSaved] = useState('');
  const [nativeOpen, setNativeOpen] = useState(false);
  const [nativeStatus, setNativeStatus] = useState('');
  const [device, setDevice] = useState<{ identifier: string; expiresAt: string; serverUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const lastFix = useRef<GpsFix | null>(null);
  const allowed = hasAccess(user, 'beat_plans');
  const onDuty = user.dutyStatus !== 'OFFLINE' && user.dutyStatus !== 'ON_LEAVE';

  useEffect(() => {
    const update = () => setUser({ ...db.getCurrentUser() });
    window.addEventListener('bb-db-updated', update);
    return () => window.removeEventListener('bb-db-updated', update);
  }, []);
  useEffect(() => {
    setEnabled(localStorage.getItem(consentKey(user.id)) === 'on');
    lastFix.current = null; setLastSaved(''); setDevice(null); setNativeOpen(false);
  }, [user.id]);

  useEffect(() => {
    if (!allowed || !enabled || !onDuty || localStorage.getItem(consentKey(user.id)) !== 'on') return;
    if (!window.isSecureContext || !navigator.geolocation) { setMessage('GPS requires HTTPS or localhost and a browser with Location Services.'); return; }
    let disposed = false;
    let blocked = false;
    let lastSent = 0;
    const owner = user.id;
    const success = (position: GeolocationPosition) => {
      if (disposed || db.getCurrentUser().id !== owner) return;
      const fix = { lat: position.coords.latitude, lng: position.coords.longitude, capturedAt: new Date(position.timestamp).toISOString(), accuracy: position.coords.accuracy };
      if (!freshGpsFix(fix)) { setMessage('Waiting for a fresh GPS position…'); return; }
      lastFix.current = fix;
      window.dispatchEvent(new CustomEvent('bb-gps-fix', { detail: { ...fix, userId: owner } }));
      if (Date.now() - lastSent < 20000) return;
      lastSent = Date.now();
      const active = db.getBeatItems().find(beat => beat.officerId === owner && beat.checkedInAt && !beat.checkedOutAt);
      const status = user.dutyStatus === 'ON_BREAK' ? 'IDLE' : active ? 'AT_STORE' : 'IN_TRANSIT';
      void recordGpsPing(owner, user.fullName, fix.lat, fix.lng, status, active?.storeName, undefined, fix.capturedAt, fix.accuracy).then(saved => {
        if (disposed) return;
        if (saved) { setLastSaved(new Date().toLocaleTimeString()); setMessage(`Sharing device GPS · accuracy ±${Math.round(fix.accuracy)} m`); }
        else setMessage('Latest GPS fix is pending on this device. It will retry while connected.');
      });
    };
    const failure = (error: GeolocationPositionError) => { if (!disposed) { blocked = error.code === 1; setMessage(geolocationMessage(error.code)); } };
    const options = { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 };
    setMessage('Finding your device GPS position…');
    const watch = navigator.geolocation.watchPosition(success, failure, options);
    const refresh = () => {
      if (disposed || blocked || document.visibilityState !== 'visible') return;
      void retryPendingGps(owner);
      navigator.geolocation.getCurrentPosition(success, failure, options);
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('online', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { disposed = true; navigator.geolocation.clearWatch(watch); window.clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [allowed, enabled, onDuty, user.id, user.fullName, user.dutyStatus, retry]);

  useEffect(() => {
    if (!nativeOpen || !allowed) return;
    let disposed = false;
    void fetch('/api/gps/devices', { cache: 'no-store', headers: { 'X-Workspace-User': user.id } }).then(async response => {
      const result = await response.json();
      if (!disposed) setNativeStatus(response.ok ? result.paired ? `Paired until ${new Date(result.expiresAt).toLocaleDateString()}. Regenerating disconnects the previous identifier.` : 'No native tracker paired.' : result.error || 'Device setup unavailable.');
    }).catch(() => { if (!disposed) setNativeStatus('Device setup could not be reached.'); });
    return () => { disposed = true; };
  }, [nativeOpen, allowed, user.id]);

  const changePairing = async (method: 'POST' | 'DELETE') => {
    const owner = user.id;
    setBusy(true);
    try {
      const response = await fetch('/api/gps/devices', { method, headers: { 'X-Workspace-User': owner } });
      const result = await response.json();
      if (db.getCurrentUser().id !== owner) return;
      if (!response.ok) throw new Error(result.error || 'Device setup failed.');
      setDevice(method === 'POST' ? result : null);
      setNativeStatus(method === 'POST' ? 'Copy this private identifier now; it is only shown once. Anyone with it can report your GPS until disconnected or expired.' : 'Native tracker disconnected.');
    } catch (error) { setNativeStatus(error instanceof Error ? error.message : 'Device setup failed.'); }
    finally { setBusy(false); }
  };

  if (!allowed) return null;
  const live = enabled && onDuty;
  return <section aria-label="Device GPS sharing" className="mb-4 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <p role="status" className="min-w-0 flex-1 text-slate-600"><span className="font-medium text-slate-900">{!enabled ? 'GPS sharing off' : !onDuty ? 'GPS paused, off duty' : 'Sharing GPS'}</span>{' · '}{!enabled ? 'share your location while this app is open' : !onDuty ? 'go on duty in Beat plan to resume' : message}{lastSaved && live ? ` · last confirmed ${lastSaved}` : ''}</p>
      <div className="flex items-center gap-2">
        {live && <button type="button" onClick={() => setRetry(value => value + 1)} className="h-8 rounded-lg border border-black/[0.08] px-3 font-medium text-slate-700 hover:bg-slate-50">Retry</button>}
        <button type="button" className={`h-8 rounded-lg px-3 font-medium ${enabled ? 'border border-black/[0.08] text-slate-700 hover:bg-slate-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`} onClick={() => {
          const next = !enabled; localStorage.setItem(consentKey(user.id), next ? 'on' : 'off'); setEnabled(next);
          if (!next) { clearPendingGps(user.id); lastFix.current = null; setLastSaved(''); }
        }}>{enabled ? 'Stop sharing' : 'Share GPS'}</button>
      </div>
    </div>
    <details onToggle={event => setNativeOpen(event.currentTarget.open)}>
      <summary className="mt-1 w-fit cursor-pointer py-1 text-slate-500 hover:text-slate-800"><Smartphone className="mr-1 inline h-3.5 w-3.5" />Background tracking on your phone</summary>
      <div className="pt-2 space-y-2 text-slate-600">
        <p>Browsers can pause GPS when closed or locked. For background updates, install the free <a className="underline text-blue-700" href="https://www.traccar.org/client/" target="_blank" rel="noreferrer">Traccar client</a> from your phone’s app store. Use OsmAnd protocol, the server URL and private device identifier below; set a 30–60 second interval, allow background/Always location, and allow battery usage. Turn on the client’s tracking service and keep your app duty status Online.</p>
        <p role="status">{nativeStatus}</p>
        {device && <div className="space-y-2"><label className="block">Server URL<input readOnly value={device.serverUrl} className="block w-full border rounded-lg p-2 mt-1" /></label><label className="block">Private device identifier<input readOnly value={device.identifier} className="block w-full border rounded-lg p-2 mt-1 font-mono" /></label><p>Expires {new Date(device.expiresAt).toLocaleDateString()}. Store the identifier only in your tracker. Never share it in screenshots.</p>{device.serverUrl.startsWith('http:') && <p className="text-amber-800">Pair on the live HTTPS website for phone tracking. This localhost URL is only reachable from this computer.</p>}</div>}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void changePairing('POST')} className="rounded-lg border border-black/[0.08] px-3 py-2 font-medium text-slate-800 disabled:opacity-50">{busy ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Updating…</> : 'Generate / replace device identifier'}</button><button type="button" disabled={busy} onClick={() => void changePairing('DELETE')} className="rounded-lg border border-black/[0.08] px-3 py-2 font-medium text-rose-700 disabled:opacity-50">Disconnect native tracker</button></div>
        <p>Stop sharing above stops this browser only. Disconnect the native tracker here, stop its service, or go off duty to stop native updates. A phone test is required to confirm your device’s background permissions.</p>
      </div>
    </details>
  </section>;
}
