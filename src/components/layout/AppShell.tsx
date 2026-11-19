'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import PWAInstallBanner from '@/components/common/PWAInstallBanner';
import { ToastContainer } from '@/components/common/Toast';
import { ConfirmHost } from '@/components/common/confirm';
import OfflineBar from '@/components/common/OfflineBar';
import FieldGpsTracker from '@/components/common/FieldGpsTracker';
import { confirmSessionWithServer, getSessionUser, logout } from '@/lib/auth';
import { firstAllowedPath, hasAccess, isSuperAdmin, setActivePage } from '@/lib/permissions';
import { OPEN_PATHS, PAGES, pageForPath } from '@/lib/access-catalog';
import type { User } from '@/lib/types';
import { db } from '@/lib/db/db-service';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/login';
  const isSharedPage = pathname.startsWith('/shared/');
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  /** True once the server has confirmed who is signed in and what they may open (or we are offline). */
  const [confirmed, setConfirmed] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (isLoginPage || isSharedPage) { setAuthorized(true); return; }
    const sessionUser = getSessionUser();
    if (!sessionUser) { setAuthorized(false); router.replace('/login'); return; }
    if (db.getCurrentUser().id !== sessionUser.id) db.setCurrentUser(sessionUser.id);
    setUser(sessionUser);
    setAuthorized(true);
    let cancelled = false;
    void confirmSessionWithServer().then(({ user: fresh }) => {
      if (cancelled) return;
      if (!fresh) { logout(); return; }
      setUser(fresh);
      setConfirmed(true);
    });
    const onUpdate = () => {
      const latest = getSessionUser();
      if (!latest) { setAuthorized(false); router.replace('/login'); return; }
      setUser(latest);
    };
    window.addEventListener('bb-db-updated', onUpdate);
    return () => { cancelled = true; window.removeEventListener('bb-db-updated', onUpdate); };
    // Only an account change needs a new server check; page changes reuse it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoginPage, isSharedPage]);

  // Every page is checked here, so a page someone was not given never shows, even for a moment.
  const page = pageForPath(pathname);
  const isSettings = pathname === '/settings' || pathname.startsWith('/settings/');
  const pageAllowed = !user ? false
    : isSuperAdmin(user) || OPEN_PATHS.includes(pathname) ? true
    : isSettings ? PAGES.some((entry) => entry.settingsTab && hasAccess(user, entry.key))
    : page ? hasAccess(user, page.key) : true;

  useEffect(() => {
    setActivePage(null);
    if (confirmed && user && !pageAllowed && !isLoginPage && !isSharedPage) router.replace(firstAllowedPath(user));
  }, [confirmed, user, pageAllowed, pathname, router, isLoginPage, isSharedPage]);

  useEffect(() => {
    if (isLoginPage || isSharedPage) return;
    const refresh = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && getSessionUser()) {
        void db.syncWithSupabase();
        if ('Notification' in window && Notification.permission === 'granted') void fetch('/api/push/flush', { method: 'POST' }).catch(() => undefined);
      }
    };
    const interval = window.setInterval(refresh, 60000);
    const onPush = (event: MessageEvent) => { if (event.data?.type === 'PUSH_RECEIVED') refresh(); };
    navigator.serviceWorker?.addEventListener('message', onPush);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); navigator.serviceWorker?.removeEventListener('message', onPush); };
  }, [isLoginPage, isSharedPage]);

  if (isLoginPage || isSharedPage) {
    return (
      <>
        {children}
        <ToastContainer />
      <ConfirmHost />
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
          <span className="text-xs font-semibold text-slate-500">Loading…</span>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-slate-50 text-slate-900">
        <span className="text-xs font-semibold text-slate-500">Redirecting to sign in…</span>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-50 pt-[env(safe-area-inset-top)] text-slate-900 antialiased">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar pending={!confirmed} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:p-8 lg:pb-8">
          <FieldGpsTracker />
          {confirmed && pageAllowed ? children : (
            <div role="status" aria-live="polite" className="flex h-64 items-center justify-center">
              <span className="bb-spinner h-6 w-6 text-blue-600" aria-hidden="true" />
              <span className="sr-only">{confirmed ? 'Opening your page…' : 'Checking your access…'}</span>
            </div>
          )}
        </main>
        <MobileNav pending={!confirmed} />
      </div>
      <PWAInstallBanner />
      <OfflineBar />
      <ToastContainer />
      <ConfirmHost />
    </div>
  );
}
