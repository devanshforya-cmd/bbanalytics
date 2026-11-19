'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';

/**
 * A ring that fills as work moves on, with the Brand Bucket mark in the middle.
 *
 * - Give `value` (0–1) when the real progress is known, such as "message 4 of 12".
 * - Give only `estimateMs` when it is not: the ring eases towards 90% over that time
 *   and finishes when `done` turns true. It never sits at 100% before the work is done.
 *
 * Cheap by design: one SVG, animated by a CSS transition on the stroke. No timers run
 * per frame, and people who ask for less motion get the ring without the movement.
 */
export default function ProgressRing({ value, estimateMs = 2000, done = false, size = 56, label, detail, mark = true, cap = 0.9, className = '' }: {
  value?: number | null; estimateMs?: number; done?: boolean; size?: number; label?: string; detail?: string; mark?: boolean;
  /** How far a time-based ring may fill before the work reports in (0–1). */
  cap?: number; className?: string;
}) {
  const known = typeof value === 'number' && Number.isFinite(value);
  // Time-based: start near zero, then hand the browser one long ease-out to 90%.
  const [eased, setEased] = useState(0.04);
  useEffect(() => {
    if (known) return;
    const id = window.requestAnimationFrame(() => setEased(cap));
    return () => window.cancelAnimationFrame(id);
  }, [known, cap]);
  const progress = done ? 1 : known ? Math.min(1, Math.max(0, value!)) : eased;
  const stroke = Math.max(3, Math.round(size / 14));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const duration = done ? 220 : known ? 260 : estimateMs * 1.6;
  const percent = Math.round(progress * 100);

  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label || 'Working'} aria-valuetext={detail ? `${percent}%, ${detail}` : `${percent}%`}
      className={`flex items-center gap-3 ${className}`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-200" />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
            className="text-blue-600 bb-ring-progress"
            style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - progress), transitionDuration: `${duration}ms` }} />
        </svg>
        {mark && (
          <span className={`absolute inset-0 flex items-center justify-center ${done ? '' : 'bb-mark-breathe'}`}>
            <Image src="/brand/bb-mark.png" alt="" width={181} height={181} className="select-none" style={{ width: size * 0.46, height: size * 0.46 }} />
          </span>
        )}
      </div>
      {(label || detail) && (
        <div className="min-w-0">
          {label && <p className="text-sm font-semibold text-slate-900">{label}</p>}
          {detail && <p className="text-xs tabular-nums text-slate-600">{detail}</p>}
        </div>
      )}
    </div>
  );
}

/** The same ring, small enough to sit inside a button in place of its icon. */
export function ButtonRing({ value, estimateMs = 1500, done = false }: { value?: number | null; estimateMs?: number; done?: boolean }) {
  return <ProgressRing value={value} estimateMs={estimateMs} done={done} size={16} mark={false} className="[&_.text-slate-200]:text-white/30 [&_.text-blue-600]:text-white" />;
}
