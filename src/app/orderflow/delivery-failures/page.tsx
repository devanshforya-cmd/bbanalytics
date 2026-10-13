'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { getBrands } from '@/lib/db/brands-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { DeliveryFailure, BrandCode, DeliveryFailureStatus, Order } from '@/lib/types';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { toast } from '@/components/common/Toast';
import { validateRequired, validateNepaliPhone } from '@/lib/validation';
import {
  TruckIcon,
  Plus,
  Search,
  Filter,
  AlertOctagon,
  PhoneOff,
  MapPinOff,
  UserX,
  X,
  Calendar,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  CheckCircle2,
  Archive,
  Ban,
  Clock,
  Compass,
  Sparkles,
  BarChart3,
  ArrowUpRight,
  Activity,
  Check,
  Camera,
  ShieldAlert,
  Image as ImageIcon,
} from 'lucide-react';

function getHistoricalWeeklyTrend(failures: DeliveryFailure[]) {
  const now = new Date();
  const allOrders = db.getOrders();
  return Array.from({ length: 12 }, (_, idx) => {
    const weekStartMs = now.getTime() - (11 - idx) * 7 * 24 * 60 * 60 * 1000;
    const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;
    const startDate = new Date(weekStartMs);
    const monthShort = startDate.toLocaleString('en-US', { month: 'short' });
    const dayNum = String(startDate.getDate()).padStart(2, '0');
    const label = `${monthShort} ${dayNum}`;

    const attempts = allOrders.filter((o) => {
      const t = new Date(o.orderDateAd || o.createdAt).getTime();
      return t >= weekStartMs && t < weekEndMs;
    }).length;

    const failCount = failures.filter((f) => {
      const t = new Date(f.dateAd || f.createdAt).getTime();
      return t >= weekStartMs && t < weekEndMs;
    }).length;

    const rate = attempts > 0 ? Math.round((failCount / attempts) * 1000) / 10 : 0;
    return {
      week: `W${idx + 1} (${label})`,
      label: `W${idx + 1}`,
      attempts,
      failures: failCount,
      rate,
    };
  });
}

