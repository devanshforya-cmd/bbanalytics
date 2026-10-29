'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db/db-service';

export type CalendarPref = 'BS' | 'AD' | 'BOTH';

const STORAGE_KEY = 'bb_calendar_pref';

export function useCalendarPreference() {
  const [preference, setPreferenceState] = useState<CalendarPref>('BS');

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
    setPreference,
    formatDate,
  };
}
