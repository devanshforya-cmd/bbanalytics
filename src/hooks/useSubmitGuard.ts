import { useState, useCallback } from 'react';

/**
 * useSubmitGuard hook prevents double/multiple form submissions across the app.
 * If an action is already in progress, subsequent clicks are ignored until complete.
 */
export function useSubmitGuard() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const guardedSubmit = useCallback(
    async (submitFn: () => Promise<void> | void) => {
      if (isSubmitting) return; // Block if already submitting
      setIsSubmitting(true);
      try {
        await submitFn();
      } catch (error) {
        console.error('Submit error:', error);
        throw error;
      } finally {
        setIsSubmitting(false); // Re-enable after completion
      }
    },
    [isSubmitting]
  );

  return { isSubmitting, guardedSubmit };
}
