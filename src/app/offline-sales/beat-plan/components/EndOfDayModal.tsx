'use client';

import React from 'react';
import { X, CheckCircle2, AlertTriangle, Send, Trophy } from 'lucide-react';
import { BeatItem, SkipReason, FieldOfficerDailySummary } from '@/lib/types';

interface EndOfDayModalProps {
  isOpen: boolean;
  beatItems: BeatItem[];
  skipReasons: Record<string, SkipReason>;
  onSkipReasonChange: (storeId: string, reason: SkipReason) => void;
  onConfirmEndDay: () => void;
  onClose: () => void;
  dailySummary: FieldOfficerDailySummary | null;
  showSummaryModal: boolean;
  onCloseSummaryModal: () => void;
}

export default function EndOfDayModal({
  isOpen,
  beatItems,
  skipReasons,
  onSkipReasonChange,
  onConfirmEndDay,
  onClose,
  dailySummary,
  showSummaryModal,
  onCloseSummaryModal,
}: EndOfDayModalProps) {
  const unvisitedStores = beatItems.filter((b) => b.status === 'PENDING');
  const visitedStores = beatItems.filter((b) => b.status === 'VISITED');

  // If summary modal is active, show the Daily Summary Celebration Card (Fix 38)
  if (showSummaryModal && dailySummary) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white text-center">
            <Trophy className="w-12 h-12 mx-auto text-amber-300 mb-2 animate-bounce" />
            <h3 className="text-xl font-black">Daily Beat Shift Completed!</h3>
            <p className="text-xs text-blue-100 mt-1">
              Field compliance report logged for {dailySummary.dateBs}
            </p>
          </div>

          <div className="p-6 space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Stores Visited</div>
                <div className="text-base font-black text-emerald-600 mt-0.5">
                  {dailySummary.storesVisited}/{dailySummary.totalStores}
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Orders Booked</div>
                <div className="text-base font-black text-blue-600 mt-0.5">
                  {dailySummary.ordersCollected}
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Cheques</div>
                <div className="text-base font-black text-amber-600 mt-0.5">
                  {dailySummary.chequesCollected}
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Compliance</div>
                <div className="text-base font-black text-purple-600 mt-0.5">
                  {dailySummary.compliancePct}%
                </div>
              </div>
            </div>

            <p className="text-slate-600 leading-relaxed text-center">
              Great work today! Your daily metrics, GPS timestamps, and physical collections have been synchronized with HQ Operations.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button
              onClick={onCloseSummaryModal}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold text-slate-900">Conclude Field Day</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-600">
            You have covered <strong>{visitedStores.length}</strong> of{' '}
            <strong>{beatItems.length}</strong> scheduled stores today.
          </p>

          {unvisitedStores.length > 0 && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-medium">
                Please provide justifications for the unvisited stores below:
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {unvisitedStores.map((s) => (
                  <div key={s.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <div className="font-bold text-slate-900">{s.storeName}</div>
                    <select
                      value={skipReasons[s.id] || 'Other task assigned'}
                      onChange={(e) => onSkipReasonChange(s.id, e.target.value as SkipReason)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="Other task assigned">Other task assigned by Manager</option>
                      <option value="Store closed">Store closed / Owner unavailable</option>
                      <option value="Travel issue">Travel issue / Traffic block</option>
                      <option value="No time">Ran out of time</option>
                      <option value="Already visited yesterday">Already covered yesterday</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmEndDay}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Submit Daily Report &amp; Clock Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
