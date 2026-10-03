'use client';

import React from 'react';
import Link from 'next/link';
import {
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Compass,
  ArrowRight,
  Sparkles,
  Phone,
} from 'lucide-react';
import { BeatItem } from '@/lib/types';
import { priorityColor as getPriorityColor } from '@/lib/ui-utils';

interface BeatRouteListProps {
  beatItems: BeatItem[];
  activeBeatId: string | null;
  onSelectBeat: (item: BeatItem) => void;
  onOpenCheckIn: (item: BeatItem) => void;
  onResumeWorkspace: (item: BeatItem) => void;
  onOptimizeRoute: () => void;
  isOptimizing?: boolean;
}

export default function BeatRouteList({
  beatItems,
  activeBeatId,
  onSelectBeat,
  onOpenCheckIn,
  onResumeWorkspace,
  onOptimizeRoute,
  isOptimizing,
}: BeatRouteListProps) {
  const visitedCount = beatItems.filter((b) => b.status === 'VISITED').length;

  return (
    <div className="space-y-4">
      {/* List Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Today&apos;s Store Beat Route
          </h3>
          <p className="text-xs text-slate-500">
            {visitedCount} of {beatItems.length} stops completed today
          </p>
        </div>

        <button
          type="button"
          onClick={onOptimizeRoute}
          disabled={isOptimizing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition shadow-2xs self-start sm:self-auto disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isOptimizing ? 'Optimizing GPS Route...' : '⚡ Optimize Route Sequence'}</span>
        </button>
      </div>

      {/* Ordered Stores Grid */}
      <div className="space-y-3">
        {beatItems.map((item, index) => {
          const isVisited = item.status === 'VISITED';
          const isSkipped = item.status === 'SKIPPED';
          const isActive = activeBeatId === item.id;
          const priority = item.priority || 'ROUTINE';
          const priorityBadgeClass = getPriorityColor(priority);

          return (
            <div
              key={item.id}
              onClick={() => onSelectBeat(item)}
              className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isActive
                  ? 'border-blue-500 bg-blue-50/30 shadow-xs ring-1 ring-blue-500'
                  : isVisited
                  ? 'border-emerald-200 bg-emerald-50/20'
                  : isSkipped
                  ? 'border-slate-200 bg-slate-50/60 opacity-70'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                {/* Sequence Number */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    isVisited
                      ? 'bg-emerald-600 text-white'
                      : isSkipped
                      ? 'bg-slate-300 text-slate-700'
                      : 'bg-slate-900 text-white'
                  }`}
                >
                  {isVisited ? <CheckCircle2 className="w-4 h-4" /> : index + 1}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {item.storeName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${priorityBadgeClass}`}
                    >
                      {priority === 'HIGH' ? '★★★ High' : priority === 'MEDIUM' ? '★★ Medium' : '★ Routine'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {item.entityType}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {item.address || 'Kathmandu Route'}
                    </span>
                    {item.contactPhone && (
                      <span className="flex items-center gap-1 text-slate-600 font-mono">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {item.contactPhone}
                      </span>
                    )}
                  </div>

                  {item.managerNotes && (
                    <div className="mt-2 p-2 rounded-lg bg-amber-50/80 border border-amber-200/60 text-[11px] text-amber-900 font-medium">
                      <strong>Manager Directive:</strong> &ldquo;{item.managerNotes}&rdquo;
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {isVisited ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResumeWorkspace(item);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 font-bold text-xs transition"
                  >
                    View / Resume Stop
                  </button>
                ) : isSkipped ? (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs font-semibold">
                    Skipped
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCheckIn(item);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>GPS Check-In</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
