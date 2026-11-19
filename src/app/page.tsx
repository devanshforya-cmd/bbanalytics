'use client';

import ProgressRing from '@/components/common/ProgressRing';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionUser, getRedirectPathForUser } from '@/lib/auth';
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
      router.replace(getRedirectPathForUser(sessionUser));
    }
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center">
      <ProgressRing estimateMs={1000} size={64} label="Opening Brand Bucket" />
    </div>
  );
}
