'use client';

import React, { useState } from 'react';
import { CheckCircle, XCircle, MapPin, Star, Clock, ChevronRight, Sun } from 'lucide-react';
import { BeatItem } from '@/lib/types';

interface AccomplishmentItem {
  label: string;
  done: boolean;
}

interface CheckOutSummaryProps {
  beat: BeatItem;
  checkInTime: string;
  accomplishments: AccomplishmentItem[];
  nextBeat?: BeatItem | null;
  nextDistanceKm?: number;
  onNavigateNext?: () => void;
  onEndDay: () => void;
  onClose: () => void;
}

const INCOMPLETE_REASONS = [
  'Store manager wasn\'t available',
  'No shelf space available right now',
  'Will follow up next visit',
  'Pitched but declined',
  'Done — forgot to mark it',
];

export default function CheckOutSummary({
  beat,
  checkInTime,
  accomplishments,
  nextBeat,
  nextDistanceKm,
  onNavigateNext,
  onEndDay,
  onClose,
}: CheckOutSummaryProps) {
  const done = accomplishments.filter((a) => a.done);
  const pending = accomplishments.filter((a) => !a.done);
  const [selectedReasons, setSelectedReasons] = useState<Record<string, string>>({});

  const now = new Date();
  const checkIn = new Date(checkInTime);
  const diffMin = Math.max(1, Math.round((now.getTime() - checkIn.getTime()) / 60000));
  const checkInStr = checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const checkOutStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const allReasonsSelected = pending.every((p) => selectedReasons[p.label]);

  const handleConfirmCheckOut = () => {
    if (pending.length > 0 && !allReasonsSelected) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 flex flex-col">
      <div className="max-w-lg mx-auto w-full px-5 py-8 flex flex-col gap-5">
        {/* Header */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/30 animate-scale-bounce">
            <CheckCircle className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Visit Complete</h2>
          <p className="text-sm font-semibold text-slate-700 mt-0.5">{beat.storeName}</p>
          <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            {checkInStr} → {checkOutStr} · {diffMin} min
          </p>
        </div>

        {/* Accomplishments */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">What you accomplished</p>
          <div className="space-y-2.5">
            {done.map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 text-xs">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="text-slate-800 font-medium">{a.label}</span>
              </div>
            ))}
            {pending.map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 text-xs">
                <XCircle className="w-4 h-4 text-slate-300 shrink-0" />
                <span className="text-slate-400 font-medium line-through">{a.label} — NOT DONE</span>
              </div>
            ))}
          </div>
        </div>

        {/* Incomplete task reasons */}
        {pending.length > 0 && (
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 shadow-xs">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-1">⚠ Incomplete Tasks</p>
            {pending.map((p) => (
              <div key={p.label} className="mt-3">
                <p className="text-xs text-amber-900 font-semibold mb-2">&ldquo;{p.label}&rdquo; was not completed. What happened?</p>
                <div className="space-y-1.5">
                  {INCOMPLETE_REASONS.map((reason) => (
                    <label key={reason} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`reason-${p.label}`}
                        value={reason}
                        checked={selectedReasons[p.label] === reason}
                        onChange={() => setSelectedReasons((prev) => ({ ...prev, [p.label]: reason }))}
                        className="accent-amber-600"
                      />
                      <span className="text-xs text-slate-700">{reason}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Next store */}
        {nextBeat && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Next Store</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">{nextBeat.storeName}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{nextDistanceKm?.toFixed(1) ?? '?'} km</span>
                  {nextBeat.priority === 'HIGH' && (
                    <span className="flex items-center gap-1 text-red-600 font-bold">
                      <Star className="w-3 h-3 fill-current" /> HIGH
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 mt-1">
          {nextBeat && onNavigateNext && (
            <button
              type="button"
              onClick={() => { handleConfirmCheckOut(); onNavigateNext(); }}
              disabled={pending.length > 0 && !allReasonsSelected}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Navigate to Next Store</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => { handleConfirmCheckOut(); onEndDay(); }}
            disabled={pending.length > 0 && !allReasonsSelected}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sun className="w-4 h-4" />
            <span>End My Day</span>
          </button>
          {pending.length > 0 && !allReasonsSelected && (
            <p className="text-center text-[11px] text-amber-600 font-medium">Select a reason for each incomplete task above</p>
          )}
        </div>
      </div>
    </div>
  );
}
