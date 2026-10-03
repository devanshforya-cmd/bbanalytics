'use client';

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

type BarState = 'online' | 'offline' | 'syncing' | 'hidden';

export default function OfflineBar() {
  const [state, setState] = useState<BarState>('hidden');

  useEffect(() => {
    const handleOffline = () => setState('offline');
    const handleOnline = () => {
      setState('syncing');
      setTimeout(() => setState('hidden'), 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    if (!navigator.onLine) setState('offline');

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (state === 'hidden') return null;

  const config = {
    offline: {
      bg: 'bg-amber-500',
      icon: <WifiOff className="w-3.5 h-3.5" />,
      text: "You're offline — changes will sync when connected",
    },
    syncing: {
      bg: 'bg-emerald-500',
      icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
      text: 'Back online — syncing...',
    },
    online: {
      bg: 'bg-emerald-500',
      icon: <Wifi className="w-3.5 h-3.5" />,
      text: 'Connected',
    },
  };

  const c = config[state];

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[10000] flex items-center justify-center gap-2 py-1.5 text-white text-xs font-semibold transition-all duration-300 ${c.bg}`}
      style={{ animation: 'slideDownBar 0.3s ease-out' }}
    >
      {c.icon}
      <span>{c.text}</span>
    </div>
  );
}
