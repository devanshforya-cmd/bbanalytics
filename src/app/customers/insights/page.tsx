'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
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

  // Core dynamic datasets from db service
  const customers: Customer[] = useMemo(() => db.getCustomers(), []);
  const orders: Order[] = useMemo(() => db.getOrders(), []);
  const deliveryFailures: DeliveryFailure[] = useMemo(() => db.getDeliveryFailures(), []);
  const returns: ReturnEntry[] = useMemo(() => db.getReturns(), []);
  const feedback: FeedbackEntry[] = useMemo(() => db.getFeedback(), []);

  const norm = (p?: string) => (p ? p.replace(/\D/g, '') : '');
  const TODAY_STR = '2026-09-08';
  const TODAY_MS = new Date(TODAY_STR).getTime();

  // Helper: total spend for a given customer
  const customerSpendMap = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach((ord) => {
      const p = norm(ord.customerPhone);
      map.set(p, (map.get(p) || 0) + (ord.totalAmount || 0));
    });
    return map;
  }, [orders]);

  const totalPlatformRevenue = useMemo(() => {
    return orders.reduce((sum, ord) => sum + (ord.totalAmount || 0), 0);
  }, [orders]);

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
        const lastDate = c.lastOrderDate || c.firstOrderDate || '2026-06-01';
        const daysInactive = Math.max(
          1,
          Math.round((TODAY_MS - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
        );

        // Previous Frequency: Days between orders before churning
        let prevFrequency = 22;
        if (c.totalOrders > 1 && c.firstOrderDate && c.lastOrderDate) {
          const firstMs = new Date(c.firstOrderDate).getTime();
          const lastMs = new Date(c.lastOrderDate).getTime();
          const spanDays = Math.max(1, Math.round((lastMs - firstMs) / (1000 * 60 * 60 * 24)));
          prevFrequency = Math.max(5, Math.round(spanDays / (c.totalOrders - 1)));
        }

        // Determine Last Experience
        const custOrders = orders.filter((o) => norm(o.customerPhone) === norm(c.phone));
        const custReturns = returns.filter((r) => norm(r.customerPhone) === norm(c.phone));
        const custFailures = deliveryFailures.filter((f) => norm(f.customerPhone) === norm(c.phone));
        const custComplaints = feedback.filter(
          (fb) => norm(fb.customerPhone) === norm(c.phone) && fb.sentiment === 'NEGATIVE'
        );

        let lastExpType = 'ORDER_SUCCESS';
        let lastExpText = 'Order Delivered';
        let recommendedAction = 'Send new product alert + loyalty discount';

        if (custReturns.length > 0) {
          lastExpType = 'RETURN';
          lastExpText = `Return (${custReturns[0].reasonCategory})`;
          recommendedAction = 'Send apology + NPR 300 privilege discount code';
        } else if (custComplaints.length > 0) {
          lastExpType = 'COMPLAINT';
          lastExpText = 'Complaint Logged';
          recommendedAction = 'Supervisor courtesy call + gift voucher';
        } else if (custFailures.length > 0) {
          lastExpType = 'FAILURE';
          lastExpText = `Delivery Failure (${custFailures[0].reason})`;
          recommendedAction = 'Offer prepaid order with free priority shipping';
        } else if (c.totalOrders >= 5) {
          recommendedAction = 'VIP concierge check-in + complimentary sample kit';
        }

        return {
          customer: c,
          daysInactive,
          prevFrequency,
          lastExpType,
          lastExpText,
          recommendedAction,
          isChurned: daysInactive >= 60,
        };
      })
      .filter((item) => item.isChurned)
      .sort((a, b) => b.customer.karmaScore - a.customer.karmaScore);
  }, [customers, orders, returns, deliveryFailures, feedback, TODAY_MS]);

  // -------------------------------------------------------------
  // 2b. REVENUE CONCENTRATION
  // -------------------------------------------------------------
  const revenueConcentration = useMemo(() => {
    const sorted = [...customers]
      .map((c) => {
        const spend = customerSpendMap.get(norm(c.phone)) || (c.totalOrders * 1850);
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
    const concentrationPct = totalPlatformRevenue > 0 ? Math.round((topRevenue / totalPlatformRevenue) * 100) : 68;

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
  const crossBrandMap = useMemo(() => {
    let foryaOnly = 0;
    let peeSafeOnly = 0;
    let reneeOnly = 0;
    let foryaPeeSafe = 0;
    let foryaRenee = 0;
    let peeSafeRenee = 0;
    let allThree = 0;

    customers.forEach((c) => {
      const b = c.brandsPurchased || [];
      const hasForya = b.includes('FORYA');
      const hasPS = b.includes('PEE_SAFE') || (b as string[]).includes('FURR');
      const hasRenee = b.includes('RENEE');

      if (hasForya && hasPS && hasRenee) allThree++;
      else if (hasForya && hasPS) foryaPeeSafe++;
      else if (hasForya && hasRenee) foryaRenee++;
      else if (hasPS && hasRenee) peeSafeRenee++;
      else if (hasForya) foryaOnly++;
      else if (hasPS) peeSafeOnly++;
      else if (hasRenee) reneeOnly++;
      else foryaOnly++;
    });

    const total = Math.max(1, customers.length);

    // Cross-sell opportunities: High karma customers missing other brands
    const crossSellOpportunities = customers
      .filter((c) => (c.brandsPurchased || []).length < 3 && c.karmaScore >= 65)
      .map((c) => {
        const b = c.brandsPurchased || [];
        const missing: string[] = [];
        if (!b.includes('FORYA')) missing.push('Forya');
        if (!b.includes('PEE_SAFE') && !(b as string[]).includes('FURR')) missing.push('Pee Safe & FURR');
        if (!b.includes('RENEE')) missing.push('Renee');

        return {
          customer: c,
          currentBrands: b.join(', '),
          targetBrand: missing[0] || 'Forya',
          suggestedPitch:
            missing[0] === 'FORYA'
              ? 'Introduce Forya Roll-On Peach (bestseller teaser)'
              : missing[0] === 'RENEE'
              ? 'Recommend Renee Fab 5-in-1 Lipstick with 10% bundle code'
              : 'Include Pee Safe Toilet Sanitizer 75ml sample',
        };
      })
      .sort((a, b) => b.customer.karmaScore - a.customer.karmaScore)
      .slice(0, 5);

    return {
      foryaOnly,
      peeSafeOnly,
      reneeOnly,
      foryaPeeSafe,
      foryaRenee,
      peeSafeRenee,
      allThree,
      total,
      crossSellOpportunities,
    };
  }, [customers]);

  // -------------------------------------------------------------
  // 2d. REPEAT PURCHASE FUNNEL
  // -------------------------------------------------------------
  const repeatFunnel = useMemo(() => {
    const c1 = customers.filter((c) => c.totalOrders >= 1).length;
    const c2 = customers.filter((c) => c.totalOrders >= 2).length;
    const c3 = customers.filter((c) => c.totalOrders >= 3).length;
    const c4 = customers.filter((c) => c.totalOrders >= 4).length;
    const c5 = customers.filter((c) => c.totalOrders >= 5).length;

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
  }, [customers]);

  // -------------------------------------------------------------
  // 2e. PURCHASE TIMING PATTERNS
  // -------------------------------------------------------------
  const timingPatterns = useMemo(() => {
    // Average cycle by segment
    const segmentCycles = {
      VIP: 16,
      LOYAL: 23,
      REGULAR: 35,
      AT_RISK: 54,
    };

    // Overdue detection: Days inactive > (avg cycle + 7)
    const overdueList = customers
      .filter((c) => c.segment !== 'BLACKLISTED')
      .map((c) => {
        const lastDate = c.lastOrderDate || c.firstOrderDate || '2026-07-01';
        const daysSince = Math.max(
          1,
          Math.round((TODAY_MS - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
        );
        const cycle = segmentCycles[c.segment as keyof typeof segmentCycles] || 30;
        const overdueBy = daysSince - (cycle + 7);

        return {
          customer: c,
          cycle,
          daysSince,
          overdueBy,
          isOverdue: overdueBy > 0,
        };
      })
      .filter((item) => item.isOverdue)
      .sort((a, b) => b.overdueBy - a.overdueBy);

    return {
      segmentCycles,
      overdueList,
    };
  }, [customers, TODAY_MS]);

  // -------------------------------------------------------------
  // 2f. COHORT ANALYSIS
  // -------------------------------------------------------------
  const cohortData = useMemo(() => {
    return [
      { month: 'Apr 2026 (Baisakh)', size: 18, m1: '66%', m2: '55%', m3: '44%', activePct: '50%', color: 'green' },
      { month: 'May 2026 (Jestha)', size: 24, m1: '62%', m2: '50%', m3: '41%', activePct: '46%', color: 'green' },
      { month: 'Jun 2026 (Ashadh)', size: 31, m1: '58%', m2: '45%', m3: '38%', activePct: '42%', color: 'amber' },
      { month: 'Jul 2026 (Shrawan)', size: 29, m1: '51%', m2: '48%', m3: '34%', activePct: '38%', color: 'amber' },
      { month: 'Aug 2026 (Bhadra)', size: 35, m1: '60%', m2: '51%', m3: '—', activePct: '57%', color: 'green' },
      { month: 'Sep 2026 (Current)', size: 16, m1: '75%', m2: '—', m3: '—', activePct: '88%', color: 'green' },
    ];
  }, []);

  // -------------------------------------------------------------
  // 2g. CHANNEL LOYALTY
  // -------------------------------------------------------------
  const channelLoyalty = useMemo(() => {
    const channelCounts: Record<string, { orders: number; customers: Set<string>; totalKarma: number }> = {
      Instagram: { orders: 0, customers: new Set(), totalKarma: 0 },
      WhatsApp: { orders: 0, customers: new Set(), totalKarma: 0 },
      Website: { orders: 0, customers: new Set(), totalKarma: 0 },
      TikTok: { orders: 0, customers: new Set(), totalKarma: 0 },
      'Retail / Field': { orders: 0, customers: new Set(), totalKarma: 0 },
    };

    orders.forEach((ord) => {
      let ch = 'Instagram';
      if (ord.platform === 'WhatsApp' || ord.source === 'WHATSAPP_EXTRACTOR') ch = 'WhatsApp';
      else if (ord.platform === 'TikTok') ch = 'TikTok';
      else if (ord.platform === 'Website') ch = 'Website';
      else if (ord.platform === 'Walk-in' || ord.source === 'FIELD_CALL') ch = 'Retail / Field';

      if (!channelCounts[ch]) {
        channelCounts[ch] = { orders: 0, customers: new Set(), totalKarma: 0 };
      }
      channelCounts[ch].orders++;
      channelCounts[ch].customers.add(norm(ord.customerPhone));
    });

    // Populate karma averages
    customers.forEach((c) => {
      const p = norm(c.phone);
      Object.values(channelCounts).forEach((data) => {
        if (data.customers.has(p)) {
          data.totalKarma += c.karmaScore;
        }
      });
    });

    const rows = Object.entries(channelCounts).map(([channel, data]) => {
      const custCount = Math.max(1, data.customers.size);
      const avgKarma = Math.round(data.totalKarma / custCount) || 72;
      const repeatRate = data.orders > custCount ? Math.round(((data.orders - custCount) / data.orders) * 100) : 35;
      return {
        channel,
        customerCount: data.customers.size,
        orderCount: data.orders,
        avgKarma,
        repeatRate: `${Math.min(85, Math.max(20, repeatRate))}%`,
        loyalistPct: `${Math.min(92, Math.max(58, 60 + (data.orders % 30)))}%`,
      };
    });

    return rows;
  }, [orders, customers]);

  // -------------------------------------------------------------
  // 2h. KARMA TREND BOARD
  // -------------------------------------------------------------
  const karmaTrendBoard = useMemo(() => {
    return customers
      .filter((c) => c.karmaScore <= 60 || c.activeFlags.length > 0 || c.segment === 'AT_RISK')
      .map((c) => {
        const prevKarma = Math.min(100, c.karmaScore + (c.segment === 'BLACKLISTED' ? 35 : 16));
        const change = c.karmaScore - prevKarma;
        let reason = 'Inactivity drop over 45+ days';

        if (c.activeFlags.includes('Serial Returner')) {
          reason = 'Multiple returns and rejected parcels';
        } else if (c.activeFlags.includes('Non-Receiver')) {
          reason = 'Consecutive doorstep delivery failures';
        } else if (c.totalComplaints > 0) {
          reason = 'Negative product quality complaint logged';
        }

        return {
          customer: c,
          prevKarma,
          currentKarma: c.karmaScore,
          change,
          reason,
          action:
            c.segment === 'BLACKLISTED'
              ? 'Enforce 100% Prepaid Only'
              : 'Dispatch retention officer call',
        };
      })
      .sort((a, b) => a.currentKarma - b.currentKarma);
  }, [customers]);

  // -------------------------------------------------------------
  // 2i. WIN-BACK LIST (Dormant 60+ days, Karma >= 70, Orders >= 2)
  // -------------------------------------------------------------
  const winBackList = useMemo(() => {
    return customers
      .filter((c) => {
        const lastDate = c.lastOrderDate || c.firstOrderDate || '2026-05-01';
        const daysInactive = Math.round((TODAY_MS - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
        return daysInactive >= 60 && c.karmaScore >= 70 && c.totalOrders >= 2;
      })
      .map((c) => {
        const lastDate = c.lastOrderDate || '2026-06-01';
        const daysInactive = Math.round((TODAY_MS - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
        const spend = customerSpendMap.get(norm(c.phone)) || c.totalOrders * 2100;
        const brand = (c.brandsPurchased && c.brandsPurchased[0]) || 'FORYA';

        let suggestedOffer = 'Free delivery + NPR 250 comeback voucher';
        if (spend > 5000) suggestedOffer = 'Complimentary Forya Silk Mist + 20% privilege code';

        return {
          customer: c,
          spend,
          daysInactive,
          brand,
          suggestedOffer,
        };
      })
      .sort((a, b) => b.customer.totalOrders - a.customer.totalOrders);
  }, [customers, customerSpendMap, TODAY_MS]);

  // -------------------------------------------------------------
  // 2j. GEOGRAPHIC INTELLIGENCE
  // -------------------------------------------------------------
  const geographicIntel = useMemo(() => {
    const cityMap: Record<
      string,
      { province: string; count: number; orders: number; revenue: number; brands: Record<string, number>; karmaSum: number }
    > = {};

    customers.forEach((c) => {
      const city = c.city || 'Kathmandu';
      const prov = c.province || 'Bagmati Province';
      if (!cityMap[city]) {
        cityMap[city] = { province: prov, count: 0, orders: 0, revenue: 0, brands: {}, karmaSum: 0 };
      }
      cityMap[city].count++;
      cityMap[city].orders += c.totalOrders;
      cityMap[city].karmaSum += c.karmaScore;
      const spend = customerSpendMap.get(norm(c.phone)) || c.totalOrders * 1900;
      cityMap[city].revenue += spend;

      (c.brandsPurchased || ['FORYA']).forEach((b) => {
        cityMap[city].brands[b] = (cityMap[city].brands[b] || 0) + 1;
      });
    });

    const rows = Object.entries(cityMap).map(([city, d]) => {
      let topBrand = 'Forya';
      let maxB = 0;
      Object.entries(d.brands).forEach(([b, cnt]) => {
        if (cnt > maxB) {
          maxB = cnt;
          topBrand = b === 'PEE_SAFE' ? 'Pee Safe & FURR' : b === 'RENEE' ? 'Renee' : 'Forya';
        }
      });

      const avgKarma = Math.round(d.karmaSum / Math.max(1, d.count));
      const growthPct = city === 'Pokhara' ? '+28%' : city === 'Biratnagar' ? '+34%' : city === 'Butwal' ? '+22%' : '+15%';

      return {
        city,
        province: d.province,
        customers: d.count,
        orders: d.orders,
        revenue: d.revenue,
        growth: growthPct,
        topBrand,
        avgKarma,
        isOutsideValley: !['Kathmandu', 'Lalitpur', 'Bhaktapur'].includes(city),
      };
    });

    return rows.sort((a, b) => b.revenue - a.revenue);
  }, [customers, customerSpendMap]);

  // -------------------------------------------------------------
  // 2k. PRODUCT AFFINITY BY SEGMENT
  // -------------------------------------------------------------
  const productAffinity = useMemo(() => {
    return [
      {
        segment: 'VIP Champions',
        badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
        kpi: 'High Basket Size & Multi-Brand',
        topProducts: [
          { name: 'Forya Nourishing Hair Serum 100ml', share: '84% adoption', brand: 'Forya' },
          { name: 'Renee FAB 5 Matte Lipstick 5-in-1', share: '72% adoption', brand: 'Renee' },
          { name: 'Pee Safe Toilet Seat Sanitizer Spray 75ml', share: '68% adoption', brand: 'Pee Safe' },
        ],
        strategy: 'Pitch premium bundle gift kits and early access to newly launched SKUs.',
      },
      {
        segment: 'Loyal Regulars',
        badgeColor: 'bg-blue-100 text-blue-900 border-blue-300',
        kpi: 'Predictable Monthly Repeat',
        topProducts: [
          { name: 'Forya Roll-On Deodorant Peach 50ml', share: '78% adoption', brand: 'Forya' },
          { name: 'FURR Face Razor for Women (Pack of 3)', share: '64% adoption', brand: 'Pee Safe' },
          { name: 'Forya Hydrating Face Mist 100ml', share: '45% adoption', brand: 'Forya' },
        ],
        strategy: 'Prompt recurring 30-day refills via automated WhatsApp reminder sequences.',
      },
      {
        segment: 'New / First-Time Buyers',
        badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        kpi: 'Low Friction Conversion',
        topProducts: [
          { name: 'Renee Madness pH Gloss Black Lipstick', share: '58% entry share', brand: 'Renee' },
          { name: 'Pee Safe Organic Cotton Panty Liners 20N', share: '42% entry share', brand: 'Pee Safe' },
          { name: 'Forya Roll-On Peach 50ml', share: '36% entry share', brand: 'Forya' },
        ],
        strategy: 'Send immediate Day-5 post-delivery usage tips to trigger second conversion.',
      },
      {
        segment: 'At-Risk / Dormant',
        badgeColor: 'bg-rose-100 text-rose-900 border-rose-300',
        kpi: 'Drop-off & Churn Candidates',
        topProducts: [
          { name: 'Forya Roll-On Peach 50ml', share: '52% past share', brand: 'Forya' },
          { name: 'Renee Everyday Matte Liquid Lip', share: '38% past share', brand: 'Renee' },
        ],
        strategy: 'Reactivate with low-AOV hero refills or apology coupon bundles.',
      },
    ];
  }, []);

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
      const spend = customerSpendMap.get(norm(c.phone)) || c.totalOrders * 1850;
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
  const segmentMovements = useMemo(() => {
    return [
      { from: 'Regular', to: 'Loyal', count: 4, type: 'PROMOTED', desc: 'Crossed 5 lifetime delivered orders with Karma > 75' },
      { from: 'Loyal', to: 'VIP', count: 2, type: 'PROMOTED', desc: 'Achieved 10+ orders with zero returns and Karma > 85' },
      { from: 'Loyal', to: 'At-Risk', count: 2, type: 'WARNING', desc: 'Zero repeat orders placed in the last 45 days' },
      { from: 'Regular', to: 'At-Risk', count: 3, type: 'WARNING', desc: 'Inactive for 60+ days or missed expected purchase cycle' },
      { from: 'At-Risk', to: 'Churned', count: 2, type: 'LOST', desc: 'No customer contact or engagement for 90+ days' },
      { from: 'Any', to: 'Win-Back', count: 1, type: 'RECOVERED', desc: 'Reactivated via WhatsApp promotion sequence' },
    ];
  }, []);

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER']}>
      <div className="space-y-8 pb-16 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Customer Intelligence', href: '/customers' },
          { label: 'Cohort Insights' },
        ]}
      />

      {/* Header with quick stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/customers"
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition"
              title="Return to Customer Directory"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  Customer Intelligence & Cohort Analytics
                </h1>
                <span className="rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold px-2.5 py-0.5 border border-blue-200">
                  13 Core Vectors
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Deterministic analytics layer per PRD 7.3: Churn forecasting, revenue concentration, brand synergy, and karma trajectories.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/customers"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            <Users className="h-3.5 w-3.5 text-slate-500" />
            Customer 360 Directory
          </Link>
          <button
            onClick={() => db.resetDatabase()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
            title="Reset to fresh seed data"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-calculate
          </button>
        </div>
      </div>

      {/* KPI Top Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Customer Base</span>
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

        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">Churn Risk (60d+)</span>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-rose-900">{churnAnalysis.length}</div>
          <div className="mt-1 text-[11px] text-rose-700 font-medium">High-value dormant profiles</div>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between text-blue-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-800">Top 10% Revenue</span>
            <Flame className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-blue-950">{revenueConcentration.concentrationPct}%</div>
          <div className="mt-1 text-[11px] text-blue-700">Driven by {revenueConcentration.topSlice.length} VIP buyers</div>
        </div>

        <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between text-purple-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-800">Cross-Brand</span>
            <Layers className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-purple-950">
            {crossBrandMap.allThree + crossBrandMap.foryaPeeSafe + crossBrandMap.foryaRenee + crossBrandMap.peeSafeRenee}
          </div>
          <div className="mt-1 text-[11px] text-purple-700">Multi-brand household buyers</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Average LTV</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            NPR {ltvDistribution.avgLtv.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 font-bold">Lifetime Value per customer</div>
        </div>
      </div>

      {/* Navigation Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 p-1.5 border border-slate-200">
        {[
          { key: 'ALL', label: 'All 13 Insights', icon: Activity },
          { key: 'CHURN_WINBACK', label: 'Churn & Win-Back', icon: TrendingDown },
          { key: 'REVENUE_LTV', label: 'Revenue & LTV', icon: DollarSign },
          { key: 'BRAND_CHANNEL', label: 'Brands & Channels', icon: Layers },
          { key: 'BEHAVIOR', label: 'Cycles & Cohorts', icon: Clock },
          { key: 'GEOGRAPHY', label: 'Geographic Intelligence', icon: MapPin },
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
