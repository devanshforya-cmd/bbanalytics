'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { ReturnEntry, ReturnReason, BrandCode, OrderPlatform } from '@/lib/types';
import {
  getTodayAd,
  getTodayBs,
  adToBs,
  bsToAd,
  NEPALI_MONTHS,
} from '@/lib/nepali-calendar';
import LogReturnForm from './components/LogReturnForm';
import ExchangePanel from '@/components/orders/ExchangePanel';
import ExchangeAnalysisPanel from './components/ExchangeAnalysisPanel';
import { OrderStatusBadge } from '@/components/orders/OrderStatusControl';
import { exchangeNeedsLink, RETURN_RESOLUTIONS } from '@/lib/exchange';
import { canPerform } from '@/lib/permissions';
import { displayDocumentId } from '@/lib/document-ids';
import { useRouter } from 'next/navigation';
import BulkActionBar from '@/components/common/BulkActionBar';
import { toast } from '@/components/common/Toast';
import {
  RotateCcw,
  Plus,
  Search,
  Filter,
  Package,
  AlertTriangle,
  Camera,
  Upload,
  X,
  ExternalLink,
  ArrowRight,
  Truck,
  CheckCircle,
  Calendar,
  User,
  Clock,
  Check,
  Eye,
} from 'lucide-react';

const ACTUAL_RETURN_REASONS: ReturnReason[] = [
  'Damage',
  'Wrong product sent',
  'Product not as described',
  'Allergic reaction',
  'Quality defect',
  'Size issue',
  'Color mismatch',
  'Changed mind',
];

const RESOLUTION_OPTIONS: Array<'Exchanged' | 'Refunded' | 'Pending' | 'Rejected'> = [
  'Exchanged',
  'Refunded',
  'Pending',
  'Rejected',
];

