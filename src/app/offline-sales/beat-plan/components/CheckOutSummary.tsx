'use client';

import React from 'react';
import { X, CheckCircle2, Clock, MapPin, ChevronRight, AlertCircle } from 'lucide-react';
import { BeatItem } from '@/lib/types';

interface CheckOutSummaryProps {
  isOpen: boolean;
  targetBeat: BeatItem | null;
  checkInTime: string;
  completedActions: Set<string>;
  hasNextStop: boolean;
  onProceedNextStore: () => void;
  onClose: () => void;
}

export default function CheckOutSummary({
  isOpen,
  targetBeat,
  checkInTime,
  completedActions,
  hasNextStop,
  onProceedNextStore,
  onClose,
}: CheckOutSummaryProps) {
  if (!isOpen || !targetBeat) return null;

  const actionLabels: Record<string, string> = {
    STOCK_COUNT: 'Multi-Brand Shelf Stock Count recorded',
    SHELF_PHOTOS: 'Before & After Merchandising Photos uploaded',
    COLLECT_CHEQUE: 'Physical payment cheque collected',
    SECONDARY_ORDER: 'Secondary retailer order queued',
  };

  const actionKeys = ['STOCK_COUNT', 'SHELF_PHOTOS', 'COLLECT_CHEQUE', 'SECONDARY_ORDER'];
  const checkInMs = targetBeat.checkedInAt ? new Date(targetBeat.checkedInAt).getTime() : NaN;
  const checkOutMs = targetBeat.checkedOutAt ? new Date(targetBeat.checkedOutAt).getTime() : Date.now();
  const durationMinutes = Number.isFinite(checkInMs) ? Math.max(0, Math.round((checkOutMs - checkInMs) / 60000)) : null;
  const durationLabel = durationMinutes === null
    ? '—'
    : durationMinutes < 1
    ? 'Less than 1 minute'
    : `${durationMinutes} minute${durationMinutes === 1 ? '' : 's'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-emerald-600 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-white" />
              <h3 className="text-lg font-bold">Store Visit Concluded</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-emerald-100 hover:text-white hover:bg-emerald-700/50 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-emerald-100 mt-1 font-medium">{targetBeat.storeName}</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Arrival Time</div>
              <div className="text-slate-900 font-bold mt-0.5">{checkInTime || '9:45 AM'}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Time on Site</div>
              <div className="text-slate-900 font-bold mt-0.5">{durationLabel}</div>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2">
              Completed Actions
            </h4>
            <div className="space-y-1.5">
              {actionKeys.map((key) => {
                const isCompleted = completedActions.has(key);
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2.5 p-2 rounded-lg ${
                      isCompleted ? 'bg-emerald-50/60 text-emerald-900' : 'bg-slate-50 text-slate-400'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${
                        isCompleted ? 'text-emerald-600' : 'text-slate-300'
                      }`}
                    />
                    <span className={isCompleted ? 'font-semibold' : ''}>{actionLabels[key]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 text-xs transition"
            >
              Return to Beat Plan
          </button>
          <button
            type="button"
            onClick={onProceedNextStore}
            className="flex-1 flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition"
          >
            <span>{hasNextStop ? 'Proceed to Next Stop' : 'Finish Route'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
