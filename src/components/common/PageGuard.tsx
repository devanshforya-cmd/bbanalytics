'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { User, UserRole } from '@/lib/types';
import { getSessionUser, getRedirectPathForRole } from '@/lib/auth';
import { db } from '@/lib/db/db-service';

interface PageGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallbackMessage?: string;
}

export default function PageGuard({
  allowedRoles,
  children,
  fallbackMessage,
}: PageGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const currentUser = getSessionUser() || db.getCurrentUser();
    setUser(currentUser);
    setIsReady(true);
  }, []);

  if (!isReady) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.role)) {
    const defaultRoute = user ? getRedirectPathForRole(user.role) : '/login';

    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mb-4 shadow-sm">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Access Restricted</h2>
        <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
          {fallbackMessage ||
            `Your account role (${user?.role?.replace('_', ' ') || 'Guest'}) does not have permission to view this module. Access is reserved for authorized operations staff.`}
        </p>
        <button
          type="button"
          onClick={() => router.replace(defaultRoute)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to My Authorized Workspace</span>
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
