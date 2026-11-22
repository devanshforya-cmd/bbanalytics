'use client';

import Money from '@/components/common/Money';
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { compareWindows, inWindow, changeLabel, COMPARE_LABEL, type CompareMode, type DateWindow } from '@/lib/period-compare';
import { countsAsSale } from '@/lib/order-status';
import { FilterCriteria, BrandCode, FeedbackEntry, ComparisonMode, DashboardSalesMode } from '@/lib/types';
import AdvancedFilterBar from '@/components/common/AdvancedFilterBar';
import { getTodayAd, matchesDateCriteria } from '@/lib/nepali-calendar';
import MetricSparkline from './components/MetricSparkline';
import type { DrillDownType } from './components/MetricDrillDownModal';
import ProductPerformanceTable from './components/ProductPerformanceTable';
import SalesChannelPerformance from './components/SalesChannelPerformance';
import BrandComparisonView from './components/BrandComparisonView';
import RegionalPerformanceView from './components/RegionalPerformanceView';
import DistributorHealthSection from './components/DistributorHealthSection';
import ThirtyDayTrendCharts from './components/ThirtyDayTrendCharts';
import MorningBriefCard from './components/MorningBriefCard';
import SeasonalInsightsSection from './components/SeasonalInsightsSection';
import StoreNetworkOverviewSection from './components/StoreNetworkOverviewSection';
import PageGuard from '@/components/common/PageGuard';
import { getSessionUser } from '@/lib/auth';
import { FeatureKey, hasAccess, isSuperAdmin } from '@/lib/permissions';
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
  ArrowUp,
  AlertTriangle,
  Star,
  Sparkles,
  Globe,
} from 'lucide-react';

