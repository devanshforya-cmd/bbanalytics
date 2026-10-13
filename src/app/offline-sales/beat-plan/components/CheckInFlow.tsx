'use client';

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Clock,
  CheckCircle,
  X,
  Camera,
  Layers,
  CreditCard,
  ShoppingBag,
  LogOut,
  Sparkles,
  Upload,
} from 'lucide-react';
import { BeatItem } from '@/lib/types';
import { db } from '@/lib/db/db-service';

interface CheckInFlowProps {
  showCheckInModal: boolean;
  showCheckInOverlay: boolean;
  showStoreActionDashboard: boolean;
  targetBeat: BeatItem | null;
  calculatedDistance: number;
  overrideReason: string;
  setOverrideReason: (r: string) => void;
  completedActions: Set<string>;
  onConfirmArrival: (photoUrl?: string) => void;
  onDismissCheckIn: () => void;
  onOpenAction: (action: any) => void;
  onConcludeStoreVisit: () => void;
}

export default function CheckInFlow({
  showCheckInModal,
  showStoreActionDashboard,
  targetBeat,
  completedActions,
  onConfirmArrival,
  onDismissCheckIn,
  onOpenAction,
  onConcludeStoreVisit,
}: CheckInFlowProps) {
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const photoRequired = db.getRequireStorePhotoAtCheckIn();

  // Reset photo on modal open
  useEffect(() => {
    if (showCheckInModal) {
      setPhotoUrl('');
    }
  }, [showCheckInModal]);

  // Live timer counting up when store workspace is active
  useEffect(() => {
    if (!showStoreActionDashboard || !targetBeat) {
      setElapsedSeconds(0);
      return;
    }

    // Determine start timestamp
    const startTime = targetBeat.checkedInAt
      ? new Date(targetBeat.checkedInAt).getTime()
      : Date.now();

    const interval = setInterval(() => {
      const diffSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      setElapsedSeconds(diffSec);
    }, 1000);

    return () => clearInterval(interval);
  }, [showStoreActionDashboard, targetBeat]);

  if (!targetBeat) return null;

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) setPhotoUrl(result);
      };
      reader.readAsDataURL(file);
    }
  };

  // 1. Silent Check-in Modal (Section 5 & 10)
  // No distance or GPS drift warnings shown to field officer.
  if (showCheckInModal) {
    const canCheckIn = !photoRequired || Boolean(photoUrl);

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4">
        <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Check In at Store</h3>
                  <p className="text-xs text-slate-500 font-medium">{targetBeat.storeName}</p>
                </div>
              </div>
              <button
                onClick={onDismissCheckIn}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="text-xs font-semibold text-slate-700">
                {targetBeat.address || 'Kathmandu Beat Route'}
              </div>
              <div className="text-[11px] text-slate-500">
                Tap Check In to begin shelf audits, stock counting, and booking orders.
              </div>
            </div>

            {/* Section 10: Mandatory Entrance Photo if configured */}
            {photoRequired && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-blue-600" />
                    <span>Store Entrance Photo</span>
                    <span className="text-rose-500 font-bold">*Required</span>
                  </label>
                  {photoUrl && (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Captured
                    </span>
                  )}
                </div>

                {photoUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-emerald-300 h-36 bg-slate-900">
                    <img
                      src={photoUrl}
                      alt="Store Entrance"
                      className="w-full h-full object-cover"
                    />
                    <label className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-slate-900/80 text-white text-xs font-semibold cursor-pointer hover:bg-slate-900 transition flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5" /> Retake
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoCapture}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-2xl p-6 bg-blue-50/50 hover:bg-blue-50 cursor-pointer transition">
                    <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center mb-2 shadow-sm">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-blue-700">Take Store Photo</span>
                    <span className="text-[11px] text-slate-500 mt-0.5">
                      Snap storefront before checking in
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoCapture}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Section 5: Big 56px Check In Button */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
            <button
              type="button"
              onClick={onDismissCheckIn}
              className="px-5 h-14 rounded-2xl border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 text-sm transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canCheckIn}
              onClick={() => onConfirmArrival(photoUrl || undefined)}
              className="flex-1 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-base shadow-sm transition flex items-center justify-center gap-2"
            >
              <MapPin className="w-5 h-5" />
              <span>Check In</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Full-Screen In-Store Operational Workspace (Section 5 & 12)
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
        desc: 'Take replenishment order with live store margins',
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
        <div className="w-full max-w-2xl max-h-[92vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
          {/* Active Store Workspace Header with Live Timer (Section 5) */}
          <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                    In-Store Session
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-300 bg-slate-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    ⏱ Time at store: {formatTimer(elapsedSeconds)}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">{targetBeat.storeName}</h3>
              </div>
            </div>

            {/* Quick close / minimize */}
            <button
              onClick={onDismissCheckIn}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
              title="Minimize workspace"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Grid */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            <div className="text-xs text-slate-500 font-medium">
              Complete mandatory store actions before checking out:
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {actions.map((act) => {
                const Icon = act.icon;
                const isCompleted = completedActions.has(act.id);

                return (
                  <button
                    key={act.id}
                    onClick={() => onOpenAction(act.id)}
                    className={`p-4 rounded-xl border text-left transition flex items-start justify-between gap-3 min-h-[72px] ${
                      isCompleted
                        ? 'bg-emerald-50/50 border-emerald-300 ring-1 ring-emerald-300'
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
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
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

          {/* Section 5: Big 56px Check-Out Button */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500 hidden sm:block">
              {completedActions.size} of {actions.length} store actions completed
            </div>
            <button
              onClick={onConcludeStoreVisit}
              className="flex-1 sm:flex-initial sm:px-8 h-14 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-base font-bold shadow-sm transition flex items-center justify-center gap-2"
            >
              <LogOut className="w-5 h-5" />
              <span>Check Out ({formatTimer(elapsedSeconds)})</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
