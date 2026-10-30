'use client';
import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

async function subscriptionHash(endpoint: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}

async function browserStep<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([operation, new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Browser notification setup timed out. Open the live app in Chrome, Edge or Safari, then retry.')), 30000); })]); }
  finally { clearTimeout(timer!); }
}

export default function PushSettings({ userId }: { userId: string }) {
  const [message, setMessage] = useState('Checking this device…');
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let current = true;
    void (async () => {
      if (!window.isSecureContext || !('PushManager' in window) || !('serviceWorker' in navigator) || !('Notification' in window)) {
        if (current) setMessage('Use Chrome, Edge, Firefox or Safari. On iPhone/iPad, add this app to your Home Screen and open it there.');
        return;
      }
      try {
        const response = await fetch('/api/push/subscription', { cache: 'no-store', headers: { 'X-Workspace-User': userId } });
        const status = await response.json();
        if (!response.ok || !status.configured) throw new Error(status.error || 'Server push setup is incomplete.');
        const registration = await browserStep(navigator.serviceWorker.register('/sw.js'));
        const subscription = await browserStep(registration.pushManager.getSubscription());
        const owned = subscription && status.deviceIds?.includes(await subscriptionHash(subscription.endpoint));
        if (current) { setAvailable(true); setEnabled(!!owned); setMessage(Notification.permission === 'denied' ? 'Notifications are blocked. Allow them in this site’s browser settings.' : owned ? 'This browser is registered to your account. Send a test to confirm delivery.' : 'Enable notifications on each device you use.'); }
      } catch (error) { if (current) setMessage(error instanceof Error ? error.message : 'Push status could not be loaded.'); }
    })();
    return () => { current = false; };
  }, [userId]);

  const toggle = async () => {
    setBusy(true);
    try {
      if (!enabled && await browserStep(Notification.requestPermission()) !== 'granted') throw new Error('Allow notifications in your browser settings, then try again.');
      const registration = await browserStep(navigator.serviceWorker.register('/sw.js'));
      await browserStep(navigator.serviceWorker.ready);
      let subscription = await browserStep(registration.pushManager.getSubscription());
      if (enabled && subscription) {
        const response = await fetch('/api/push/subscription', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Workspace-User': userId }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!response.ok) throw new Error('Could not remove this device. Retry while connected.');
        await subscription.unsubscribe(); setEnabled(false); setMessage('Notifications disabled for this browser.');
      } else {
        const statusResponse = await fetch('/api/push/subscription', { cache: 'no-store', headers: { 'X-Workspace-User': userId } }); const status = await statusResponse.json();
        if (!statusResponse.ok || !status.publicKey) throw new Error('Push setup is unavailable.');
        if (subscription && !status.deviceIds?.includes(await subscriptionHash(subscription.endpoint))) { await subscription.unsubscribe(); subscription = null; }
        const padding = '='.repeat((4 - status.publicKey.length % 4) % 4);
        const key = Uint8Array.from(atob((status.publicKey + padding).replace(/-/g, '+').replace(/_/g, '/')), value => value.charCodeAt(0));
        subscription ||= await browserStep(registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
        const response = await fetch('/api/push/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-User': userId }, body: JSON.stringify(subscription.toJSON()) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Subscription was not saved.');
        setEnabled(true); setMessage('Device registered. Send a test and check your notification centre.');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Push setup failed.'); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { const response = await fetch('/api/push/test', { method: 'POST', headers: { 'X-Workspace-User': userId } }); const result = await response.json(); setMessage(result.message || result.error || 'Test could not be sent.'); }
    catch { setMessage('No connection. Retry when online.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" aria-label="Push notifications">
    <h3 className="text-sm font-bold flex items-center gap-2"><Bell className="h-4 w-4 text-blue-600" />Push notifications</h3>
    <p className="text-xs text-slate-600" role="status">{message}</p>
    <p className="text-xs text-slate-500">Task assignments and operations alerts can appear while the app is closed. Lock-screen messages contain no business details.</p>
    {available && <div className="flex gap-2"><button type="button" disabled={busy} onClick={toggle} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Working…' : enabled ? 'Disable on this device' : 'Enable on this device'}</button>{enabled && <button type="button" disabled={busy} onClick={test} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-50">Send test push</button>}</div>}
  </section>;
}
