'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders pop-ups at the top of the page (document.body), so they always open in the middle of the
 * screen you are looking at, wherever the button was. Inside a page, an animated or hovered card
 * would otherwise become the pop-up's frame and push it out of view.
 */
export default function Portal({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}
