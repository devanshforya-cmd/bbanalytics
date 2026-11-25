'use client';

import React, { forwardRef, useEffect, useRef, useState } from 'react';

type Props = React.InputHTMLAttributes<HTMLInputElement>;

const asNumber = (text: unknown) => (text === '' || text === null || text === undefined ? NaN : Number(text));

/**
 * A number box that types like a normal text box. Drop-in for <input type="number">:
 * - backspace can clear it while you type (the form keeps its own value until you leave the box);
 * - tapping into a box that shows 0 selects it, so typing replaces the 0 instead of making "05";
 * - leading zeros are tidied when you leave the box.
 */
const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput({ value, onChange, onFocus, onBlur, inputMode, step, ...rest }, ref) {
  const shown = value === undefined || value === null ? '' : String(value);
  const [draft, setDraft] = useState(shown);
  const editing = useRef(false);

  // Follow the form's value, except while the person is typing something that already means the same number.
  useEffect(() => {
    if (!editing.current) { setDraft(shown); return; }
    if (draft === '' || draft === '-' || draft.endsWith('.')) return;
    if (asNumber(draft) !== asNumber(shown)) setDraft(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  return (
    <input
      {...rest}
      ref={ref}
      type="number"
      step={step}
      inputMode={inputMode || (step && String(step).includes('.') ? 'decimal' : step === 'any' ? 'decimal' : 'numeric')}
      value={draft}
      onFocus={(event) => {
        editing.current = true;
        // A placeholder 0 is replaced by the first digit typed.
        if (asNumber(event.currentTarget.value) === 0) event.currentTarget.select();
        onFocus?.(event);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange?.(event);
      }}
      onBlur={(event) => {
        editing.current = false;
        // Show what the form kept: an emptied box goes back to the form's value, "05" becomes "5".
        const kept = value === undefined || value === null ? '' : String(value);
        setDraft(kept !== '' && Number.isFinite(asNumber(kept)) ? String(asNumber(kept)) : kept);
        onBlur?.(event);
      }}
    />
  );
});

export default NumberInput;
