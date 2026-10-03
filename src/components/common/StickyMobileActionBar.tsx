'use client';

import React from 'react';

interface StickyMobileActionBarProps {
  children: React.ReactNode;
  className?: string;
  summaryText?: string;
  summarySubtext?: string;
}

export default function StickyMobileActionBar({
  children,
  className = '',
  summaryText,
  summarySubtext,
}: StickyMobileActionBarProps) {
  return (
    <div
      className={`fixed bottom-16 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 shadow-xl sm:static sm:bg-transparent sm:border-0 sm:p-0 sm:shadow-none sm:z-auto transition-all ${className}`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {(summaryText || summarySubtext) && (
          <div className="shrink-0">
            {summaryText && (
              <div className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                {summaryText}
              </div>
            )}
            {summarySubtext && (
              <div className="text-[10px] sm:text-xs text-slate-500 font-medium leading-none mt-0.5">
                {summarySubtext}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
          {children}
        </div>
      </div>
    </div>
  );
}
