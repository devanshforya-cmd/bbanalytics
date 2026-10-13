'use client';

import React, { useState, useEffect } from 'react';
import {
  Sun,
  AlertTriangle,
  Package,
  Truck,
  RotateCcw,
  MessageSquare,
  Compass,
  Phone,
  CreditCard,
  Calendar,
  X,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { getTodayBs } from '@/lib/nepali-calendar';
import { User } from '@/lib/types';
import { getScope, hasAccess, isSuperAdmin } from '@/lib/permissions';

export default function MorningBriefCard() {
  const [user, setUser] = useState<User | null>(null);
  const [visible, setVisible] = useState(false);
  const [briefData, setBriefData] = useState<any>(null);

  useEffect(() => {
    const sessionUser = getSessionUser() || db.getCurrentUser();
    setUser(sessionUser);

    // Only users with access to dashboard or beat plans see the morning brief
    if (!isSuperAdmin(sessionUser) && !hasAccess(sessionUser, 'dashboard') && !hasAccess(sessionUser, 'beat_plans')) {
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const storageKey = `bb_last_brief_dismissed_${sessionUser.id}_${todayStr}`;
    const dismissed = localStorage.getItem(storageKey);

    if (!dismissed) {
      const data = db.getMorningBriefData(sessionUser);
      setBriefData(data);
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    if (user) {
      const todayStr = new Date().toISOString().split('T')[0];
      const storageKey = `bb_last_brief_dismissed_${user.id}_${todayStr}`;
      localStorage.setItem(storageKey, 'true');
    }
    setVisible(false);
  };

  if (!visible || !user || !briefData) return null;

  const todayBs = getTodayBs();
  const todayAd = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const isOfficer = getScope(user, 'beat_plans') === 'OWN';

  return (
    <div className="mb-6 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white p-5 sm:p-6 shadow-md shadow-amber-500/5 relative animate-fade-in">
      {/* Top row */}
      <div className="flex items-start justify-between pb-4 border-b border-amber-200/70">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/25">
            <Sun className="h-6 w-6 animate-spin-slow" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>Good Morning, {user.fullName.split(' ')[0]}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                Daily Operations Brief
              </span>
            </h3>
            <p className="text-xs text-slate-600 font-medium mt-0.5 flex items-center gap-2">
              <span>{todayBs} BS</span>
              <span className="text-slate-300">&bull;</span>
              <span>{todayAd}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-amber-100/60 transition-colors"
          aria-label="Dismiss brief"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-4">
        {/* Yesterday's Summary */}
        <div className="space-y-3 bg-white/70 p-4 rounded-2xl border border-amber-100">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Yesterday&apos;s Performance Summary</span>
          </div>

          {isOfficer ? (
            <div className="text-xs text-slate-700 space-y-2">
              <p className="leading-relaxed">
                Great effort yesterday! You visited <strong className="font-semibold text-slate-900">{briefData.yesterdaySummary.storeVisits}</strong> scheduled stores on your beat.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium text-xs">
                  {briefData.yesterdaySummary.compliancePct}% Compliance
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-medium text-xs">
                  {briefData.yesterdaySummary.chequesCollected} Cheques collected
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <Package className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">
                  Orders: <strong>{briefData.yesterdaySummary.totalOrders}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <Truck className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="truncate">
                  Failures: <strong>{briefData.yesterdaySummary.deliveryFailures}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <RotateCcw className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="truncate">
                  Returns: <strong>{briefData.yesterdaySummary.returnsCount}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <MessageSquare className="w-4 h-4 text-purple-500 shrink-0" />
                <span className="truncate">
                  Complaints: <strong>{briefData.yesterdaySummary.complaintsCount}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <Compass className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">
                  Beat: <strong>{briefData.yesterdaySummary.storeVisits}</strong> ({briefData.yesterdaySummary.compliancePct}%)
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <CreditCard className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="truncate">
                  Cheques: <strong>{briefData.yesterdaySummary.chequesCollected}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Today's Attention Required */}
        <div className="space-y-3 bg-white/70 p-4 rounded-2xl border border-amber-100">
          <div className="text-[11px] font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            <span>Today&apos;s Action Priorities</span>
          </div>

          <div className="space-y-2 text-xs">
            {briefData.todayAttention.overdueCheques.length > 0 && (
              <div className="flex items-start gap-2 text-rose-800 bg-rose-50 p-2 rounded-xl border border-rose-200">
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                <span>
                  <strong>{briefData.todayAttention.overdueCheques.length} Cheque(s) Overdue:</strong>{' '}
                  {briefData.todayAttention.overdueCheques[0].storeName} (Rs.{' '}
                  {briefData.todayAttention.overdueCheques[0].amount.toLocaleString()}) requires cash or replacement.
                </span>
              </div>
            )}

            <div className="flex items-start gap-2 text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />
              <span>
                <strong>Beat Plan Active:</strong> {briefData.todayAttention.todayBeatCount} stores queued for check-in today across Kathmandu Valley.
              </span>
            </div>

            {briefData.todayAttention.upcomingHoliday && (
              <div className="flex items-start gap-2 text-blue-800 bg-blue-50 p-2 rounded-xl border border-blue-200">
                <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Public Holiday Tomorrow:</strong> {briefData.todayAttention.upcomingHoliday.name} ({briefData.todayAttention.upcomingHoliday.dateBs}). Field routes will be paused.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons Footer */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-amber-200/70">
        <button
          type="button"
          onClick={handleDismiss}
          className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-amber-100/50 transition-colors"
        >
          Dismiss for Today
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
        >
          <span>View Dashboard</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
