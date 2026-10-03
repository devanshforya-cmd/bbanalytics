'use client';

import React, { useState, useEffect, useRef } from 'react';

interface StatusBadgeProps {
  status: string;
  className?: string;
  variant?: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'slate';
  showAnimation?: boolean;
}

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  red: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
};

function getVariantForStatus(status: string): 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'slate' {
  const s = status.toUpperCase();
  if (['CASHED', 'DELIVERED', 'COMPLETED', 'RESOLVED', 'ACTIVE', 'VISITED'].includes(s)) return 'green';
  if (['BOUNCED', 'FAILED', 'CANCELLED', 'LOST', 'OVERDUE'].includes(s)) return 'red';
  if (['DELAYED', 'IN_PROGRESS', 'PENDING', 'COLLECTED_IN_FIELD'].includes(s)) return 'amber';
  if (['HANDED_OVER_AT_OFFICE', 'DISPATCHED', 'OPEN'].includes(s)) return 'blue';
  return 'slate';
}

export default function StatusBadge({
  status,
  className = '',
  variant,
  showAnimation = true,
}: StatusBadgeProps) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    if (status !== prevStatusRef.current && showAnimation) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setCurrentStatus(status);
        prevStatusRef.current = status;
        setTimeout(() => setIsTransitioning(false), 200);
      }, 150);
      return () => clearTimeout(timer);
    }
    setCurrentStatus(status);
    prevStatusRef.current = status;
  }, [status, showAnimation]);

  const v = variant || getVariantForStatus(currentStatus);
  const c = COLOR_MAP[v];

  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all duration-200
        ${c.bg} ${c.text} ${c.border}
        ${isTransitioning ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}
        ${className}
      `}
    >
      {currentStatus.replace(/_/g, ' ')}
    </span>
  );
}
