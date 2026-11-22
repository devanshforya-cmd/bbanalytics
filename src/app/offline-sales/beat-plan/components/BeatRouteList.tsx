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
  Route,
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
  const totalCount = beatItems.length;

  return (
    <div className="space-y-4">
      {/* Route header: the day's stops drawn as a route line, one mark per store */}
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h3 className="text-[15px] font-medium text-slate-900">Today&apos;s route</h3>
            <p className="mt-0.5 text-[13px] text-slate-500"><span className="tabular-nums text-slate-900">{visitedCount}</span> of <span className="tabular-nums">{totalCount}</span> stores visited, in route order</p>
          </div>
          <button type="button" onClick={onOptimizeRoute} disabled={isOptimizing || totalCount < 2} className="btn btn-secondary self-start disabled:opacity-50">
            <Route />{isOptimizing ? 'Reordering…' : 'Reorder by distance'}
          </button>
        </div>
        <div className="mt-4 flex items-center" role="img" aria-label={`${visitedCount} of ${totalCount} stores visited`}>
          {totalCount === 0 ? <div className="h-px w-full bg-black/[0.08]" /> : beatItems.map((item, index) => {
            const done = item.status !== 'PENDING';
            return (
              <React.Fragment key={item.id}>
                {index > 0 && <span className={`h-0.5 flex-1 ${done ? 'bg-blue-600' : 'bg-black/[0.08]'}`} />}
                <span title={item.storeName} className={`h-2.5 w-2.5 shrink-0 rounded-full ${done ? 'bg-blue-600' : 'border-2 border-slate-300 bg-white'}`} />
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Ordered Stores Checklist Grid */}
      <div className="space-y-3">
        {beatItems.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
            <Compass className="w-8 h-8 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-800">No beat visits scheduled today</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There are no stores queued on your route for today. You can add a one-time visit using the Override action above or assign stores from the Stores directory.
            </p>
          </div>
        ) : (
          beatItems.map((item, index) => {
          const isVisited = item.status === 'VISITED';
          const isSkipped = item.status === 'SKIPPED';
          const isActive = activeBeatId === item.id;
          const priority = item.priority || 'ROUTINE';
          const priorityBadgeClass = getPriorityColor(priority);

          // Visited Store (Collapsed view with checkmarks)
          if (isVisited) {
            return (
              <div
                key={item.id}
                onClick={() => onSelectBeat(item)}
                className="p-3.5 sm:p-4 rounded-2xl border border-emerald-200 bg-emerald-50/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition hover:bg-emerald-50/40 cursor-pointer"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 line-through text-slate-600">
                        {item.storeName}
                      </span>
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        Completed
                      </span>
                    </div>
                    {/* Collapsed summary badges */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px] font-medium text-slate-500">
                      <span className="text-emerald-700 bg-white border border-emerald-200 px-2 py-0.5 rounded-md">
                        Stock ✓
                      </span>
                      <span className="text-emerald-700 bg-white border border-emerald-200 px-2 py-0.5 rounded-md">
                        Photos ✓
                      </span>
                      <span className="text-emerald-700 bg-white border border-emerald-200 px-2 py-0.5 rounded-md">
                        Order ✓
                      </span>
                      <span className="text-slate-500">
                        {item.address || 'Kathmandu Route'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResumeWorkspace(item);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 font-bold text-xs transition self-end sm:self-center shadow-2xs"
                >
                  View / reopen stop
                </button>
              </div>
            );
          }

          // Upcoming or Skipped Store
          return (
            <div
              key={item.id}
              onClick={() => onSelectBeat(item)}
              className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isActive
                  ? 'border-blue-500 bg-blue-50/30 shadow-xs ring-1 ring-blue-500'
                  : isSkipped
                  ? 'border-slate-200 bg-slate-50/60 opacity-70'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                {/* Sequence Number */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    isSkipped ? 'bg-slate-300 text-slate-700' : 'bg-slate-900 text-white'
                  }`}
                >
                  {index + 1}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {item.storeName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${priorityBadgeClass}`}
                    >
                      {priority === 'HIGH'
                        ? 'High'
                        : priority === 'MEDIUM'
                        ? 'Medium'
                        : 'Routine'}
                    </span>
                    {item.oneTimeOverride && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        Added by admin
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500 font-mono">
                      {item.entityType}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {item.address || 'Kathmandu Route'}
                    </span>
                    {item.contactPhone && (
                      <a
                        href={`tel:${item.contactPhone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-blue-600 hover:underline font-mono"
                      >
                        <Phone className="w-3 h-3 text-blue-500" />
                        {item.contactPhone}
                      </a>
                    )}
                  </div>

                  {item.managerNotes && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 font-medium">
                      <strong className="text-amber-800">Manager directive:</strong> &ldquo;{item.managerNotes}&rdquo;
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {isSkipped ? (
                  <span className="px-3 py-1.5 rounded-xl bg-slate-200 text-slate-700 text-xs font-semibold">
                    Skipped
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCheckIn(item);
                    }}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition min-h-[48px]"
                  >
                    <MapPin className="w-4 h-4" />
                    <span>Check in</span>
                  </button>
                )}
              </div>
            </div>
          );
        }))}
      </div>
    </div>
  );
}
