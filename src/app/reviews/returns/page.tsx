'use client';

import { confirmAction } from '@/components/common/confirm';
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

  const handleBulkSetResolution = async (
    newResolution: 'Exchanged' | 'Refunded' | 'Pending' | 'Rejected'
  ) => {
    if (!(await confirmAction({ title: `Set ${selectedIds.length} return${selectedIds.length === 1 ? '' : 's'} to ${newResolution}?`, consequences: newResolution === 'Exchanged' ? ['Each one then needs its replacement order linked.'] : [], confirmLabel: 'Update returns' }))) return;
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
      <div className="mx-auto max-w-7xl space-y-5 pb-20">
      {/* 7f: Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Reviews & Returns', href: '/reviews/feedback' },
          { label: 'Returns' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Returns</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Products that came back after delivery. Parcels that never arrived are logged in{' '}
            <Link href="/orderflow/delivery-failures" className="font-semibold text-blue-700 hover:underline">Delivery failures</Link>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowLogModal(true); setSaveSuccess(null); }}
          className="inline-flex items-center gap-1.5 self-start rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 sm:self-auto"
        >
          <Plus className="h-4 w-4" /> Log return
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Returns', value: String(actualReturnsCount), hint: `${actualReturnsPct}% of orders` },
          { label: 'Exchanged · refunded', value: `${returnsList.filter((entry) => entry.orderStatus === 'Exchanged').length} · ${returnsList.filter((entry) => entry.orderStatus === 'Refunded').length}`, hint: 'resolution so far' },
          { label: 'Awaiting decision', value: String(returnsList.filter((entry) => entry.orderStatus === 'Pending').length), hint: 'resolution pending', tone: returnsList.some((entry) => entry.orderStatus === 'Pending') ? 'text-amber-700' : 'text-slate-900' },
          { label: 'Delivery failures', value: String(deliveryFailuresCount), hint: `${deliveryFailuresPct}% of orders · tracked separately`, href: '/orderflow/delivery-failures' },
        ].map((tile) => {
          const body = (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{tile.label}</p>
              <p className={`mt-1 text-2xl font-black tabular-nums ${tile.tone || 'text-slate-900'}`}>{tile.value}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">{tile.hint}</p>
            </>
          );
          return tile.href
            ? <Link key={tile.label} href={tile.href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-blue-300">{body}</Link>
            : <div key={tile.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">{body}</div>;
        })}
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
              <span>Serial Returner Alert: This customer has logged 3+ product returns within 30 days. The &quot;Serial Returner&quot; security flag has been activated in Customer 360.</span>
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
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Resolution</th>
                <th className="py-3 px-4">Returned</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4 text-center">Photo</th>
                <th className="py-3 px-4">Notes</th>
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
                    : null;

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

                      {/* Resolution: one control that shows the current value and changes it */}
                      <td className="py-3.5 px-4">
                        {(() => {
                          const tone = ret.orderStatus === 'Exchanged' ? 'border-purple-200 bg-purple-50 text-purple-800'
                            : ret.orderStatus === 'Refunded' ? 'border-sky-200 bg-sky-50 text-sky-800'
                            : ret.orderStatus === 'Pending' ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700';
                          return canEditReturns ? (
                            <select aria-label={`Resolution for ${ret.productName}`} value={ret.orderStatus} onClick={(event) => event.stopPropagation()}
                              onChange={(event) => setResolution(ret, event.target.value as ReturnEntry['orderStatus'])}
                              className={`cursor-pointer rounded-full border py-0.5 pl-2.5 pr-6 text-[11px] font-bold ${tone}`}>
                              {RETURN_RESOLUTIONS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                            </select>
                          ) : <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${tone}`}>{ret.orderStatus}</span>;
                        })()}
                        {ret.orderStatus === 'Exchanged' && (() => {
                          const replacement = ret.exchangeOrderId ? db.getOrderById(ret.exchangeOrderId) : undefined;
                          if (replacement) return (
                            <Link href={`/orderflow/orders/${replacement.id}`} onClick={(event) => event.stopPropagation()} className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 hover:underline">
                              ↪ <span className="font-mono">{displayDocumentId(replacement.orderNumber)}</span> <OrderStatusBadge status={replacement.status} />
                            </Link>
                          );
                          return canEditReturns ? (
                            <button type="button" onClick={(event) => { event.stopPropagation(); setExchangeFor(ret); }} className="mt-1.5 block text-[11px] font-bold text-amber-700 hover:underline">+ Link replacement order</button>
                          ) : <span className="mt-1.5 block text-[11px] font-semibold text-amber-700">Replacement not linked</span>;
                        })()}
                      </td>

                      {/* Timeline */}
                      <td className="py-3.5 px-4 text-[11px]">
                        <div className="font-semibold text-slate-800">{ret.dateAd}</div>
                        <div className="text-slate-400">{daysToReturn === null ? 'Order date unknown' : daysToReturn === 0 ? 'Same day as order' : `${daysToReturn} day${daysToReturn === 1 ? '' : 's'} after order`}</div>
                      </td>

                      {/* Territory & Platform */}
                      <td className="py-3.5 px-4 text-[11px]">
                        <div className="font-semibold text-slate-800">{ret.platform}</div>
                        <div className="text-slate-400">{ret.valley === 'Inside' ? 'Inside valley' : 'Outside valley'}</div>
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
