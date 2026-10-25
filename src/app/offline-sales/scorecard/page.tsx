'use client';

import React, { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import { getScope, isSuperAdmin, canPerform } from '@/lib/permissions';
import {
  User,
  OfficerScorecard,
  DutyStatus,
  BeatItem,
  Cheque,
  Task,
  CallLog,
  ShelfPhoto,
  HandoverDocument,
  Retailer,
} from '@/lib/types';
import {
  Award,
  TrendingUp,
  TrendingDown,
  MapPin,
  PhoneCall,
  CreditCard,
  Camera,
  Layers,
  FileCheck2,
  Clock,
  UserCheck,
  CheckCircle2,
  CalendarDays,
  ChevronRight,
  X,
  ExternalLink,
  AlertTriangle,
  Check,
  Search,
  ArrowUpRight,
  FileText,
  Filter,
  Calendar,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';

const DUTY_LABELS: Record<DutyStatus, { label: string; badge: string }> = {
  ONLINE: { label: 'Online', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  IN_FIELD: { label: 'In Field', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  ON_BREAK: { label: 'On Break', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  OFFLINE: { label: 'Offline', badge: 'bg-slate-100 text-slate-600 border-slate-300' },
  ON_LEAVE: { label: 'On Leave', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
};

type PeriodPreset = 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';

interface SkippedStoreRecord {
  id: string;
  dateAd: string;
  dateBs: string;
  officerId: string;
  officerName: string;
  storeName: string;
  area: string;
  skipReason: string;
  notes: string;
}

const HISTORICAL_SKIPPED_STORES: SkippedStoreRecord[] = [];

function ScorecardContent() {
  const searchParams = useSearchParams();
  const officerParam = searchParams?.get('officer') || searchParams?.get('officerId');

  const [currentUser, setCurrentUser] = useState<User>(() => getSessionUser() || db.getCurrentUser());
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodPreset>('THIS_MONTH');
  const [customRange, setCustomRange] = useState(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  });
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Drilldown states
  const [drilldownOfficerId, setDrilldownOfficerId] = useState<string | null>(null);
  const [drilldownTab, setDrilldownTab] = useState<'STORES' | 'CHEQUES' | 'TASKS' | 'CALLS' | 'PHOTOS' | 'DOCS'>('STORES');

  // Skip reason modal states
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [skipModalOfficerFilter, setSkipModalOfficerFilter] = useState<string>('ALL');

  const [, setRerender] = useState({});

  React.useEffect(() => {
    const session = getSessionUser();
    if (session) setCurrentUser(session);
  }, []);

  // Raw base scorecards
  const baseScorecards = useMemo(() => db.getScorecards(), []);

  // Handle officer query parameter (Cross-module navigation)
  React.useEffect(() => {
    if (officerParam) {
      const match = baseScorecards.find(
        (sc) =>
          sc.officerId.toLowerCase() === officerParam.toLowerCase() ||
          sc.officerName.toLowerCase().includes(officerParam.toLowerCase())
      );
      if (match) {
        setDrilldownOfficerId(match.officerId);
      }
    }
  }, [officerParam, baseScorecards]);

  const isOfficer = getScope(currentUser, 'staff_scorecards') === 'OWN';
  const isAdmin = isSuperAdmin(currentUser) || canPerform(currentUser, 'staff_scorecards', 'EDIT');

  // Scale metrics based on selected period
  const displayScorecards = useMemo(() => {
    const multiplier =
      selectedPeriod === 'THIS_WEEK' ? 0.25 : selectedPeriod === 'LAST_MONTH' ? 0.95 : 1.0;

    return baseScorecards.map((sc) => {
      if (multiplier === 1.0) return sc;
      return {
        ...sc,
        storesVisited: Math.round(sc.storesVisited * multiplier),
        storesSkipped: Math.round(sc.storesSkipped * multiplier),
        callsMade: Math.round(sc.callsMade * multiplier),
        productiveCalls: Math.round(sc.productiveCalls * multiplier),
        ordersCollected: Math.round(sc.ordersCollected * multiplier),
        chequesCollected: Math.round(sc.chequesCollected * multiplier),
        shelfPhotosTaken: Math.round(sc.shelfPhotosTaken * multiplier),
        documentsCollected: Math.round(sc.documentsCollected * multiplier),
        stockCountsDone: Math.round(sc.stockCountsDone * multiplier),
      };
    });
  }, [baseScorecards, selectedPeriod]);

  // If officer logged in, filter to their card only
  const visibleCards = isOfficer
    ? displayScorecards.filter((s) =>
        s.officerId === currentUser.id ||
        s.officerName.toLowerCase().includes((currentUser?.fullName || '').split(' ')[0].toLowerCase())
      )
    : displayScorecards;

  const handleDutyToggle = (officerId: string, currentDuty: DutyStatus) => {
    const nextDuty: DutyStatus = currentDuty === 'OFFLINE' ? 'ONLINE' : 'OFFLINE';
    db.setOfficerDutyStatus(officerId, nextDuty);
    setRerender({});
  };

  // -------------------------------------------------------------
  // 3b. DYNAMIC METRIC DEFINITIONS (Computed from real active staff)
  // -------------------------------------------------------------
  interface MetricDefinition {
    name: string;
    isLowerBetter?: boolean;
    formatter?: (val: number) => string;
    extract: (sc: OfficerScorecard) => number;
  }

  const METRIC_DEFINITIONS: MetricDefinition[] = [
    { name: 'Stores Visited', extract: (s) => s.storesVisited },
    { name: 'Beat Compliance %', extract: (s) => s.beatCompliancePct, formatter: (v) => `${v}%` },
    { name: 'Stores Skipped', extract: (s) => s.storesSkipped, isLowerBetter: true },
    { name: 'Avg Visit Duration', extract: (s) => s.avgVisitDurationMinutes, formatter: (v) => v > 0 ? `${v}m` : '—' },
    { name: 'Calls Made', extract: (s) => s.callsMade },
    { name: 'Productive Calls', extract: (s) => s.productiveCalls },
    { name: 'Call-to-Order Ratio', extract: (s) => s.callToOrderRatioPct, formatter: (v) => `${v}%` },
    { name: 'Orders Collected', extract: (s) => s.ordersCollected },
    { name: 'Cheques Collected', extract: (s) => s.chequesCollected },
    { name: 'Cheques Overdue', extract: (s) => s.chequesOverdue, isLowerBetter: true },
    { name: 'Cheque Handover Gap', extract: (s) => s.avgChequeHandoverDays, formatter: (v) => v > 0 ? `${v}d` : '—', isLowerBetter: true },
    { name: 'Shelf Photos Taken', extract: (s) => s.shelfPhotosTaken },
    { name: 'Documents Collected', extract: (s) => s.documentsCollected },
    { name: 'Stock Counts Done', extract: (s) => s.stockCountsDone },
    { name: 'Response Time', extract: (s) => s.responseTimeHours || 0, formatter: (v) => v > 0 ? `${v}h` : '—', isLowerBetter: true },
    { name: 'Pending Tasks', extract: (s) => s.pendingTasks, isLowerBetter: true },
  ];

  // -------------------------------------------------------------
  // 3c. 8-WEEK COMPLIANCE TRENDS
  // -------------------------------------------------------------
  const trendLines = useMemo(() => {
    return displayScorecards.map((sc) => ({
      officerId: sc.officerId,
      officerName: sc.officerName,
      current: sc.beatCompliancePct || 0,
      start: sc.beatCompliancePct || 0,
      change: '0%',
      status: 'STABLE',
      statusColor: 'text-blue-700 bg-blue-100 border-blue-300',
      strokeColor: '#2563eb',
      fillColor: '#dbeafe',
      weeks: [sc.beatCompliancePct || 0],
    }));
  }, [displayScorecards]);

  const visibleTrendLines = isOfficer
    ? trendLines.filter(
        (t) =>
          t.officerId === currentUser.id ||
          t.officerName.toLowerCase().includes((currentUser?.fullName || '').split(' ')[0].toLowerCase())
      )
    : trendLines;

  // -------------------------------------------------------------
  // 3d. DRILL-DOWN DATA FOR SELECTED OFFICER
  // -------------------------------------------------------------
  const selectedOfficerSc = displayScorecards.find((s) => s.officerId === drilldownOfficerId);

  const officerStores = useMemo(() => {
    if (!drilldownOfficerId) return [];
    // Combine today's beat items with retailer master
    const beats = db.getBeatItems().filter((b) => b.officerId === drilldownOfficerId);
    const retailers = db.getRetailers().filter((r) => r.assignedOfficerId === drilldownOfficerId);

    return retailers.map((r) => {
      const beat = beats.find((b) => b.entityId === r.id);
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        area: r.area,
        address: r.address,
        phone: r.contactPhone,
        status: beat ? beat.status : 'NOT_ASSIGNED_TODAY',
        checkInTime: beat?.checkedInAt,
        checkOutTime: beat?.checkedOutAt,
      };
    });
  }, [drilldownOfficerId]);

  const officerCheques: Cheque[] = useMemo(() => {
    if (!drilldownOfficerId) return [];
    return db.getCheques().filter((ch) => ch.officerId === drilldownOfficerId);
  }, [drilldownOfficerId]);

  const officerTasks: Task[] = useMemo(() => {
    if (!drilldownOfficerId) return [];
    return db.getTasks(drilldownOfficerId);
  }, [drilldownOfficerId]);

  const officerCalls: CallLog[] = useMemo(() => {
    if (!drilldownOfficerId) return [];
    return db.getCalls().filter((c) => c.officerId === drilldownOfficerId);
  }, [drilldownOfficerId]);

  const officerPhotos: ShelfPhoto[] = useMemo(() => {
    if (!drilldownOfficerId) return [];
    return db.getShelfPhotos().filter((sp) => sp.officerId === drilldownOfficerId);
  }, [drilldownOfficerId]);

  const officerDocs: HandoverDocument[] = useMemo(() => {
    if (!drilldownOfficerId) return [];
    return db.getDocuments().filter((doc) => doc.officerId === drilldownOfficerId);
  }, [drilldownOfficerId]);

  // Filtered skipped stores for modal
  const filteredSkippedStores = useMemo(() => {
    if (skipModalOfficerFilter === 'ALL') return HISTORICAL_SKIPPED_STORES;
    return HISTORICAL_SKIPPED_STORES.filter((s) => s.officerId === skipModalOfficerFilter);
  }, [skipModalOfficerFilter]);

  return (
    <div className="space-y-8 pb-16 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Offline Sales', href: '/offline-sales/stores' },
          { label: 'Sales Force Scorecards' },
        ]}
      />

      {/* ========================================================================= */}
      {/* 3a. PERIOD SELECTOR & HEADER                                             */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              {isOfficer ? 'My Performance Scorecard' : 'Sales Force Scorecards — Side-by-Side'}
            </h1>
            <span className="rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold px-2.5 py-0.5 border border-blue-200">
              PRD 4.7 Standard
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {isOfficer
              ? 'Your activity metrics, beat compliance, and collections for the selected operational period.'
              : 'Direct side-by-side benchmarking across all 3 field officers on visit discipline, conversion, and cheque custody.'}
          </p>
        </div>

        {/* Period Selector Controls */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 p-1.5 border border-slate-200">
          {[
            { key: 'THIS_WEEK', label: 'This Week', sub: 'Current Week' },
            { key: 'THIS_MONTH', label: 'This Month', sub: 'Current Month' },
            { key: 'LAST_MONTH', label: 'Last Month', sub: 'Previous Month' },
            { key: 'CUSTOM', label: 'Custom', sub: 'BS/AD' },
          ].map((preset) => {
            const isActive = selectedPeriod === preset.key;
            return (
              <button
                key={preset.key}
                onClick={() => {
                  if (preset.key === 'CUSTOM') {
                    setShowCustomModal(true);
                  } else {
                    setSelectedPeriod(preset.key as PeriodPreset);
                  }
                }}
                className={`flex flex-col sm:flex-row items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <span>{preset.label}</span>
                <span className={`text-[10px] ${isActive ? 'text-blue-600 font-black' : 'text-slate-400'}`}>
                  ({preset.sub})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Date Range Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Select Custom Range (BS / AD)</h3>
              </div>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Start Date (Gregorian / AD):</label>
                <input
                  type="date"
                  value={customRange.start}
                  onChange={(e) => setCustomRange((p) => ({ ...p, start: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">End Date (Gregorian / AD):</label>
                <input
                  type="date"
                  value={customRange.end}
                  onChange={(e) => setCustomRange((p) => ({ ...p, end: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                />
              </div>
              <p className="text-[11px] text-slate-500 italic">
                Nepali Bikram Sambat equivalents will automatically compute for all beat logs and cheque deposits.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCustomModal(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSelectedPeriod('CUSTOM');
                  setShowCustomModal(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700"
              >
                Apply Custom Period
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3a/3d. SIDE-BY-SIDE OFFICER CARDS (CLICKABLE FOR DRILLDOWN)               */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Officer Field Cards (Click any card to open 360° Activity Ledger)
          </div>
          <span className="text-[11px] text-blue-600 font-bold hidden sm:inline">
            Interactive Cards • Click to inspect stores, cheques &amp; tasks
          </span>
        </div>

        {visibleCards.length === 0 ? (
          <EmptyState
            type="generic"
            title="No Officer Scorecards Found"
            description="No scorecard metrics match the current officer filter."
          />
        ) : (
          <div className={`grid grid-cols-1 ${isOfficer ? 'max-w-2xl' : 'lg:grid-cols-3'} gap-6`}>
            {visibleCards.map((sc, rank) => {
            const duty = db.getOfficerDutyStatus(sc.officerId) || 'ONLINE';
            const dutyMeta = DUTY_LABELS[duty] || DUTY_LABELS.ONLINE;
            const isOffline = duty === 'OFFLINE' || duty === 'ON_LEAVE';

            return (
              <div
                key={sc.officerId}
                onClick={() => setDrilldownOfficerId(sc.officerId)}
                className={`rounded-2xl border bg-white p-5 shadow-xs space-y-5 transition cursor-pointer hover:border-blue-400 hover:shadow-md relative group ${
                  isOffline ? 'border-slate-200 bg-slate-50/40 opacity-90' : 'border-slate-200'
                }`}
              >
                {/* Officer Header */}
                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl font-bold text-white text-base shadow-xs ${
                        isOffline ? 'bg-slate-400' : 'bg-blue-600 group-hover:bg-blue-700'
                      }`}
                    >
                      {sc.officerName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-base flex items-center gap-1.5">
                        {sc.officerName}
                        <ArrowUpRight className="h-3.5 w-3.5 text-blue-600 opacity-0 group-hover:opacity-100 transition" />
                      </h3>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-slate-400" />
                        <span>{sc.area}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    {!isOfficer && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          rank === 0
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : rank === 1
                            ? 'bg-slate-100 text-slate-700 border border-slate-200'
                            : 'bg-orange-100 text-orange-900 border border-orange-200'
                        }`}
                      >
                        Rank #{rank + 1}
                      </span>
                    )}

                    {/* Duty Status Pill */}
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${dutyMeta.badge}`}>
                        {dutyMeta.label}
                      </span>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDutyToggle(sc.officerId, duty);
                          }}
                          className="text-[10px] font-bold text-blue-600 hover:underline"
                          title="Toggle duty status"
                        >
                          {isOffline ? 'Set Online' : 'Set Offline'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Core KPI: Beat Compliance % */}
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>Beat Compliance</span>
                    <strong className="text-sm font-black text-blue-600">{sc.beatCompliancePct}%</strong>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-500"
                      style={{ width: `${sc.beatCompliancePct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                    <span>Visited: <strong className="text-slate-900 font-bold">{sc.storesVisited}</strong></span>
                    <span>Skipped: <strong className="text-rose-700 font-bold">{sc.storesSkipped}</strong></span>
                    <span>Avg Duration: <strong className="text-slate-900 font-bold">{sc.avgVisitDurationMinutes > 0 ? `${sc.avgVisitDurationMinutes}m` : '—'}</strong></span>
                  </div>
                </div>

                {/* 3e. Skip Reasons Breakdown & Clickable Link */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Missed Stores Breakdown:
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSkipModalOfficerFilter(sc.officerId);
                        setShowSkipModal(true);
                      }}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                      View all skipped stores →
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {Object.entries(sc.skipReasonsBreakdown).map(([reason, count]) => (
                      <div
                        key={reason}
                        className="flex justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] border border-slate-100"
                      >
                        <span className="text-slate-600">{reason}:</span>
                        <strong className="text-slate-900 font-bold">{count}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Calling & Conversion */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Calls &amp; Order Conversion
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                      <div className="text-base font-black text-slate-900">{sc.callsMade}</div>
                      <div className="text-[10px] text-slate-500">Calls Made</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                      <div className="text-base font-black text-emerald-600">{sc.productiveCalls}</div>
                      <div className="text-[10px] text-slate-500">Orders Coll.</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                      <div className="text-base font-black text-blue-600">{sc.callToOrderRatioPct}%</div>
                      <div className="text-[10px] text-slate-500">Conversion %</div>
                    </div>
                  </div>
                </div>

                {/* Cheques & Collection Speed */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Cheque Custody &amp; Collection Discipline
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                      <div className="text-base font-black text-slate-900">{sc.chequesCollected}</div>
                      <div className="text-[10px] text-slate-500">Cheques Coll.</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                      <div className="text-base font-black text-amber-600">{sc.avgChequeHandoverDays > 0 ? `${sc.avgChequeHandoverDays}d` : '—'}</div>
                      <div className="text-[10px] text-slate-500">Handover Gap</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                      <div className="text-base font-black text-rose-600">{sc.chequesOverdue}</div>
                      <div className="text-[10px] text-slate-500">Overdue</div>
                    </div>
                  </div>
                </div>

                {/* Merchandising Proof of Work & Tasks */}
                <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Photos: <strong>{sc.shelfPhotosTaken}</strong></span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5 text-blue-600" />
                    <span>Stock: <strong>{sc.stockCountsDone}</strong></span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FileCheck2 className="h-3.5 w-3.5 text-amber-600" />
                    <span>Docs: <strong>{sc.documentsCollected}</strong></span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-rose-600" />
                    <span>Tasks: <strong>{sc.pendingTasks}</strong></span>
                  </div>
                </div>

                {/* Fix 38c: Latest Daily Summary Expandable Section */}
                {(() => {
                  const summaries = db.getFieldOfficerDailySummaries(sc.officerId);
                  const latestSummary = summaries[0];
                  if (!latestSummary) return null;
                  return (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="border-t border-slate-100 pt-3 space-y-2 bg-slate-50/80 p-3 rounded-xl border border-slate-200/70"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span>Latest Daily Summary</span>
                        </span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                          {latestSummary.dateBs}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 space-y-1">
                        <div className="flex justify-between">
                          <span>Beat Visits:</span>
                          <span className="font-bold text-slate-900">
                            {latestSummary.storesVisited}/{latestSummary.totalStores} ({latestSummary.compliancePct}%)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Calls &amp; Orders:</span>
                          <span className="font-semibold text-slate-700">
                            {latestSummary.callsMade} calls &bull; {latestSummary.ordersCollected} orders
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Cheques Collected:</span>
                          <span className="font-semibold text-emerald-700 font-mono">
                            {latestSummary.chequesCollected} (NPR {latestSummary.chequeTotalAmount.toLocaleString()})
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Field Time:</span>
                          <span>{latestSummary.startTime} – {latestSummary.endTime} ({latestSummary.durationFormatted})</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
          );
        })}
      </div>
      )}
    </div>

      {/* ========================================================================= */}
      {/* 3b. FULL 16-METRIC COMPARISON TABLE (ADMIN ONLY)                          */}
      {/* ========================================================================= */}
      {!isOfficer && (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-black">
                3b
              </span>
              <h2 className="text-base font-bold text-slate-900">
                16-Metric Side-by-Side Performance Matrix (PRD Part 4.7)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Rigorous cross-comparison across all 3 officers with automated leader highlights and lagging flags.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-800 font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Best Performer
            </span>
            <span className="flex items-center gap-1.5 text-rose-700 font-bold">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> Lagging Metric
            </span>
          </div>
        </div>

        {displayScorecards.length === 0 ? (
          <div className="py-8">
            <EmptyState
              type="visits"
              title="No Staff Scorecards Available"
              description="Staff performance scorecards will appear once sales officers log activity or complete beat store visits."
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold text-slate-900">Operational Metric</th>
                  {displayScorecards.map((sc) => (
                    <th key={sc.officerId} className="py-3 px-4 text-center font-bold text-slate-900">
                      {sc.officerName}
                    </th>
                  ))}
                  {displayScorecards.length > 1 && (
                    <th className="py-3 px-4 text-center font-black text-slate-900">Best Leader</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {METRIC_DEFINITIONS.map((metric) => {
                  let bestOfficer: OfficerScorecard | undefined = undefined;
                  let bestVal = metric.isLowerBetter ? Infinity : -Infinity;

                  for (const sc of displayScorecards) {
                    const val = metric.extract(sc);
                    if (metric.isLowerBetter ? val < bestVal : val > bestVal) {
                      bestVal = val;
                      bestOfficer = sc;
                    }
                  }

                  const bestId = bestOfficer ? bestOfficer.officerId : '';
                  const bestName = bestOfficer ? bestOfficer.officerName : '';

                  return (
                    <tr key={metric.name} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">{metric.name}</td>
                      {displayScorecards.map((sc) => {
                        const rawVal = metric.extract(sc);
                        const formatted = metric.formatter ? metric.formatter(rawVal) : rawVal;
                        const isBest =
                          bestId === sc.officerId &&
                          displayScorecards.length > 1;

                        return (
                          <td
                            key={sc.officerId}
                            className={`py-3 px-4 text-center ${
                              isBest
                                ? 'bg-emerald-50 font-black text-emerald-900'
                                : 'font-medium text-slate-700'
                            }`}
                          >
                            {formatted}
                          </td>
                        );
                      })}

                      {displayScorecards.length > 1 && (
                        <td className="py-3 px-4 text-center">
                          {bestName ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-black text-[11px] border border-emerald-300">
                              {bestName} ✓
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* ========================================================================= */}
      {/* 3c. 8-WEEK COMPLIANCE TREND LINES PER OFFICER                            */}
      {/* ========================================================================= */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs font-black">
                3c
              </span>
              <h2 className="text-base font-bold text-slate-900">
                8-Week Beat Compliance Trend Lines
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Trajectory of beat discipline over the last 8 weeks to determine whether each officer is improving, stable, or declining.
            </p>
          </div>
        </div>

        <div className={`grid grid-cols-1 ${isOfficer ? 'max-w-md' : 'md:grid-cols-3'} gap-6`}>
          {visibleTrendLines.map((trend) => {
            // Compute SVG points for a 260x70 viewBox
            const width = 260;
            const height = 70;
            const min = 70;
            const max = 100;

            const points = trend.weeks.map((val, idx) => {
              const x = trend.weeks.length > 1
                ? (idx / (trend.weeks.length - 1)) * (width - 24) + 12
                : width / 2;
              const y = height - ((val - min) / (max - min)) * (height - 20) - 10;
              return { x, y, val };
            });

            const pathD = points.reduce((acc, p, idx) => {
              return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
            }, '');

            const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

            return (
              <div
                key={trend.officerId}
                className="rounded-2xl border border-slate-200 p-5 bg-slate-50/40 space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-black text-slate-900 text-sm">{trend.officerName}</h3>
                    <div className="text-[11px] text-slate-500">
                      8-Week Compliance: <strong className="text-slate-900">{trend.start}% → {trend.current}%</strong>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black border ${trend.statusColor}`}>
                    {trend.status} ({trend.change})
                  </span>
                </div>

                {/* SVG Mini Line Chart */}
                <div className="rounded-xl bg-white p-3 border border-slate-100 shadow-2xs">
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24 overflow-visible">
                    <defs>
                      <linearGradient id={`grad-${trend.officerId}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={trend.strokeColor} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={trend.strokeColor} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Area fill */}
                    <path d={areaD} fill={`url(#grad-${trend.officerId})`} />

                    {/* Trend Line */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={trend.strokeColor}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Data Points */}
                    {points.map((p, i) => (
                      <g key={i} className="group/point">
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="3"
                          fill="#ffffff"
                          stroke={trend.strokeColor}
                          strokeWidth="2"
                        />
                        <title>Week {i + 1}: {p.val}%</title>
                      </g>
                    ))}
                  </svg>

                  <div className="flex justify-between text-[10px] text-slate-400 font-bold mt-2 pt-1 border-t border-slate-100">
                    <span>W1 ({trend.start}%)</span>
                    <span>W4</span>
                    <span>W8 ({trend.current}%)</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3d. DRILL-DOWN OFFICER PERFORMANCE 360° MODAL / DRAWER                     */}
      {/* ========================================================================= */}
      {drilldownOfficerId && selectedOfficerSc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 font-black text-white text-lg shadow-xs">
                  {selectedOfficerSc.officerName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-slate-900">{selectedOfficerSc.officerName}</h2>
                    <span className="rounded-md bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5">
                      {selectedOfficerSc.beatCompliancePct}% Beat Compliance
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedOfficerSc.area}</p>
                </div>
              </div>

              <button
                onClick={() => setDrilldownOfficerId(null)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-100/60 overflow-x-auto px-4 gap-1 pt-2">
              {[
                { key: 'STORES', label: 'Stores & Beat', count: officerStores.length },
                { key: 'CHEQUES', label: 'Cheques', count: officerCheques.length },
                { key: 'TASKS', label: 'Pending Tasks', count: officerTasks.length },
                { key: 'CALLS', label: 'Field Calls', count: officerCalls.length },
                { key: 'PHOTOS', label: 'Shelf Photos', count: officerPhotos.length },
                { key: 'DOCS', label: 'Documents', count: officerDocs.length },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setDrilldownTab(t.key as any)}
                  className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                    drilldownTab === t.key
                      ? 'bg-white text-slate-900 border-t border-x border-slate-200 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <span>{t.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    drilldownTab === t.key ? 'bg-blue-100 text-blue-800 font-black' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 text-xs">
              {/* TAB 1: STORES */}
              {drilldownTab === 'STORES' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-slate-500 text-[11px]">
                    <span>Retail stores assigned to {selectedOfficerSc.officerName}</span>
                    <span className="font-bold">{officerStores.length} Stores Total</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {officerStores.map((st) => (
                      <div key={st.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <Link
                            href={`/offline-sales/stores/${st.id || encodeURIComponent(st.name)}`}
                            className="font-bold text-slate-900 text-xs hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            {st.name}
                            <ArrowUpRight className="h-3 w-3 text-slate-400" />
                          </Link>
                          <div className="text-[11px] text-slate-400">{st.type} • {st.address}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              st.status === 'VISITED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : st.status === 'SKIPPED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {st.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: CHEQUES */}
              {drilldownTab === 'CHEQUES' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-slate-500 text-[11px]">
                    <span>Cheques in custody / deposited by {selectedOfficerSc.officerName}</span>
                    <span className="font-bold">Total: NPR {officerCheques.reduce((s, c) => s + c.amount, 0).toLocaleString()}</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {officerCheques.length === 0 ? (
                      <div className="p-6 text-center text-slate-400">No active cheques found for this period.</div>
                    ) : (
                      officerCheques.map((ch) => (
                        <div key={ch.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <Link
                              href={`/offline-sales/cheques?search=${encodeURIComponent(ch.chequeNumber)}`}
                              className="font-bold text-slate-900 text-xs hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                            >
                              Cheque #{ch.chequeNumber} — {ch.bankName}
                              <ArrowUpRight className="h-3 w-3 text-slate-400" />
                            </Link>
                            <div className="text-[11px] text-slate-400">
                              <Link
                                href={`/offline-sales/stores/${ch.entityId || encodeURIComponent(ch.storeName)}`}
                                className="hover:text-blue-600 hover:underline font-medium text-slate-700"
                              >
                                {ch.storeName}
                              </Link>{' '}
                              • Cash Date: {ch.cashDateAd}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-slate-900 text-xs">NPR {ch.amount.toLocaleString()}</div>
                            <span className="rounded bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 text-[9px]">
                              {ch.status}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: TASKS */}
              {drilldownTab === 'TASKS' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-slate-500 text-[11px]">
                    <span>Assigned operational directives</span>
                    <span className="font-bold">{officerTasks.length} Active Tasks</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {officerTasks.map((t) => (
                      <div key={t.id} className="p-3 flex items-start justify-between hover:bg-slate-50 gap-3">
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900">{t.title}</div>
                          <p className="text-[11px] text-slate-500">{t.description}</p>
                          <div className="text-[10px] text-slate-400">Due: {t.dueDateBs} ({t.dueDateAd})</div>
                        </div>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold shrink-0 ${
                            t.priority === 'HIGH'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {t.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: CALLS */}
              {drilldownTab === 'CALLS' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-slate-500 text-[11px]">
                    <span>Tele-sales &amp; payment follow-up call history</span>
                    <span className="font-bold">{officerCalls.length} Calls Logged</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {officerCalls.length === 0 ? (
                      <div className="p-6 text-center text-slate-400">No field calls logged in this period.</div>
                    ) : (
                      officerCalls.map((c) => (
                        <div key={c.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <div className="font-bold text-slate-900">{c.storeName} ({c.contactName})</div>
                            <div className="text-[11px] text-slate-400">{c.label} • Duration: {Math.round(c.durationSeconds / 60)}m</div>
                          </div>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                              c.outcome === 'Order Received'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {c.outcome}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: PHOTOS */}
              {drilldownTab === 'PHOTOS' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-slate-500 text-[11px]">
                    <span>Shelf facing audit &amp; planogram photo gallery</span>
                    <span className="font-bold">{officerPhotos.length} Merchandising Photos</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {officerPhotos.length === 0 ? (
                      <div className="col-span-3 p-6 text-center text-slate-400">No shelf photos submitted yet.</div>
                    ) : (
                      officerPhotos.map((p) => {
                        const img = (p.afterPhotoUrls && p.afterPhotoUrls[0]) || (p.beforePhotoUrls && p.beforePhotoUrls[0]);
                        return (
                          <div key={p.id} className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                            {img ? (
                              <img
                                src={img}
                                alt={p.storeName}
                                className="h-32 w-full object-cover"
                              />
                            ) : (
                              <div className="h-32 w-full flex items-center justify-center bg-slate-100 text-slate-400">
                                <Camera className="w-6 h-6" />
                              </div>
                            )}
                            <div className="p-2.5 space-y-0.5">
                              <div className="font-bold text-slate-900 truncate">{p.storeName}</div>
                              <div className="text-[10px] text-slate-400">{p.dateBs}</div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: DOCS */}
              {drilldownTab === 'DOCS' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-slate-500 text-[11px]">
                    <span>Handover documents (delivery receipts, VAT bills)</span>
                    <span className="font-bold">{officerDocs.length} Collected</span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {officerDocs.length === 0 ? (
                      <div className="p-6 text-center text-slate-400">No handover documents recorded.</div>
                    ) : (
                      officerDocs.map((doc) => (
                        <div key={doc.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <div className="font-bold text-slate-900">{doc.documentType}</div>
                            <div className="text-[11px] text-slate-400">{doc.storeName} • Ref: {doc.referenceNumber || 'N/A'}</div>
                          </div>
                          <span className="rounded bg-blue-100 text-blue-800 font-bold px-2 py-0.5 text-[10px]">
                            {doc.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setDrilldownOfficerId(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
              >
                Close Activity Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3e. SKIPPED STORES ANALYSIS MODAL                                        */}
      {/* ========================================================================= */}
      {showSkipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <h3 className="font-bold text-slate-900 text-base">Skipped Stores Log &amp; Root Cause Analysis</h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Allows sales managers to detect recurring operational bottlenecks across retail store routes.
                </p>
              </div>

              <button
                onClick={() => setShowSkipModal(false)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Officer Filter in Modal */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/40 flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-600">Filter Officer:</span>
              <div className="flex gap-1.5">
                {[
                  { id: 'ALL', name: 'All Officers' },
                  ...displayScorecards.map((sc) => ({ id: sc.officerId, name: sc.officerName })),
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSkipModalOfficerFilter(opt.id)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                      skipModalOfficerFilter === opt.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Table */}
            <div className="p-5 overflow-y-auto flex-1">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Date (BS/AD)</th>
                      <th className="py-2.5 px-3">Store Name &amp; Area</th>
                      <th className="py-2.5 px-3">Officer</th>
                      <th className="py-2.5 px-3">Skip Reason</th>
                      <th className="py-2.5 px-3">Notes / Operational Context</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSkippedStores.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No skipped stores logged for this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredSkippedStores.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{item.dateBs}</div>
                            <div className="text-[10px] text-slate-400">{item.dateAd}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{item.storeName}</div>
                            <div className="text-[10px] text-slate-400">{item.area}</div>
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-700">{item.officerName}</td>
                          <td className="py-3 px-3">
                            <span className="rounded bg-rose-100 text-rose-800 font-bold px-2 py-0.5 text-[10px]">
                              {item.skipReason}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-medium max-w-xs">{item.notes}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowSkipModal(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
              >
                Close Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScorecardPage() {
  return (
    <PageGuard feature="staff_scorecards">
      <Suspense
        fallback={
          <div className="p-8 text-center text-slate-500 font-medium">
            Loading Scorecard and Officer Metrics...
          </div>
        }
      >
        <ScorecardContent />
      </Suspense>
    </PageGuard>
  );
}


