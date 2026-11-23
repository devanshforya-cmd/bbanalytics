'use client';

import { useEffect, useRef, useState } from 'react';
import { publishGpsSharing, registerGpsActions } from '@/lib/gps-sharing-store';
import { db } from '@/lib/db/db-service';
import { clearPendingGps, recordGpsPing, retryPendingGps } from '@/lib/db/gps-service';
import { hasAccess } from '@/lib/permissions';
import { geolocationMessage, freshGpsFix, type GpsFix } from '@/lib/gps-validation';

const consentKey = (id: string) => `bb_gps_enabled_v1_${id}`;

/** Runs device GPS sharing in the background on every page. Its controls live in the profile drawer (GpsSharingPanel). */
export default function FieldGpsTracker() {
  const [user, setUser] = useState(() => db.getCurrentUser());
  const [enabled, setEnabled] = useState(false);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState('GPS sharing is off on this device.');
  const [lastSaved, setLastSaved] = useState('');
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
    lastFix.current = null; setLastSaved('');
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

  // Publish what the profile drawer needs, and let it switch sharing on and off.
  useEffect(() => {
    publishGpsSharing({ allowed, enabled, onDuty, message, lastSaved });
  }, [allowed, enabled, onDuty, message, lastSaved]);
  useEffect(() => {
    registerGpsActions({
      setEnabled: (on) => {
        localStorage.setItem(consentKey(user.id), on ? 'on' : 'off'); setEnabled(on);
        if (!on) { clearPendingGps(user.id); lastFix.current = null; setLastSaved(''); }
      },
      retry: () => setRetry((value) => value + 1),
    });
  }, [user.id]);

  return null;
}
