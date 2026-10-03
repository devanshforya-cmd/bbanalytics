'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { X, Package, ArrowUpRight, TrendingDown, Users, Globe, ShoppingBag } from 'lucide-react';
import { Product, Order, ReturnEntry, FeedbackEntry, BrandCode } from '@/lib/types';
import EmptyState from './EmptyState';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  orders: Order[];
  returns: ReturnEntry[];
  feedback: FeedbackEntry[];
  calendarMode: 'BS' | 'AD';
}

export default function ProductDetailModal({
  product,
  onClose,
  orders,
  returns,
  feedback,
  calendarMode,
}: ProductDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'returns' | 'channels' | 'customers'>('timeline');

  if (!product) return null;

  // Filter orders for this product
  const productOrders = orders.filter((o) =>
    o.items.some((i) => i.productId === product.id || i.productName === product.name)
  );

  // Filter returns for this product
  const productReturns = returns.filter(
    (r) => r.productId === product.id || r.productName === product.name
  );

  // Filter complaints for this product
  const productComplaints = feedback.filter(
    (f) => f.productId === product.id || f.productName === product.name
  );

  // Channels selling this product
  const channelCounts: Record<string, number> = {};
  productOrders.forEach((o) => {
    channelCounts[o.platform] = (channelCounts[o.platform] || 0) + 1;
  });

  // Regions ordering this product
  const regionCounts: Record<string, number> = {};
  productOrders.forEach((o) => {
    const reg = o.province || 'Kathmandu Valley';
    regionCounts[reg] = (regionCounts[reg] || 0) + 1;
  });

  // Unique customers
  const customerMap = new Map<string, { name: string; phone: string; orders: number }>();
  productOrders.forEach((o) => {
    if (!customerMap.has(o.customerPhone)) {
      customerMap.set(o.customerPhone, {
        name: o.customerName,
        phone: o.customerPhone,
        orders: 0,
      });
    }
    customerMap.get(o.customerPhone)!.orders += 1;
  });

  const uniqueCustomers = Array.from(customerMap.values());

  const returnRate =
    productOrders.length > 0
      ? ((productReturns.length / productOrders.length) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 w-full md:w-[70vw] max-w-5xl bg-white shadow-2xl flex flex-col border-l border-slate-200 z-50">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-200">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">{product.name}</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800">
                  {product.brandCode}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 font-mono">
                  {product.sku}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                <span>Category: <strong className="text-slate-700">{product.category}</strong></span>
                <span>•</span>
                <span>MRP: <strong className="text-slate-700">NPR {product.mrp}</strong></span>
                <span>•</span>
                <Link
                  href={`/products/${product.id}`}
                  className="font-bold text-blue-600 hover:underline flex items-center gap-0.5"
                >
                  Full 360 View <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-white border-b border-slate-100 text-xs">
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-[10px] uppercase font-bold text-slate-500">Orders Logged</div>
            <div className="text-lg font-black text-slate-900 mt-0.5">{productOrders.length}</div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-[10px] uppercase font-bold text-slate-500">Return Rate</div>
            <div
              className={`text-lg font-black mt-0.5 ${
                Number(returnRate) > 10 ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {returnRate}% ({productReturns.length})
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-[10px] uppercase font-bold text-slate-500">Complaints</div>
            <div className="text-lg font-black text-amber-600 mt-0.5">
              {productComplaints.length}
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-[10px] uppercase font-bold text-slate-500">Unique Buyers</div>
            <div className="text-lg font-black text-blue-600 mt-0.5">
              {uniqueCustomers.length}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-white px-4 sm:px-5 gap-2">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'timeline'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Order Timeline ({productOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('returns')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'returns'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Returns & Defects ({productReturns.length})
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'channels'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Channels & Regions
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'customers'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Customer List ({uniqueCustomers.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/40">
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              {productOrders.length === 0 ? (
                <EmptyState type="orders" />
              ) : (
                <div className="space-y-3">
                  {productOrders.map((o) => (
                    <div
                      key={o.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{o.orderNumber}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 font-semibold text-slate-700">
                            {o.platform}
                          </span>
                        </div>
                        <div className="text-slate-500 text-[11px] mt-0.5">
                          Customer: <strong className="text-slate-800">{o.customerName}</strong> • {o.district}, {o.province}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900">
                          {calendarMode === 'BS' ? o.orderDateBs : o.orderDateAd}
                        </div>
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {o.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'returns' && (
            <div className="space-y-4">
              {productReturns.length === 0 ? (
                <EmptyState type="returns" customMessage="Zero returns recorded for this SKU. Excellent quality control!" />
              ) : (
                <div className="space-y-3">
                  {productReturns.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-slate-900">
                          <span>{r.customerName}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            {r.reasonCategory}
                          </span>
                        </div>
                        <span className="text-slate-500 font-medium">
                          {calendarMode === 'BS' ? r.dateBs : r.dateAd}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px]">{r.remarks || 'No detailed remark.'}</p>
                      <div className="flex flex-wrap gap-1">
                        {r.issueCategories.map((c) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'channels' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Channels */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Sales Channels Breakdown
                </h4>
                <div className="space-y-2">
                  {Object.entries(channelCounts).map(([ch, count]) => (
                    <div key={ch} className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                      <span className="font-semibold text-slate-800">{ch}</span>
                      <span className="font-bold text-blue-600">{count} orders</span>
                    </div>
                  ))}
                  {Object.keys(channelCounts).length === 0 && (
                    <div className="text-xs text-slate-400">No channel data.</div>
                  )}
                </div>
              </div>

              {/* Regions */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Regional Orders Breakdown
                </h4>
                <div className="space-y-2">
                  {Object.entries(regionCounts).map(([reg, count]) => (
                    <div key={reg} className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                      <span className="font-semibold text-slate-800">{reg}</span>
                      <span className="font-bold text-emerald-600">{count} orders</span>
                    </div>
                  ))}
                  {Object.keys(regionCounts).length === 0 && (
                    <div className="text-xs text-slate-400">No regional data.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'customers' && (
            <div className="space-y-3">
              {uniqueCustomers.length === 0 ? (
                <EmptyState type="orders" />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="p-2.5">Customer Name</th>
                        <th className="p-2.5">Phone</th>
                        <th className="p-2.5 text-right">Orders for this SKU</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {uniqueCustomers.map((c) => (
                        <tr key={c.phone} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-900">{c.name}</td>
                          <td className="p-2.5 font-mono text-slate-500">{c.phone}</td>
                          <td className="p-2.5 text-right font-bold">{c.orders}</td>
                          <td className="p-2.5 text-right">
                            <Link
                              href="/customers"
                              className="text-blue-600 font-bold hover:underline"
                            >
                              Customer 360
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
