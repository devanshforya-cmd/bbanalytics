'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionUser, getRedirectPathForRole } from '@/lib/auth';
import { db } from '@/lib/db/db-service';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (!sessionUser) {
      router.replace('/login');
    } else {
      // Sync db current user with session
      if (db.getCurrentUser().id !== sessionUser.id) {
        db.setCurrentUser(sessionUser.id);
      }
      router.replace(getRedirectPathForRole(sessionUser.role));
    }
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-3 text-slate-500">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"></div>
        <span className="text-sm font-medium">Loading Brand Bucket Command Center...</span>
      </div>
    </div>
  );
}
