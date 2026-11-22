'use client';
import Link from 'next/link';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { User } from '@/lib/types';
import { getScope, hasAccess } from '@/lib/permissions';
import { GREETING, dayPart, type DayPart } from '@/lib/greeting';

export default function MorningBriefCard() {
  const [user, setUser] = useState<User | null>(null);
  const [visible, setVisible] = useState(false);
  const [briefData, setBriefData] = useState<any>(null);
  // Re-read every minute so an open dashboard moves from morning to afternoon on its own.
  const [part, setPart] = useState<DayPart>(() => dayPart());
  useEffect(() => { const timer = window.setInterval(() => setPart(dayPart()), 60000); return () => window.clearInterval(timer); }, []);
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

  const attention = briefData.todayAttention;
  const y = briefData.yesterdaySummary;
  const Row = ({ tone, children }: { tone: 'bad' | 'warn' | 'info'; children: React.ReactNode }) => (
    <li className="flex items-start gap-3 py-2.5">
      <span aria-hidden="true" className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${tone === 'bad' ? 'bg-rose-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-slate-400'}`} />
      <span className="text-[13px] leading-5 text-slate-700">{children}</span>
    </li>
  );

  return (
    <section aria-label="Today's brief" className="relative mb-6 rounded-2xl border border-black/[0.08] bg-white px-5 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-slate-900">{GREETING[part].hello}, {(user?.fullName || 'there').split(' ')[0]}</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">{GREETING[part].brief} · {todayBs} · {todayAd}</p>
        </div>
        <button type="button" onClick={handleDismiss} className="-mr-2 -mt-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Hide for today">
          <X className="h-4 w-4" />
        </button>
      </div>

      {isOfficer && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-black/[0.06] pt-4">
          {canSeeBeatPlans && <div><dt className="text-xs text-slate-500">Stores visited yesterday</dt><dd className="mt-1 text-xl font-medium tabular-nums text-slate-900">{y.storeVisits}</dd></div>}
          {canSeeBeatPlans && <div><dt className="text-xs text-slate-500">Beat compliance</dt><dd className="mt-1 text-xl font-medium tabular-nums text-slate-900">{y.compliancePct}%</dd></div>}
          {canSeeCheques && <div><dt className="text-xs text-slate-500">Cheques collected</dt><dd className="mt-1 text-xl font-medium tabular-nums text-slate-900">{y.chequesCollected}</dd></div>}
        </dl>
      )}

      {hasAttentionData && (
        <div className="mt-4 border-t border-black/[0.06] pt-3">
          <p className="text-xs text-slate-500">Today</p>
          <ul className="divide-y divide-black/[0.05]">
            {canSeeCheques && attention.overdueCheques.length > 0 && (
              <Row tone="bad">
                <span className="font-medium text-slate-900">{attention.overdueChequeCount} {attention.overdueChequeCount === 1 ? 'cheque is' : 'cheques are'} past their date</span>, NPR <span className="tabular-nums">{attention.overdueChequeTotal.toLocaleString()}</span> in all. Largest: {attention.overdueCheques[0].storeName}, NPR <span className="tabular-nums">{attention.overdueCheques[0].amount.toLocaleString()}</span>
              </Row>
            )}
            {attention.unconfirmedDeliveries > 0 && (hasAccess(user, 'orderflow') || hasAccess(user, 'order_desk')) && (
              <Row tone="warn">
                <span className="font-medium text-slate-900">{attention.unconfirmedDeliveries} {attention.unconfirmedDeliveries === 1 ? 'order was' : 'orders were'} dispatched 4+ days ago and not marked delivered.</span>{' '}
                <Link href="/orderflow/orders?status=unconfirmed" className="text-blue-700 underline-offset-2 hover:underline">Confirm them</Link> so delivery and return numbers stay right.
              </Row>
            )}
            {canSeeBeatPlans && (
              <Row tone={attention.todayBeatCount ? 'warn' : 'info'}>
                {attention.todayBeatCount
                  ? <><span className="font-medium text-slate-900">{attention.todayBeatCount} {attention.todayBeatCount === 1 ? 'store visit' : 'store visits'} left today</span>{!isOfficer && attention.todayOfficers > 1 ? ` across ${attention.todayOfficers} officers` : ''}</>
                  : 'No store visits left today'}
              </Row>
            )}
            {(canSeeBeatPlans || hasAccess(user, 'settings')) && attention.upcomingHoliday && (
              <Row tone="info">
                <span className="font-medium text-slate-900">Public holiday tomorrow:</span> {attention.upcomingHoliday.name} ({attention.upcomingHoliday.dateBs}). Field routes will be paused.
              </Row>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
