'use client';

import Money from '@/components/common/Money';
import InfoTip from '@/components/common/InfoTip';
import { failureReasonLabel } from '@/lib/failure-reason';
import { countsAsSale } from '@/lib/order-status';
import React, { useState, useMemo, useEffect } from 'react';
import { phoneDigits } from '@/lib/customer-lookup';
import { cohortRetention, lifecycleMovements } from '@/lib/customer-cohorts';
import { channelLoyalty as channelLoyaltyOf, customerHistories, daysSince, purchaseCycles, repeatSteps } from '@/lib/customer-insights';
import Link from 'next/link';
import { customerBrandMap } from '@/lib/product-catalog';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { toast } from '@/components/common/Toast';
import { getTodayAd } from '@/lib/nepali-calendar';
import { Customer, Order, DeliveryFailure, ReturnEntry, FeedbackEntry } from '@/lib/types';
import {
  Users,
  TrendingDown,
  ArrowLeft,
  Layers,
  MapPin,
  DollarSign,
  Flame,
  RefreshCw,
  Activity,
  Clock,
} from 'lucide-react';
import ChurnPrediction from './sections/ChurnPrediction';
import WinBackList from './sections/WinBackList';
import KarmaTrendBoard from './sections/KarmaTrendBoard';
import RevenueConcentration from './sections/RevenueConcentration';
import RepeatFunnel from './sections/RepeatFunnel';
import CrossBrandMap from './sections/CrossBrandMap';
import CohortAnalysis from './sections/CohortAnalysis';
import SegmentMovement from './sections/SegmentMovement';
import GeographicIntel from './sections/GeographicIntel';

type TabCategory = 'ALL' | 'CHURN_WINBACK' | 'REVENUE_LTV' | 'BRAND_CHANNEL' | 'BEHAVIOR' | 'GEOGRAPHY';

