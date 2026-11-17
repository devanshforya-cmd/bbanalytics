import { useState, useCallback, useRef } from 'react';

/**
 * useSubmitGuard hook prevents double/multiple form submissions across the app.
 * One click, one record: the lock is a ref, so a second click in the same
 * frame is blocked even before React has re-rendered the disabled button.
 */
export function useSubmitGuard() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const locked = useRef(false);

  const guardedSubmit = useCallback(
    async (submitFn: () => Promise<void> | void) => {
      if (locked.current) return; // Block if already submitting
      locked.current = true;
      setIsSubmitting(true);
      try {
        await submitFn();
      } catch (error) {
        console.error('Submit error:', error);
        throw error;
      } finally {
        locked.current = false;
        setIsSubmitting(false); // Re-enable after completion
      }
    },
    []
  );

  return { isSubmitting, guardedSubmit };
}
