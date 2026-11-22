'use client';

import React, { useState, useEffect } from 'react';
import { syncManager } from '@/lib/offline-sync';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'bb_pwa_install_dismissed_at';
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < DISMISS_FOR_MS;
  } catch { return false; }
}

/** The iOS share glyph: a square with an arrow coming out of the top. */
function ShareGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="inline h-4 w-4 -translate-y-px text-blue-600" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'ios-inapp' | 'other'>('other');

  useEffect(() => {
    // 1. Check if already installed in standalone mode
    const isRunningStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(isRunningStandalone);

    // 2. Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Listen for updates
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content available
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('PWA Service Worker registration skipped:', err);
        });

      // Listen for sync trigger from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'TRIGGER_OFFLINE_SYNC') {
          syncManager.forceSyncNow();
        }
      });
    }

    if (isRunningStandalone) return;

    const ua = navigator.userAgent;
    // iPadOS reports itself as a Mac; touch support gives it away.
    const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const inApp = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|TikTok/i.test(ua);
    setPlatform(ios ? (inApp ? 'ios-inapp' : 'ios') : 'other');

    // 3. Android and desktop Chrome hand us a real install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!recentlyDismissed()) setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    const handleInstalled = () => { setShowBanner(false); setIsStandalone(true); };
    window.addEventListener('appinstalled', handleInstalled);

    // 4. iPhone and iPad never send that prompt, so we show the Safari steps ourselves
    let timer: number | undefined;
    if (ios && !recentlyDismissed()) timer = window.setTimeout(() => setShowBanner(true), 2500);

    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') setShowBanner(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
  };

  if (!showBanner || isStandalone) return null;

  return (
    <aside
      aria-label="Install Brand Bucket"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl animate-in slide-in-from-bottom-5 duration-200 sm:left-auto sm:right-6 sm:bottom-6"
    >
      <div className="flex items-start gap-3">
        <img src="/apple-touch-icon.png" alt="" className="h-11 w-11 shrink-0 rounded-xl ring-1 ring-black/5" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Add Brand Bucket to your home screen</h2>
          {platform === 'ios' && (
            <ol className="mt-1.5 space-y-1 text-[13px] leading-snug text-slate-600">
              <li>1. Tap <ShareGlyph /> <span className="font-medium text-slate-800">Share</span> in the Safari toolbar.</li>
              <li>2. Scroll down and tap <span className="font-medium text-slate-800">Add to home screen</span>.</li>
              <li>3. Tap <span className="font-medium text-slate-800">Add</span>. Open it from your home screen to get notifications.</li>
            </ol>
          )}
          {platform === 'ios-inapp' && (
            <p className="mt-1 text-[13px] leading-snug text-slate-600">This page is open inside another app. Open it in Safari first, then tap <ShareGlyph /> Share and choose add to home screen.</p>
          )}
          {platform === 'other' && (
            <p className="mt-1 text-[13px] leading-snug text-slate-600">Opens like an app, works offline in the field, and can send you notifications.</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {platform === 'other' && deferredPrompt && (
              <button type="button" onClick={handleInstallClick} className="btn btn-primary">
                <Download className="h-3.5 w-3.5" />
                Install
              </button>
            )}
            <button type="button" onClick={handleDismiss} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              {platform === 'other' ? 'Not now' : 'Got it'}
            </button>
          </div>
        </div>
        <button type="button" onClick={handleDismiss} className="shrink-0 rounded-lg p-1 text-slate-500 hover:text-slate-700" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
