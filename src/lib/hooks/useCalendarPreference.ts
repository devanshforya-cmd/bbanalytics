'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db/db-service';

export type CalendarPref = 'BS' | 'AD' | 'BOTH';

const STORAGE_KEY = 'bb_calendar_pref';

export function useCalendarPreference() {
  const [preference, setPreferenceState] = useState<CalendarPref>('BS');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Check localStorage
    const saved = localStorage.getItem(STORAGE_KEY) as CalendarPref | null;
    if (saved && (saved === 'BS' || saved === 'AD' || saved === 'BOTH')) {
      setPreferenceState(saved);
      return;
    }

    // 2. Check current logged in user preference
    try {
      const user = db.getCurrentUser();
      if (user && user.calendarPreference) {
        setPreferenceState(user.calendarPreference);
        localStorage.setItem(STORAGE_KEY, user.calendarPreference);
        return;
      }
    } catch {
      // Fallback
    }

    // 3. Default to Nepal standard 'BS'
    setPreferenceState('BS');
  }, []);

  const setPreference = useCallback((pref: CalendarPref) => {
    setPreferenceState(pref);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, pref);
    }
    try {
      const user = db.getCurrentUser();
      if (user && user.id) {
        db.updateUser(user.id, { calendarPreference: pref });
      }
    } catch {
      // Ignore if user cannot be updated immediately
    }
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
    setPreference,
    formatDate,
  };
}
