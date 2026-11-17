import { useState, useCallback, useRef } from 'react';

/**
 * Remember which button was pressed last, so the save that follows can show a spinner on it.
 * Safari does not focus buttons on click, so the pointer is tracked as well as the keyboard.
 */
let lastPressed: { button: HTMLButtonElement; at: number } | null = null;
if (typeof document !== 'undefined') {
  const remember = (target: EventTarget | null) => {
    const button = target instanceof Element ? target.closest('button') : null;
    if (button) lastPressed = { button, at: Date.now() };
  };
  document.addEventListener('pointerdown', (event) => remember(event.target), true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') remember(document.activeElement); }, true);
  document.addEventListener('submit', (event) => remember((event as SubmitEvent).submitter || null), true);
}

function pressedButton(): HTMLButtonElement | null {
  return lastPressed && Date.now() - lastPressed.at < 1500 && lastPressed.button.isConnected ? lastPressed.button : null;
}

/**
 * useSubmitGuard hook prevents double/multiple form submissions across the app.
 * One click, one record: the lock is a ref, so a second click in the same
 * frame is blocked even before React has re-rendered the disabled button.
 * While the save runs, the pressed button is marked busy (aria-busy), which shows a spinner on it.
 */
export function useSubmitGuard() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const locked = useRef(false);

  const guardedSubmit = useCallback(
    async (submitFn: () => Promise<void> | void) => {
      if (locked.current) return; // Block if already submitting
      locked.current = true;
      setIsSubmitting(true);
      const button = pressedButton();
      button?.setAttribute('aria-busy', 'true');
      button?.setAttribute('data-auto-busy', '');
      try {
        await submitFn();
      } catch (error) {
        console.error('Submit error:', error);
        throw error;
      } finally {
        locked.current = false;
        button?.removeAttribute('aria-busy');
        button?.removeAttribute('data-auto-busy');
        setIsSubmitting(false); // Re-enable after completion
      }
    },
    []
  );

  return { isSubmitting, guardedSubmit };
}
