'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import PWAInstallBanner from '@/components/common/PWAInstallBanner';
import { ToastContainer } from '@/components/common/Toast';
import OfflineBar from '@/components/common/OfflineBar';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db/db-service';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/login';
  const isSharedPage = pathname.startsWith('/shared/');
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (isLoginPage || isSharedPage) {
      setAuthorized(true);
      return;
    }

    const checkSession = () => {
    const sessionUser = getSessionUser();
    if (!sessionUser) {
      setAuthorized(false);
      router.replace('/login');
    } else {
      // Sync db current user with authenticated session
      if (db.getCurrentUser().id !== sessionUser.id) {
        db.setCurrentUser(sessionUser.id);
      }
      setAuthorized(true);
    }
    };
    checkSession();
    window.addEventListener('bb-db-updated', checkSession);
    return () => window.removeEventListener('bb-db-updated', checkSession);
  }, [pathname, isLoginPage, isSharedPage, router]);

  useEffect(() => {
    if (isLoginPage || isSharedPage) return;
    const refresh = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && getSessionUser()) void db.syncWithSupabase();
    };
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [isLoginPage, isSharedPage]);

  if (isLoginPage || isSharedPage) {
    return (
      <>
        {children}
        <ToastContainer />
      </>
    );
  }

  if (authorized === null) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-slate-50 text-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/25 font-black text-white text-base">
            BB
          </div>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-xs font-semibold tracking-wide text-slate-500">Initializing Command Center...</span>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-slate-50 text-slate-900">
        <span className="text-xs font-semibold tracking-wide text-slate-500">Redirecting to sign in…</span>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-50 pt-[env(safe-area-inset-top)] text-slate-900 antialiased">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:p-8 lg:pb-8">
          {children}
        </main>
        <MobileNav />
      </div>
      <PWAInstallBanner />
      <OfflineBar />
      <ToastContainer />
    </div>
  );
}
