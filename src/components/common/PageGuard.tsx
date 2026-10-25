'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/lib/types';
import { getRedirectPathForUser, getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db/db-service';
import { FeatureKey, hasAccess, isSuperAdmin } from '@/lib/permissions';

interface PageGuardProps {
  feature?: FeatureKey | string;
  allowedRoles?: any[]; // Deprecated, ignored
  children: React.ReactNode;
  fallbackMessage?: string;
  redirectTo?: string;
}

export default function PageGuard({
  feature,
  children,
  fallbackMessage,
  redirectTo,
}: PageGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const currentUser = getSessionUser() || db.getCurrentUser();
    setUser(currentUser);
    setIsReady(true);
  }, []);

  const hasPermission = Boolean(
    user && (isSuperAdmin(user) || !feature || hasAccess(user, feature))
  );

  useEffect(() => {
    if (isReady && !hasPermission) {
      router.replace(redirectTo || getRedirectPathForUser(user));
    }
  }, [hasPermission, isReady, redirectTo, router, user]);

  if (!isReady) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!hasPermission) {
    return null;
  }

  return <>{children}</>;
}