export default function CustomerInsightsPage() {
  const [activeTab, setActiveTab] = useState<TabCategory>('ALL');
  const [contactedMap, setContactedMap] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshKey(key => key + 1);
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  // Core dynamic datasets from db service
  const customers: Customer[] = useMemo(() => db.getCustomers(), [refreshKey]);
  const orders: Order[] = useMemo(() => db.getOrders(), [refreshKey]);
  const deliveryFailures: DeliveryFailure[] = useMemo(() => db.getDeliveryFailures(), [refreshKey]);
  const returns: ReturnEntry[] = useMemo(() => db.getReturns(), [refreshKey]);
  const feedback: FeedbackEntry[] = useMemo(() => db.getFeedback(), [refreshKey]);

  const norm = (p?: string) => (p ? p.replace(/\D/g, '') : '');
  const TODAY_STR = getTodayAd();
  const TODAY_MS = new Date().getTime();

  // Helper: total spend for a given customer
  // Every figure below comes from each customer's real order history. Spend counts only orders
  // that are sales (not cancelled, failed or returned).
  const histories = useMemo(() => customerHistories(orders), [orders]);
  const customerSpendMap = useMemo(() => new Map([...histories].map(([phone, h]) => [phone, h.spend])), [histories]);
  const totalPlatformRevenue = useMemo(() => [...histories.values()].reduce((sum, h) => sum + h.spend, 0), [histories]);

  // Toggle win-back contacted state
  const toggleContacted = (id: string) => {
    setContactedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // -------------------------------------------------------------
  // 2a. CHURN PREDICTION
  // -------------------------------------------------------------
  const churnAnalysis = useMemo(() => {
    return customers
      .map((c) => {
        const h = histories.get(norm(c.phone));
        if (!h?.lastSale) return null;
        const daysInactive = daysSince(h.lastSale, TODAY_STR);
        // The most recent thing that went wrong for this customer, if anything did.
        const events = [
          ...returns.filter((r) => norm(r.customerPhone) === h.phone).map((r) => ({ date: r.dateAd || '', type: 'RETURN', text: `Return (${r.reasonCategory})`, action: 'Apologise and offer an exchange or a discount on the next order' })),
          ...feedback.filter((f) => norm(f.customerPhone) === h.phone && (f.type === 'COMPLAINT' || f.sentiment === 'NEGATIVE')).map((f) => ({ date: f.dateReceivedAd || '', type: 'COMPLAINT', text: 'Complaint logged', action: 'A senior call to close the complaint first' })),
          ...deliveryFailures.filter((f) => norm(f.customerPhone) === h.phone).map((f) => ({ date: f.dateAd || '', type: 'FAILURE', text: `Delivery failed (${failureReasonLabel(f)})`, action: 'Offer prepaid with priority delivery' })),
        ].sort((x, y) => y.date.localeCompare(x.date));
        const last = events[0];
        return {
          customer: c,
          daysInactive,
          prevFrequency: h.avgGap,
          lastExpType: last?.type || 'ORDER_SUCCESS',
          lastExpText: last?.text || 'Order delivered',
          recommendedAction: last?.action || (h.sales.length >= 5 ? 'Personal check-in from the team' : 'Tell them about new products, with a returning-customer offer'),
          isChurned: daysInactive >= 60,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item && item.isChurned)
      .sort((a, b) => b.customer.karmaScore - a.customer.karmaScore);
  }, [customers, histories, returns, deliveryFailures, feedback, TODAY_STR]);

  // -------------------------------------------------------------
  // 2b. REVENUE CONCENTRATION
  // -------------------------------------------------------------
  const revenueConcentration = useMemo(() => {
    const sorted = [...customers]
      .map((c) => {
        const spend = customerSpendMap.get(norm(c.phone)) || 0;
        const aov = c.totalOrders > 0 ? Math.round(spend / c.totalOrders) : 0;
        return {
          customer: c,
          spend,
          aov,
        };
      })
      .sort((a, b) => b.spend - a.spend);

    const topCount = Math.max(1, Math.ceil(sorted.length * 0.1));
    const topSlice = sorted.slice(0, Math.max(3, topCount));
    const topRevenue = topSlice.reduce((sum, item) => sum + item.spend, 0);
    const concentrationPct = totalPlatformRevenue > 0 ? Math.round((topRevenue / totalPlatformRevenue) * 100) : 0;

    return {
      topSlice,
      topCount,
      topRevenue,
      concentrationPct,
    };
  }, [customers, customerSpendMap, totalPlatformRevenue]);

  // -------------------------------------------------------------
  // 2c. CROSS-BRAND BEHAVIOR MAP
  // -------------------------------------------------------------
  // Brands each customer actually bought, from their orders.
  const crossBrandMap = useMemo(() => customerBrandMap(customers.map((c) => {
    const h = histories.get(norm(c.phone));
    return h ? { ...c, brandsPurchased: [...new Set(h.sales.map((o) => o.brandCode).filter(Boolean))] } : c;
  }), db.getBrands('ACTIVE'), db.getProducts()), [customers, histories]);

  // -------------------------------------------------------------
  // 2d. REPEAT PURCHASE FUNNEL
  // -------------------------------------------------------------
  const repeatFunnel = useMemo(() => {
    const [c1, c2, c3, c4, c5] = repeatSteps(histories);

    const p1 = 100;
    const p2 = c1 > 0 ? Math.round((c2 / c1) * 100) : 0;
    const p3 = c2 > 0 ? Math.round((c3 / c2) * 100) : 0;
    const p4 = c3 > 0 ? Math.round((c4 / c3) * 100) : 0;
    const p5 = c4 > 0 ? Math.round((c5 / c4) * 100) : 0;

    const drop1to2 = 100 - p2;
    const drop2to3 = 100 - p3;
    const drop3to4 = 100 - p4;
    const drop4to5 = 100 - p5;

    return {
      steps: [
        { label: '1st Order (First-time buyers)', count: c1, pct: p1, drop: 0 },
        { label: '2nd Order (First repeat)', count: c2, pct: Math.round((c2 / Math.max(1, c1)) * 100), drop: drop1to2 },
        { label: '3rd Order (Habitual buyers)', count: c3, pct: Math.round((c3 / Math.max(1, c1)) * 100), drop: drop2to3 },
        { label: '4th Order (Brand loyalists)', count: c4, pct: Math.round((c4 / Math.max(1, c1)) * 100), drop: drop3to4 },
        { label: '5+ Orders (VIP Champions)', count: c5, pct: Math.round((c5 / Math.max(1, c1)) * 100), drop: drop4to5 },
      ],
      biggestDrop: '1st Order to 2nd Order',
      biggestDropPct: drop1to2,
    };
  }, [histories]);

  // -------------------------------------------------------------
  // 2e. PURCHASE TIMING PATTERNS
  // -------------------------------------------------------------
  const timingPatterns = useMemo(() => {
    // Real average days between purchases per segment; null where nobody in it has bought twice.
    const cycles = purchaseCycles(histories, customers);
    const segmentCycles = { VIP: cycles.VIP, LOYAL: cycles.LOYAL, REGULAR: cycles.REGULAR, AT_RISK: cycles.AT_RISK };

    // Overdue: more than a week past their own usual gap (or their segment's, or everyone's).
    const overdueList = customers
      .filter((c) => c.segment !== 'BLACKLISTED')
      .flatMap((c) => {
        const h = histories.get(norm(c.phone));
        if (!h?.lastSale) return [];
        const cycle = h.avgGap ?? segmentCycles[c.segment as keyof typeof segmentCycles] ?? cycles.overall;
        if (cycle === null || cycle === undefined) return [];
        const since = daysSince(h.lastSale, TODAY_STR);
        const overdueBy = since - (cycle + 7);
        return overdueBy > 0 ? [{ customer: c, cycle, daysSince: since, overdueBy, isOverdue: true }] : [];
      })
      .sort((a, b) => b.overdueBy - a.overdueBy);

    return { segmentCycles, overdueList, samples: cycles.samples };
  }, [customers, histories, TODAY_STR]);

  // -------------------------------------------------------------
  // 2f. COHORT ANALYSIS
  // -------------------------------------------------------------
  // Real cohorts from order dates (first order month), not sample figures.
  const cohortData = useMemo(() => cohortRetention(orders, getTodayAd()), [orders]);

  // -------------------------------------------------------------
  // 2g. CHANNEL LOYALTY
  // -------------------------------------------------------------
  const channelLoyalty = useMemo(() => channelLoyaltyOf(histories, customers, orders), [histories, customers, orders]);

  // -------------------------------------------------------------
  // 2h. KARMA TREND BOARD
  // -------------------------------------------------------------
  const karmaTrendBoard = useMemo(() => {
    // Lowest scores and what actually pulled them down (counted from orders, failures, returns and complaints).
    return customers
      .filter((c) => c.karmaScore <= 60 || c.activeFlags.length > 0 || c.segment === 'AT_RISK' || c.segment === 'BLACKLISTED')
      .map((c) => {
        const h = histories.get(norm(c.phone));
        const list = h?.orders || [];
        const failed = list.filter((o) => o.status === 'FAILED').length;
        const cancelled = list.filter((o) => o.status === 'CANCELLED').length;
        const returned = returns.filter((r) => norm(r.customerPhone) === norm(c.phone)).length;
        const complaints = feedback.filter((f) => norm(f.customerPhone) === norm(c.phone) && f.type === 'COMPLAINT').length;
        const parts = [
          failed && `${failed} failed ${failed === 1 ? 'delivery' : 'deliveries'}`,
          returned && `${returned} ${returned === 1 ? 'return' : 'returns'}`,
          cancelled && `${cancelled} ${cancelled === 1 ? 'cancellation' : 'cancellations'}`,
          complaints && `${complaints} ${complaints === 1 ? 'complaint' : 'complaints'}`,
        ].filter(Boolean) as string[];
        const lastSale = h?.lastSale;
        return {
          customer: c,
          currentKarma: c.karmaScore,
          reason: parts.length ? parts.join(', ') : lastSale ? `No order for ${daysSince(lastSale, TODAY_STR)} days` : 'No completed order yet',
          action: c.segment === 'BLACKLISTED' || failed + cancelled >= 2 ? 'Take prepaid orders only' : complaints ? 'Call to close the complaint' : 'Call to check in',
        };
      })
      .sort((a, b) => a.currentKarma - b.currentKarma);
  }, [customers, histories, returns, feedback, TODAY_STR]);

  // -------------------------------------------------------------
  // 2i. WIN-BACK LIST (Dormant 60+ days, Karma >= 70, Orders >= 2)
  // -------------------------------------------------------------
  const winBackList = useMemo(() => {
    return customers
      .filter((c) => {
        const h = histories.get(norm(c.phone));
        return !!h?.lastSale && daysSince(h.lastSale, TODAY_STR) >= 60 && c.karmaScore >= 70 && h.sales.length >= 2;
      })
      .map((c) => {
        const daysInactive = daysSince(histories.get(norm(c.phone))!.lastSale!, TODAY_STR);
        const spend = customerSpendMap.get(norm(c.phone)) || 0;
        const brand = c.brandsPurchased?.[0] || 'Not recorded';

        const suggestedOffer = 'Review purchase history and choose an active offer from Promotions.';

        return {
          customer: c,
          spend,
          daysInactive,
          brand,
          suggestedOffer,
        };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [customers, customerSpendMap, histories, TODAY_STR]);

  // -------------------------------------------------------------
  // 2j. GEOGRAPHIC INTELLIGENCE
  // -------------------------------------------------------------
  const geographicIntel = useMemo(() => {
    const cityMap: Record<
      string,
      { province: string; count: number; orders: number; revenue: number; brands: Record<string, number>; karmaSum: number }
    > = {};

    customers.forEach((c) => {
      const city = c.city || 'City not recorded';
      const prov = c.province || 'Not recorded';
      if (!cityMap[city]) {
        cityMap[city] = { province: prov, count: 0, orders: 0, revenue: 0, brands: {}, karmaSum: 0 };
      }
      cityMap[city].count++;
      cityMap[city].orders += histories.get(norm(c.phone))?.sales.length || 0;
      cityMap[city].karmaSum += c.karmaScore;
      const spend = customerSpendMap.get(norm(c.phone)) || 0;
      cityMap[city].revenue += spend;

      (c.brandsPurchased || []).forEach((b) => {
        cityMap[city].brands[b] = (cityMap[city].brands[b] || 0) + 1;
      });
    });

    // Orders from each city, last 30 days against the 30 before.
    const cityByPhone = new Map(customers.map((c) => [norm(c.phone), c.city || 'City not recorded']));
    const recent: Record<string, { now: number; before: number }> = {};
    for (const order of orders) {
      if (!countsAsSale(order)) continue;
      const city = cityByPhone.get(norm(order.customerPhone));
      const time = Date.parse(`${(order.orderDateAd || '').slice(0, 10)}T00:00:00Z`);
      if (!city || Number.isNaN(time)) continue;
      const age = (TODAY_MS - time) / 86400000;
      const bucket = (recent[city] ||= { now: 0, before: 0 });
      if (age <= 30) bucket.now += 1; else if (age <= 60) bucket.before += 1;
    }

    const rows = Object.entries(cityMap).map(([city, d]) => {
      let topBrand = 'Not recorded';
      let maxB = 0;
      Object.entries(d.brands).forEach(([b, cnt]) => {
        if (cnt > maxB) {
          maxB = cnt;
          topBrand = db.getBrands().find(brand => brand.code === b)?.name || b;
        }
      });

      const avgKarma = Math.round(d.karmaSum / Math.max(1, d.count));
      const span = recent[city];
      const growth = !span || (span.now === 0 && span.before === 0) ? '—'
        : span.before === 0 ? 'New'
        : `${span.now >= span.before ? '+' : ''}${Math.round(((span.now - span.before) / span.before) * 100)}%`;

      return {
        city,
        province: d.province,
        customers: d.count,
        orders: d.orders,
        revenue: d.revenue,
        growth,
        topBrand,
        avgKarma,
        isOutsideValley: city !== 'City not recorded' && !['Kathmandu', 'Lalitpur', 'Bhaktapur'].includes(city),
      };
    });

    return rows.sort((a, b) => b.revenue - a.revenue);
  }, [customers, customerSpendMap, histories, orders, TODAY_MS]);

  // -------------------------------------------------------------
  // 2k. PRODUCT AFFINITY BY SEGMENT
  // -------------------------------------------------------------
  const productAffinity = useMemo(() => {
    const computeTopProductsForSegment = (segmentKey: string) => {
      const segCustomers = customers.filter((c) => c.segment === segmentKey);
      const segPhones = new Set(segCustomers.map((c) => phoneDigits(c.phone)));
      const segOrders = orders.filter((o) => countsAsSale(o) && segPhones.has(phoneDigits(o.customerPhone)));
      const prodMap: Record<string, { count: number; brand: string }> = {};

      segOrders.forEach((o) => {
        o.items?.forEach((it) => {
          if (!prodMap[it.productName]) {
            prodMap[it.productName] = { count: 0, brand: o.brandCode || 'General' };
          }
          prodMap[it.productName].count += it.quantity;
        });
      });

      const totalItems = Object.values(prodMap).reduce((s, p) => s + p.count, 0);
      return Object.entries(prodMap)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3)
        .map(([name, data]) => ({
          name,
          share: totalItems > 0 ? `${Math.round((data.count / totalItems) * 100)}% share` : '—',
          brand: data.brand,
        }));
    };

    return [
      {
        segment: 'VIP Champions',
        badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
        kpi: 'High Basket Size & Multi-Brand',
        topProducts: computeTopProductsForSegment('VIP'),
        strategy: 'Pitch premium bundle gift kits and early access to newly launched SKUs.',
      },
      {
        segment: 'Loyal Regulars',
        badgeColor: 'bg-blue-100 text-blue-900 border-blue-300',
        kpi: 'Predictable Monthly Repeat',
        topProducts: computeTopProductsForSegment('LOYAL'),
        strategy: 'Prompt recurring 30-day refills via automated WhatsApp reminder sequences.',
      },
      {
        segment: 'New / First-Time Buyers',
        badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        kpi: 'Low Friction Conversion',
        topProducts: computeTopProductsForSegment('NEW'),
        strategy: 'Send immediate Day-5 post-delivery usage tips to trigger second conversion.',
      },
      {
        segment: 'At-Risk / Dormant',
        badgeColor: 'bg-rose-100 text-rose-900 border-rose-300',
        kpi: 'Drop-off & Churn Candidates',
        topProducts: computeTopProductsForSegment('AT_RISK'),
        strategy: 'Reactivate with low-AOV hero refills or apology coupon bundles.',
      },
    ];
  }, [customers, orders]);

  // -------------------------------------------------------------
  // 2l. LTV DISTRIBUTION
  // -------------------------------------------------------------
  const ltvDistribution = useMemo(() => {
    let b1 = 0; // < 1k
    let b2 = 0; // 1k - 3k
    let b3 = 0; // 3k - 5k
    let b4 = 0; // 5k - 10k
    let b5 = 0; // 10k+

    let totalSpendSum = 0;

    customers.forEach((c) => {
      const spend = customerSpendMap.get(norm(c.phone)) || 0;
      totalSpendSum += spend;
      if (spend < 1000) b1++;
      else if (spend <= 3000) b2++;
      else if (spend <= 5000) b3++;
      else if (spend <= 10000) b4++;
      else b5++;
    });

    const total = Math.max(1, customers.length);
    const avgLtv = Math.round(totalSpendSum / total);

    return {
      avgLtv,
      brackets: [
        { label: 'NPR < 1,000', count: b1, pct: Math.round((b1 / total) * 100), color: 'bg-slate-300' },
        { label: 'NPR 1,000 - 3,000', count: b2, pct: Math.round((b2 / total) * 100), color: 'bg-blue-400' },
        { label: 'NPR 3,000 - 5,000', count: b3, pct: Math.round((b3 / total) * 100), color: 'bg-indigo-500' },
        { label: 'NPR 5,000 - 10,000', count: b4, pct: Math.round((b4 / total) * 100), color: 'bg-purple-600' },
        { label: 'NPR 10,000+', count: b5, pct: Math.round((b5 / total) * 100), color: 'bg-amber-500' },
      ],
    };
  }, [customers, customerSpendMap]);

  // -------------------------------------------------------------
  // 2m. SEGMENT MOVEMENT TRACKER (Last 30 Days)
  // -------------------------------------------------------------
  const segmentMovements = useMemo(() => lifecycleMovements(orders, getTodayAd()), [orders]);

  return (
    <PageGuard feature="customers">
      <div className="space-y-8 pb-16 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Customer intelligence', href: '/customers' },
          { label: 'Cohort insights' },
        ]}
      />

      {/* Header with quick stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/customers"
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition"
              title="Return to customer directory"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="flex items-center gap-1.5 text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  Cohort insights
<InfoTip label="About this page">Churn forecasting, revenue concentration, brand synergy, and karma trajectories.</InfoTip></h1>
              </div>
              
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/customers"
            className="btn btn-secondary"
          >
            <Users className="h-3.5 w-3.5 text-slate-500" />
            Customer 360 Directory
          </Link>
          <button
            onClick={() => {
              setRefreshKey((k) => k + 1);
              toast.success('Customer metrics recalculated.');
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition cursor-pointer"
            title="Re-calculate customer analytics"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-calculate
          </button>
        </div>
      </div>

      {/* KPI Top Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold text-slate-500">Customer base</span>
            <Users className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{customers.length}</div>
          <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
            <span className="font-bold text-emerald-600">
              {customers.filter((c) => c.segment === 'VIP' || c.segment === 'LOYAL').length}
            </span>{' '}
            in VIP / Loyal tiers
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-[11px] font-semibold text-rose-800">Churn risk (60d+)</span>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-rose-900">{churnAnalysis.length}</div>
          <div className="mt-1 text-[11px] text-rose-700 font-medium">High-value dormant profiles</div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-blue-400">
            <span className="text-[11px] font-semibold text-blue-800">Top 10% revenue</span>
            <Flame className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-blue-950">{revenueConcentration.concentrationPct}%</div>
          <div className="mt-1 text-[11px] text-blue-700">Driven by {revenueConcentration.topSlice.length} VIP buyers</div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-purple-400">
            <span className="text-[11px] font-semibold text-purple-800">Cross-Brand</span>
            <Layers className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {crossBrandMap.multiBrand}
          </div>
          <div className="mt-1 text-[11px] text-purple-700">Multi-brand household buyers</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold text-slate-500">Average LTV</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            <Money>{ltvDistribution.avgLtv.toLocaleString()}</Money>
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 font-bold">Lifetime Value per customer</div>
        </div>
      </div>

      {/* Navigation Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 p-1.5 border border-slate-200">
        {[
          { key: 'ALL', label: 'All insights', icon: Activity },
          { key: 'CHURN_WINBACK', label: 'Churn & win-back', icon: TrendingDown },
          { key: 'REVENUE_LTV', label: 'Revenue & LTV', icon: DollarSign },
          { key: 'BRAND_CHANNEL', label: 'Brands & channels', icon: Layers },
          { key: 'BEHAVIOR', label: 'Cycles & cohorts', icon: Clock },
          { key: 'GEOGRAPHY', label: 'Geographic intelligence', icon: MapPin },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabCategory)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                isActive
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: CHURN & RETENTION SUITE                                       */}
      {/* ========================================================================= */}
      {(activeTab === 'ALL' || activeTab === 'CHURN_WINBACK') && (
        <div className="space-y-8">
          <ChurnPrediction churnAnalysis={churnAnalysis} />
          <WinBackList
            winBackList={winBackList}
            contactedMap={contactedMap}
            toggleContacted={toggleContacted}
          />
          <KarmaTrendBoard karmaTrendBoard={karmaTrendBoard} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: REVENUE, FUNNELS & LTV SUITE                                   */}
      {/* ========================================================================= */}
      {(activeTab === 'ALL' || activeTab === 'REVENUE_LTV') && (
        <div className="space-y-8">
          <RevenueConcentration
            revenueConcentration={revenueConcentration}
            ltvDistribution={ltvDistribution}
          />
          <RepeatFunnel repeatFunnel={repeatFunnel} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: BRANDS & CHANNELS SUITE                                       */}
      {/* ========================================================================= */}
      {(activeTab === 'ALL' || activeTab === 'BRAND_CHANNEL') && (
        <CrossBrandMap
          crossBrandMap={crossBrandMap}
          channelLoyalty={channelLoyalty}
          productAffinity={productAffinity}
        />
      )}

      {/* ========================================================================= */}
      {/* SECTION 4: BEHAVIOR, CYCLES & COHORTS                                     */}
      {/* ========================================================================= */}
      {(activeTab === 'ALL' || activeTab === 'BEHAVIOR') && (
        <div className="space-y-8">
          <CohortAnalysis timingPatterns={timingPatterns} cohortData={cohortData} />
          <SegmentMovement segmentMovements={segmentMovements} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 5: GEOGRAPHIC INTELLIGENCE                                       */}
      {/* ========================================================================= */}
      {(activeTab === 'ALL' || activeTab === 'GEOGRAPHY') && (
        <GeographicIntel geographicIntel={geographicIntel} />
      )}
      </div>
    </PageGuard>
  );
}
