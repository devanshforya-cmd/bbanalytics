'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowUpRight, Gift, Layers, MapPin, MessageSquare, RotateCcw, ShoppingBag, Truck, Users } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import Money from '@/components/common/Money';
import ProductTrendChart from '@/components/products/ProductTrendChart';
import { OrderStatusBadge } from '@/components/orders/OrderStatusControl';
import { comboMetrics, type ProductMetricsInput } from '@/lib/product-metrics';
import { isSellableCombo } from '@/lib/product-catalog';
import { displayDocumentId } from '@/lib/document-ids';
import type { Combo, DeliveryFailure, FeedbackEntry, Order, Product, ReturnEntry, SecondaryOrder } from '@/lib/types';

const card = 'bg-white rounded-3xl border border-slate-200 p-5 shadow-xs';

function Bar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-700 font-medium truncate">{label}</span>
        <span className="text-slate-900 font-bold font-mono shrink-0">{value} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function Combo360Page() {
  const params = useParams();
  const comboId = decodeURIComponent((params?.id as string) || '');
  const [combo, setCombo] = useState<Combo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [secondaryOrders, setSecondaryOrders] = useState<SecondaryOrder[]>([]);
  const [returns, setReturns] = useState<ReturnEntry[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [deliveryFailures, setDeliveryFailures] = useState<DeliveryFailure[]>([]);

  useEffect(() => {
    if (!comboId) return;
    const load = () => {
      const all = db.getCombos();
      setCombos(all);
      setCombo(all.find((entry) => entry.id === comboId) || null);
      setProducts(db.getProducts());
      setOrders(db.getOrders());
      setSecondaryOrders(db.getSecondaryOrders());
      setReturns(db.getReturns());
      setFeedback(db.getFeedback());
      setDeliveryFailures(db.getDeliveryFailures());
    };
    load();
    window.addEventListener('bb-db-updated', load);
    return () => window.removeEventListener('bb-db-updated', load);
  }, [comboId]);

  const input = useMemo<ProductMetricsInput>(() => ({ orders, secondaryOrders, combos, returns, feedback, deliveryFailures }), [orders, secondaryOrders, combos, returns, feedback, deliveryFailures]);
  const names = useMemo(() => new Map<string, string>([...products.map((p) => [p.id, p.name] as [string, string]), ...combos.map((c) => [c.id, c.name] as [string, string])]), [products, combos]);
  const m = useMemo(() => (combo ? comboMetrics(combo.id, { ...input, names }) : null), [combo, input, names]);

  if (!combo || !m) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Combo not found. It may have been deleted or your catalogue is still syncing.</p>
        <Link href="/products" className="text-blue-700 underline">Back to products</Link>
      </div>
    );
  }

  const currentMrp = combo.items.reduce((sum, part) => sum + (products.find((p) => p.id === part.productId)?.mrp ?? part.mrp) * part.quantity, 0);
  const savings = currentMrp > 0 ? Math.max(0, Math.round((1 - combo.comboPrice / currentMrp) * 1000) / 10) : 0;
  const sellable = isSellableCombo(combo, products);
  const recentOrders = [...m.orders].sort((a, b) => (b.orderDateAd || '').localeCompare(a.orderDateAd || '')).slice(0, 10);
  const recentFeedback = [...m.feedback.entries].sort((a, b) => (b.dateReceivedAd || '').localeCompare(a.dateReceivedAd || '')).slice(0, 6);
  const reasonCounts = new Map<string, number>();
  for (const entry of m.returns.entries) if (entry.orderStatus !== 'Rejected') reasonCounts.set(entry.reasonCategory || 'Other', (reasonCounts.get(entry.reasonCategory || 'Other') || 0) + 1);
  const reasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const brand = db.getBrands().find((b) => b.code === combo.brandCode)?.name || combo.brandCode;

  return (
    <PageGuard feature="products">
      <div className="space-y-6 pb-12 max-w-7xl mx-auto">
        <Breadcrumbs items={[{ label: 'Product Catalog', href: '/products' }, { label: 'Combos', href: '/products?tab=combos' }, { label: combo.name }]} />

        {/* Header */}
        <div className={`${card} sm:p-6`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-purple-600 flex items-center justify-center text-white shrink-0"><Layers className="w-8 h-8" /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700">{brand}</span>
                  {combo.sku && <span className="text-[11px] font-mono text-purple-800 bg-purple-100 px-2 py-0.5 rounded-md font-bold">{combo.sku}</span>}
                  <span className="text-xs text-slate-500">Online only</span>
                  {!sellable && <span className="text-xs font-semibold text-amber-700">Unavailable for new orders: a product in it is missing or archived</span>}
                  {combo.active === false && <span className="text-xs text-amber-700">Inactive</span>}
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1.5">{combo.name}</h1>
                {combo.description && <p className="text-xs text-slate-500 mt-1 max-w-2xl">{combo.description}</p>}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 px-5 py-3 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-500 block">Combo price</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl sm:text-2xl font-black text-purple-700 font-mono"><Money>{combo.comboPrice}</Money></span>
                <span className="text-xs text-slate-500 line-through font-mono"><Money>{currentMrp}</Money></span>
              </div>
              <span className="text-xs font-bold text-emerald-700">Saves {savings}% on today&apos;s product prices</span>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold"><span>Kits sold</span><ShoppingBag className="w-4 h-4 text-purple-600" /></div>
            <div className="text-2xl font-black text-slate-900 mt-2 font-mono">{m.kits.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">
              {m.orders.length} {m.orders.length === 1 ? 'order' : 'orders'}, <Money>{m.revenue.toLocaleString()}</Money>
              {m.giftKits ? ` · ${m.giftKits} given free` : ''}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold"><span>Buyers</span><Users className="w-4 h-4 text-blue-600" /></div>
            <div className="text-2xl font-black text-blue-700 mt-2 font-mono">{m.buyers}</div>
            <div className="text-xs text-slate-500 mt-1">{m.repeatBuyers} bought it more than once</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold"><span>Kit return rate</span><RotateCcw className="w-4 h-4 text-amber-600" /></div>
            <div className="text-2xl font-black text-amber-600 mt-2 font-mono">{m.returns.ratePct.toFixed(1)}%</div>
            <div className="text-xs text-slate-500 mt-1">
              {m.returns.wholeKits} whole {m.returns.wholeKits === 1 ? 'kit' : 'kits'} back
              {(() => { const singles = m.returns.partUnits.reduce((s, p) => s + p.units, 0); return singles ? `, ${singles} single ${singles === 1 ? 'product' : 'products'}` : ''; })()}
            </div>
          </div>
          <Link href={`/reviews/feedback?product=${encodeURIComponent(combo.name)}`} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-brand-500 transition block">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold"><span>Feedback</span><MessageSquare className="w-4 h-4 text-brand-600" /></div>
            <div className="text-xl font-black text-slate-900 mt-2">
              {m.feedback.reviews} {m.feedback.reviews === 1 ? 'review' : 'reviews'}, {m.feedback.complaints} {m.feedback.complaints === 1 ? 'complaint' : 'complaints'}
            </div>
            <div className="text-xs text-slate-500 mt-1 truncate">Top issue: <strong className="text-slate-700">{m.feedback.topIssue || 'None reported'}</strong></div>
          </Link>
        </div>

        <ProductTrendChart productId={combo.id} input={input} kind="combo" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* What's inside and how much of each product sells through the combo */}
          <div className={`${card} lg:col-span-2 space-y-4`}>
            <div>
              <h3 className="text-sm font-bold text-slate-900">What&apos;s inside</h3>
              <p className="text-xs text-slate-500 mt-0.5">How many of each product went out in this combo, against all its online sales.</p>
            </div>
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                    <th className="p-3">Product</th>
                    <th className="p-3 text-right">Per kit</th>
                    <th className="p-3 text-right">Price today</th>
                    <th className="p-3 text-right">Sold in this combo</th>
                    <th className="p-3 text-right">Share of its online sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {m.components.map((part) => {
                    const product = products.find((p) => p.id === part.productId);
                    return (
                      <tr key={part.productId} className="hover:bg-slate-50">
                        <td className="p-3">
                          <Link href={`/products/${part.productId}`} className="font-bold text-slate-900 hover:text-blue-600 hover:underline inline-flex items-center gap-1">
                            {product?.name || part.productName}<ArrowUpRight className="h-3 w-3 text-slate-400" />
                          </Link>
                          {(!product || product.active === false) && <div className="text-[10px] text-amber-700">Archived or missing</div>}
                        </td>
                        <td className="p-3 text-right font-mono">{part.perKit}</td>
                        <td className="p-3 text-right font-mono"><Money>{product?.mrp ?? combo.items.find((i) => i.productId === part.productId)?.mrp ?? 0}</Money></td>
                        <td className="p-3 text-right font-mono font-bold">{part.unitsViaCombo}</td>
                        <td className="p-3 text-right">
                          <span className="font-mono font-bold text-purple-700">{part.sharePct}%</span>
                          <span className="text-[10px] text-slate-500 block">of {part.productUnitsOnline} units</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">Average price paid per kit: <strong className="text-slate-700"><Money>{m.avgKitPrice.toLocaleString()}</Money></strong>, after offers and discounts.</p>
          </div>

          {/* Where it sells */}
          <div className={`${card} space-y-5`}>
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-purple-600" />Kits by channel</h3>
              {m.platforms.length === 0 ? <p className="text-xs text-slate-500">No kits sold yet.</p>
                : m.platforms.slice(0, 5).map((row) => <Bar key={row.name} label={row.name} value={row.kits} total={m.kits} tone="bg-purple-600" />)}
            </div>
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-600" />Kits by province</h3>
              {m.provinces.length === 0 ? <p className="text-xs text-slate-500">No kits sold yet.</p>
                : m.provinces.slice(0, 5).map((row) => <Bar key={row.name} label={row.name} value={row.kits} total={m.kits} tone="bg-blue-600" />)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Returns */}
          <div className={`${card} space-y-3`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><RotateCcw className="w-4 h-4 text-amber-600" />Returns and exchanges</h3>
              <Link href={`/reviews/returns?product=${encodeURIComponent(combo.name)}`} className="text-xs font-bold text-brand-600 hover:underline">View</Link>
            </div>
            {m.returns.entries.length === 0 ? <p className="text-xs text-slate-500">Nothing returned from this combo.</p> : (
              <>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {([['Returned', m.returns.returned], ['Exchanged', m.returns.exchanged], ['Refunded', m.returns.refunded]] as const).map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 p-2"><div className="font-black text-slate-900 font-mono text-base">{value}</div><div className="text-[10px] text-slate-500">{label}</div></div>
                  ))}
                </div>
                {(m.returns.pending > 0 || m.returns.rejected > 0) && <p className="text-[11px] text-slate-500">{m.returns.pending} pending, {m.returns.rejected} rejected.</p>}
                {m.returns.partUnits.length > 0 && (
                  <div className="text-xs">
                    <div className="font-semibold text-slate-700 mb-1">Single products sent back from a kit</div>
                    {m.returns.partUnits.map((part) => <div key={part.productId} className="flex justify-between text-slate-600"><span className="truncate">{part.productName}</span><span className="font-mono">{part.units}</span></div>)}
                  </div>
                )}
                {reasons.length > 0 && <p className="text-xs text-slate-600"><strong>Why:</strong> {reasons.map(([reason, count]) => `${reason} (${count})`).join(', ')}</p>}
                {m.exchangeKitsSent > 0 && <p className="text-[11px] text-slate-500">{m.exchangeKitsSent} replacement {m.exchangeKitsSent === 1 ? 'kit' : 'kits'} sent on exchange orders.</p>}
              </>
            )}
          </div>

          {/* Delivery failures */}
          <div className={`${card} space-y-3`}>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Truck className="w-4 h-4 text-rose-600" />Delivery failures</h3>
            <div className="text-2xl font-black text-rose-700 font-mono">{m.failures.ratePct.toFixed(1)}%</div>
            <p className="text-xs text-slate-500">{m.failures.entries.length} failed {m.failures.entries.length === 1 ? 'delivery' : 'deliveries'} on orders with this combo.</p>
            {m.failures.entries.slice(0, 4).map((failure) => (
              <div key={failure.id} className="flex justify-between text-xs text-slate-600 border-t border-slate-100 pt-1.5">
                <span className="truncate">{failure.reason || 'Reason not recorded'}</span><span className="font-mono shrink-0 ml-2">{failure.dateBs || failure.dateAd}</span>
              </div>
            ))}
          </div>

          {/* Bought together */}
          <div className={`${card} space-y-3`}>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Gift className="w-4 h-4 text-emerald-600" />Often bought with it</h3>
            {m.boughtWith.length === 0 ? <p className="text-xs text-slate-500">Usually ordered on its own.</p> : m.boughtWith.map((row) => (
              <div key={row.productId} className="flex items-center justify-between text-xs">
                <Link href={combos.some((c) => c.id === row.productId) ? `/products/combo/${row.productId}` : `/products/${row.productId}`} className="font-medium text-slate-800 hover:text-blue-600 hover:underline truncate">{row.name}</Link>
                <span className="font-mono text-slate-600 shrink-0 ml-2">{row.orders} {row.orders === 1 ? 'order' : 'orders'} ({m.orders.length ? Math.round((row.orders / m.orders.length) * 100) : 0}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent orders */}
        <div className={`${card} space-y-4`}>
          <h3 className="text-sm font-bold text-slate-900">Recent orders with this combo</h3>
          {recentOrders.length === 0 ? <p className="p-6 text-center text-xs text-slate-500">No orders yet.</p> : (
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                    <th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Channel</th><th className="p-3">Date</th><th className="p-3 text-right">Kits</th><th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="p-3"><Link href={`/orderflow/orders/${order.id}`} className="font-mono font-bold text-blue-700 hover:underline">{displayDocumentId(order.orderNumber)}</Link></td>
                      <td className="p-3">{order.customerPhone ? <Link href={`/customers/${order.customerPhone}`} className="text-slate-800 hover:text-blue-600 hover:underline">{order.customerName}</Link> : order.customerName}</td>
                      <td className="p-3 text-slate-600">{order.platform}</td>
                      <td className="p-3 font-mono text-slate-500">{order.orderDateBs || order.orderDateAd}</td>
                      <td className="p-3 text-right font-mono font-bold">{order.items.filter((line) => line.productId === combo.id && !line.isGift).reduce((s, line) => s + line.quantity, 0)}</td>
                      <td className="p-3 text-center"><OrderStatusBadge status={order.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Feedback */}
        <div className={`${card} space-y-4`}>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-brand-600" />Reviews and complaints ({m.feedback.entries.length})</h3>
          {recentFeedback.length === 0 ? <p className="p-6 text-center text-xs text-slate-500">No reviews or complaints for this combo yet.</p> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentFeedback.map((item) => (
                <div key={item.id} className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{item.customerName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.type === 'COMPLAINT' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>{item.type}</span>
                  </div>
                  <p className="text-slate-600 line-clamp-3 italic">&ldquo;{item.fullText}&rdquo;</p>
                  <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                    <span>{item.productId === combo.id ? 'About the combo' : `About ${item.productName}`}</span><span>{item.dateReceivedBs || item.dateReceivedAd}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageGuard>
  );
}
