'use client';
import { useEffect, useState } from 'react';
import { db } from '@/lib/db/db-service';

export function useOrderOptions() {
  const [options, setOptions] = useState(() => db.getOrderOptions());
  useEffect(() => {
    const refresh = () => setOptions(db.getOrderOptions());
    refresh(); window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);
  return options;
}