export default function DeliveryFailuresPage() {
  const [failures, setFailures] = useState<DeliveryFailure[]>(() => db.getDeliveryFailures());
  const HISTORICAL_WEEKLY_TREND = useMemo(() => getHistoricalWeeklyTrend(failures), [failures]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedValley, setSelectedValley] = useState<string>('ALL');
  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedReasonFilter, setSelectedReasonFilter] = useState<string | null>(null);

  // Hover state for Trend Chart
  const [hoveredWeekIndex, setHoveredWeekIndex] = useState<number | null>(null);

  // Modals
  const [showLogModal, setShowLogModal] = useState(false);
  const [reattemptModalItem, setReattemptModalItem] = useState<DeliveryFailure | null>(null);
  const [reattemptDate, setReattemptDate] = useState(getTodayAd());
  const [reattemptAssignee, setReattemptAssignee] = useState('Pathao Express Rider');
  const [reattemptNotes, setReattemptNotes] = useState('');

  // Fix 41: Proof of Delivery (POD) & Fraud Detection State
  const [selectedPodProof, setSelectedPodProof] = useState<{
    orderNumber: string;
    customerName: string;
    proof: NonNullable<Order['deliveryProof']>;
  } | null>(null);
  const [showUploadPodModal, setShowUploadPodModal] = useState<DeliveryFailure | null>(null);
  const [podDeliveredBy, setPodDeliveredBy] = useState('Pathao Express Courier #882');
  const [podRecipient, setPodRecipient] = useState('');
  const [podPhotoUrl, setPodPhotoUrl] = useState(
    'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=500&auto=format&fit=crop&q=60'
  );

  const handleSavePod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showUploadPodModal) return;

    db.addDeliveryProof(showUploadPodModal.orderNumber, {
      photoUrl: podPhotoUrl,
      deliveryDateBs: getTodayBs(),
      deliveryDateAd: getTodayAd(),
      recipientName: podRecipient || showUploadPodModal.customerName,
      deliveredBy: podDeliveredBy,
    });

    setShowUploadPodModal(null);
    toast.success(
      `✓ Proof of delivery recorded for order ${showUploadPodModal.orderNumber}. Disputed claim flagged.`
    );
  };

  // Form State for new failure
  const [orderNumber, setOrderNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [productName, setProductName] = useState('Forya Roll-On Peach 50ml');
  const [brandCode, setBrandCode] = useState<BrandCode>('FORYA');
  const [deliveryMethod, setDeliveryMethod] = useState<'Standard' | 'Pathao' | 'In-house Rider' | 'Nepal Post'>('Standard');
  const [reason, setReason] = useState<DeliveryFailure['reason']>('Call not received');
  const [valley, setValley] = useState<'Inside' | 'Outside'>('Outside');
  const [remarks, setRemarks] = useState('');
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  // Days since calculation
  const getDaysSince = (dateAd: string) => {
    try {
      const docDate = new Date(dateAd).getTime();
      const today = new Date().getTime();
      const diffMs = Math.max(0, today - docDate);
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      return `${days}d ago`;
    } catch {
      return '—';
    }
  };

  // 6b. Reason breakdown counts & percentages
  const reasonBreakdown = useMemo(() => {
    const reasonsList: { reason: DeliveryFailure['reason']; label: string; color: string; bg: string; border: string }[] = [
      { reason: 'Call not received', label: 'Call Not Received', color: 'text-amber-700', bg: 'bg-amber-500', border: 'border-amber-300' },
      { reason: 'Address not found', label: 'Address Not Found', color: 'text-blue-700', bg: 'bg-blue-500', border: 'border-blue-300' },
      { reason: 'Customer refused delivery', label: 'Customer Refused', color: 'text-rose-700', bg: 'bg-rose-500', border: 'border-rose-300' },
      { reason: 'Customer unavailable', label: 'Customer Unavailable', color: 'text-purple-700', bg: 'bg-purple-500', border: 'border-purple-300' },
    ];

    const total = failures.length;
    return reasonsList.map((item) => {
      const count = failures.filter((f) => f.reason === item.reason).length;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return {
        ...item,
        count,
        pct,
      };
    });
  }, [failures]);

  // 6e. Dynamic Pattern Analysis calculations directly from data
  const patterns = useMemo(() => {
    if (failures.length === 0) return null;

    // 1. Day of Week calculation: Monday (1) and Tuesday (2)
    let monTueCount = 0;
    failures.forEach((f) => {
      const d = new Date(f.dateAd);
      const day = d.getDay(); // 0 is Sunday, 1 is Monday, 2 is Tuesday
      if (day === 1 || day === 2) monTueCount++;
    });
    const monTuePct = Math.round((monTueCount / failures.length) * 100);

    // 2. Outside vs Inside Valley calculation
    const outsideCount = failures.filter((f) => f.valley === 'Outside').length;
    const insideCount = failures.filter((f) => f.valley === 'Inside').length;
    const outsideRatio = insideCount > 0 ? (outsideCount / insideCount).toFixed(1) : outsideCount.toString();

    // 3. Pathao vs Standard calculation
    const pathaoCount = failures.filter((f) => f.deliveryMethod === 'Pathao').length;
    const standardCount = failures.filter((f) => f.deliveryMethod === 'Standard').length;
    const pathaoToStandardMultiplier =
      pathaoCount > 0 ? (standardCount / pathaoCount).toFixed(1) : standardCount.toString();

    return {
      monTuePct,
      outsideCount,
      insideCount,
      outsideRatio,
      pathaoCount,
      standardCount,
      pathaoToStandardMultiplier,
    };
  }, [failures]);

  // 6a. Filtered Failures List
  const filtered = useMemo(() => {
    return failures.filter((f) => {
      if (selectedReasonFilter && f.reason !== selectedReasonFilter) return false;
      if (selectedBrand !== 'ALL' && f.brandCode !== selectedBrand) return false;
      if (selectedValley !== 'ALL' && f.valley !== selectedValley) return false;
      if (selectedMethod !== 'ALL' && f.deliveryMethod !== selectedMethod) return false;
      if (selectedStatus !== 'ALL') {
        const curStatus = f.status || 'FAILED';
        if (curStatus !== selectedStatus) return false;
      }

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matches =
          f.orderNumber.toLowerCase().includes(q) ||
          f.customerName.toLowerCase().includes(q) ||
          f.customerPhone.includes(q) ||
          (f.productName && f.productName.toLowerCase().includes(q)) ||
          f.reason.toLowerCase().includes(q) ||
          (f.remarks && f.remarks.toLowerCase().includes(q)) ||
          (f.assignedTo && f.assignedTo.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [
    failures,
    selectedReasonFilter,
    selectedBrand,
    selectedValley,
    selectedMethod,
    selectedStatus,
    searchTerm,
  ]);

  // 6c. Actions Handlers
  const handleScheduleReattempt = () => {
    if (!reattemptModalItem) return;
    db.updateDeliveryFailure(reattemptModalItem.id, {
      status: 'REATTEMPT_SCHEDULED',
      reattemptDateAd: reattemptDate,
      assignedTo: reattemptAssignee,
      attempts: (reattemptModalItem.attempts || 1) + 1,
      remarks: reattemptNotes.trim() || reattemptModalItem.remarks,
    });
    setFailures([...db.getDeliveryFailures()]);
    setReattemptModalItem(null);
    setReattemptNotes('');
    toast.success('Delivery reattempt scheduled successfully.');
  };

  const handleMarkAsDelivered = (item: DeliveryFailure) => {
    db.updateDeliveryFailure(item.id, {
      status: 'DELIVERED',
      remarks: `${item.remarks || ''} (Delivered successfully upon reattempt)`.trim(),
    });
    setFailures([...db.getDeliveryFailures()]);
    toast.success('Order marked as delivered successfully.');
  };

  const handleReturnToWarehouse = (item: DeliveryFailure) => {
    db.updateDeliveryFailure(item.id, {
      status: 'RETURNED_TO_WAREHOUSE',
      remarks: `${item.remarks || ''} (All delivery attempts exhausted. Consignment returned to warehouse)`.trim(),
    });
    setFailures([...db.getDeliveryFailures()]);
    toast.info('Consignment returned to warehouse.');
  };

  const handleCancelOrder = (item: DeliveryFailure) => {
    db.updateDeliveryFailure(item.id, {
      status: 'CANCELLED',
      remarks: `${item.remarks || ''} (Order cancelled upon customer request)`.trim(),
    });
    setFailures([...db.getDeliveryFailures()]);
    toast.info('Order marked as cancelled.');
  };

  const handleSaveNewFailure = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};
    const orderErr = validateRequired(orderNumber, 'Order number');
    if (orderErr) errors.orderNumber = orderErr;

    const phoneErr = validateNepaliPhone(customerPhone);
    if (phoneErr) errors.customerPhone = phoneErr;

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error('Please fix the validation errors before submitting.');
      return;
    }
    setFormErrors({});

    db.addDeliveryFailure({
      orderId: `ord_${Date.now()}`,
      orderNumber,
      brandCode,
      customerName: customerName || 'Customer',
      customerPhone,
      productName,
      deliveryMethod,
      dateAd: getTodayAd(),
      dateBs: getTodayBs(),
      reason,
      valley,
      attempts: 1,
      status: 'FAILED',
      remarks,
    });

    setFailures([...db.getDeliveryFailures()]);
    setShowLogModal(false);
    toast.success('Delivery failure logged successfully.');

    // Reset Form
    setOrderNumber('');
    setCustomerName('');
    setCustomerPhone('');
    setRemarks('');
  };

  // SVG dimensions for 6d
  const chartWidth = 720;
  const chartHeight = 160;
  const paddingX = 40;
  const paddingY = 24;
  const maxRate = 7.0; // 7% top scale

  const points = HISTORICAL_WEEKLY_TREND.map((item, idx) => {
    const x = paddingX + (idx / (HISTORICAL_WEEKLY_TREND.length - 1)) * (chartWidth - paddingX * 2);
    const y = chartHeight - paddingY - (item.rate / maxRate) * (chartHeight - paddingY * 2);
    return { x, y, ...item };
  });

  const pathD = points.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );
  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight - paddingY} L ${points[0].x} ${chartHeight - paddingY} Z`;

  // SLA line (3.0%)
  const slaY = chartHeight - paddingY - (3.0 / maxRate) * (chartHeight - paddingY * 2);

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'DATA_ENTRY']}>
      <div className="space-y-6 pb-20">
      <Breadcrumbs
        items={[
          { label: 'OrderFlow', href: '/orderflow/manual-entry' },
          { label: 'Delivery Failures' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Delivery Failures Register
            </h1>
            <span className="rounded-full bg-rose-100 text-rose-800 text-xs font-bold px-2.5 py-0.5">
              Separated from Product Returns
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Tracks courier bottlenecks (&quot;Call not received&quot;, &quot;Address not found&quot;) without muddying product quality metrics.
          </p>
        </div>

        <button
          onClick={() => setShowLogModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 self-start sm:self-auto transition-colors"
        >
          <Plus className="h-4 w-4" />
          Log Delivery Failure
        </button>
      </div>

      {/* 6b. Reason Breakdown Chart (Horizontal Bar Chart with click-to-filter) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              Failure Reason Breakdown & Distribution
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any bar to filter the records table below by failure root cause.
            </p>
          </div>

          {selectedReasonFilter && (
            <button
              onClick={() => setSelectedReasonFilter(null)}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors self-start sm:self-auto"
            >
              Filtering by: {selectedReasonFilter} <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reasonBreakdown.map((item) => {
            const isSelected = selectedReasonFilter === item.reason;
            return (
              <div
                key={item.reason}
                onClick={() => setSelectedReasonFilter(isSelected ? null : item.reason)}
                className={`group cursor-pointer rounded-xl border p-3.5 transition-all ${
                  isSelected
                    ? `${item.border} ring-2 ring-blue-500 bg-blue-50/20`
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    {item.label}
                    {isSelected && <Check className="h-3.5 w-3.5 text-blue-600" />}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">{item.count}</span>
                    <span className="text-slate-400 font-medium">({item.pct}%)</span>
                  </div>
                </div>

                {/* Bar */}
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    style={{ width: `${item.pct}%` }}
                    className={`h-full rounded-full ${item.bg} transition-all duration-500`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6e. Pattern Analysis Cards (Auto-detected from data) */}
      {patterns && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Monday & Tuesday Spike */}
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-white p-4 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-amber-800 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="h-4 w-4 text-amber-600" />
              Day-of-Week Pattern
            </div>
            <div className="text-xl font-bold text-slate-900">
              {patterns.monTuePct}% of Failures on Mon/Tue
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Delivery failures cluster heavily at the start of the workweek due to weekend courier transit accumulation and uncoordinated customer calls.
            </p>
          </div>

          {/* Card 2: Outside Valley Disparity */}
          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white p-4 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-indigo-800 text-xs font-bold uppercase tracking-wider">
              <Compass className="h-4 w-4 text-indigo-600" />
              Territory Disparity
            </div>
            <div className="text-xl font-bold text-slate-900">
              Outside Valley is {patterns.outsideRatio}x Higher
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {patterns.outsideCount} Outside Valley vs {patterns.insideCount} Inside Valley failures. Provincial regional hubs face severe street landmark ambiguity.
            </p>
          </div>

          {/* Card 3: Pathao vs Standard Courier */}
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white p-4 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wider">
              <TruckIcon className="h-4 w-4 text-emerald-600" />
              Courier Channel Reliability
            </div>
            <div className="text-xl font-bold text-slate-900">
              Pathao Fails {patterns.pathaoToStandardMultiplier}x Less
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pathao deliveries log {patterns.pathaoCount} failures versus {patterns.standardCount} on Standard Courier. Direct rider GPS tracking sharply cuts location misses.
            </p>
          </div>
        </div>
      )}

      {/* 6d. Trend Section: Weekly Line Chart (Last 3 Months) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-600" />
              Delivery Failure Rate Trend (Last 3 Months / 12 Weeks)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Weekly failure rate percentage against total delivery dispatch attempts.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
              <TrendingDown className="h-3.5 w-3.5" />
              Current Rate: 1.5% (-73% drop)
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Actual Rate
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <span className="h-0.5 w-3 bg-rose-400 border-dashed" />
              3.0% SLA Target
            </div>
          </div>
        </div>

        {/* SVG Line Chart */}
        <div className="relative overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-44 select-none"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="failureGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            <line x1={paddingX} y1={paddingY} x2={chartWidth - paddingX} y2={paddingY} stroke="#f1f5f9" strokeWidth="1" />
            <line x1={paddingX} y1={chartHeight / 2} x2={chartWidth - paddingX} y2={chartHeight / 2} stroke="#f1f5f9" strokeWidth="1" />
            <line x1={paddingX} y1={chartHeight - paddingY} x2={chartWidth - paddingX} y2={chartHeight - paddingY} stroke="#e2e8f0" strokeWidth="1" />

            {/* SLA Target Line (Dashed) */}
            <line
              x1={paddingX}
              y1={slaY}
              x2={chartWidth - paddingX}
              y2={slaY}
              stroke="#f43f5e"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text x={chartWidth - paddingX - 4} y={slaY - 4} textAnchor="end" fill="#f43f5e" fontSize="9" fontWeight="bold">
              3.0% SLA Target
            </text>

            {/* Area Fill */}
            <path d={areaD} fill="url(#failureGradient)" />

            {/* Line */}
            <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* Points */}
            {points.map((pt, idx) => {
              const isHovered = hoveredWeekIndex === idx;
              return (
                <g key={pt.week} className="cursor-pointer" onMouseEnter={() => setHoveredWeekIndex(idx)} onMouseLeave={() => setHoveredWeekIndex(null)}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 6 : 3.5}
                    fill={isHovered ? '#059669' : '#ffffff'}
                    stroke="#10b981"
                    strokeWidth="2.5"
                    className="transition-all"
                  />
                  {/* X Axis Label */}
                  <text
                    x={pt.x}
                    y={chartHeight - 6}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="9"
                    fontWeight={isHovered ? 'bold' : 'normal'}
                  >
                    {pt.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Interactive Tooltip Card */}
          {hoveredWeekIndex !== null && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded-xl px-3 py-2 text-xs shadow-xl border border-slate-700 pointer-events-none flex items-center gap-3">
              <span className="font-bold text-emerald-400">{HISTORICAL_WEEKLY_TREND[hoveredWeekIndex].week}</span>
              <span>Dispatches: <strong>{HISTORICAL_WEEKLY_TREND[hoveredWeekIndex].attempts}</strong></span>
              <span>Failures: <strong>{HISTORICAL_WEEKLY_TREND[hoveredWeekIndex].failures}</strong></span>
              <span>Failure Rate: <strong className="text-emerald-300">{HISTORICAL_WEEKLY_TREND[hoveredWeekIndex].rate}%</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* 6a. Full Data Table Filter Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search order #, customer, phone, product, remarks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-500"
            />
          </div>

          {/* Brand Filter */}
          <div>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white outline-none focus:border-blue-500"
            >
              <option value="ALL">All Brands</option>
              {getBrands('ACTIVE').map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Valley Filter */}
          <div>
            <select
              value={selectedValley}
              onChange={(e) => setSelectedValley(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white outline-none focus:border-blue-500"
            >
              <option value="ALL">All Territories</option>
              <option value="Inside">Inside Valley</option>
              <option value="Outside">Outside Valley</option>
            </select>
          </div>

          {/* Delivery Method */}
          <div>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white outline-none focus:border-blue-500"
            >
              <option value="ALL">All Delivery Methods</option>
              <option value="Standard">Standard Courier</option>
              <option value="Pathao">Pathao Express</option>
              <option value="In-house Rider">In-house Rider</option>
            </select>
          </div>
        </div>

        {/* Second Row: Status filter & Record counter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">Status Filter:</span>
            <div className="flex flex-wrap gap-1.5">
              {['ALL', 'FAILED', 'REATTEMPT_SCHEDULED', 'DELIVERED', 'RETURNED_TO_WAREHOUSE', 'CANCELLED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase transition-all ${
                    selectedStatus === st
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-slate-500 font-medium self-end sm:self-center">
            Showing {filtered.length} of {failures.length} records
          </div>
        </div>
      </div>

      {/* 6a. Full Data Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[1100px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="py-3 px-3">Date (BS/AD)</th>
                <th className="py-3 px-3">Order #</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3">Phone</th>
                <th className="py-3 px-3">Brand</th>
                <th className="py-3 px-3">Product</th>
                <th className="py-3 px-3">Reason</th>
                <th className="py-3 px-3">Delivery Method</th>
                <th className="py-3 px-3">Valley</th>
                <th className="py-3 px-3">Attempts</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Days Since</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-slate-400">
                    No delivery failures match current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((df) => {
                  const daysSince = getDaysSince(df.dateAd);
                  const status = df.status || 'FAILED';

                  return (
                    <tr key={df.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Date (AD) */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                        <div className="font-semibold text-slate-900 font-mono text-xs">{df.dateAd}</div>
                      </td>

                      {/* Order # & Proof of Delivery Fraud Warning (Fix 41) */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-blue-600">{df.orderNumber}</div>
                        {(() => {
                          const order = db
                            .getOrders()
                            .find((o) => o.id === df.orderNumber || o.orderNumber === df.orderNumber);
                          if (order?.deliveryProof) {
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedPodProof({
                                    orderNumber: df.orderNumber,
                                    customerName: df.customerName,
                                    proof: order.deliveryProof!,
                                  })
                                }
                                className="mt-1 flex items-center gap-1 rounded bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                              >
                                <Camera className="w-3 h-3 text-rose-600" />
                                <span>⚠️ Fraud Warning (POD on file)</span>
                              </button>
                            );
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setShowUploadPodModal(df);
                                setPodRecipient(df.customerName);
                              }}
                              className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600 transition cursor-pointer"
                            >
                              <Camera className="w-2.5 h-2.5" />
                              <span>Attach POD</span>
                            </button>
                          );
                        })()}
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-3 font-semibold text-slate-800 whitespace-nowrap">
                        <Link
                          href={`/customers/${encodeURIComponent(df.customerPhone)}`}
                          className="hover:text-blue-600 hover:underline font-bold"
                        >
                          {df.customerName}
                        </Link>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {df.customerPhone}
                      </td>

                      {/* Brand */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            df.brandCode === 'FORYA'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : df.brandCode === 'RENEE'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {df.brandCode}
                        </span>
                      </td>

                      {/* Product */}
                      <td className="py-3 px-3 max-w-[180px] truncate text-slate-700" title={df.productName}>
                        <Link
                          href={`/products/${encodeURIComponent(df.productName || 'Cosmetics Parcel')}`}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {df.productName || 'Cosmetics Parcel'}
                        </Link>
                      </td>

                      {/* Reason */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            df.reason === 'Call not received'
                              ? 'bg-amber-100 text-amber-800'
                              : df.reason === 'Address not found'
                              ? 'bg-blue-100 text-blue-800'
                              : df.reason === 'Customer refused delivery'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {df.reason}
                        </span>
                      </td>

                      {/* Delivery Method */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                          {df.deliveryMethod || 'Standard'}
                        </span>
                      </td>

                      {/* Valley */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                            df.valley === 'Inside'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-orange-50 text-orange-700 border border-orange-200'
                          }`}
                        >
                          {df.valley} Valley
                        </span>
                      </td>

                      {/* Attempts */}
                      <td className="py-3 px-3 whitespace-nowrap font-mono text-center">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {df.attempts || 1}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                            status === 'DELIVERED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : status === 'REATTEMPT_SCHEDULED'
                              ? 'bg-blue-100 text-blue-800 animate-pulse'
                              : status === 'RETURNED_TO_WAREHOUSE'
                              ? 'bg-slate-200 text-slate-700'
                              : status === 'CANCELLED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {status.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Days Since */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        {daysSince}
                      </td>

                      {/* 6c. Contextual Action Buttons */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Schedule Reattempt */}
                          {status !== 'DELIVERED' && status !== 'CANCELLED' && status !== 'RETURNED_TO_WAREHOUSE' && (
                            <button
                              onClick={() => {
                                setReattemptModalItem(df);
                                setReattemptDate(getTodayAd());
                                setReattemptAssignee('Pathao Express Rider');
                                setReattemptNotes('');
                              }}
                              title="Schedule Reattempt"
                              className="rounded bg-blue-50 border border-blue-200 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                              Reattempt
                            </button>
                          )}

                          {/* Mark as Delivered */}
                          {status !== 'DELIVERED' && status !== 'CANCELLED' && status !== 'RETURNED_TO_WAREHOUSE' && (
                            <button
                              onClick={() => handleMarkAsDelivered(df)}
                              title="Mark as Delivered"
                              className="rounded bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 transition-colors"
                            >
                              Delivered ✓
                            </button>
                          )}

                          {/* Return to Warehouse */}
                          {status !== 'RETURNED_TO_WAREHOUSE' && status !== 'DELIVERED' && (
                            <button
                              onClick={() => handleReturnToWarehouse(df)}
                              title="Return to Warehouse (RTO)"
                              className="rounded bg-slate-100 border border-slate-200 px-1.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                            >
                              RTO
                            </button>
                          )}

                          {/* Cancel Order */}
                          {status !== 'CANCELLED' && status !== 'DELIVERED' && (
                            <button
                              onClick={() => handleCancelOrder(df)}
                              title="Cancel Order"
                              className="rounded bg-rose-50 border border-rose-200 px-1.5 py-1 text-[10px] font-semibold text-rose-600 hover:bg-rose-100 transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6c. Schedule Reattempt Modal */}
      {reattemptModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-blue-600" />
                  Schedule Delivery Reattempt
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Assign courier unit and reattempt date for order {reattemptModalItem.orderNumber}
                </p>
              </div>
              <button
                onClick={() => setReattemptModalItem(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 space-y-1">
              <div className="font-bold text-slate-900">{reattemptModalItem.customerName}</div>
              <div className="text-slate-600">{reattemptModalItem.productName || 'Cosmetics SKU'}</div>
              <div className="text-slate-500 text-[11px]">
                Phone: <span className="font-mono text-slate-800">{reattemptModalItem.customerPhone}</span> • Attempt #{((reattemptModalItem.attempts || 1) + 1)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Reattempt Date (AD) *</label>
                <input
                  type="date"
                  value={reattemptDate}
                  onChange={(e) => setReattemptDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Assign Courier / Rider *</label>
                <select
                  value={reattemptAssignee}
                  onChange={(e) => setReattemptAssignee(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none focus:border-blue-500 font-medium"
                >
                  <option value="Pathao Express Rider">Pathao Express Rider</option>
                  <option value="Rider Bikash (In-house)">Rider Bikash (In-house)</option>
                  <option value="Courier Ramesh Giri">Courier Ramesh Giri</option>
                  <option value="Outside Valley Hub Agent">Outside Valley Hub Agent</option>
                  <option value="Nepal Post Courier">Nepal Post Courier</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Rider Instructions / Landmark Clarification
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Call alternate number +977-9800000000; customer home after 5:30 PM."
                value={reattemptNotes}
                onChange={(e) => setReattemptNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-blue-500 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setReattemptModalItem(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleReattempt}
                className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 shadow-sm"
              >
                Schedule Reattempt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Failure Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveNewFailure}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-3.5 text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Log Delivery Failure</h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Record logistical delivery bottleneck without impacting product quality return metrics.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Order Number *</label>
                <input
                  type="text"
                  placeholder="e.g. BB-ORD-2083-9912"
                  value={orderNumber}
                  onChange={(e) => {
                    setOrderNumber(e.target.value);
                    if (formErrors.orderNumber) setFormErrors((prev) => ({ ...prev, orderNumber: '' }));
                  }}
                  className={`w-full rounded-lg border ${formErrors.orderNumber ? 'border-red-500 bg-red-50/20' : 'border-slate-300'} px-3 py-2 outline-none font-mono focus:border-rose-500`}
                />
                {formErrors.orderNumber && (
                  <p className="mt-1 text-xs text-red-500">{formErrors.orderNumber}</p>
                )}
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Brand *</label>
                <select
                  value={brandCode}
                  onChange={(e) => setBrandCode(e.target.value as BrandCode)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none focus:border-rose-500"
                >
                  {getBrands('ACTIVE').map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  placeholder="e.g. Pratima KC"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Customer Phone *</label>
                <input
                  type="text"
                  placeholder="+977-98XXXXXXXX"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    if (formErrors.customerPhone) setFormErrors((prev) => ({ ...prev, customerPhone: '' }));
                  }}
                  className={`w-full rounded-lg border ${formErrors.customerPhone ? 'border-red-500 bg-red-50/20' : 'border-slate-300'} px-3 py-2 outline-none font-mono focus:border-rose-500`}
                />
                {formErrors.customerPhone && (
                  <p className="mt-1 text-xs text-red-500">{formErrors.customerPhone}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Product SKU Description</label>
              <input
                type="text"
                placeholder="e.g. Forya Roll-On Peach 50ml, Renee Fab 5"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-rose-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Failure Reason *</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as DeliveryFailure['reason'])}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none font-semibold text-rose-700"
                >
                  <option value="Call not received">Call not received</option>
                  <option value="Address not found">Address not found</option>
                  <option value="Customer refused delivery">Customer refused delivery</option>
                  <option value="Customer unavailable">Customer unavailable</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Delivery Method</label>
                <select
                  value={deliveryMethod}
                  onChange={(e) => setDeliveryMethod(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none"
                >
                  <option value="Standard">Standard Courier</option>
                  <option value="Pathao">Pathao Express</option>
                  <option value="In-house Rider">In-house Rider</option>
                  <option value="Nepal Post">Nepal Post</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Territory</label>
                <select
                  value={valley}
                  onChange={(e) => setValley(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none"
                >
                  <option value="Outside">Outside Valley</option>
                  <option value="Inside">Inside Valley</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Courier Remarks</label>
              <textarea
                rows={2}
                placeholder="e.g. Rider tried 3 times across 2 days. Returned to parcel hub."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-rose-600 px-5 py-2 font-semibold text-white hover:bg-rose-700 shadow"
              >
                Record Delivery Failure
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Proof of Delivery Lightbox / Fraud Alert Modal (Fix 41) */}
      {selectedPodProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                <AlertOctagon className="w-5 h-5 text-rose-600" />
                <span>Fraud Investigation: Proof of Delivery on File</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPodProof(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                <strong>High-Risk Claim:</strong> The delivery courier recorded photographic proof of delivery and confirmed handover to recipient <strong>{selectedPodProof.proof.recipientName || selectedPodProof.customerName}</strong>. The customer claim of non-delivery is disputed.
              </p>
            </div>

            {/* Photo Preview */}
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-video relative flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedPodProof.proof.photoUrl}
                alt="Delivery Proof"
                className="max-h-full max-w-full object-contain"
              />
              <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded font-mono">
                📸 Handover Evidence Verified
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Courier / Rider</span>
                <span className="font-semibold text-slate-800">{selectedPodProof.proof.deliveredBy}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Delivery Date</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {selectedPodProof.proof.deliveryDateBs} ({selectedPodProof.proof.deliveryDateAd})
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setSelectedPodProof(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold hover:bg-slate-50"
              >
                Close Investigation Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Proof of Delivery Modal (Fix 41) */}
      {showUploadPodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Camera className="w-4 h-4 text-blue-600" />
                <span>Upload Proof of Delivery (POD)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadPodModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePod} className="space-y-3">
              <div>
                <span className="text-slate-500">Order Reference:</span>
                <p className="font-bold text-blue-600 font-mono text-sm">{showUploadPodModal.orderNumber}</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Delivered By (Rider / Courier) *</label>
                <input
                  type="text"
                  required
                  value={podDeliveredBy}
                  onChange={(e) => setPodDeliveredBy(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Recipient Name *</label>
                <input
                  type="text"
                  required
                  value={podRecipient}
                  onChange={(e) => setPodRecipient(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Proof Photo URL *</label>
                <input
                  type="url"
                  required
                  value={podPhotoUrl}
                  onChange={(e) => setPodPhotoUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 outline-none focus:border-blue-500 font-mono text-[11px]"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowUploadPodModal(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow"
                >
                  Attach Evidence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </PageGuard>
  );
}
