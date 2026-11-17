'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { calendarScopeForPath, type CalendarScope } from '@/lib/calendar-scope';

export type CalendarPref = 'BS' | 'AD' | 'BOTH';

const STORAGE_KEY = 'bb_calendar_pref';

/**
 * The calendar to show. Online sales, reviews, customers and marketing always use AD; offline (B2B)
 * sales always show BS and AD together; elsewhere (dashboard, settings) the user's own choice applies.
 * Pass a scope to override the page's section, for example in a shared component.
 */
export function useCalendarPreference(scopeOverride?: CalendarScope) {
  const pathname = usePathname();
  const scope = scopeOverride || calendarScopeForPath(pathname || '');
  const [userPreference, setPreferenceState] = useState<CalendarPref>('BS');
  const preference: CalendarPref = scope === 'D2C' ? 'AD' : scope === 'B2B' ? 'BOTH' : userPreference;

  useEffect(() => {
    const load = () => {
      const user = db.getCurrentUser();
      const saved = localStorage.getItem(`${STORAGE_KEY}:${user.id}`);
      setPreferenceState(saved === 'BS' || saved === 'AD' || saved === 'BOTH' ? saved : user.calendarPreference || 'BS');
    };
    load(); window.addEventListener('bb-db-updated', load);
    return () => window.removeEventListener('bb-db-updated', load);
  }, []);

  const setPreference = useCallback((pref: CalendarPref) => {
    setPreferenceState(pref);
    if (typeof window !== 'undefined') localStorage.setItem(`${STORAGE_KEY}:${db.getCurrentUser().id}`, pref);
  }, []);

  const formatDate = useCallback(
    (dateAd: string, dateBs?: string): string => {
      if (!dateAd && !dateBs) return '—';
      if (preference === 'BS') {
        return dateBs || dateAd;
      }
      if (preference === 'AD') {
        return dateAd;
      }
      // 'BOTH'
      if (dateBs && dateAd && dateBs !== dateAd) {
        return `${dateBs} (${dateAd})`;
      }
      return dateBs || dateAd;
    },
    [preference]
  );

  return {
    preference,
    /** The person's own choice, used where no section rule applies. */
    userPreference,
    scope,
    setPreference,
    formatDate,
  };
}
