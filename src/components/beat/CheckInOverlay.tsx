'use client';

import React, { useEffect, useState } from 'react';
import { MapPin, Star, CheckSquare, ChevronRight, Clock } from 'lucide-react';
import { BeatItem } from '@/lib/types';

interface CheckInOverlayProps {
  beat: BeatItem;
  distance: number;
  onStartWorking: () => void;
  onCancel: () => void;
}

type Phase = 'locating' | 'success';

export default function CheckInOverlay({ beat, distance, onStartWorking, onCancel }: CheckInOverlayProps) {
  const [phase, setPhase] = useState<Phase>('locating');
  const [showContent, setShowContent] = useState(false);
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    const t = setTimeout(() => {
      setPhase('success');
      setTimeout(() => setShowContent(true), 50);
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  const priorityStars = beat.priority === 'HIGH' ? '★★★' : beat.priority === 'MEDIUM' ? '★★' : '★';
  const priorityLabel = beat.priority === 'HIGH' ? 'HIGH PRIORITY' : beat.priority === 'MEDIUM' ? 'MEDIUM PRIORITY' : 'ROUTINE';
  const priorityColor = beat.priority === 'HIGH' ? 'text-red-600' : beat.priority === 'MEDIUM' ? 'text-amber-600' : 'text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 p-6 text-white">
      {/* Cancel */}
      <button
        type="button"
        onClick={onCancel}
        className="absolute top-5 right-5 text-white/50 hover:text-white text-xs font-medium transition"
      >
        Cancel
      </button>

      {phase === 'locating' && (
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <div className="w-20 h-20 rounded-full border-2 border-blue-400/40 flex items-center justify-center relative">
            <div className="w-14 h-14 rounded-full bg-blue-500/20 border border-blue-400/40 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-blue-400" />
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-blue-400/20 animate-ping" />
          </div>
          <div className="text-center">
            <p className="text-white/60 text-sm mb-2">Arriving at</p>
            <h2 className="text-xl font-bold tracking-wide">{beat.storeName}</h2>
            <p className="text-white/50 text-xs mt-1">{beat.storeType} · {beat.address}</p>
          </div>
          <p className="text-blue-300 text-sm font-medium flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping inline-block" />
            Locating you...
          </p>
        </div>
      )}

      {phase === 'success' && (
        <div className={`flex flex-col items-center gap-5 max-w-sm w-full transition-all duration-400 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {/* Animated ✅ */}
          <div className={`w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 ${showContent ? 'animate-scale-bounce' : ''}`}>
            <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
              <path d="M6 16l7 7 13-13" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="draw-check" />
            </svg>
          </div>

          <div className="text-center">
            <p className="text-emerald-400 text-sm font-semibold mb-1">Checked In</p>
            <h2 className="text-xl font-bold tracking-wide">{beat.storeName}</h2>
            <div className="flex items-center justify-center gap-3 mt-2 text-white/60 text-xs">
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{timeStr}</span>
              <span>·</span>
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{distance}m away</span>
            </div>
          </div>

          {/* Priority Badge */}
          {beat.priority && (
            <div className={`flex items-center gap-1.5 text-sm font-bold ${priorityColor}`}>
              <Star className="w-4 h-4 fill-current" />
              <span>{priorityStars} {priorityLabel}</span>
            </div>
          )}

          {/* Manager Note */}
          {beat.managerNotes && (
            <div className="w-full bg-blue-500/10 border border-blue-400/20 rounded-2xl p-3.5">
              <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider mb-1">Manager Note</p>
              <p className="text-xs text-white/80 leading-relaxed">&ldquo;{beat.managerNotes}&rdquo;</p>
            </div>
          )}

          {/* Tasks at this store */}
          {beat.pendingTasks && beat.pendingTasks.length > 0 && (
            <div className="w-full">
              <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">Today&apos;s tasks at this store</p>
              <div className="space-y-2">
                {beat.pendingTasks.map((task, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-white/80">
                    <CheckSquare className="w-3.5 h-3.5 text-white/40 shrink-0" />
                    <span>{task}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onStartWorking}
            className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm shadow-lg shadow-emerald-500/30 transition-all active:scale-[0.98]"
          >
            <span>Start Working</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
