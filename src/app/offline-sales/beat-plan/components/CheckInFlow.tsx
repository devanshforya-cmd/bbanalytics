'use client';

import React from 'react';
import {
  MapPin,
  Clock,
  CheckCircle,
  X,
  AlertTriangle,
  Camera,
  Layers,
  CreditCard,
  ShoppingBag,
  FileText,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { BeatItem } from '@/lib/types';

interface CheckInFlowProps {
  showCheckInModal: boolean;
  showCheckInOverlay: boolean;
  showStoreActionDashboard: boolean;
  targetBeat: BeatItem | null;
  calculatedDistance: number;
  overrideReason: string;
  setOverrideReason: (r: string) => void;
  completedActions: Set<string>;
  onConfirmArrival: () => void;
  onDismissCheckIn: () => void;
  onOpenAction: (action: any) => void;
  onConcludeStoreVisit: () => void;
}

export default function CheckInFlow({
  showCheckInModal,
  showCheckInOverlay,
  showStoreActionDashboard,
  targetBeat,
  calculatedDistance,
  overrideReason,
  setOverrideReason,
  completedActions,
  onConfirmArrival,
  onDismissCheckIn,
  onOpenAction,
  onConcludeStoreVisit,
}: CheckInFlowProps) {
  if (!targetBeat) return null;

  const isFar = calculatedDistance > 150;

  // 1. Geofence Check-in Prompt Modal
  if (showCheckInModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="p-6 space-y-4 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">GPS Proximity Verification</h3>
                <p className="text-slate-500">{targetBeat.storeName}</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600">Distance to store coordinate:</span>
                <strong className={isFar ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                  {calculatedDistance} meters away
                </strong>
              </div>
              <div className="text-[11px] text-slate-500">
                {isFar
                  ? '⚠️ You are outside the standard 150m check-in radius. GPS override will be flagged to Admin.'
                  : '✓ Accurate check-in radius confirmed via device GPS coordinates.'}
              </div>
            </div>

            {isFar && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reason for remote check-in
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. GPS drift inside basement mall, checked in at parking..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onDismissCheckIn}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 text-xs transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmArrival}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition"
            >
              Confirm GPS Check-in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Full-Screen In-Store Operational Workspace
  if (showStoreActionDashboard) {
    const actions = [
      {
        id: 'STOCK_COUNT',
        title: 'Shelf Stock Count',
        desc: 'Audit stock across Forya, Pee Safe, Furr, Renee',
        icon: Layers,
        color: 'text-purple-600 bg-purple-50',
      },
      {
        id: 'SHELF_PHOTOS',
        title: 'Shelf Before & After Photos',
        desc: 'Capture merchandising compliance & placement evidence',
        icon: Camera,
        color: 'text-blue-600 bg-blue-50',
      },
      {
        id: 'SECONDARY_ORDER',
        title: 'Book Secondary Order',
        desc: 'Take replenishment order for distributor billing',
        icon: ShoppingBag,
        color: 'text-emerald-600 bg-emerald-50',
      },
      {
        id: 'COLLECT_CHEQUE',
        title: 'Collect Cheque',
        desc: 'Record physical bank payment & photograph',
        icon: CreditCard,
        color: 'text-amber-600 bg-amber-50',
      },
    ];

    return (
      <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
          {/* Active Store Workspace Header */}
          <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  Active In-Store Session
                </span>
                <h3 className="text-base font-bold text-white">{targetBeat.storeName}</h3>
              </div>
            </div>
            <button
              onClick={onConcludeStoreVisit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Check-Out</span>
            </button>
          </div>

          {/* Action Grid */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="text-xs text-slate-500 font-medium">
              Complete mandatory field actions before clocking out of this retail stop:
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {actions.map((act) => {
                const Icon = act.icon;
                const isCompleted = completedActions.has(act.id);

                return (
                  <button
                    key={act.id}
                    onClick={() => onOpenAction(act.id)}
                    className={`p-4 rounded-xl border text-left transition flex items-start justify-between gap-3 ${
                      isCompleted
                        ? 'bg-emerald-50/40 border-emerald-300'
                        : 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`p-2.5 rounded-xl shrink-0 ${act.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{act.title}</span>
                          {isCompleted && (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                          {act.desc}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
