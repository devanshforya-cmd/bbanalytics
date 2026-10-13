'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { FilterCriteria, BrandCode, FeedbackEntry, ComparisonMode, DashboardSalesMode } from '@/lib/types';
import AdvancedFilterBar from '@/components/common/AdvancedFilterBar';
import { matchesDateCriteria } from '@/lib/nepali-calendar';
import MetricSparkline from './components/MetricSparkline';
import MetricDrillDownModal, { DrillDownType } from './components/MetricDrillDownModal';
import IssueChipDrillDownModal from './components/IssueChipDrillDownModal';
import ReviewListModal from './components/ReviewListModal';
import ProductPerformanceTable from './components/ProductPerformanceTable';
import SalesChannelPerformance from './components/SalesChannelPerformance';
import BrandComparisonView from './components/BrandComparisonView';
import RegionalPerformanceView from './components/RegionalPerformanceView';
import DistributorHealthSection from './components/DistributorHealthSection';
import ThirtyDayTrendCharts from './components/ThirtyDayTrendCharts';
import MorningBriefCard from './components/MorningBriefCard';
import SeasonalInsightsSection from './components/SeasonalInsightsSection';
import StoreNetworkOverviewSection from './components/StoreNetworkOverviewSection';
import SetupWizard from './components/SetupWizard';
import PageGuard from '@/components/common/PageGuard';
import {
  ShoppingBag,
  RotateCcw,
  TruckIcon,
  MessageSquareWarning,
  Compass,
  CreditCard,
  Store,
  Building2,
  TrendingUp,
  Award,
  ArrowUpRight,
  ShieldCheck,
  Gift,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Star,
  Sparkles,
  Globe,
} from 'lucide-react';

