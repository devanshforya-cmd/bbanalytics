'use client';
import Link from 'next/link';

import React, { useState, useEffect } from 'react';
import {
  Sun,
  Sunrise,
  Sunset,
  Moon,
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
  ShieldCheck,
} from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { User } from '@/lib/types';
import { getScope, hasAccess } from '@/lib/permissions';
import { GREETING, dayPart, type DayPart } from '@/lib/greeting';

/** Colour and icon for each part of the day. */
const LOOK: Record<DayPart, { Icon: typeof Sun; card: string; tile: string; badge: string; line: string }> = {
  MORNING: { Icon: Sunrise, card: 'border-amber-200 from-amber-50/90 via-orange-50/40 to-white', tile: 'bg-amber-600 shadow-amber-500/25', badge: 'bg-amber-100 text-amber-800 border-amber-200', line: 'border-amber-200/70' },
  AFTERNOON: { Icon: Sun, card: 'border-sky-200 from-sky-50/90 via-blue-50/30 to-white', tile: 'bg-sky-600 shadow-sky-500/25', badge: 'bg-sky-100 text-sky-800 border-sky-200', line: 'border-sky-200/70' },
  EVENING: { Icon: Sunset, card: 'border-orange-200 from-orange-50/90 via-rose-50/40 to-white', tile: 'bg-orange-600 shadow-orange-500/25', badge: 'bg-orange-100 text-orange-800 border-orange-200', line: 'border-orange-200/70' },
  NIGHT: { Icon: Moon, card: 'border-indigo-200 from-indigo-50/90 via-slate-50/60 to-white', tile: 'bg-indigo-700 shadow-indigo-500/25', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200', line: 'border-indigo-200/70' },
};

export default function MorningBriefCard() {
  const [user, setUser] = useState<User | null>(null);
  const [visible, setVisible] = useState(false);
  const [briefData, setBriefData] = useState<any>(null);
  // Re-read every minute so an open dashboard moves from morning to afternoon on its own.
  const [part, setPart] = useState<DayPart>(() => dayPart());
  useEffect(() => { const timer = window.setInterval(() => setPart(dayPart()), 60000); return () => window.clearInterval(timer); }, []);
  const look = LOOK[part];
  const hasBriefDataAccess = (activeUser: User) =>
    ['beat_plans', 'orderflow', 'reviews', 'cheque_tracker'].some((feature) => hasAccess(activeUser, feature));

  useEffect(() => {
    const sessionUser = getSessionUser() || db.getCurrentUser();
    setUser(sessionUser);

    if (!hasBriefDataAccess(sessionUser)) return;

    const todayStr = getTodayAd();
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
      const todayStr = getTodayAd();
      const storageKey = `bb_last_brief_dismissed_${user.id}_${todayStr}`;
      localStorage.setItem(storageKey, 'true');
    }
    setVisible(false);
  };

  if (!visible || !user || !briefData || !hasBriefDataAccess(user)) return null;

  const todayBs = getTodayBs();
  const todayAd = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const canSeeBeatPlans = hasAccess(user, 'beat_plans');
  const canSeeOrders = hasAccess(user, 'orderflow');
  const canSeeReviews = hasAccess(user, 'reviews');
  const canSeeCheques = hasAccess(user, 'cheque_tracker');
  const isOfficer = canSeeBeatPlans && getScope(user, 'beat_plans') === 'OWN';
  const hasAttentionData = canSeeCheques || canSeeBeatPlans || hasAccess(user, 'settings');

  // Nothing new to say: the KPI cards already show the numbers.
  if (!isOfficer && !hasAttentionData) return null;

  return (
    <div className={`mb-6 rounded-3xl border bg-gradient-to-br p-5 sm:p-6 shadow-md relative animate-fade-in ${look.card}`}>
      {/* Top row */}
      <div className={`flex items-start justify-between pb-4 border-b ${look.line}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md ${look.tile}`}>
            <look.Icon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex flex-wrap items-center gap-2">
              <span>{GREETING[part].hello}, {(user?.fullName || 'there').split(' ')[0]}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${look.badge}`}>
                {GREETING[part].brief}
              </span>
            </h2>
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
          className="p-1.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-amber-100/60 transition-colors"
          aria-label="Dismiss brief"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Grid Content */}
      <div className={`grid grid-cols-1 gap-5 py-4 ${isOfficer && hasAttentionData ? 'md:grid-cols-2' : ''}`}>
        {/* Yesterday's summary: only for field officers; managers see these numbers in the KPI cards below */}
        {isOfficer && (<>
        {/* Yesterday's Summary */}
        <div className="space-y-3 bg-white/70 p-4 rounded-2xl border border-amber-100">
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Yesterday&apos;s Performance Summary</span>
          </div>

          {isOfficer ? (
            <div className="text-xs text-slate-700 space-y-2">
                {canSeeBeatPlans && <p className="leading-relaxed">
                  Yesterday you visited <strong className="font-semibold text-slate-900">{briefData.yesterdaySummary.storeVisits}</strong> of the stores on your beat.
                </p>}
              <div className="flex flex-wrap gap-2 pt-1">
                  {canSeeBeatPlans && <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium text-xs">
                  {briefData.yesterdaySummary.compliancePct}% Compliance
                  </span>}
                  {canSeeCheques && <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-medium text-xs">
                  {briefData.yesterdaySummary.chequesCollected} Cheques collected
                  </span>}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {canSeeOrders && <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <Package className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">
                  Orders: <strong>{briefData.yesterdaySummary.totalOrders}</strong>
                </span>
              </div>}

              {canSeeOrders && <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <Truck className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="truncate">
                  Failures: <strong>{briefData.yesterdaySummary.deliveryFailures}</strong>
                </span>
              </div>}

              {canSeeReviews && <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <RotateCcw className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="truncate">
                  Returns: <strong>{briefData.yesterdaySummary.returnsCount}</strong>
                </span>
              </div>}

              {canSeeReviews && <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <MessageSquare className="w-4 h-4 text-purple-500 shrink-0" />
                <span className="truncate">
                  Complaints: <strong>{briefData.yesterdaySummary.complaintsCount}</strong>
                </span>
              </div>}

              {canSeeBeatPlans && <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <Compass className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">
                  Beat: <strong>{briefData.yesterdaySummary.storeVisits}</strong> ({briefData.yesterdaySummary.compliancePct}%)
                </span>
              </div>}

              {canSeeCheques && <div className="flex items-center gap-2 text-slate-700 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <CreditCard className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="truncate">
                  Cheques: <strong>{briefData.yesterdaySummary.chequesCollected}</strong>
                </span>
              </div>}
            </div>
          )}
        </div>
        </>)}

        {/* Today's Attention Required */}
        {hasAttentionData && <div className="space-y-3 bg-white/70 p-4 rounded-2xl border border-amber-100">
          <div className="text-[11px] font-bold text-rose-600 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            <span>Today&apos;s Action Priorities</span>
          </div>

          <div className="space-y-2 text-xs">
            {canSeeCheques && briefData.todayAttention.overdueCheques.length > 0 && (
              <div className="flex items-start gap-2 text-rose-800 bg-rose-50 p-2 rounded-xl border border-rose-200">
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                <span>
                  <strong>{briefData.todayAttention.overdueChequeCount} {briefData.todayAttention.overdueChequeCount === 1 ? 'cheque is' : 'cheques are'} past their date</strong>{' '}
                  (NPR {briefData.todayAttention.overdueChequeTotal.toLocaleString()} in all). Largest: {briefData.todayAttention.overdueCheques[0].storeName}, NPR {briefData.todayAttention.overdueCheques[0].amount.toLocaleString()}.
                </span>
              </div>
            )}

            {briefData.todayAttention.unconfirmedDeliveries > 0 && (hasAccess(user, 'orderflow') || hasAccess(user, 'order_desk')) && (
              <div className="flex items-start gap-2 text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                <span>
                  <strong>{briefData.todayAttention.unconfirmedDeliveries} {briefData.todayAttention.unconfirmedDeliveries === 1 ? 'order was' : 'orders were'} dispatched 4+ days ago and not marked delivered.</strong>{' '}
                  <Link href="/orderflow/orders?status=unconfirmed" className="font-semibold underline">Confirm them</Link> so delivery and return numbers stay right.
                </span>
              </div>
            )}

            {canSeeBeatPlans && <div className="flex items-start gap-2 text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />
              <span>
                {briefData.todayAttention.todayBeatCount
                  ? <><strong>{briefData.todayAttention.todayBeatCount} {briefData.todayAttention.todayBeatCount === 1 ? 'store visit' : 'store visits'} left today</strong>{!isOfficer && briefData.todayAttention.todayOfficers > 1 ? ` across ${briefData.todayAttention.todayOfficers} officers` : ''}.</>
                  : <><strong>No store visits left today.</strong></>}
              </span>
            </div>}

            {(canSeeBeatPlans || hasAccess(user, 'settings')) && briefData.todayAttention.upcomingHoliday && (
              <div className="flex items-start gap-2 text-blue-800 bg-blue-50 p-2 rounded-xl border border-blue-200">
                <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Public Holiday Tomorrow:</strong> {briefData.todayAttention.upcomingHoliday.name} ({briefData.todayAttention.upcomingHoliday.dateBs}). Field routes will be paused.
                </span>
              </div>
            )}
          </div>
        </div>}
      </div>

      {/* Action Buttons Footer */}
      <div className={`flex items-center justify-end gap-2 pt-3 border-t ${look.line}`}>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-black/[0.04] hover:text-slate-900"
        >
          Hide for today
        </button>
      </div>
    </div>
  );
}
