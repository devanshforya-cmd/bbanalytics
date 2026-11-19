'use client';

import ProgressRing from '@/components/common/ProgressRing';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/lib/types';
import { getRedirectPathForUser, getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db/db-service';
import { FeatureKey, hasAccess, isSuperAdmin } from '@/lib/permissions';

interface PageGuardProps {
  /** One feature, or several of which any one is enough. */
  feature?: FeatureKey | string | (FeatureKey | string)[];
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
    const refresh = () => { setUser(getSessionUser()); setIsReady(true); };
    refresh();
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  const hasPermission = Boolean(
    user && (isSuperAdmin(user) || !feature || (Array.isArray(feature) ? feature.some((key) => hasAccess(user, key)) : hasAccess(user, feature)))
  );

  useEffect(() => {
    if (isReady && !hasPermission) {
      router.replace(redirectTo || getRedirectPathForUser(user));
    }
  }, [hasPermission, isReady, redirectTo, router, user]);

  if (!isReady) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <ProgressRing estimateMs={800} size={52} label="Opening page" />
      </div>
    );
  }

  if (!hasPermission) {
    return null;
  }

  return <>{children}</>;
}