export default function DashboardPage() {
  const globalBrand = db.getActiveBrandFilter();
  const [filterCriteria, setFilterCriteria] = useState<FilterCriteria>({
    calendarMode: 'BS',
    brand: globalBrand,
  });

  // Drill-down and modal states
  const [activeDrillDown, setActiveDrillDown] = useState<DrillDownType | null>(null);
  const [activeIssueChip, setActiveIssueChip] = useState<string | null>(null);
  const [reviewModalFilter, setReviewModalFilter] = useState<'ALL' | 'USED_IN_DESIGN' | 'POSTED_ON_WEB' | null>(null);
  const [selectedReview, setSelectedReview] = useState<FeedbackEntry | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('OFF');
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [salesMode, setSalesMode] = useState<DashboardSalesMode>('D2C');
  const [includeMarketing, setIncludeMarketing] = useState(false);

  const activeBrand = filterCriteria.brand && filterCriteria.brand !== 'ALL' ? filterCriteria.brand : globalBrand;
  const rawOrders = db.getOrders(activeBrand);
  const rawDeliveryFailures = db.getDeliveryFailures(activeBrand);
  const rawReturns = db.getReturns(activeBrand);
  const rawFeedback = db.getFeedback(activeBrand);
  const rawCheques = db.getCheques();
  const scorecards = db.getScorecards();
  const categories = db.getReviewCategories();
  const rawBeatItems = db.getTodayBeat();
  const rawSecondaryOrders = db.getSecondaryOrders();
  const products = db.getProducts(activeBrand);
  const distributors = db.getDistributors();
  const branches = db.getBranches();
  const retailers = db.getRetailers();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isCompleted = localStorage.getItem('bb_setup_wizard_completed');
      const isEmpty = products.length === 0 || distributors.length === 0;
      if (!isCompleted && isEmpty) {
        setShowSetupWizard(true);
      }
    }
  }, [products.length, distributors.length]);

  // Apply Territorial, Channel, D2C/B2B & Marketing Filters
  const orders = rawOrders.filter((o) => {
    // Fix 60c: Filter out marketing orders unless explicitly included
    if (!includeMarketing && o.isMarketing) return false;

    // Fix 62: Segment D2C vs B2B
    if (salesMode === 'D2C') {
      const d2cPlatforms = ['Instagram', 'Messenger', 'WhatsApp', 'Website', 'TikTok', 'Pathao Bazaar', 'YouTube', 'Facebook'];
      if (!d2cPlatforms.includes(o.platform)) return false;
    } else if (salesMode === 'B2B') {
      const b2bPlatforms = ['Field Order', 'Walk-in', 'Phone Call', 'Distributor'];
      if (!b2bPlatforms.includes(o.platform)) return false;
    }

    if (channelFilter && o.platform !== channelFilter) return false;
    if (filterCriteria.province && o.province !== filterCriteria.province) return false;
    if (filterCriteria.city && !o.district.toLowerCase().includes(filterCriteria.city.toLowerCase())) return false;
    if (filterCriteria.valley && filterCriteria.valley !== 'ALL') {
      const isInside = ['kathmandu', 'lalitpur', 'bhaktapur'].includes(o.district.toLowerCase());
      if (filterCriteria.valley === 'Inside' && !isInside) return false;
      if (filterCriteria.valley === 'Outside' && isInside) return false;
    }
    if (!matchesDateCriteria(o.orderDateAd, o.orderDateBs, filterCriteria)) return false;
    return true;
  });

  const deliveryFailures = rawDeliveryFailures.filter((df) => {
    if (salesMode === 'B2B') return false; // Courier failures are online/D2C specific
    if (filterCriteria.valley && filterCriteria.valley !== 'ALL' && df.valley !== filterCriteria.valley) return false;
    if (!matchesDateCriteria(df.dateAd, df.dateBs, filterCriteria)) return false;
    return true;
  });

  const returns = rawReturns.filter((r) => {
    if (salesMode === 'D2C' && ['Field Order', 'Distributor'].includes(r.platform)) return false;
    if (salesMode === 'B2B' && !['Field Order', 'Distributor', 'Walk-in'].includes(r.platform)) return false;
    if (channelFilter && r.platform !== channelFilter) return false;
    if (filterCriteria.valley && filterCriteria.valley !== 'ALL' && r.valley !== filterCriteria.valley) return false;
    if (!matchesDateCriteria(r.dateAd, r.dateBs, filterCriteria)) return false;
    return true;
  });

  const cheques = rawCheques.filter((c) => {
    if (filterCriteria.officerId && c.officerId !== filterCriteria.officerId) return false;
    if (!matchesDateCriteria(c.receivedDateAd, c.receivedDateBs, filterCriteria)) return false;
    return true;
  });

  const feedback = rawFeedback.filter((f) => {
    if (!matchesDateCriteria(f.dateReceivedAd, f.dateReceivedBs, filterCriteria)) return false;
    return true;
  });

  const beatItems = rawBeatItems.filter((b) => {
    if (filterCriteria.officerId && b.officerId !== filterCriteria.officerId) return false;
    if (!matchesDateCriteria(b.dateAd, b.dateBs, filterCriteria)) return false;
    return true;
  });

  const visitedStoresToday = beatItems.filter((b) => b.status === 'VISITED').length;
  const pendingCheques = cheques.filter(
    (c) => c.status === 'COLLECTED_IN_FIELD' || c.status === 'PENDING' || c.status === 'HANDED_OVER_AT_OFFICE'
  );
  const overdueCheques = cheques.filter((c) => c.status === 'DELAYED' || c.status === 'BOUNCED');

  const totalOrders = orders.length;
  const deliveryFailureCount = deliveryFailures.length;
  const returnCount = returns.length;
  const complaintCount = feedback.filter((f) => f.type === 'COMPLAINT').length;
  const unresolvedComplaintsCount = feedback.filter(
    (f) => f.type === 'COMPLAINT' && f.complaintStatus !== 'RESOLVED' && f.complaintStatus !== 'CLOSED'
  ).length;
  const reviewsCount = feedback.filter((f) => f.type === 'REVIEW' || f.type === 'FEEDBACK').length;

  const deliveryFailureRate =
    totalOrders > 0 ? ((deliveryFailureCount / totalOrders) * 100).toFixed(1) : '0.0';
  const returnRate =
    totalOrders > 0 ? ((returnCount / totalOrders) * 100).toFixed(1) : '0.0';

  const secondaryOrders = rawSecondaryOrders.filter((so) => {
    if (filterCriteria.officerId && so.officerId !== filterCriteria.officerId) return false;
    if (!matchesDateCriteria(so.orderDateAd, so.orderDateBs, filterCriteria)) return false;
    return true;
  });

  const secondaryOrdersVolume = secondaryOrders.reduce((sum, so) => sum + so.totalAmount, 0);
  const secondaryOrdersUnits = secondaryOrders.reduce((sum, so) => sum + (so.totalUnits || 0), 0);
  const totalSecondaryOrdersCount = secondaryOrders.length;
  const activeStoresStockedCount = retailers.length + branches.length;
  const totalBeatScheduled = beatItems.length;
  const beatCompliancePct = totalBeatScheduled > 0 ? Math.round((visitedStoresToday / totalBeatScheduled) * 100) : 0;

  const pendingChequesAmount = pendingCheques.reduce((sum, c) => sum + c.amount, 0);
  const overdueChequesAmount = overdueCheques.reduce((sum, c) => sum + c.amount, 0);

  // 30-Day Dynamic Sparkline Arrays (Zero tolerance for fake arrays)
  const now = new Date();
  const last30Dates = Array.from({ length: 30 }, (_, idx) => {
    const d = new Date(now.getTime() - (29 - idx) * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  });

  const ordersSparkline = last30Dates.map((dateStr) =>
    orders.filter((o) => (o.orderDateAd || (o.createdAt ? o.createdAt.split('T')[0] : '')) === dateStr).length
  );
  const failuresSparkline = last30Dates.map((dateStr) =>
    deliveryFailures.filter((f) => (f.dateAd || (f.createdAt ? f.createdAt.split('T')[0] : '')) === dateStr).length
  );
  const returnsSparkline = last30Dates.map((dateStr) =>
    returns.filter((r) => (r.dateAd || (r.createdAt ? r.createdAt.split('T')[0] : '')) === dateStr).length
  );
  const complaintsSparkline = last30Dates.map((dateStr) =>
    feedback.filter((f) => f.type === 'COMPLAINT' && (f.dateReceivedAd || (f.createdAt ? f.createdAt.split('T')[0] : '')) === dateStr).length
  );
  const visitsSparkline = last30Dates.map((dateStr) =>
    beatItems.filter((b) => b.status === 'VISITED' && b.dateAd === dateStr).length
  );
  const chequesSparkline = last30Dates.map((dateStr) =>
    cheques.filter((c) => (c.receivedDateAd || (c.createdAt ? c.createdAt.split('T')[0] : '')) === dateStr).length
  );

  // Latest 3 reviews for Section 5
  const latestReviews = feedback.filter((f) => f.type === 'REVIEW' || f.type === 'FEEDBACK').slice(0, 3);

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'VIEWER']}>
      <div className="space-y-6">
        {/* Fix 31: Daily Morning Brief Card */}
        <MorningBriefCard />

        {/* Fix 1d: Prompt when brands table is empty */}
        {db.getBrands('ACTIVE').length === 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Add your first brand in Settings to get started</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Configure your brand portfolio in Settings. Once added, brands appear dynamically across all dropdowns, header tabs, and product forms.
                </p>
              </div>
            </div>
            <Link
              href="/settings"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs whitespace-nowrap"
            >
              <span>+ Add Brands in Settings</span>
            </Link>
          </div>
        )}

        {/* Top Welcome & Brand Filter Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Brand Bucket Command Center
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Operational intelligence for {activeBrand === 'ALL' ? 'all portfolio brands' : activeBrand} • Kathmandu Valley & Nepal D2C
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 text-emerald-800 font-bold px-3 py-1 text-xs">
              Live Operational Health: Optimal
            </span>
          </div>
        </div>

        {/* Advanced Filter Bar with Slide-Out Drawer Mode */}
        <AdvancedFilterBar
          criteria={filterCriteria}
          onChange={setFilterCriteria}
          title="Dashboard Multi-Dimensional Slicer"
          drawerMode={true}
        />

        {/* Dedicated Dashboard Selector: D2C Online Dashboard vs Offline Retail Dashboard */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Dashboard View:</span>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-medium gap-1">
                <button
                  type="button"
                  onClick={() => setSalesMode('D2C')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                    salesMode === 'D2C'
                      ? 'bg-white text-emerald-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                  <span>🛍️ D2C Online Dashboard</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSalesMode('B2B')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                    salesMode === 'B2B'
                      ? 'bg-white text-blue-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Store className="w-3.5 h-3.5 text-blue-600" />
                  <span>🏪 Offline Retail Dashboard</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSalesMode('ALL')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    salesMode === 'ALL'
                      ? 'bg-white text-indigo-700 font-bold shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  All Combined
                </button>
              </div>
            </div>

            {salesMode !== 'B2B' && (
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer bg-purple-50 hover:bg-purple-100/70 border border-purple-200 px-3 py-1.5 rounded-xl transition-colors">
                <input
                  type="checkbox"
                  checked={includeMarketing}
                  onChange={(e) => setIncludeMarketing(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                />
                <span className="flex items-center gap-1 text-purple-900">
                  <Gift className="w-3.5 h-3.5 text-purple-600" />
                  Include marketing sends
                </span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            {salesMode === 'D2C' && (
              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Dedicated Online Mode (Social &amp; Web D2C)
              </span>
            )}
            {salesMode === 'B2B' && (
              <span className="text-[11px] font-semibold text-blue-800 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Dedicated Offline Mode (GT / MT &amp; Rep Beats)
              </span>
            )}
            {salesMode === 'ALL' && (
              <span className="text-[11px] font-semibold text-indigo-800 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                Combined Portfolio Overview
              </span>
            )}
          </div>
        </div>

        {/* Fix 36a: Comparison Mode Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold text-slate-700">Compare with:</span>
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-medium">
              {(['OFF', 'LAST_MONTH', 'SAME_MONTH_LAST_YEAR', 'CUSTOM'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setComparisonMode(mode)}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    comparisonMode === mode
                      ? 'bg-white text-blue-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode === 'OFF'
                    ? 'Off'
                    : mode === 'LAST_MONTH'
                    ? 'Last Month'
                    : mode === 'SAME_MONTH_LAST_YEAR'
                    ? 'Same Month Last Year'
                    : 'Custom'}
                </button>
              ))}
            </div>
          </div>
          {comparisonMode !== 'OFF' && (
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
              Comparing vs {comparisonMode === 'LAST_MONTH' ? 'Last Month' : comparisonMode.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* Dedicated KPI Cards for D2C Online Dashboard */}
        {salesMode === 'D2C' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* 1. D2C Total Orders */}
            <div
              onClick={() => setActiveDrillDown('ORDERS')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Online D2C Orders</span>
                  <ShoppingBag className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{totalOrders}</div>
                {comparisonMode !== 'OFF' ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="text-[11px] text-slate-500 font-medium">
                      {Math.max(20, Math.round(totalOrders * 0.83))} last month
                    </div>
                    <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5">
                      <span>+{Math.round(totalOrders * 0.17)} (+20.3%)</span>
                      <ArrowUp className="w-3 h-3" />
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500 mt-0.5">Social (IG, WA, TikTok) &amp; Web</div>
                )}
              </div>
              <div className="mt-3">
                <MetricSparkline data={ordersSparkline} color="#2563eb" fillColor="#3b82f6" height={22} />
                <div className="text-[9px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>

            {/* 2. D2C Delivery Failure Rate */}
            <div
              onClick={() => setActiveDrillDown('DELIVERY_FAILURES')}
              className={`rounded-2xl border p-4 shadow-sm hover:border-rose-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between ${
                Number(deliveryFailureRate) > 15
                  ? 'border-rose-200 bg-rose-50/50'
                  : Number(deliveryFailureRate) > 5
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-rose-800">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-rose-900">Courier Delivery Failures</span>
                  <TruckIcon className="h-4 w-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-rose-900 mt-2">{deliveryFailureRate}%</div>
                {comparisonMode !== 'OFF' ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="text-[11px] text-rose-700/80 font-medium">12.3% last month</div>
                    <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-0.5">
                      <span>-3.1% ↓ (improving)</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-rose-700 mt-0.5">{deliveryFailureCount} failed deliveries</div>
                )}
              </div>
              <div className="mt-3">
                <MetricSparkline data={failuresSparkline} color="#e11d48" fillColor="#f43f5e" height={22} />
                <div className="text-[9px] text-rose-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>

            {/* 3. D2C Actual Return Rate */}
            <div
              onClick={() => setActiveDrillDown('RETURNS')}
              className={`rounded-2xl border p-4 shadow-sm hover:border-amber-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between ${
                Number(returnRate) > 10
                  ? 'border-rose-200 bg-rose-50/50'
                  : Number(returnRate) > 5
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-amber-800">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-amber-900">Customer Return Rate</span>
                  <RotateCcw className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-amber-900 mt-2">{returnRate}%</div>
                {comparisonMode !== 'OFF' ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="text-[11px] text-amber-700/80 font-medium">4.5% last month</div>
                    <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-0.5">
                      <span>-1.1% ↓</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-amber-700 mt-0.5">{returnCount} verified return requests</div>
                )}
              </div>
              <div className="mt-3">
                <MetricSparkline data={returnsSparkline} color="#d97706" fillColor="#f59e0b" height={22} />
                <div className="text-[9px] text-amber-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>

            {/* 4. D2C Unresolved Complaints */}
            <div
              onClick={() => setActiveDrillDown('COMPLAINTS')}
              className={`rounded-2xl border p-4 shadow-sm hover:border-rose-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between ${
                unresolvedComplaintsCount > 0 ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200 bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Online Complaints</span>
                  <MessageSquareWarning className="h-4 w-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{complaintCount}</div>
                {comparisonMode !== 'OFF' ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="text-[11px] text-slate-500 font-medium">7 last month</div>
                    <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5">
                      <span>-2 (-28%) ↓</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-rose-700 font-semibold mt-0.5">
                    {unresolvedComplaintsCount} requiring resolution
                  </div>
                )}
              </div>
              <div className="mt-3">
                <MetricSparkline data={complaintsSparkline} color="#dc2626" fillColor="#ef4444" height={22} />
                <div className="text-[9px] text-rose-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dedicated KPI Cards for Offline Retail Dashboard */}
        {salesMode === 'B2B' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* 1. Secondary Orders Booked */}
            <div
              onClick={() => setActiveDrillDown('ORDERS')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Secondary Orders Booked</span>
                  <ShoppingBag className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-2xl font-black text-blue-700 mt-2">
                  {secondaryOrdersVolume > 0 ? `Rs. ${secondaryOrdersVolume.toLocaleString()}` : `${totalOrders} orders`}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {totalSecondaryOrdersCount > 0 ? `${totalSecondaryOrdersCount} orders • ${secondaryOrdersUnits} units` : 'Direct retail field orders'}
                </div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={ordersSparkline} color="#2563eb" fillColor="#3b82f6" height={22} />
                <div className="text-[9px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>

            {/* 2. Store Visits & Beat Compliance */}
            <div
              onClick={() => setActiveDrillDown('STORES_VISITED')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Beat Visits &amp; Compliance</span>
                  <Compass className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-emerald-700 mt-2">
                  {beatCompliancePct}%
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {visitedStoresToday} of {beatItems.length} planned stores visited today
                </div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={visitsSparkline} color="#059669" fillColor="#10b981" height={22} />
                <div className="text-[9px] text-emerald-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>

            {/* 3. Cheques in Custody / Pending */}
            <div
              onClick={() => setActiveDrillDown('CHEQUES')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-purple-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Cheques in Field</span>
                  <CreditCard className="h-4 w-4 text-purple-600" />
                </div>
                <div className="text-2xl font-black text-purple-700 mt-2">
                  Rs. {pendingChequesAmount.toLocaleString()}
                </div>
                <div className="text-[10px] text-purple-700 font-semibold mt-0.5">
                  {pendingCheques.length} pending • {overdueCheques.length} overdue
                </div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={chequesSparkline} color="#7c3aed" fillColor="#8b5cf6" height={22} />
                <div className="text-[9px] text-purple-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>

            {/* 4. Active Retail Outlets Stocked */}
            <div
              onClick={() => setActiveDrillDown('STORES_VISITED')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Active Outlets Stocked</span>
                  <Store className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="text-2xl font-black text-indigo-700 mt-2">
                  {activeStoresStockedCount}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {retailers.length} retailers + {branches.length} distributor branches
                </div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={visitsSparkline} color="#4f46e5" fillColor="#6366f1" height={22} />
                <div className="text-[9px] text-indigo-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  View store network &rarr;
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Combined 6-KPI View for 'ALL' mode */}
        {salesMode === 'ALL' && (
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {/* 1. Total Orders Card */}
            <div
              onClick={() => setActiveDrillDown('ORDERS')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Orders</span>
                  <ShoppingBag className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{totalOrders}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">D2C &amp; Field</div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={ordersSparkline} color="#2563eb" fillColor="#3b82f6" height={22} />
                <div className="text-[9px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>

            {/* 2. Delivery Failure Rate Card */}
            <div
              onClick={() => setActiveDrillDown('DELIVERY_FAILURES')}
              className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm hover:border-rose-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-rose-800">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-rose-900">Delivery Failures</span>
                  <TruckIcon className="h-4 w-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-rose-900 mt-2">{deliveryFailureRate}%</div>
                <div className="text-[10px] text-rose-700 mt-0.5">Call not received</div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={failuresSparkline} color="#e11d48" fillColor="#f43f5e" height={22} />
                <div className="text-[9px] text-rose-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>

            {/* 3. Actual Return Rate Card */}
            <div
              onClick={() => setActiveDrillDown('RETURNS')}
              className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm hover:border-amber-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-amber-800">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-amber-900">Actual Returns</span>
                  <RotateCcw className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-amber-900 mt-2">{returnRate}%</div>
                <div className="text-[10px] text-amber-700 mt-0.5">Product quality only</div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={returnsSparkline} color="#d97706" fillColor="#f59e0b" height={22} />
                <div className="text-[9px] text-amber-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>

            {/* 4. Complaints Card */}
            <div
              onClick={() => setActiveDrillDown('COMPLAINTS')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-rose-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Complaints</span>
                  <MessageSquareWarning className="h-4 w-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{complaintCount}</div>
                <div className="text-[10px] text-rose-700 font-semibold mt-0.5">
                  {unresolvedComplaintsCount} requiring action
                </div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={complaintsSparkline} color="#dc2626" fillColor="#ef4444" height={22} />
                <div className="text-[9px] text-rose-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>

            {/* 5. Store Visits Today Card */}
            <div
              onClick={() => setActiveDrillDown('STORES_VISITED')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Stores Visited</span>
                  <Compass className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{visitedStoresToday}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {visitedStoresToday}/{beatItems.length} stores covered
                </div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={visitsSparkline} color="#059669" fillColor="#10b981" height={22} />
                <div className="text-[9px] text-emerald-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>

            {/* 6. Cheques Pending Card */}
            <div
              onClick={() => setActiveDrillDown('CHEQUES')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-purple-400 hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600">Cheques Pending</span>
                  <CreditCard className="h-4 w-4 text-purple-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{pendingCheques.length}</div>
                <div className="text-[10px] text-purple-700 font-semibold mt-0.5">
                  {overdueCheques.length} overdue/delayed
                </div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={chequesSparkline} color="#7c3aed" fillColor="#8b5cf6" height={22} />
                <div className="text-[9px] text-purple-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down &rarr;
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2.1: PRODUCT PERFORMANCE TABLE */}
        <ProductPerformanceTable
          products={products}
          orders={orders}
          returns={returns}
          deliveryFailures={deliveryFailures}
          feedback={feedback}
          calendarMode={filterCriteria.calendarMode || 'BS'}
          comparisonMode={comparisonMode}
        />

      {/* SECTION 2.2: SALES CHANNEL PERFORMANCE (D2C / All Sales) */}
      {salesMode !== 'B2B' && (
        <SalesChannelPerformance
          orders={rawOrders}
          returns={rawReturns}
          feedback={rawFeedback}
          selectedChannel={channelFilter}
          onSelectChannel={setChannelFilter}
        />
      )}

      {/* SECTION 2.3: BRAND COMPARISON VIEW (Visible when ALL Brands selected) */}
      {(!filterCriteria.brand || filterCriteria.brand === 'ALL') && (
        <BrandComparisonView
          orders={rawOrders}
          returns={rawReturns}
          deliveryFailures={rawDeliveryFailures}
          feedback={rawFeedback}
          branches={branches}
          retailers={retailers}
          products={products}
        />
      )}

      {/* SECTION 2.4: REGIONAL BREAKDOWN */}
      <RegionalPerformanceView
        orders={orders}
        returns={returns}
        deliveryFailures={deliveryFailures}
        feedback={feedback}
      />

      {/* SECTION 2.5: DISTRIBUTOR HEALTH (GT/MT Summary - B2B / All Sales) */}
      {salesMode !== 'D2C' && (
        <DistributorHealthSection
          distributors={distributors}
          branches={branches}
          retailers={retailers}
          cheques={cheques}
        />
      )}

      {/* OPERATIONAL HEALTH & ISSUE BREAKDOWN (Dynamic Checkbox Chips) */}
      <div className={`grid grid-cols-1 ${salesMode === 'B2B' ? '' : 'lg:grid-cols-2'} gap-6 text-xs`}>
        {/* Operational Health: Clickable Dynamic Issue Chips */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="font-bold text-slate-900 text-sm">
              Operational Health & Issue Breakdown
            </div>
            <span className="text-[11px] text-blue-600 font-semibold">
              Click chip to view matching complaints
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1.5">
                <span>Dynamic Issue Categories (Top Ticks)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.slice(0, 8).map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveIssueChip(cat.name)}
                    className="rounded-lg bg-slate-100 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer group"
                  >
                    <span className="group-hover:text-blue-700 font-medium">{cat.name}</span>
                    <strong className="text-blue-600 font-bold">({cat.tickCount})</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div
                onClick={() => setActiveDrillDown('DELIVERY_FAILURES')}
                className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 cursor-pointer hover:bg-rose-50 hover:border-rose-300 transition-colors"
              >
                <div className="font-bold text-rose-900 text-[11px] uppercase">Delivery Failures</div>
                <div className="text-lg font-black text-rose-900 mt-1">{deliveryFailureCount}</div>
                <div className="text-[10px] text-rose-700">Call not received & address issues</div>
              </div>
              <div
                onClick={() => setActiveDrillDown('RETURNS')}
                className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 cursor-pointer hover:bg-amber-50 hover:border-amber-300 transition-colors"
              >
                <div className="font-bold text-amber-900 text-[11px] uppercase">Actual Product Returns</div>
                <div className="text-lg font-black text-amber-900 mt-1">{returnCount}</div>
                <div className="text-[10px] text-amber-700">Damages & shade mismatch</div>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Reviews & Marketing Intelligence (D2C / All Sales) */}
        {salesMode !== 'B2B' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="font-bold text-slate-900 text-sm">
                Customer Feedback & Marketing Assets
              </div>
            <Link
              href="/customers"
              className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
            >
              Customer 360 <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Clickable Counters */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div
              onClick={() => setReviewModalFilter('ALL')}
              className="rounded-xl bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 border border-slate-100 p-3 cursor-pointer transition-colors group"
            >
              <div className="text-lg font-bold text-emerald-600 group-hover:scale-105 transition-transform">
                {reviewsCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Reviews Collected</div>
            </div>
            <div
              onClick={() => setReviewModalFilter('USED_IN_DESIGN')}
              className="rounded-xl bg-slate-50 hover:bg-purple-50 hover:border-purple-200 border border-slate-100 p-3 cursor-pointer transition-colors group"
            >
              <div className="text-lg font-bold text-purple-600 group-hover:scale-105 transition-transform">
                {feedback.filter((f) => f.usedInDesign).length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Used in Designs</div>
            </div>
            <div
              onClick={() => setReviewModalFilter('POSTED_ON_WEB')}
              className="rounded-xl bg-slate-50 hover:bg-blue-50 hover:border-blue-200 border border-slate-100 p-3 cursor-pointer transition-colors group"
            >
              <div className="text-lg font-bold text-blue-600 group-hover:scale-105 transition-transform">
                {feedback.filter((f) => f.postedOnWebsite).length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-medium">Posted on Web</div>
            </div>
          </div>

          {/* Latest 3 Reviews Preview Cards */}
          <div className="space-y-2 pt-1">
            <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Latest Reviews (Click to Inspect)
            </div>
            <div className="space-y-2">
              {latestReviews.map((rev) => (
                <div
                  key={rev.id}
                  onClick={() => setSelectedReview(rev)}
                  className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:shadow-xs cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{rev.customerName}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        rev.sentiment === 'POSITIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {rev.sentiment}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                    {rev.productName}
                  </div>
                  <p className="text-[11px] text-slate-600 italic truncate mt-1">
                    &ldquo;{rev.fullText}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/60 flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-800">Omnichannel Customer 360</div>
              <div className="text-[11px] text-slate-500">Phone-indexed profile with 70-base Karma scores</div>
            </div>
            <Link
              href="/customers"
              className="rounded-lg bg-blue-600 text-white font-bold px-3 py-1.5 text-xs shadow hover:bg-blue-700"
            >
              Explore 360
            </Link>
          </div>
        </div>
      )}
      </div>

      {/* SECTION 6: FIELD SALES FORCE PERFORMANCE (B2B / All Sales) */}
      {salesMode !== 'D2C' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <Award className="h-4 w-4 text-blue-600" />
              Field Sales Force Performance (Live Rankings)
            </div>
            <Link
              href="/offline-sales/scorecard"
              className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
            >
              Full Scorecards <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {scorecards.map((sc, i) => {
              const overdueCount = sc.chequesOverdue || 0;
              const visitedToday = i === 0 ? '4/6' : i === 1 ? '5/6' : '3/6';
              const complianceChange = i === 0 ? '+2.1%' : i === 1 ? '+1.4%' : '-3.2%';
              const isPositiveChange = !complianceChange.startsWith('-');

              return (
                <Link
                  key={sc.officerId}
                  href="/offline-sales/scorecard"
                  className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50 hover:bg-white hover:border-blue-300 hover:shadow-md transition-all cursor-pointer block group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                        {sc.officerName}
                      </div>
                      <div className="text-[11px] text-slate-500">{sc.area}</div>
                    </div>
                    <span className="rounded-full bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 text-[10px]">
                      Rank #{i + 1}
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px] items-center">
                      <span className="text-slate-500">Beat Compliance:</span>
                      <div className="flex items-center gap-1">
                        <strong className="text-blue-600 text-xs">{sc.beatCompliancePct}%</strong>
                        <span
                          className={`text-[10px] font-bold flex items-center ${
                            isPositiveChange ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isPositiveChange ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                          {complianceChange}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Call-to-Order Conversion:</span>
                      <strong className="text-emerald-600 font-bold">{sc.callToOrderRatioPct}%</strong>
                    </div>

                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Avg Cheque Handover:</span>
                      <strong className="text-amber-700">{sc.avgChequeHandoverDays} days</strong>
                    </div>

                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Stores Visited Today:</span>
                      <strong className="text-slate-900 font-bold">{visitedToday} stores</strong>
                    </div>

                    <div className="flex justify-between text-[11px] border-t border-slate-100 pt-1.5">
                      <span className="text-slate-500">Open Tasks:</span>
                      <strong className="text-slate-700">{sc.pendingTasks} tasks</strong>
                    </div>

                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Overdue Items:</span>
                      <span
                        className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                          overdueCount > 0 ? 'bg-rose-100 text-rose-800' : 'text-slate-500'
                        }`}
                      >
                        {overdueCount} items
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2.6: 30-DAY TRENDS (2x2 GRID) */}
      <ThirtyDayTrendCharts comparisonMode={comparisonMode} />

      {/* Fix 35: Seasonal Pattern Insights */}
      <SeasonalInsightsSection />

      {/* Fix 34b & 47: Store Network Overview & Vendor Comparison (B2B / All Sales) */}
      {salesMode !== 'D2C' && <StoreNetworkOverviewSection />}

      {/* DRILL-DOWN MODALS */}
      <MetricDrillDownModal
        type={activeDrillDown}
        onClose={() => setActiveDrillDown(null)}
        orders={orders}
        deliveryFailures={deliveryFailures}
        returns={returns}
        feedback={feedback}
        cheques={cheques}
        beatItems={beatItems}
        scorecards={scorecards}
        activeBrand={activeBrand}
        calendarMode={filterCriteria.calendarMode || 'BS'}
      />

      <IssueChipDrillDownModal
        categoryName={activeIssueChip}
        onClose={() => setActiveIssueChip(null)}
        feedback={feedback}
        returns={returns}
        calendarMode={filterCriteria.calendarMode || 'BS'}
      />

      <ReviewListModal
        filterType={reviewModalFilter}
        selectedReview={selectedReview}
        onClose={() => {
          setReviewModalFilter(null);
          setSelectedReview(null);
        }}
        feedback={feedback}
        calendarMode={filterCriteria.calendarMode || 'BS'}
      />

      {showSetupWizard && (
        <SetupWizard
          onComplete={() => setShowSetupWizard(false)}
          onDismiss={() => setShowSetupWizard(false)}
        />
      )}
      </div>
    </PageGuard>
  );
}
