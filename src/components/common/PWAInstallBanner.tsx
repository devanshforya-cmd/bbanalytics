'use client';

import React, { useState, useEffect } from 'react';
import { syncManager } from '@/lib/offline-sync';
import { Download, X, Smartphone, Sparkles } from 'lucide-react';
import { toast } from '@/components/common/Toast';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // 1. Check if already installed in standalone mode
    const isRunningStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(isRunningStandalone);

    if (isRunningStandalone) return;

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

    // 3. Listen for browser install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const dismissed = localStorage.getItem('bb_pwa_install_dismissed_v1');
      if (!dismissed) {
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 4. Fallback for mobile devices that don't trigger beforeinstallprompt on first load (e.g. iOS or Android)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const dismissed = localStorage.getItem('bb_pwa_install_dismissed_v1');
    if (isMobile && !dismissed && !isRunningStandalone) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      // Fallback instruction for iOS / browsers without beforeinstallprompt
      toast.info('To install Brand Bucket on your home screen: Tap the browser Share/Menu icon and select "Add to Home Screen".');
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('bb_pwa_install_dismissed_v1', 'true');
  };

  if (!showBanner || isStandalone) return null;

  return (
    <aside
      aria-label="PWA Installation Notice"
      className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 z-50 max-w-md bg-white border border-slate-200 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-5 duration-200"
    >
      <div className="flex items-start gap-3">
        {/* App Icon */}
        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
          BB
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-bold text-slate-900">Brand Bucket Command Center</h2>
            <span className="text-[9px] bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.2 rounded-full">
              PWA
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5 leading-snug">
            Install Brand Bucket on your home screen for quick access, offline mode &amp; fast field logging.
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition active:scale-98 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install</span>
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
            >
              Not now
            </button>
          </div>
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition shrink-0"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
