'use client';

import { roleLabel } from '@/lib/roles';
import BrandLogo from './BrandLogo';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { User } from '@/lib/types';
import NavMenu from './NavMenu';

export default function Sidebar({ pending = false }: { pending?: boolean }) {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User>(() => getSessionUser() || db.getCurrentUser());

  useEffect(() => {
    const refresh = () => { const session = getSessionUser(); if (session) setCurrentUser(session); };
    refresh();
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  return (
    <aside className="hidden w-64 flex-col border-r border-black/[0.06] bg-white/80 text-slate-700 backdrop-blur-xl lg:flex">
      {/* Brand Header */}
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" aria-label="Brand Bucket home" className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500">
          <BrandLogo variant="full" priority className="h-8" />
        </Link>
      </div>

      {/* Nav List Filtered Strictly by Permissions */}
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
        {pending ? <NavSkeleton /> : <NavMenu user={currentUser} pathname={pathname} />}
      </nav>

      {/* Footer User Info */}
      <div className="border-t border-black/[0.06] p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <div className="relative">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              {currentUser.fullName ? currentUser.fullName.charAt(0) : 'U'}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>
          <div className="overflow-hidden flex-1 min-w-0">
            <div className="truncate text-xs font-bold text-slate-900">{currentUser.fullName}</div>
            <div className="truncate text-[10px] font-medium text-slate-500">
              {roleLabel(currentUser)}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Grey placeholders while the server confirms access, so no one else's menu ever shows. */
export function NavSkeleton() {
  return (
    <div role="status" aria-label="Loading your menu" className="space-y-5 px-1 pt-1">
      {[4, 3, 5].map((rows, index) => (
        <div key={index} className="space-y-2">
          <div className="h-2.5 w-20 rounded-full bg-slate-200/80" />
          {Array.from({ length: rows }).map((_, row) => <div key={row} className="flex items-center gap-2.5 px-1.5 py-1"><div className="h-[18px] w-[18px] rounded-md bg-slate-200/80" /><div className="h-3 rounded-full bg-slate-200/80" style={{ width: `${55 + ((row * 17 + index * 11) % 35)}%` }} /></div>)}
        </div>
      ))}
    </div>
  );
}