export default function ReturnsPage() {
  const router = useRouter();
  const [returnsList, setReturnsList] = useState<ReturnEntry[]>(db.getReturns());
  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [reasonFilter, setReasonFilter] = useState<string>('ALL');
  const [showLogModal, setShowLogModal] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [exchangeFor, setExchangeFor] = useState<ReturnEntry | null>(null);
  const canEditReturns = canPerform(db.getCurrentUser(), 'reviews', 'EDIT');
  // Stay in step with saves from other screens and other devices.
  useEffect(() => {
    const refresh = () => setReturnsList([...db.getReturns()]);
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);
  const setResolution = (ret: ReturnEntry, resolution: ReturnEntry['orderStatus']) => {
    db.updateReturnResolution(ret.id, resolution);
    setReturnsList([...db.getReturns()]);
    if (resolution === 'Exchanged') setExchangeFor(db.getReturns('ALL').find((entry) => entry.id === ret.id) || ret);
    else toast.success(`Resolution set to ${resolution}`);
  };
  const unlinkedExchanges = returnsList.filter(exchangeNeedsLink);

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((r) => r.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleBulkSetResolution = (
    newResolution: 'Exchanged' | 'Refunded' | 'Pending' | 'Rejected'
  ) => {
    if (selectedIds.length === 0) return;
    selectedIds.forEach((id) => {
      db.updateReturnResolution(id, newResolution);
    });
    toast.success(
      `Updated resolution of ${selectedIds.length} return${selectedIds.length === 1 ? '' : 's'} to ${newResolution}.`,
      newResolution === 'Exchanged' ? 'Link each one to its replacement order from the list.' : undefined
    );
    setSelectedIds([]);
    setReturnsList([...db.getReturns()]);
  };

  // Success Notification State
  const [saveSuccess, setSaveSuccess] = useState<{
    customerName: string;
    customerPhone: string;
    productId: string;
    productName: string;
    isSerialReturner: boolean;
    timeToReturnDays: number;
  } | null>(null);

  // 11a: Separation Header Stats
  // Recounted whenever the list refreshes (it listens for saves from other screens and devices).
  // Exchange replacements and cancelled orders are not orders the customer bought.
  const totalOrdersCount = useMemo(() => db.getOrders().filter((order) => !order.exchangeReturnId && order.status !== 'CANCELLED').length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [returnsList]);

  const actualReturnsCount = returnsList.length;
  const actualReturnsPct = totalOrdersCount > 0 ? ((actualReturnsCount / totalOrdersCount) * 100).toFixed(1) : '0.0';

  const deliveryFailuresCount = useMemo(() => db.getDeliveryFailures().length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [returnsList]);
  const deliveryFailuresPct = totalOrdersCount > 0 ? ((deliveryFailuresCount / totalOrdersCount) * 100).toFixed(1) : '0.0';

  const activeBrands = db.getBrands('ACTIVE');

  const filtered = useMemo(() => {
    return returnsList.filter((r) => {
      const matchesSearch =
        r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.reasonCategory.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerPhone.includes(searchTerm);
      const matchesBrand = brandFilter === 'ALL' || r.brandCode === brandFilter;
      const matchesReason = reasonFilter === 'ALL' || r.reasonCategory === reasonFilter;
      return matchesSearch && matchesBrand && matchesReason;
    });
  }, [returnsList, searchTerm, brandFilter, reasonFilter]);

  return (
    <PageGuard feature="reviews">
      <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* 7f: Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Reviews & Quality', href: '/reviews/feedback' },
          { label: 'Product Returns Register' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Actual Product Returns Register
            </h1>
            <span className="rounded-full bg-rose-100 text-rose-800 text-xs font-bold px-2.5 py-0.5">
              Quality & RMA Ledger
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Log and manage confirmed product returns (damaged goods, wrong shades, quality defects). Dispatched parcels rejected before delivery are recorded under Delivery Failures.
          </p>
        </div>

        <button
          onClick={() => {
            setShowLogModal(true);
            setSaveSuccess(null);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 self-start sm:self-auto transition-all"
        >
          <Plus className="h-4 w-4" />
          Log Product Return
        </button>
      </div>

      {/* 11a: Clear Separation Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Actual Product Returns */}
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/70 p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-emerald-200 text-emerald-900 font-bold px-2.5 py-0.5 text-[11px] uppercase tracking-wider">
              🟢 Genuine Quality Returns
            </span>
            <span className="text-[11px] font-semibold text-emerald-800">
              {actualReturnsPct}% of orders
            </span>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              Actual Product Returns: {actualReturnsCount}{' '}
              <span className="text-sm font-normal text-slate-600">({actualReturnsPct}%)</span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Items where the customer successfully received and unboxed the parcel, but initiated a return due to verified damage, wrong shade, leakage, or adverse reaction.
            </p>
          </div>
          <div className="text-[11px] text-emerald-800 font-medium pt-1">
            Impact: Manufacturer defect tracking, batch quarantine, replacement dispatch & customer karma penalty (-3).
          </div>
        </div>

        {/* Card 2: Delivery Failures (Separated with direct link) */}
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm space-y-3 relative">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 text-[11px] uppercase tracking-wider">
              🔴 Logistics Non-Deliveries
            </span>
            <span className="text-[11px] font-semibold text-rose-700">
              {deliveryFailuresPct}% of orders
            </span>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              Delivery Failures: {deliveryFailuresCount}{' '}
              <span className="text-sm font-normal text-slate-600">({deliveryFailuresPct}%)</span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Dispatched parcels that were <strong>never delivered</strong> to the recipient (phone unreachable, invalid address, customer unavailable, rider RTS).
            </p>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500 italic">
              Tracked separately — does not taint product quality.
            </span>
            <Link
              href="/orderflow/delivery-failures"
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
            >
              Go to Delivery Failures Register →
            </Link>
          </div>
        </div>
      </div>

      {unlinkedExchanges.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900" role="status">
          <span><strong>{unlinkedExchanges.length} exchange{unlinkedExchanges.length === 1 ? '' : 's'}</strong> {unlinkedExchanges.length === 1 ? 'has' : 'have'} no replacement order linked, so {unlinkedExchanges.length === 1 ? 'it is' : 'they are'} missing from dispatch and exchange analysis.</span>
          {canEditReturns && <button type="button" onClick={() => setExchangeFor(unlinkedExchanges[0])} className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 font-bold hover:bg-amber-100">Link the oldest</button>}
        </div>
      )}

      <ExchangeAnalysisPanel returns={filtered} />

      {/* 11c: Post-Save Feedback Banner */}
      {saveSuccess && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm space-y-2 animate-in fade-in">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <span>Return Registered Successfully • Karma Penalized (-3 Points)</span>
            </div>
            <button
              onClick={() => setSaveSuccess(null)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-slate-700">
            Recorded product return of <strong>{saveSuccess.productName}</strong> for customer{' '}
            <strong>{saveSuccess.customerName}</strong> ({saveSuccess.customerPhone}). Time-to-return: <strong>{saveSuccess.timeToReturnDays} days</strong> after initial dispatch.
          </p>
          {saveSuccess.isSerialReturner && (
            <div className="rounded-xl border border-amber-300 bg-amber-100 p-2.5 text-xs text-amber-900 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
              <span>⚠️ Serial Returner Alert: This customer has logged 3+ product returns within 30 days. The &quot;Serial Returner&quot; security flag has been activated in Customer 360.</span>
            </div>
          )}
          <div className="flex items-center gap-3 pt-2 text-xs">
            <Link
              href={`/customers/${saveSuccess.customerPhone}`}
              className="font-bold text-blue-700 hover:underline flex items-center gap-1"
            >
              <User className="h-3.5 w-3.5" />
              View Customer in Customer 360 ↗
            </Link>
            <span className="text-slate-300">|</span>
            <Link
              href={`/products/${saveSuccess.productId}`}
              className="font-bold text-blue-700 hover:underline flex items-center gap-1"
            >
              <Package className="h-3.5 w-3.5" />
              View Product Quality Analytics ↗
            </Link>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search product, customer name, phone, or reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs bg-transparent outline-none text-slate-800"
            />
          </div>

          <div>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="ALL">All Brands</option>
              {activeBrands.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="ALL">All Return Reasons</option>
              {ACTUAL_RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[850px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Brand & Product</th>
                <th className="py-3 px-4">Customer & Karma</th>
                <th className="py-3 px-4">Return Reason</th>
                <th className="py-3 px-4">Resolution Status</th>
                <th className="py-3 px-4">Timeline (BS/AD)</th>
                <th className="py-3 px-4">Channel & Territory</th>
                <th className="py-3 px-4 text-center">Proof Photo</th>
                <th className="py-3 px-4">Issue Tags & Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No matching return entries found.
                  </td>
                </tr>
              ) : (
                filtered.map((ret) => {
                  // Time-to-return
                  const daysToReturn = ret.orderProcessedDateAd
                    ? Math.max(
                        0,
                        Math.round(
                          (new Date(ret.dateAd).getTime() -
                            new Date(ret.orderProcessedDateAd).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                      )
                    : 4;

                  const isSelected = selectedIds.includes(ret.id);

                  return (
                    <tr
                      key={ret.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-50/60 hover:bg-blue-50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3.5 px-4 w-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(e) => handleToggleSelect(ret.id, e)}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      {/* Product Link (7d) */}
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/products/${ret.productId || encodeURIComponent(ret.productName)}`}
                          className="font-bold text-slate-900 hover:text-blue-600 hover:underline block truncate max-w-[200px]"
                        >
                          {ret.productName} ↗
                        </Link>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span className="font-semibold text-slate-600">{ret.brandCode}</span>
                          <span>•</span>
                          <span>Qty: <strong>{ret.quantity}</strong></span>
                        </div>
                      </td>

                      {/* Customer Link (7a) */}
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/customers/${encodeURIComponent(ret.customerPhone)}`}
                          className="font-bold text-blue-600 hover:underline block"
                        >
                          {ret.customerName}
                        </Link>
                        <span className="text-[11px] font-mono text-slate-400 block">
                          {ret.customerPhone}
                        </span>
                      </td>

                      {/* Return Reason Category */}
                      <td className="py-3.5 px-4">
                        <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 inline-block">
                          {ret.reasonCategory}
                        </span>
                      </td>

                      {/* Resolution */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold inline-block ${
                            ret.orderStatus === 'Exchanged'
                              ? 'bg-blue-100 text-blue-800'
                              : ret.orderStatus === 'Refunded'
                              ? 'bg-purple-100 text-purple-800'
                              : ret.orderStatus === 'Pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {ret.orderStatus}
                        </span>
                        {canEditReturns && (
                          <select aria-label={`Change resolution for ${ret.productName}`} value="" onClick={(event) => event.stopPropagation()}
                            onChange={(event) => { const value = event.target.value as ReturnEntry['orderStatus']; if (value) setResolution(ret, value); }}
                            className="ml-1.5 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-600">
                            <option value="">Change…</option>
                            {RETURN_RESOLUTIONS.filter((entry) => entry !== ret.orderStatus).map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                          </select>
                        )}
                        {ret.orderStatus === 'Exchanged' && (() => {
                          const replacement = ret.exchangeOrderId ? db.getOrderById(ret.exchangeOrderId) : undefined;
                          if (replacement) return (
                            <Link href={`/orderflow/orders/${replacement.id}`} onClick={(event) => event.stopPropagation()} className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-purple-700 hover:underline">
                              ↪ {displayDocumentId(replacement.orderNumber)} <OrderStatusBadge status={replacement.status} />
                            </Link>
                          );
                          return canEditReturns ? (
                            <button type="button" onClick={(event) => { event.stopPropagation(); setExchangeFor(ret); }} className="mt-1 block rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100">Link replacement order</button>
                          ) : <span className="mt-1 block text-[10px] font-semibold text-amber-700">Replacement not linked</span>;
                        })()}
                      </td>

                      {/* Timeline */}
                      <td className="py-3.5 px-4 text-[11px]">
                        <div className="font-semibold text-slate-800 font-mono">{ret.dateAd}</div>
                        <div className="text-slate-400">{daysToReturn} days after delivery</div>
                      </td>

                      {/* Territory & Platform */}
                      <td className="py-3.5 px-4 text-[11px]">
                        <div className="font-semibold text-slate-800">{ret.platform}</div>
                        <div className="text-slate-400">{ret.valley} Valley</div>
                      </td>

                      {/* Evidence Photo Lightbox */}
                      <td className="py-3.5 px-4 text-center">
                        {ret.evidenceUrl ? (
                          <button
                            onClick={() => setLightboxImg(ret.evidenceUrl || null)}
                            className="group relative inline-block h-9 w-9 rounded-lg overflow-hidden border border-slate-200 shadow-xs hover:ring-2 hover:ring-blue-400"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={ret.evidenceUrl}
                              alt="Defect Proof"
                              className="h-full w-full object-cover group-hover:scale-110 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                              <Eye className="h-3 w-3" />
                            </div>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[11px]">None</span>
                        )}
                      </td>

                      {/* Remarks & Issue Tags */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1 mb-1">
                          {ret.issueCategories.map((cat, i) => (
                            <span
                              key={i}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                        <div className="text-slate-600 text-[11px] truncate" title={ret.remarks}>
                          {ret.remarks || '—'}
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

      {/* Lightbox Modal */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in cursor-zoom-out"
        >
          <div className="relative max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxImg} alt="Return defect" className="h-full w-full object-contain" />
            <button
              onClick={() => setLightboxImg(null)}
              className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white hover:bg-black"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {showLogModal && (
        <LogReturnForm onClose={() => setShowLogModal(false)} onViewCustomer={(phone) => router.push(`/customers/${phone}`)}
          onSaved={(summary) => {
            setReturnsList([...db.getReturns()]); setShowLogModal(false); setSaveSuccess(summary);
            if (summary.resolution === 'Exchanged') { const saved = db.getReturns('ALL').find((entry) => entry.id === summary.returnId); if (saved) setExchangeFor(saved); }
          }} />
      )}
      {exchangeFor && <ExchangePanel ret={exchangeFor} onClose={() => setExchangeFor(null)} onDone={() => setReturnsList([...db.getReturns()])} />}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        totalCount={filtered.length}
        onClearSelection={handleClearSelection}
        onSelectAll={handleSelectAll}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-300 font-medium">Set Resolution:</span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleBulkSetResolution(
                  e.target.value as 'Exchanged' | 'Refunded' | 'Pending' | 'Rejected'
                );
                e.target.value = '';
              }
            }}
            className="rounded-lg bg-slate-800 border border-slate-700 text-white text-xs px-2.5 py-1.5 outline-none font-medium cursor-pointer"
          >
            <option value="" disabled>Resolution...</option>
            {RESOLUTION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </BulkActionBar>
      </div>
    </PageGuard>
  );
}
