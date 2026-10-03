'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import PWAInstallBanner from '@/components/common/PWAInstallBanner';
import NotificationPermissionBanner from '@/components/common/NotificationPermissionBanner';
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
  }, [pathname, isLoginPage, isSharedPage, router]);

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
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-emerald-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span className="text-xs font-mono tracking-wider text-slate-400">Initializing Command Center...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900 antialiased">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">
          {children}
        </main>
        <MobileNav />
      </div>
      <PWAInstallBanner />
      <NotificationPermissionBanner />
      <OfflineBar />
      <ToastContainer />
    </div>
  );
}