function DashboardFeature({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  return allowed ? <>{children}</> : null;
}

// Opened on demand: loaded the first time someone opens them, not with the dashboard.
const MetricDrillDownModal = dynamic(() => import('./components/MetricDrillDownModal'));
const IssueChipDrillDownModal = dynamic(() => import('./components/IssueChipDrillDownModal'));
const ReviewListModal = dynamic(() => import('./components/ReviewListModal'));
const SetupWizard = dynamic(() => import('@/components/dashboard/SetupWizard'));

export default function DashboardPage() {
  const currentUser = getSessionUser() || db.getCurrentUser();
  const canSee = (feature: FeatureKey) => hasAccess(currentUser, feature);
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
  const [salesMode, setSalesMode] = useState<DashboardSalesMode>(() =>
    hasAccess(getSessionUser() || db.getCurrentUser(), 'orderflow') ? 'D2C' : 'B2B'
  );
  const [dbVersion, setDbVersion] = useState(0);

  useEffect(() => {
    db.syncWithSupabase().catch(() => {});
    const handleUpdate = () => setDbVersion((v) => v + 1);
    window.addEventListener('bb-db-updated', handleUpdate);
    return () => window.removeEventListener('bb-db-updated', handleUpdate);
  }, []);

  const activeBrand = filterCriteria.brand && filterCriteria.brand !== 'ALL' ? filterCriteria.brand : globalBrand;
  const rawOrders = db.getOrders(activeBrand);
  const rawDeliveryFailures = db.getDeliveryFailures(activeBrand);
  const rawReturns = db.getReturns(activeBrand);
  const rawFeedback = db.getFeedback(activeBrand);
  const rawCheques = db.getCheques();
  const scorecards = db.getScorecards();
  const rankedScorecards = [...scorecards].sort((a, b) =>
    b.beatCompliancePct - a.beatCompliancePct
    || b.callToOrderRatioPct - a.callToOrderRatioPct
    || b.storesVisited - a.storesVisited
  );
  const categories = db.getReviewCategories();
  const rawBeatItems = db.getTodayBeat();
  const rawSecondaryOrders = db.getSecondaryOrders();
  const products = db.getProducts(activeBrand);
  const distributors = db.getDistributors();
  const branches = db.getBranches();
  const retailers = db.getRetailers();

  // First-time setup guide. It shows only when all of these hold:
  //   the first server refresh has finished (so an unloaded screen is never mistaken for an empty one),
  //   the user is the Super Admin, no brand exists yet, and this account has not dismissed it.
  // Dismissal is saved on the account, so it survives reloads, other devices and new logins.
  const setupUser = getSessionUser() || db.getCurrentUser();
  const setupGuideDue = db.isWorkspaceLoaded() && isSuperAdmin(setupUser) && db.getBrands('ALL').length === 0 && !db.getMyPreferences().setupGuideDismissedAt;
  useEffect(() => { setShowSetupWizard(setupGuideDue); }, [setupGuideDue]);
  const closeSetupWizard = () => { setShowSetupWizard(false); db.setMyPreferences({ setupGuideDismissedAt: new Date().toISOString() }); };

  // Apply Territorial, Channel, D2C/B2B & Marketing Filters
  const keepOrder = (o: (typeof rawOrders)[number], checkDate = true) => {
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
    if (checkDate && !matchesDateCriteria(o.orderDateAd, o.orderDateBs, filterCriteria)) return false;
    return true;
  };
  const orders = rawOrders.filter((o) => keepOrder(o));

  const keepFailure = (df: (typeof rawDeliveryFailures)[number], checkDate = true) => {
    if (salesMode === 'B2B') return false; // Courier failures are online/D2C specific
    if (filterCriteria.valley && filterCriteria.valley !== 'ALL' && df.valley !== filterCriteria.valley) return false;
    if (checkDate && !matchesDateCriteria(df.dateAd, df.dateBs, filterCriteria)) return false;
    return true;
  };
  const deliveryFailures = rawDeliveryFailures.filter((df) => keepFailure(df));

  const keepReturn = (r: (typeof rawReturns)[number], checkDate = true) => {
    if (salesMode === 'D2C' && ['Field Order', 'Distributor'].includes(r.platform)) return false;
    if (salesMode === 'B2B' && !['Field Order', 'Distributor', 'Walk-in'].includes(r.platform)) return false;
    if (channelFilter && r.platform !== channelFilter) return false;
    if (filterCriteria.valley && filterCriteria.valley !== 'ALL' && r.valley !== filterCriteria.valley) return false;
    if (checkDate && !matchesDateCriteria(r.dateAd, r.dateBs, filterCriteria)) return false;
    return true;
  };
  const returns = rawReturns.filter((r) => keepReturn(r));

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

  // Orders that count as sales: cancelled orders, exchanges and marketing sends are left out.
  const totalOrders = orders.filter(countsAsSale).length;
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

  // "Compare with": the last 30 days against the same 30 days a month or a year earlier.
  const compareMode: CompareMode = comparisonMode === 'LAST_MONTH' || comparisonMode === 'SAME_MONTH_LAST_YEAR' ? comparisonMode : 'OFF';
  const windows = compareWindows(compareMode, new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' }));
  const periodFigures = (window: DateWindow) => {
    const periodOrders = rawOrders.filter((o) => keepOrder(o, false) && countsAsSale(o) && inWindow(o.orderDateAd, window)).length;
    const periodFailures = rawDeliveryFailures.filter((df) => keepFailure(df, false) && inWindow(df.dateAd, window)).length;
    const periodReturns = rawReturns.filter((r) => keepReturn(r, false) && inWindow(r.dateAd, window)).length;
    const periodComplaints = rawFeedback.filter((f) => f.type === 'COMPLAINT' && inWindow(f.dateReceivedAd, window)).length;
    return {
      orders: periodOrders,
      failureRate: periodOrders ? Math.round((periodFailures / periodOrders) * 1000) / 10 : 0,
      returnRate: periodOrders ? Math.round((periodReturns / periodOrders) * 1000) / 10 : 0,
      complaints: periodComplaints,
    };
  };
  const nowFigures = windows ? periodFigures(windows.current) : null;
  const beforeFigures = windows ? periodFigures(windows.previous) : null;
  const compareLine = (key: 'orders' | 'failureRate' | 'returnRate' | 'complaints', lowerIsBetter: boolean) => {
    if (!nowFigures || !beforeFigures || compareMode === 'OFF') return null;
    const now = nowFigures[key], before = beforeFigures[key];
    const isRate = key === 'failureRate' || key === 'returnRate';
    const change = isRate
      ? { text: now === before ? 'No change' : `${now > before ? '+' : ''}${(Math.round((now - before) * 10) / 10)} pts`, direction: now > before ? 'up' : now < before ? 'down' : 'flat' }
      : changeLabel(now, before);
    const good = change.direction === 'flat' ? null : (change.direction === 'down') === lowerIsBetter;
    return (
      <div className="mt-1 space-y-0.5">
        <div className="text-[11px] text-slate-600 font-medium">Last 30 days: <strong>{isRate ? `${now}%` : now}</strong></div>
        <div className="text-[11px] text-slate-500">{isRate ? `${before}%` : before} in {COMPARE_LABEL[compareMode]}</div>
        <div className={`text-[11px] font-bold ${good === null ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-rose-700'}`}>{change.text}</div>
      </div>
    );
  };

  const secondaryOrders = rawSecondaryOrders.filter((so) => {
    if (so.status === 'CANCELLED') return false;
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
    <PageGuard feature="dashboard">
      <div className="space-y-6">
        {/* Fix 31: Daily Morning Brief Card */}
        <MorningBriefCard />

        {/* Fix 1d: Prompt when brands table is empty */}
        {canSee('settings') && db.getBrands('ACTIVE').length === 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-blue-50 border border-blue-200 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Add your first brand in Settings to get started</h2>
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

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p suppressHydrationWarning className="text-[13px] font-medium text-slate-500">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 suppressHydrationWarning className="mt-0.5 text-[28px] font-semibold leading-tight text-slate-900">
              {(() => { const hour = new Date().getHours(); return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'; })()}{currentUser.fullName ? `, ${currentUser.fullName.split(' ')[0]}` : ''}
            </h1>
          </div>
          {activeBrand !== 'ALL' && <span className="rounded-full bg-white px-3 py-1 text-[13px] font-medium text-slate-600 shadow-xs ring-1 ring-black/[0.06]">{activeBrand}</span>}
        </div>

        {/* Advanced Filter Bar with Slide-Out Drawer Mode */}
        <AdvancedFilterBar
          criteria={filterCriteria}
          onChange={setFilterCriteria}
          title="Filters"
          drawerMode={true}
        />

        {/* Which sales to show: a segmented control, as on iOS */}
        {(() => {
          const options = [
            canSee('orderflow') && { id: 'D2C' as const, label: 'Online' },
            (canSee('beat_plans') || canSee('stores')) && { id: 'B2B' as const, label: 'Offline' },
            canSee('orderflow') && (canSee('beat_plans') || canSee('stores')) && { id: 'ALL' as const, label: 'All' },
          ].filter(Boolean) as { id: DashboardSalesMode; label: string }[];
          if (options.length < 2) return null;
          return (
            <div role="tablist" aria-label="Sales to show" className="inline-flex rounded-[10px] bg-black/[0.06] p-0.5">
              {options.map((option) => (
                <button key={option.id} type="button" role="tab" aria-selected={salesMode === option.id} onClick={() => setSalesMode(option.id)}
                  className={`min-w-[84px] rounded-[8px] px-4 py-1.5 text-[13px] font-medium transition ${salesMode === option.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                  {option.label}
                </button>
              ))}
            </div>
          );
        })()}

        {/* Fix 36a: Comparison Mode Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold text-slate-700">Compare with:</span>
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-medium">
              {(['OFF', 'LAST_MONTH', 'SAME_MONTH_LAST_YEAR'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setComparisonMode(mode)}
                  className={`px-3 py-1 rounded-lg transition ${
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
              Last 30 days vs {compareMode === 'OFF' ? '' : COMPARE_LABEL[compareMode]}
            </span>
          )}
        </div>

        {/* Dedicated KPI Cards for D2C Online Dashboard */}
        {salesMode === 'D2C' && canSee('orderflow') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* 1. D2C Total Orders */}
            <DashboardFeature allowed={canSee('orderflow')}>
            <div
              onClick={() => setActiveDrillDown('ORDERS')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-bold text-[10px] text-slate-600">Online D2C Orders</span>
                  <ShoppingBag className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{totalOrders}</div>
                {compareLine('orders', false) ?? (
                  <div className="text-[10px] text-slate-500 mt-0.5">Social (IG, WA, TikTok) &amp; Web</div>
                )}
              </div>
              <div className="mt-3">
                <MetricSparkline data={ordersSparkline} color="#2563eb" fillColor="#3b82f6" height={22} />
                <div className="text-[9px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>

            {/* 2. D2C Delivery Failure Rate */}
            <DashboardFeature allowed={canSee('orderflow')}>
            <div
              onClick={() => setActiveDrillDown('DELIVERY_FAILURES')}
              className={`rounded-2xl border p-4 shadow-sm hover:border-rose-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between ${
                Number(deliveryFailureRate) > 15
                  ? 'border-rose-200 bg-rose-50/50'
                  : Number(deliveryFailureRate) > 5
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-rose-800">
                  <span className="font-bold text-[10px] text-rose-900">Courier Delivery Failures</span>
                  <TruckIcon className="h-4 w-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-rose-900 mt-2">{deliveryFailureRate}%</div>
                {compareLine('failureRate', true) ?? (
                  <div className="text-[10px] text-rose-700 mt-0.5">{deliveryFailureCount} failed deliveries</div>
                )}
              </div>
              <div className="mt-3">
                <MetricSparkline data={failuresSparkline} color="#e11d48" fillColor="#f43f5e" height={22} />
                <div className="text-[9px] text-rose-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>

            {/* 3. D2C Actual Return Rate */}
            <DashboardFeature allowed={canSee('reviews')}>
            <div
              onClick={() => setActiveDrillDown('RETURNS')}
              className={`rounded-2xl border p-4 shadow-sm hover:border-amber-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between ${
                Number(returnRate) > 10
                  ? 'border-rose-200 bg-rose-50/50'
                  : Number(returnRate) > 5
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-amber-800">
                  <span className="font-bold text-[10px] text-amber-900">Customer Return Rate</span>
                  <RotateCcw className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-amber-900 mt-2">{returnRate}%</div>
                {compareLine('returnRate', true) ?? (
                  <div className="text-[10px] text-amber-700 mt-0.5">{returnCount} verified return requests</div>
                )}
              </div>
              <div className="mt-3">
                <MetricSparkline data={returnsSparkline} color="#d97706" fillColor="#f59e0b" height={22} />
                <div className="text-[9px] text-amber-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>

            {/* 4. D2C Unresolved Complaints */}
            <DashboardFeature allowed={canSee('reviews')}>
            <div
              onClick={() => setActiveDrillDown('COMPLAINTS')}
              className={`rounded-2xl border p-4 shadow-sm hover:border-rose-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between ${
                unresolvedComplaintsCount > 0 ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200 bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-bold text-[10px] text-slate-600">Online Complaints</span>
                  <MessageSquareWarning className="h-4 w-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{complaintCount}</div>
                {compareLine('complaints', true) ?? (
                  <div className="text-[10px] text-rose-700 font-semibold mt-0.5">
                    {unresolvedComplaintsCount} requiring resolution
                  </div>
                )}
              </div>
              <div className="mt-3">
                <MetricSparkline data={complaintsSparkline} color="#dc2626" fillColor="#ef4444" height={22} />
                <div className="text-[9px] text-rose-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>
          </div>
        )}

        {/* Dedicated KPI Cards for Offline Retail Dashboard */}
        {salesMode === 'B2B' && (canSee('beat_plans') || canSee('stores') || canSee('cheque_tracker')) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* 1. Secondary Orders Booked */}
            <DashboardFeature allowed={canSee('orderflow')}>
            <div
              onClick={() => setActiveDrillDown('ORDERS')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-bold text-[10px] text-slate-600">Secondary Orders Booked</span>
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
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>

            {/* 2. Store Visits & Beat Compliance */}
            <DashboardFeature allowed={canSee('beat_plans')}>
            <div
              onClick={() => setActiveDrillDown('STORES_VISITED')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-bold text-[10px] text-slate-600">Beat Visits &amp; Compliance</span>
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
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>

            {/* 3. Cheques in Custody / Pending */}
            <DashboardFeature allowed={canSee('cheque_tracker')}>
            <div
              onClick={() => setActiveDrillDown('CHEQUES')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-purple-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-bold text-[10px] text-slate-600">Cheques in Field</span>
                  <CreditCard className="h-4 w-4 text-purple-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">
                  <Money prefix="Rs. ">{pendingChequesAmount.toLocaleString()}</Money>
                </div>
                <div className="text-[10px] text-purple-700 font-semibold mt-0.5">
                  {pendingCheques.length} pending • {overdueCheques.length} overdue
                </div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={chequesSparkline} color="#7c3aed" fillColor="#8b5cf6" height={22} />
                <div className="text-[9px] text-purple-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>

            {/* 4. Active Retail Outlets Stocked */}
            <DashboardFeature allowed={canSee('stores')}>
            <div
              onClick={() => setActiveDrillDown('STORES_VISITED')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-bold text-[10px] text-slate-600">Active Outlets Stocked</span>
                  <Store className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">
                  {activeStoresStockedCount}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {retailers.length} retailers + {branches.length} distributor branches
                </div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={visitsSparkline} color="#4f46e5" fillColor="#6366f1" height={22} />
                <div className="text-[9px] text-indigo-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  View store network
                </div>
              </div>
            </div>
            </DashboardFeature>
          </div>
        )}

        {/* Combined 6-KPI View for 'ALL' mode */}
        {salesMode === 'ALL' && (
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {/* 1. Total Orders Card */}
            <DashboardFeature allowed={canSee('orderflow')}>
            <div
              onClick={() => setActiveDrillDown('ORDERS')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-bold text-[10px] text-slate-600">Orders</span>
                  <ShoppingBag className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{totalOrders}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">D2C &amp; Field</div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={ordersSparkline} color="#2563eb" fillColor="#3b82f6" height={22} />
                <div className="text-[9px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>

            {/* 2. Delivery Failure Rate Card */}
            <DashboardFeature allowed={canSee('orderflow')}>
            <div
              onClick={() => setActiveDrillDown('DELIVERY_FAILURES')}
              className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm hover:border-rose-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-rose-800">
                  <span className="font-bold text-[10px] text-rose-900">Delivery Failures</span>
                  <TruckIcon className="h-4 w-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-rose-900 mt-2">{deliveryFailureRate}%</div>
                <div className="text-[10px] text-rose-700 mt-0.5">Call not received</div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={failuresSparkline} color="#e11d48" fillColor="#f43f5e" height={22} />
                <div className="text-[9px] text-rose-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>

            {/* 3. Actual Return Rate Card */}
            <DashboardFeature allowed={canSee('reviews')}>
            <div
              onClick={() => setActiveDrillDown('RETURNS')}
              className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm hover:border-amber-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-amber-800">
                  <span className="font-bold text-[10px] text-amber-900">Actual Returns</span>
                  <RotateCcw className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-amber-900 mt-2">{returnRate}%</div>
                <div className="text-[10px] text-amber-700 mt-0.5">Product quality only</div>
              </div>
              <div className="mt-3">
                <MetricSparkline data={returnsSparkline} color="#d97706" fillColor="#f59e0b" height={22} />
                <div className="text-[9px] text-amber-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>

            {/* 4. Complaints Card */}
            <DashboardFeature allowed={canSee('reviews')}>
            <div
              onClick={() => setActiveDrillDown('COMPLAINTS')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-rose-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-bold text-[10px] text-slate-600">Complaints</span>
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
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>

            {/* 5. Store Visits Today Card */}
            <DashboardFeature allowed={canSee('beat_plans')}>
            <div
              onClick={() => setActiveDrillDown('STORES_VISITED')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-bold text-[10px] text-slate-600">Stores Visited</span>
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
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>

            {/* 6. Cheques Pending Card */}
            <DashboardFeature allowed={canSee('cheque_tracker')}>
            <div
              onClick={() => setActiveDrillDown('CHEQUES')}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-purple-400 hover:shadow-md cursor-pointer transition group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-bold text-[10px] text-slate-600">Cheques Pending</span>
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
                  Click to drill down
                </div>
              </div>
            </div>
            </DashboardFeature>
          </div>
        )}

        {/* SECTION 2.1: PRODUCT PERFORMANCE TABLE */}
        <DashboardFeature allowed={canSee('products')}>
        <ProductPerformanceTable
          products={products}
          orders={orders}
          returns={returns}
          deliveryFailures={deliveryFailures}
          feedback={feedback}
          calendarMode={filterCriteria.calendarMode || 'BS'}
          comparisonMode={comparisonMode}
        />
        </DashboardFeature>

      {/* SECTION 2.2: SALES CHANNEL PERFORMANCE (D2C / All Sales) */}
      {canSee('orderflow') && salesMode !== 'B2B' && (
        <SalesChannelPerformance
          orders={rawOrders}
          returns={rawReturns}
          feedback={rawFeedback}
          selectedChannel={channelFilter}
          onSelectChannel={setChannelFilter}
        />
      )}

      {/* SECTION 2.3: BRAND COMPARISON VIEW (Visible when ALL Brands selected) */}
      {canSee('orderflow') && canSee('reviews') && canSee('products') && (!filterCriteria.brand || filterCriteria.brand === 'ALL') && (
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
      {canSee('orderflow') && canSee('reviews') && <RegionalPerformanceView
        orders={orders}
        returns={returns}
        deliveryFailures={deliveryFailures}
        feedback={feedback}
      />}

      {/* SECTION 2.5: DISTRIBUTOR HEALTH (GT/MT Summary - B2B / All Sales) */}
      {canSee('distributors') && canSee('cheque_tracker') && salesMode !== 'D2C' && (
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
        <DashboardFeature allowed={canSee('reviews') && canSee('orderflow')}>
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
                <div className="font-bold text-rose-900 text-[11px] ">Delivery Failures</div>
                <div className="text-lg font-black text-rose-900 mt-1">{deliveryFailureCount}</div>
                <div className="text-[10px] text-rose-700">Call not received & address issues</div>
              </div>
              <div
                onClick={() => setActiveDrillDown('RETURNS')}
                className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 cursor-pointer hover:bg-amber-50 hover:border-amber-300 transition-colors"
              >
                <div className="font-bold text-amber-900 text-[11px] ">Actual Product Returns</div>
                <div className="text-lg font-black text-amber-900 mt-1">{returnCount}</div>
                <div className="text-[10px] text-amber-700">Damages & shade mismatch</div>
              </div>
            </div>
          </div>
        </div>
        </DashboardFeature>

        {/* Customer Reviews & Marketing Intelligence (D2C / All Sales) */}
        {canSee('reviews') && salesMode !== 'B2B' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="font-bold text-slate-900 text-sm">
                {canSee('marketing') ? 'Customer Feedback & Marketing Assets' : 'Customer Feedback'}
              </div>
              {canSee('customers') && (
            <Link
              href="/customers"
              className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
            >
              Customer 360 <ArrowUpRight className="h-3 w-3" />
            </Link>
              )}
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
            <div className="text-[11px] font-bold text-slate-600 ">
              Latest Reviews (Click to Inspect)
            </div>
            <div className="space-y-2">
              {latestReviews.map((rev) => (
                <div
                  key={rev.id}
                  onClick={() => setSelectedReview(rev)}
                  className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:shadow-xs cursor-pointer transition"
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

          {canSee('customers') && <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/60 flex items-center justify-between">
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
          </div>}
        </div>
      )}
      </div>

      {/* SECTION 6: FIELD SALES FORCE PERFORMANCE (B2B / All Sales) */}
      {canSee('staff_scorecards') && salesMode !== 'D2C' && (
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
            {rankedScorecards.map((sc, i) => {
              const overdueCount = sc.chequesOverdue || 0;
              const stopsToday = rawBeatItems.filter(
                (beat) => beat.officerId === sc.officerId && beat.dateAd === getTodayAd()
              );
              const visitedToday = stopsToday.filter((beat) => beat.status === 'VISITED').length;

              return (
                <Link
                  key={sc.officerId}
                  href="/offline-sales/scorecard"
                  className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50 hover:bg-white hover:border-blue-300 hover:shadow-md transition cursor-pointer block group"
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
                      <strong className="text-blue-600 text-xs">{sc.beatCompliancePct}%</strong>
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
                      <strong className="text-slate-900 font-bold">{visitedToday}/{stopsToday.length} stores</strong>
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
      {canSee('staff_scorecards') && canSee('orderflow') && canSee('reviews') && (
        <ThirtyDayTrendCharts comparisonMode={comparisonMode} />
      )}

      {/* Fix 35: Seasonal Pattern Insights */}
      {canSee('orderflow') && <SeasonalInsightsSection />}

      {/* Fix 34b & 47: Store Network Overview & Vendor Comparison (B2B / All Sales) */}
      {canSee('stores') && canSee('distributors') && salesMode !== 'D2C' && <StoreNetworkOverviewSection />}

      {/* DRILL-DOWN MODALS */}
      {activeDrillDown && <MetricDrillDownModal
        type={activeDrillDown}
        onClose={() => setActiveDrillDown(null)}
        orders={canSee('orderflow') ? orders : []}
        deliveryFailures={canSee('orderflow') ? deliveryFailures : []}
        returns={canSee('reviews') ? returns : []}
        feedback={canSee('reviews') ? feedback : []}
        cheques={canSee('cheque_tracker') ? cheques : []}
        beatItems={canSee('beat_plans') ? beatItems : []}
        scorecards={canSee('staff_scorecards') ? scorecards : []}
        activeBrand={activeBrand}
        calendarMode={filterCriteria.calendarMode || 'BS'}
      />}

      {activeIssueChip && <IssueChipDrillDownModal
        categoryName={activeIssueChip}
        onClose={() => setActiveIssueChip(null)}
        feedback={canSee('reviews') ? feedback : []}
        returns={canSee('reviews') ? returns : []}
        calendarMode={filterCriteria.calendarMode || 'BS'}
      />}

      {(reviewModalFilter || selectedReview) && <ReviewListModal
        filterType={reviewModalFilter}
        selectedReview={selectedReview}
        onClose={() => {
          setReviewModalFilter(null);
          setSelectedReview(null);
        }}
        feedback={canSee('reviews') ? feedback : []}
        calendarMode={filterCriteria.calendarMode || 'BS'}
      />}

      {showSetupWizard && setupGuideDue && (
        <SetupWizard onComplete={closeSetupWizard} onDismiss={closeSetupWizard} />
      )}
      </div>
    </PageGuard>
  );
}
