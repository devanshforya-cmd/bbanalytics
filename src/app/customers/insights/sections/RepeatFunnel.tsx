'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface FunnelStep {
  label: string;
  count: number;
  pct: number;
  drop: number;
}

export interface RepeatFunnelData {
  biggestDrop: string;
  biggestDropPct: number;
  steps: FunnelStep[];
}

interface RepeatFunnelProps {
  repeatFunnel: RepeatFunnelData;
}

export default function RepeatFunnel({ repeatFunnel }: RepeatFunnelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs font-black">
              2d
            </span>
            <h2 className="text-base font-bold text-slate-900">
              Repeat Purchase Funnel & Drop-Off Dynamics
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quantifies friction at each step of the customer journey from first order through 5th+ repeat purchase.
          </p>
        </div>
      </div>

      {/* Funnel Drop-off Alert */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900">
          <span className="font-bold">Conversion Alert:</span> The greatest drop-off occurs between{' '}
          <span className="font-black underline">{repeatFunnel.biggestDrop}</span> with a{' '}
          <span className="font-black">{repeatFunnel.biggestDropPct}% attrition rate</span>. Re-order post-purchase
          outreach should trigger at Day 7 post-delivery.
        </div>
      </div>

      {/* Funnel Visual Bars */}
      <div className="space-y-3 pt-2">
        {repeatFunnel.steps.map((step, idx) => (
          <div key={step.label} className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-800">{step.label}</span>
              <div className="flex items-center gap-3">
                {idx > 0 && (
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                    -{step.drop}% drop
                  </span>
                )}
                <span className="font-black text-slate-900">
                  {step.count} customers ({step.pct}%)
                </span>
              </div>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 bg-linear-to-r from-blue-600 to-indigo-600"
                style={{ width: `${Math.max(8, step.pct)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
