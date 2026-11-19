'use client';

import React from 'react';
import { getSessionUser } from '@/lib/auth';
import { canSeeSensitive } from '@/lib/permissions';

/** Whether the signed-in person's role includes money. */
export function canSeeMoney(): boolean {
  return canSeeSensitive(getSessionUser(), 's.money');
}

/**
 * An amount in rupees. People whose role leaves out money see a hidden marker instead
 * (the server also sends them 0, so nothing can be read from the page).
 */
export default function Money({ children, prefix = 'NPR ' }: { children: React.ReactNode; prefix?: string }) {
  if (!canSeeMoney()) return <span className="text-slate-500" title="Your role does not include money">{prefix}<span aria-label="hidden">••••</span></span>;
  return <>{prefix}{children}</>;
}

/** The same, for text that is not a React element (titles, CSV cells, tooltips). */
export function nprText(formatted: string | number): string {
  return canSeeMoney() ? `NPR ${formatted}` : 'NPR ••••';
}
