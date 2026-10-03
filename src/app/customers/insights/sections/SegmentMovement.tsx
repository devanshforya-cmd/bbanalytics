'use client';

import React from 'react';

export interface SegmentMovementItem {
  from: string;
  to: string;
  count: number;
  type: 'PROMOTED' | 'WARNING' | 'LOST' | 'RECOVERED' | string;
  desc: string;
}

interface SegmentMovementProps {
  segmentMovements: SegmentMovementItem[];
}

export default function SegmentMovement({ segmentMovements }: SegmentMovementProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-600 text-white text-xs font-black">
              2m
            </span>
            <h2 className="text-base font-bold text-slate-900">
              30-Day Customer Segment Migration Tracker
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Records movement between loyalty segments to verify customer health velocity and early-warning demotions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {segmentMovements.map((move, i) => (
          <div
            key={i}
            className={`rounded-xl border p-3.5 space-y-2 ${
              move.type === 'PROMOTED'
                ? 'bg-emerald-50/50 border-emerald-200'
                : move.type === 'WARNING'
                ? 'bg-amber-50/50 border-amber-200'
                : move.type === 'LOST'
                ? 'bg-rose-50/50 border-rose-200'
                : 'bg-blue-50/50 border-blue-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-black text-xs text-slate-900">
                <span>{move.from}</span>
                <span className="text-slate-400">→</span>
                <span
                  className={
                    move.type === 'PROMOTED'
                      ? 'text-emerald-700'
                      : move.type === 'WARNING'
                      ? 'text-amber-700'
                      : move.type === 'LOST'
                      ? 'text-rose-700'
                      : 'text-blue-700'
                  }
                >
                  {move.to}
                </span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                  move.type === 'PROMOTED'
                    ? 'bg-emerald-200 text-emerald-900'
                    : move.type === 'WARNING'
                    ? 'bg-amber-200 text-amber-900'
                    : move.type === 'LOST'
                    ? 'bg-rose-200 text-rose-900'
                    : 'bg-blue-200 text-blue-900'
                }`}
              >
                {move.count} accounts
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">{move.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
