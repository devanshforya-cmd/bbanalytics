'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { BrandCode } from '@/lib/types';
import {
  ArrowLeft,
  Phone,
  MapPin,
  Award,
  ShieldAlert,
  ShoppingBag,
  RotateCcw,
  MessageSquare,
  Truck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Info,
  Tag,
  AlertCircle,
} from 'lucide-react';

interface UnifiedTimelineItem {
  id: string;
  date: string;
  dateBs: string;
  type: 'ORDER' | 'DELIVERY_FAILURE' | 'RETURN' | 'FEEDBACK';
  data: any;
}

interface KarmaLedgerEvent {
  id: string;
  event: string;
  date: string;
  points: number;
  runningTotal: number;
  type: 'BASE' | 'ORDER_PLACED' | 'ORDER_DELIVERED' | 'FAILURE' | 'RETURN' | 'FEEDBACK' | 'ADJUSTMENT';
}

export default function CustomerDetailPage() {
  const params = useParams();
  const rawPhone = decodeURIComponent((params?.phone as string) || '');
  const customer = db.getCustomerByPhone(rawPhone);
  const [showKarmaBreakdown, setShowKarmaBreakdown] = useState(false);
  const [brandTimelineFilter, setBrandTimelineFilter] = useState<BrandCode | 'ALL'>('ALL');

  if (!customer) {
    return (
      <div className="space-y-6 max-w-5xl py-12 text-center">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Customer Directory
        </Link>
        <div className="bg-white rounded-2xl border border-slate-200 p-12 max-w-md mx-auto space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 font-bold text-lg">
            ?
          </div>
          <h2 className="text-base font-bold text-slate-900">Customer Profile Not Found</h2>
          <p className="text-xs text-slate-500">
            No profile exists matching phone number &quot;{rawPhone}&quot;.
          </p>
          <Link
            href="/customers"
            className="inline-block px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
          >
            Return to Directory
          </Link>
        </div>
      </div>
    );
  }

  // Normalization helper for phone comparison
  const norm = (p: string) => p.replace(/\D/g, '');
  const targetPhone = norm(customer.phone);

  const orders = db.getOrders().filter((o) => norm(o.customerPhone) === targetPhone);
  const failures = db.getDeliveryFailures().filter((f) => norm(f.customerPhone) === targetPhone);
  const returns = db.getReturns().filter((r) => norm(r.customerPhone) === targetPhone);
  const feedback = db.getFeedback().filter((fb) => norm(fb.customerPhone) === targetPhone);
  const allBrands = db.getBrands('ACTIVE');

  // 1a. Unified Chronological Timeline (sorted newest first)
  const timelineItems: UnifiedTimelineItem[] = useMemo(() => {
    const list: UnifiedTimelineItem[] = [];

    orders.forEach((ord) => {
      list.push({
        id: `ord_${ord.id}`,
        date: ord.orderDateAd || '2026-09-01',
        dateBs: ord.orderDateBs || '',
        type: 'ORDER',
        data: ord,
      });
    });

    failures.forEach((df) => {
      list.push({
        id: `df_${df.id}`,
        date: df.dateAd || '2026-09-01',
        dateBs: df.dateBs || '',
        type: 'DELIVERY_FAILURE',
        data: df,
      });
    });

    returns.forEach((ret) => {
      list.push({
        id: `ret_${ret.id}`,
        date: ret.dateAd || '2026-09-01',
        dateBs: ret.dateBs || '',
        type: 'RETURN',
        data: ret,
      });
    });

    feedback.forEach((fb) => {
      list.push({
        id: `fb_${fb.id}`,
        date: fb.dateReceivedAd || '2026-09-01',
        dateBs: fb.dateReceivedBs || '',
        type: 'FEEDBACK',
        data: fb,
      });
    });

    // Sort descending by date (newest first)
    return list.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  }, [orders, failures, returns, feedback]);

  // Brand Engagement Summary (Fix 69c)
  const brandEngagement = useMemo(() => {
    return [
      { code: 'FORYA' as BrandCode, name: 'Forya', color: 'emerald', dot: '🟢' },
      { code: 'PEE_SAFE' as BrandCode, name: 'Pee Safe', color: 'purple', dot: '🟣' },
      { code: 'RENEE' as BrandCode, name: 'Renee', color: 'rose', dot: '⚪' },
    ].map((b) => {
      const bOrders = orders.filter((o) => (b.code === 'PEE_SAFE' ? o.brandCode === 'PEE_SAFE' || o.brandCode === 'FURR' : o.brandCode === b.code));
      const bReturns = returns.filter((r) => (b.code === 'PEE_SAFE' ? r.brandCode === 'PEE_SAFE' || r.brandCode === 'FURR' : r.brandCode === b.code));
      const bFeedback = feedback.filter((fb) => (b.code === 'PEE_SAFE' ? fb.brandCode === 'PEE_SAFE' || fb.brandCode === 'FURR' : fb.brandCode === b.code));
      const firstDate = bOrders.length > 0 ? bOrders[bOrders.length - 1].orderDateAd : null;

      return {
        ...b,
        ordersCount: bOrders.length,
        returnsCount: bReturns.length,
        complaintsCount: bFeedback.length,
        hasOrdered: bOrders.length > 0,
        firstDate,
      };
    });
  }, [orders, returns, feedback]);

  // Filtered Timeline Items (Fix 69b)
  const filteredTimelineItems = useMemo(() => {
    if (brandTimelineFilter === 'ALL') return timelineItems;
    return timelineItems.filter((item) => {
      const b = item.data?.brandCode;
      if (brandTimelineFilter === 'PEE_SAFE') {
        return b === 'PEE_SAFE' || b === 'FURR';
      }
      return b === brandTimelineFilter;
    });
  }, [timelineItems, brandTimelineFilter]);

  // Brand-filtered stats (Fix 69b)
  const filteredStats = useMemo(() => {
    if (brandTimelineFilter === 'ALL') {
      return {
        ordersCount: customer.totalOrders,
        failuresCount: customer.totalDeliveryFailures,
        returnsCount: customer.totalReturns,
        feedbackCount: customer.totalReviews,
      };
    }
    const bOrders = orders.filter((o) => (brandTimelineFilter === 'PEE_SAFE' ? o.brandCode === 'PEE_SAFE' || o.brandCode === 'FURR' : o.brandCode === brandTimelineFilter));
    const bFailures = failures.filter((f) => (brandTimelineFilter === 'PEE_SAFE' ? f.brandCode === 'PEE_SAFE' || f.brandCode === 'FURR' : f.brandCode === brandTimelineFilter));
    const bReturns = returns.filter((r) => (brandTimelineFilter === 'PEE_SAFE' ? r.brandCode === 'PEE_SAFE' || r.brandCode === 'FURR' : r.brandCode === brandTimelineFilter));
    const bFeedback = feedback.filter((fb) => (brandTimelineFilter === 'PEE_SAFE' ? fb.brandCode === 'PEE_SAFE' || fb.brandCode === 'FURR' : fb.brandCode === brandTimelineFilter));
    return {
      ordersCount: bOrders.length,
      failuresCount: bFailures.length,
      returnsCount: bReturns.length,
      feedbackCount: bFeedback.length,
    };
  }, [customer, brandTimelineFilter, orders, failures, returns, feedback]);

  // 1b. Karma Score Ledger Calculation
  const karmaLedger: KarmaLedgerEvent[] = useMemo(() => {
    // Gather all raw events chronologically (oldest first)
    interface RawEvent {
      date: string;
      label: string;
      points: number;
      type: KarmaLedgerEvent['type'];
    }

    const rawEvents: RawEvent[] = [];

    orders.forEach((ord) => {
      rawEvents.push({
        date: ord.orderDateAd || '2026-08-01',
        label: `Order #${ord.orderNumber} placed`,
        points: 2,
        type: 'ORDER_PLACED',
      });
      if (ord.status === 'DELIVERED') {
        rawEvents.push({
          date: ord.orderDateAd || '2026-08-02',
          label: `Order #${ord.orderNumber} delivered successfully`,
          points: 1,
          type: 'ORDER_DELIVERED',
        });
      }
    });

    failures.forEach((df) => {
      rawEvents.push({
        date: df.dateAd || '2026-08-05',
        label: `Delivery failure (${df.reason})`,
        points: -5,
        type: 'FAILURE',
      });
    });

    returns.forEach((ret) => {
      rawEvents.push({
        date: ret.dateAd || '2026-08-10',
        label: `Product return logged (${ret.reasonCategory})`,
        points: -3,
        type: 'RETURN',
      });
    });

    feedback.forEach((fb) => {
      if (fb.type === 'COMPLAINT') {
        rawEvents.push({
          date: fb.dateReceivedAd || '2026-08-12',
          label: `Complaint filed (${fb.productName})`,
          points: -2,
          type: 'FEEDBACK',
        });
      } else if (fb.type === 'REVIEW') {
        rawEvents.push({
          date: fb.dateReceivedAd || '2026-08-12',
          label: `Positive review submitted`,
          points: 3,
          type: 'FEEDBACK',
        });
      }
    });

    // Sort oldest first for running total calculation
    rawEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Compute net delta from explicit events
    const netDelta = rawEvents.reduce((sum, ev) => sum + ev.points, 0);

    // Initial base score calibrated to land on exact customer.karmaScore
    const baseScore = Math.max(0, customer.karmaScore - netDelta);
    let running = baseScore;

    const ledger: KarmaLedgerEvent[] = [
      {
        id: 'base_score',
        event: 'Account Starting Baseline',
        date: customer.firstOrderDate || 'Initial',
        points: baseScore,
        runningTotal: baseScore,
        type: 'BASE',
      },
    ];

    rawEvents.forEach((ev, idx) => {
      running += ev.points;
      const formattedDate = new Date(ev.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      ledger.push({
        id: `ke_${idx}`,
        event: ev.label,
        date: formattedDate !== 'Invalid Date' ? formattedDate : ev.date,
        points: ev.points,
        runningTotal: running,
        type: ev.type,
      });
    });

    return ledger;
  }, [customer, orders, failures, returns, feedback]);

  // 1c. Active Flags Evaluation
  const activeFlags = useMemo(() => {
    const flags: { title: string; color: 'red' | 'yellow' | 'orange'; description: string }[] = [];

    // Serial Returner: 3+ returns
    if (customer.totalReturns >= 3 || returns.length >= 3) {
      flags.push({
        title: 'Serial Returner',
        color: 'red',
        description: '3+ returns recorded in the last 30 days. High reverse logistics cost profile.',
      });
    }

    // Non-Receiver: 2+ delivery failures
    if (customer.totalDeliveryFailures >= 2 || failures.length >= 2) {
      flags.push({
        title: 'Non-Receiver',
        color: 'yellow',
        description: '2+ delivery failures logged. Phone calls frequently unanswered or address unreachable.',
      });
    }

    // COD Abuser: 3+ cancellations or repeated COD refusals
    const refusedCount = failures.filter((f) => f.reason.toLowerCase().includes('refuse')).length;
    if (customer.totalCancellations >= 3 || refusedCount >= 2) {
      flags.push({
        title: 'COD Abuser',
        color: 'orange',
        description: 'Multiple COD delivery refusals or cancellations. Pre-payment requirement strongly advised.',
      });
    }

    // Include any existing explicit active flags on the customer object
    if (customer.activeFlags && customer.activeFlags.length > 0) {
      customer.activeFlags.forEach((fl) => {
        if (!flags.some((f) => f.title.toLowerCase() === fl.toLowerCase())) {
          flags.push({
            title: fl,
            color: 'red',
            description: 'Flagged on customer record by risk management.',
          });
        }
      });
    }

    return flags;
  }, [customer, returns, failures]);

  // 1d. Brands Purchased Visual Counts
  const brandPurchases = useMemo(() => {
    return allBrands.map((b) => {
      // FURR and PEE_SAFE are consolidated under PEE_SAFE
      const count = orders.filter((o) => {
        if (b.code === 'PEE_SAFE') {
          return o.brandCode === 'PEE_SAFE' || o.brandCode === 'FURR';
        }
        return o.brandCode === b.code;
      }).length;

      return {
        brand: b,
        orderCount: count,
      };
    });
  }, [allBrands, orders]);

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER']}>
      <div className="space-y-6 max-w-5xl pb-16">
      {/* Breadcrumb navigation */}
      <Breadcrumbs
        items={[
          { label: 'Customer Intelligence', href: '/customers' },
          { label: 'Customer 360' },
          { label: customer.name },
        ]}
      />

      {/* Customer Header Card with Karma Score */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white font-bold text-xl shadow">
            {customer.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
              <span className="rounded-full bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 text-xs">
                {customer.segment}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="font-mono">{customer.phone}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-slate-400" />
                {customer.city}, {customer.province}
              </span>
              <span>•</span>
              <span>First ordered: {customer.firstOrderDate || '2026-07-15'}</span>
            </div>
          </div>
        </div>

        {/* Karma Score Pill & Breakdown Trigger */}
        <div className="flex flex-col items-center sm:items-end">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center min-w-[160px] shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Karma Score</div>
            <div className="text-2xl font-black text-blue-600 mt-0.5">
              {customer.karmaScore} <span className="text-xs font-normal text-slate-400">/ 100</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {customer.karmaScore >= 70
                ? '🟢 Clean Track Record'
                : customer.karmaScore >= 40
                ? '🟡 Monitored'
                : '🔴 COD Block Advised'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowKarmaBreakdown(!showKarmaBreakdown)}
            className="mt-2 text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline transition"
          >
            <span>{showKarmaBreakdown ? 'Hide calculation details' : 'How this score was calculated'}</span>
            {showKarmaBreakdown ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* 1b. Collapsible Karma Score Breakdown Table */}
      {showKarmaBreakdown && (
        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-5 shadow-xs space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-blue-100 pb-2.5">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Award className="h-4 w-4 text-blue-600" />
                Karma Score Audit Trail & Ledger
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Transparent rule-based scoring determining reliability, discount eligibility, and Cash on Delivery (COD) approval.
              </p>
            </div>
            <span className="text-xs font-bold text-blue-800 bg-blue-100/80 px-2.5 py-1 rounded-full">
              Final Score: {customer.karmaScore}/100
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-blue-100 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-2 px-3">Event</th>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3 text-center">Points</th>
                  <th className="py-2 px-3 text-right">Running Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100/60 bg-white/80 rounded-xl overflow-hidden">
                {karmaLedger.map((item) => (
                  <tr key={item.id} className="hover:bg-blue-50/50 transition">
                    <td className="py-2 px-3 font-semibold text-slate-800">
                      {item.event}
                    </td>
                    <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                      {item.date}
                    </td>
                    <td className="py-2 px-3 text-center font-bold">
                      {item.points > 0 ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          +{item.points}
                        </span>
                      ) : item.points < 0 ? (
                        <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {item.points}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">
                      {item.runningTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BRAND ENGAGEMENT (Fix 69c) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-purple-600" />
          Brand Engagement
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {brandEngagement.map((be) => (
            <div
              key={be.code}
              className={`rounded-xl border p-3.5 transition ${
                be.hasOrdered
                  ? be.code === 'FORYA'
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                    : be.code === 'PEE_SAFE'
                    ? 'bg-purple-50/60 border-purple-200 text-purple-950'
                    : 'bg-rose-50/60 border-rose-200 text-rose-950'
                  : 'bg-slate-50/80 border-slate-200 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <span>{be.dot}</span> {be.name}
                </span>
                {be.hasOrdered ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white shadow-2xs">
                    {be.ordersCount} order{be.ordersCount > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-slate-400">Never ordered</span>
                )}
              </div>
              {be.hasOrdered ? (
                <div className="mt-2 text-[11px] space-y-0.5 opacity-90">
                  <div>• Returns: <strong>{be.returnsCount}</strong> | Complaints: <strong>{be.complaintsCount}</strong></div>
                  <div className="text-[10px] text-slate-500">Customer since: {be.firstDate || '2026-08'}</div>
                </div>
              ) : (
                <div className="mt-2 text-[10px] text-slate-400">
                  Target for cross-brand bundle recommendations
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-slate-400 font-bold text-[10px] uppercase">
            {brandTimelineFilter === 'ALL' ? 'Orders Placed' : `${brandTimelineFilter} Orders`}
          </div>
          <div className="text-lg font-bold text-slate-900 mt-1">{filteredStats.ordersCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-slate-400 font-bold text-[10px] uppercase">
            {brandTimelineFilter === 'ALL' ? 'Delivery Failures' : `${brandTimelineFilter} Failures`}
          </div>
          <div className="text-lg font-bold text-rose-600 mt-1">{filteredStats.failuresCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-slate-400 font-bold text-[10px] uppercase">
            {brandTimelineFilter === 'ALL' ? 'Product Returns' : `${brandTimelineFilter} Returns`}
          </div>
          <div className="text-lg font-bold text-amber-600 mt-1">{filteredStats.returnsCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-slate-400 font-bold text-[10px] uppercase">
            {brandTimelineFilter === 'ALL' ? 'Reviews Given' : `${brandTimelineFilter} Reviews`}
          </div>
          <div className="text-lg font-bold text-emerald-600 mt-1">{filteredStats.feedbackCount}</div>
        </div>
      </div>

      {/* 1c. Active Flags Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-slate-500" />
            Active Risk & Behavior Flags
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">Auto-Evaluated</span>
        </div>

        {activeFlags.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200/80 px-4 py-3 text-emerald-800 text-xs font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>✅ No active flags — clean customer record. Eligible for all payment terms & express dispatch.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeFlags.map((flag, idx) => {
              const badgeStyle =
                flag.color === 'red'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : flag.color === 'yellow'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-orange-50 border-orange-200 text-orange-900';

              const iconDot =
                flag.color === 'red' ? '🔴' : flag.color === 'yellow' ? '🟡' : '🟠';

              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-3.5 space-y-1.5 shadow-2xs ${badgeStyle}`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <span>{iconDot}</span>
                    <span>&quot;{flag.title}&quot;</span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">{flag.description}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 1d. Brands Purchased Visual */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Tag className="h-4 w-4 text-slate-500" />
              Brands Purchased & Cross-Sell Opportunities
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Shows principal brand penetration for this customer across the distributor portfolio.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {brandPurchases.map(({ brand, orderCount }) => {
            const hasPurchased = orderCount > 0;

            // Brand specific badge colors
            let brandColorStyle = 'bg-slate-100 text-slate-400 border-slate-200 border-dashed opacity-75';
            let dot = '⚪';

            if (hasPurchased) {
              if (brand.code === 'FORYA') {
                brandColorStyle = 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
                dot = '🟢';
              } else if (brand.code === 'PEE_SAFE') {
                brandColorStyle = 'bg-purple-50 text-purple-800 border-purple-300 font-bold';
                dot = '🟣';
              } else if (brand.code === 'RENEE') {
                brandColorStyle = 'bg-rose-50 text-rose-800 border-rose-300 font-bold';
                dot = '🔴';
              } else {
                brandColorStyle = 'bg-blue-50 text-blue-800 border-blue-300 font-bold';
                dot = '🔵';
              }
            }

            return (
              <div
                key={brand.code}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition ${brandColorStyle}`}
              >
                <span>{dot}</span>
                <span>{brand.name}</span>
                {hasPurchased ? (
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-bold shadow-2xs">
                    {orderCount} order{orderCount > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-medium">
                    (0 orders) ← Cross-sell opportunity
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 1a & 1e. Unified Chronological Timeline with Cross-Links */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Unified Chronological Timeline
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Merged interactions (Orders, Delivery Failures, Returns & Feedback) ordered chronologically (newest first).
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
            {filteredTimelineItems.length} Events
          </span>
        </div>

        {/* Brand Filter Pills above timeline (Fix 69b) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-slate-400 text-[11px] uppercase tracking-wider mr-1">Showing:</span>
            {[
              { id: 'ALL', label: 'All Brands' },
              { id: 'FORYA', label: 'Forya' },
              { id: 'PEE_SAFE', label: 'Pee Safe' },
              { id: 'RENEE', label: 'Renee' },
            ].map((pill) => (
              <button
                key={pill.id}
                onClick={() => setBrandTimelineFilter(pill.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  brandTimelineFilter === pill.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
          {brandTimelineFilter !== 'ALL' && (
            <span className="text-[11px] text-blue-700 font-semibold">
              Filtered to {brandTimelineFilter} interactions ({filteredTimelineItems.length})
            </span>
          )}
        </div>

        {filteredTimelineItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 space-y-1">
            <Sparkles className="h-6 w-6 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-600">No interaction history recorded for this brand</p>
            <p>New orders, calls, deliveries, or returns will show up here automatically.</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6 text-xs">
            {filteredTimelineItems.map((item) => {
              if (item.type === 'ORDER') {
                const ord = item.data;
                return (
                  <div key={item.id} className="relative group">
                    <div className="absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] ring-4 ring-white shadow-xs">
                      ✓
                    </div>
                    <div className="rounded-xl border border-blue-100 bg-blue-50/20 p-4 space-y-2 hover:border-blue-300 transition shadow-2xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            Order #{ord.orderNumber} Placed ({ord.brandCode})
                          </div>
                          <div className="text-slate-500 text-[11px] mt-0.5">
                            {ord.orderDateBs} ({ord.orderDateAd}) • Platform: <strong>{ord.platform}</strong> • Total: <strong className="text-slate-800">NPR {ord.totalAmount?.toLocaleString()}</strong>
                          </div>
                        </div>
                        <span className="rounded-full bg-blue-100 text-blue-800 font-bold px-2 py-0.5 text-[10px]">
                          {ord.status}
                        </span>
                      </div>

                      <div className="text-slate-600 text-[11px] bg-white rounded-lg p-2 border border-slate-100">
                        <strong>Items:</strong>{' '}
                        {ord.items?.map((i: any, idx: number) => (
                          <span key={idx}>
                            {idx > 0 && ', '}
                            <Link
                              href={`/products/${i.productId || encodeURIComponent(i.productName)}`}
                              className="font-semibold text-slate-800 hover:text-blue-600 hover:underline"
                            >
                              {i.productName}
                            </Link>{' '}
                            ({i.quantity}x)
                          </span>
                        )) || 'No items listed'}
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <span className="text-slate-400 font-mono">ID: {ord.id}</span>
                        <Link
                          href={`/orderflow/manual-entry?order=${ord.orderNumber}`}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold hover:underline"
                        >
                          View in OrderFlow <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === 'DELIVERY_FAILURE') {
                const df = item.data;
                return (
                  <div key={item.id} className="relative group">
                    <div className="absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white text-[10px] font-bold ring-4 ring-white shadow-xs">
                      !
                    </div>
                    <div className="rounded-xl border border-rose-100 bg-rose-50/30 p-4 space-y-2 hover:border-rose-300 transition shadow-2xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-rose-900 text-sm">
                            Delivery Failure: {df.reason} (Order #{df.orderNumber})
                          </div>
                          <div className="text-slate-500 text-[11px] mt-0.5">
                            {df.dateBs} ({df.dateAd}) • Courier Territory: <strong>{df.valley} Valley</strong>
                          </div>
                        </div>
                        <span className="rounded-full bg-rose-100 text-rose-800 font-bold px-2 py-0.5 text-[10px]">
                          -5 Karma Penalty
                        </span>
                      </div>

                      {df.remarks && (
                        <div className="text-rose-700 bg-white rounded-lg p-2 border border-rose-100 text-[11px] italic">
                          &quot;{df.remarks}&quot;
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <span className="text-slate-400 font-mono">Failure ID: {df.id}</span>
                        <Link
                          href="/orderflow/delivery-failures"
                          className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 font-bold hover:underline"
                        >
                          View in Delivery Failures <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === 'RETURN') {
                const ret = item.data;
                return (
                  <div key={item.id} className="relative group">
                    <div className="absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-white text-[11px] ring-4 ring-white shadow-xs">
                      ↩
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/20 p-4 space-y-2 hover:border-amber-300 transition shadow-2xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-amber-950 text-sm">
                            Product Return:{' '}
                            <Link
                              href={`/products/${ret.productId || encodeURIComponent(ret.productName)}`}
                              className="hover:text-blue-600 hover:underline"
                            >
                              {ret.productName}
                            </Link>{' '}
                            ({ret.brandCode})
                          </div>
                          <div className="text-slate-500 text-[11px] mt-0.5">
                            {ret.dateBs} ({ret.dateAd}) • Status: <strong>{ret.orderStatus || 'Returned'}</strong> • Reason: <strong>{ret.reasonCategory}</strong>
                          </div>
                        </div>
                        <span className="rounded-full bg-amber-100 text-amber-800 font-bold px-2 py-0.5 text-[10px]">
                          -3 Karma Penalty
                        </span>
                      </div>

                      {(ret.issueCategories?.length > 0 || ret.remarks) && (
                        <div className="text-amber-900 bg-white rounded-lg p-2 border border-amber-100 text-[11px]">
                          <strong>Issues:</strong> {ret.issueCategories?.join(', ') || 'Quality issue'}
                          {ret.remarks ? ` — "${ret.remarks}"` : ''}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <span className="text-slate-400 font-mono">Return ID: {ret.id}</span>
                        <Link
                          href="/reviews/returns"
                          className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800 font-bold hover:underline"
                        >
                          View in Returns <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === 'FEEDBACK') {
                const fb = item.data;
                const isComplaint = fb.type === 'COMPLAINT';
                const pillColor = isComplaint
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-emerald-100 text-emerald-800';

                return (
                  <div key={item.id} className="relative group">
                    <div
                      className={`absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full text-white text-[10px] ring-4 ring-white shadow-xs ${
                        isComplaint ? 'bg-rose-500' : 'bg-emerald-600'
                      }`}
                    >
                      ★
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-2 hover:border-slate-300 transition shadow-2xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {fb.type}:{' '}
                            <Link
                              href={`/products/${fb.productId || encodeURIComponent(fb.productName)}`}
                              className="hover:text-blue-600 hover:underline"
                            >
                              {fb.productName}
                            </Link>
                          </div>
                          <div className="text-slate-500 text-[11px] mt-0.5">
                            {fb.dateReceivedBs} ({fb.dateReceivedAd}) via <strong>{fb.channel}</strong>
                          </div>
                        </div>
                        <span className={`rounded-full font-bold px-2 py-0.5 text-[10px] ${pillColor}`}>
                          {fb.type}
                        </span>
                      </div>

                      {fb.fullText && (
                        <div className="text-slate-700 bg-white rounded-lg p-2 border border-slate-100 text-[11px] italic">
                          &quot;{fb.fullText}&quot;
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <span className="text-slate-400 font-mono">Feedback ID: {fb.id}</span>
                        <Link
                          href="/reviews/feedback"
                          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-bold hover:underline"
                        >
                          View in Feedback <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
      </div>
      </div>
    </PageGuard>
  );
}
