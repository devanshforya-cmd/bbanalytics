'use client';

import Money from '@/components/common/Money';
import InfoTip from '@/components/common/InfoTip';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { Product, SecondaryOrder, Retailer, Branch, FeedbackEntry, StockCount, Order, Combo, ReturnEntry, DeliveryFailure } from '@/lib/types';
import { productMetrics, type ProductMetricsInput } from '@/lib/product-metrics';
import { countsAsSale } from '@/lib/order-status';
import ProductTrendChart from '@/components/products/ProductTrendChart';
import {
  Package,
  ArrowLeft,
  TrendingUp,
  Store,
  RotateCcw,
  Star,
  Layers,
  Percent,
  Clock,
  AlertTriangle,
  Building2,
  Calendar,
  MessageSquare,
  Lightbulb,
  ShoppingBag,
  ExternalLink,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import ProductActions from '@/components/products/ProductActions';
import PageGuard from '@/components/common/PageGuard';

export default function Product360Page() {
  const params = useParams();
  const router = useRouter();
  const productId = decodeURIComponent((params?.id as string) || '');

  const [product, setProduct] = useState<Product | null>(null);
  const [secondaryOrders, setSecondaryOrders] = useState<SecondaryOrder[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stockCounts, setStockCounts] = useState<StockCount[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [returns, setReturns] = useState<ReturnEntry[]>([]);
  const [deliveryFailures, setDeliveryFailures] = useState<DeliveryFailure[]>([]);

  useEffect(() => {
    if (!productId) return;
    const load = () => {
      setProduct(db.getProductById(productId) || db.getProductByNameOrId(productId) || null);
      setSecondaryOrders(db.getSecondaryOrders());
      setFeedback(db.getFeedback());
      setRetailers(db.getRetailers());
      setBranches(db.getBranches());
      setStockCounts(db.getStockCounts());
      setOrders(db.getOrders());
      setCombos(db.getCombos());
      setReturns(db.getReturns());
      setDeliveryFailures(db.getDeliveryFailures());
    };
    load();
    window.addEventListener('bb-db-updated', load);
    return () => window.removeEventListener('bb-db-updated', load);
  }, [productId]);

  const metricsInput = useMemo<ProductMetricsInput>(() => ({ orders, secondaryOrders, combos, returns, feedback, deliveryFailures }),
    [orders, secondaryOrders, combos, returns, feedback, deliveryFailures]);

  if (!product) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Product not found. It may have been deleted or your catalogue is still syncing.</p>
        <Link href="/products" className="text-blue-700 underline">Back to products</Link>
      </div>
    );
  }

  const metrics = productMetrics(product.id, metricsInput);
  const relatedOrders = secondaryOrders
    .filter((order) => order.status !== 'CANCELLED' && order.items.some((item) => item.productId === product.id))
    .sort((x, y) => (y.orderDateAd || '').localeCompare(x.orderDateAd || ''));
  const relatedFeedback = [...metrics.feedback.entries].sort((x, y) => (y.dateReceivedAd || '').localeCompare(x.dateReceivedAd || ''));
  const productReturns = metrics.returns.entries;
  const { reviews: reviewsCount, complaints: complaintsCount } = metrics.feedback;
  const topIssue = metrics.feedback.topIssue || 'None reported';
  const d2cUnits = metrics.d2c.units;
  const { gtUnits, mtUnits } = metrics.b2b;
  const totalUnitsSold = metrics.totalUnits;
  const gtPct = totalUnitsSold > 0 ? Math.round((gtUnits / totalUnitsSold) * 100) : 0;
  const mtPct = totalUnitsSold > 0 ? Math.round((mtUnits / totalUnitsSold) * 100) : 0;
  const d2cPct = totalUnitsSold > 0 ? Math.round((d2cUnits / totalUnitsSold) * 100) : 0;
  const totalReturnUnits = metrics.returns.units;
  const returnRatePct = metrics.returns.ratePct.toFixed(1);

  // Combos this product goes into, with the units of it each one has sold.
  const containingCombos = combos
    .filter((entry) => entry.items.some((item) => item.productId === product.id))
    .map((entry) => {
      const perKit = entry.items.find((item) => item.productId === product.id)?.quantity || 1;
      const kits = orders.filter(countsAsSale).reduce((sum, order) => sum + order.items.filter((line) => line.productId === entry.id && !line.isGift).reduce((acc, line) => acc + line.quantity, 0), 0);
      return { id: entry.id, name: entry.name, units: kits * perKit };
    })
    .sort((x, y) => y.units - x.units);

  // Why units came back, from the returns themselves.
  const reasonCounts = new Map<string, number>();
  for (const entry of productReturns) {
    if (entry.orderStatus === 'Rejected') continue;
    const reason = entry.reasonCategory || 'Other';
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
  }
  const returnReasons = [...reasonCounts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
  const countedReturns = [...reasonCounts.values()].reduce((x, y) => x + y, 0);

  // Stores Carrying This Product with stock counts
  const productStores: {
    id: string;
    storeName: string;
    branchName: string;
    assignedOfficer: string;
    lastStockDate: string;
    unitsOnShelf: number;
    daysSinceCount: number;
  }[] = [];

  // Retailers and chain branches that stock this brand, or have counted it.
  const outlets = [
    ...retailers.map((store) => ({ id: store.id, name: store.name, area: [store.area, store.city].filter(Boolean).join(', '), officer: store.assignedOfficerName || '', brands: store.brandsStocked || [] })),
    ...branches.map((store) => ({ id: store.id, name: store.name, area: [store.area, store.city].filter(Boolean).join(', '), officer: store.assignedOfficerName || '', brands: store.brandsAvailable || [] })),
  ].filter((store) => store.brands.includes(product.brandCode) || stockCounts.some((count) => count.entityId === store.id));

  outlets.forEach((store) => {
    const counts = stockCounts
      .filter((count) => count.entityId === store.id)
      .sort((x, y) => new Date(y.dateAd || y.createdAt).getTime() - new Date(x.dateAd || x.createdAt).getTime());
    const latest = counts.find((count) => count.items.some((item) => item.productId === product.id)) || counts[0];
    let shelfUnits = 0;
    let daysAgo = 999;
    let countDate = 'Never counted';
    if (latest) {
      countDate = latest.dateBs || latest.dateAd;
      const parsedDate = new Date(latest.dateAd || latest.createdAt);
      if (!isNaN(parsedDate.getTime())) daysAgo = Math.max(0, Math.floor((Date.now() - parsedDate.getTime()) / 86400000));
      shelfUnits = latest.items.find((item) => item.productId === product.id)?.shelfQty || 0;
    }
    productStores.push({
      id: store.id,
      storeName: store.name,
      branchName: store.area || '—',
      assignedOfficer: store.officer || 'Not assigned',
      lastStockDate: countDate,
      unitsOnShelf: shelfUnits,
      daysSinceCount: daysAgo,
    });
  });

  const storesStockingProduct = productStores.filter((ps) => ps.unitsOnShelf > 0);
  const totalOutletsCount = retailers.length + branches.length;
  const penetrationPct = totalOutletsCount > 0 ? ((storesStockingProduct.length / totalOutletsCount) * 100).toFixed(1) : '0.0';

  return (
    <PageGuard feature="products">
      <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Breadcrumb navigation */}
      <Breadcrumbs
        items={[
          { label: 'Product catalog', href: '/products' },
          { label: product.name },
        ]}
      />

      {/* Hero Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-black/[0.08] bg-slate-50 text-slate-500">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-[11px] font-black px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700"
                >
                  {db.getBrands().find(brand => brand.code === product.brandCode)?.name || product.brandCode}
                </span>
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-bold">
                  {product.sku}
                </span>
                {product.active === false && <span className="text-xs text-amber-700">Archived</span>}
                <ProductActions product={product} onChanged={() => { if (!db.getProductById(product.id)) router.push('/products'); }} />
                <span className="text-xs text-slate-500">&bull; {product.category}</span>
              </div>
              <h1 className="flex items-center gap-1.5 text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1.5">
                {product.name}
<InfoTip label="About this page">Packed {product.caseSize || 24} units per case</InfoTip></h1>
              
            </div>
          </div>

          {/* Master Catalog MRP */}
          <div className="bg-slate-50 border border-slate-200 px-5 py-3 rounded-2xl flex items-center gap-4">
            <div>
              <span className="text-[11px] font-bold text-slate-500 block ">
                Catalog reference MRP
              </span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono mt-0.5">
                <Money>{product.mrp}</Money>
              </div>
            </div>
            <div className="border-l border-slate-200 pl-4 text-[11px] text-slate-500 font-medium">
              Consumer Catalog Price<br />
              <span className="text-slate-500">VAT inclusive</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Core Performance KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Units sold</span>
            <TrendingUp className="w-4 h-4 text-brand-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {totalUnitsSold.toLocaleString()} <span className="text-xs font-normal text-slate-500">units</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {d2cUnits.toLocaleString()} online, {(gtUnits + mtUnits).toLocaleString()} in stores{metrics.d2c.comboUnits ? ` (${metrics.d2c.comboUnits} in combos)` : ''}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Store penetration</span>
            <Store className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {penetrationPct}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {storesStockingProduct.length} of {totalOutletsCount} active beat outlets stock
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Return rate (online)</span>
            <RotateCcw className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600 mt-2 font-mono">
            {returnRatePct}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {totalReturnUnits} of {d2cUnits} online units came back ({metrics.returns.exchangedUnits} exchanged)
          </div>
        </div>

        <Link
          href={`/reviews/feedback?product=${encodeURIComponent(product.name)}`}
          className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-brand-500 hover:shadow-md transition cursor-pointer group block"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span className="group-hover:text-brand-600 transition-colors">Feedback summary</span>
            <div className="flex items-center gap-1 text-brand-600">
              <MessageSquare className="w-4 h-4" />
              <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-2 font-mono group-hover:text-slate-900 transition-colors">
            {reviewsCount} {reviewsCount === 1 ? 'review' : 'reviews'}, {complaintsCount} {complaintsCount === 1 ? 'complaint' : 'complaints'}
          </div>
          <div className="text-xs text-slate-500 mt-1 truncate flex items-center justify-between" title={`Top Issue: ${topIssue}`}>
            <span>Top issue: <strong className="text-slate-700">{topIssue}</strong></span>
            <span className="text-[11px] text-brand-600 font-bold group-hover:underline">View in hub</span>
          </div>
        </Link>
      </div>

      <ProductTrendChart productId={product.id} input={metricsInput} />

      {/* Two Columns: Channel Volume Radar + Store Stocking Outlets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Channel Volume Breakdown */}
        <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Sales channel velocity</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Volume split across general trade, modern trade, and online D2C
            </p>
          </div>

          {totalUnitsSold === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 bg-slate-50/50 rounded-2xl border border-slate-100">
              No orders or distribution velocity recorded for this product yet.
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {/* GT */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-700">General trade (kiranas &amp; pharmacies)</span>
                  <span className="text-slate-900 font-bold font-mono">{gtPct}% ({gtUnits} units)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-brand-600 rounded-full" style={{ width: `${gtPct}%` }} />
                </div>
              </div>

              {/* MT */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-700">Modern trade (supermarkets &amp; chains)</span>
                  <span className="text-slate-900 font-bold font-mono">{mtPct}% ({mtUnits} units)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${mtPct}%` }} />
                </div>
              </div>

              {/* Online D2C */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-700">D2C online (WhatsApp / social orders)</span>
                  <span className="text-slate-900 font-bold font-mono">{d2cPct}% ({d2cUnits} units)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-purple-600 rounded-full" style={{ width: `${d2cPct}%` }} />
                </div>
              </div>
            </div>
          )}

          {containingCombos.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 space-y-1.5 mt-4">
              <div className="text-xs font-bold text-slate-800">Sold in combos</div>
              {containingCombos.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-xs">
                  <Link href={`/products/combo/${encodeURIComponent(entry.id)}`} className="font-medium text-purple-800 hover:underline truncate">{entry.name}</Link>
                  <span className="font-mono text-slate-600 shrink-0 ml-2">{entry.units} units</span>
                </div>
              ))}
            </div>
          )}

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 mt-4">
            <div className="text-xs font-bold text-slate-800">Secondary cadence:</div>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>
                {relatedOrders.length > 1
                  ? `${relatedOrders.length} secondary orders booked across retail accounts.`
                  : relatedOrders.length === 1
                  ? '1 secondary order booked.'
                  : 'No secondary retailer orders logged yet.'}
              </span>
            </div>
          </div>
        </div>

        {/* Customer Sentiment & Feedback Voice */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Consumer feedback &amp; quality telemetry</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real customer feedback, returns, and star ratings mapped to this SKU
              </p>
            </div>
            <Link
              href="/reviews/feedback"
              className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              <span>Feedback hub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedFeedback.slice(0, 4).map((f) => (
              <div
                key={f.id}
                className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => {
                      const rating = f.sentiment === 'POSITIVE' ? 5 : f.sentiment === 'NEUTRAL' ? 3 : 2;
                      return (
                        <Star
                          key={s}
                          className={`w-3 h-3 ${
                            s <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'
                          }`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">{f.dateReceivedBs || f.dateReceivedAd || ''}</span>
                </div>
                <p className="text-slate-700 font-medium line-clamp-2">
                  &ldquo;{f.fullText}&rdquo;
                </p>
                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 border-t border-slate-200/60">
                  <span className="truncate">
                    {f.customerPhone ? (
                      <Link
                        href={`/customers/${f.customerPhone}`}
                        className="font-bold text-slate-700 hover:text-blue-600 hover:underline"
                      >
                        {f.customerName}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-700">{f.customerName}</span>
                    )}{' '}
                    ({f.channel})
                  </span>
                  <span className="font-semibold text-emerald-700">
                    {f.issueCategories[0] || f.type}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Return reasons summary */}
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {countedReturns === 0 ? 'No returns or exchanges recorded for this product.' : (
                  <><strong>Why it came back:</strong> {returnReasons.map(([reason, count]) => `${reason} (${count})`).join(', ')}.
                  {' '}{metrics.returns.returnedUnits} returned, {metrics.returns.exchangedUnits} exchanged, {metrics.returns.refundedUnits} refunded{metrics.returns.pendingUnits ? `, ${metrics.returns.pendingUnits} pending` : ''}.</>
                )}
              </span>
            </div>
            <Link
              href={`/reviews/returns?product=${encodeURIComponent(product.name)}`}
              className="font-bold underline text-amber-800 hover:text-amber-950 shrink-0 ml-2"
            >
              View returns
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Secondary Store Bookings */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent in-store secondary bookings</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live orders booked by sales officers during beat visits
            </p>
          </div>
          <Link
            href="/offline-sales/beat-plan"
            className="text-xs font-bold text-brand-600 hover:text-brand-700"
          >
            Go to beat plan
          </Link>
        </div>

        {relatedOrders.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No secondary orders logged for this SKU yet.
          </div>
        ) : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold ">
                  <th className="p-3">Order #</th>
                  <th className="p-3">Store name</th>
                  <th className="p-3">Sales rep</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Cases booked</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relatedOrders.map((ord) => {
                  const item = ord.items.find(
                    (i) =>
                      i.productId === product.id
                  ) || ord.items[0];

                  return (
                    <tr key={ord.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-800">{ord.orderNumber}</td>
                      <td className="p-3">
                        <Link
                          href={`/offline-sales/stores/${ord.entityId || encodeURIComponent(ord.storeName)}`}
                          className="font-bold text-slate-900 hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          {ord.storeName}
                          <ArrowUpRight className="h-3 w-3 text-slate-400" />
                        </Link>
                        <div className="text-[11px] text-slate-500">{ord.contactPhone}</div>
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/offline-sales/scorecard?officer=${encodeURIComponent(ord.officerName)}`}
                          className="text-slate-700 font-medium hover:text-blue-600 hover:underline"
                        >
                          {ord.officerName}
                        </Link>
                      </td>
                      <td className="p-3 font-mono text-slate-500">{ord.orderDateBs}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        {item.cases} Cases ({item.totalUnits} units)
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 enum-label">
                          {ord.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stores Carrying This Product */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Store className="w-4 h-4 text-blue-600" />
              Stores carrying this product
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live shelf presence, stock count audit history, and on-shelf unit inventory
            </p>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
            {productStores.length} Active Outlets Stocking
          </span>
        </div>

        {productStores.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No retail stores currently mapped to this SKU.
          </div>
        ) : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold ">
                  <th className="p-3">Store</th>
                  <th className="p-3">Branch</th>
                  <th className="p-3">Assigned officer</th>
                  <th className="p-3">Last stock count</th>
                  <th className="p-3 text-right">Units on shelf</th>
                  <th className="p-3 text-right">Days since count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productStores.map((s) => {
                  const isOutOfStock = s.unitsOnShelf === 0;
                  const isCountStale = s.daysSinceCount >= 7;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <Link
                          href={`/offline-sales/stores/${s.id}`}
                          className="font-bold text-slate-900 hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          {s.storeName}
                          <ArrowUpRight className="h-3 w-3 text-slate-400" />
                        </Link>
                      </td>
                      <td className="p-3 text-slate-600 font-medium">
                        {s.branchName}
                      </td>
                      <td className="p-3 text-slate-700">
                        {s.assignedOfficer}
                      </td>
                      <td className="p-3 font-mono text-slate-500">
                        {s.lastStockDate}
                      </td>
                      <td className="p-3 text-right">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md font-mono ${
                            isOutOfStock
                              ? 'bg-rose-50 text-rose-700 font-bold border border-rose-200'
                              : 'bg-emerald-50 text-emerald-800 font-bold'
                          }`}
                        >
                          {s.unitsOnShelf} units
                          {isOutOfStock && ' (OOS)'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md font-mono ${
                            isCountStale
                              ? 'bg-amber-50 text-amber-700 font-semibold border border-amber-200'
                              : 'text-slate-600'
                          }`}
                        >
                          {s.daysSinceCount >= 900 ? 'Never' : `${s.daysSinceCount}d ago`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Feedback & Reviews for this Product */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-brand-600" />
              Customer Feedback &amp; Complaints ({relatedFeedback.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified reviews, ratings, and customer-reported issues specific to {product.name}
            </p>
          </div>
          <Link
            href={`/reviews/feedback?product=${encodeURIComponent(product.name)}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 hover:bg-brand-100/80 text-brand-700 font-bold px-3 py-1.5 text-xs transition-colors border border-brand-200"
          >
            <span>Open in Feedback Hub ({relatedFeedback.length})</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {relatedFeedback.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No customer reviews or complaints logged for this SKU yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {relatedFeedback.slice(0, 6).map((item) => (
              <Link
                key={item.id}
                href={`/reviews/feedback?product=${encodeURIComponent(product.name)}`}
                className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-brand-300 hover:shadow-xs transition text-xs flex flex-col justify-between group cursor-pointer"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                      {item.customerName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        item.type === 'COMPLAINT'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {item.type}
                    </span>
                  </div>
                  <p className="text-slate-600 line-clamp-2 text-[11px]">
                    &ldquo;{item.fullText}&rdquo;
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
                  <span>{item.dateReceivedBs || item.dateReceivedAd}</span>
                  <span className="text-brand-600 font-semibold group-hover:underline flex items-center gap-0.5">
                    View details
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      </div>
    </PageGuard>
  );
}
