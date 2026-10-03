'use client';

import React, { useState, useEffect } from 'react';
import { Bell, ShieldAlert, X } from 'lucide-react';

export default function NotificationPermissionBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      const dismissedUntil = localStorage.getItem('bb_notif_prompt_dismissed_until');
      if (!dismissedUntil || Date.now() > Number(dismissedUntil)) {
        setShow(true);
      }
    }
  }, []);

  const handleEnable = async () => {
    if ('Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          // Attempt test notification
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'NOTIFICATIONS_ENABLED',
            });
          }
        }
      } catch (e) {
        console.warn('Error requesting notification permission', e);
      }
    }
    setShow(false);
  };

  const handleDismiss = () => {
    // Dismiss for 7 days
    const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem('bb_notif_prompt_dismissed_until', String(nextWeek));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:bottom-6 sm:right-6 sm:left-auto sm:max-w-md z-50 animate-bounce-in">
      <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-xl shadow-blue-500/10 flex items-start gap-3.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shrink-0 shadow-md shadow-blue-500/20">
          <Bell className="h-5 w-5" />
        </div>

        <div className="flex-1 text-xs">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 text-sm">Stay Updated with Smart Alerts</h4>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-slate-500 mt-1 leading-relaxed">
            Enable lock-screen notifications to get immediate alerts for overdue cheques, urgent customer complaints, and beat route reassignments.
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleEnable}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors"
            >
              Enable Notifications
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
