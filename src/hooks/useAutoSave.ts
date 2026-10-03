'use client';

import { useState, useEffect, useCallback } from 'react';

export function useAutoSave<T extends Record<string, any>>(formKey: string, formData: T) {
  const storageKey = `bb_draft_${formKey}`;
  const [hasDraft, setHasDraft] = useState(false);
  const [draftTimestamp, setDraftTimestamp] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<T | null>(null);

  // Check for existing draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.data && Object.keys(parsed.data).length > 0) {
          setHasDraft(true);
          setSavedDraft(parsed.data);
          setDraftTimestamp(parsed.timestamp || 'earlier');
        }
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  // Auto-save every 10 seconds if form has content
  useEffect(() => {
    const timer = setInterval(() => {
      const hasValues = Object.values(formData).some((v) => v !== '' && v !== null && v !== undefined && (!Array.isArray(v) || v.length > 0));
      if (hasValues) {
        try {
          const payload = {
            data: formData,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          };
          localStorage.setItem(storageKey, JSON.stringify(payload));
        } catch {
          // storage full or disabled
        }
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [storageKey, formData]);

  const resumeDraft = useCallback((): T | null => {
    if (savedDraft) {
      setHasDraft(false);
      return savedDraft;
    }
    return null;
  }, [savedDraft]);

  const discardDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setHasDraft(false);
    setSavedDraft(null);
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return {
    hasDraft,
    draftTimestamp,
    resumeDraft,
    discardDraft,
    clearDraft,
  };
}
