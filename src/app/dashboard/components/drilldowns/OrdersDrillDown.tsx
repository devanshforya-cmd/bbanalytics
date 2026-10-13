'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, Search } from 'lucide-react';
import { Order, ReturnEntry, BrandCode, Brand } from '@/lib/types';
import { db } from '@/lib/db/db-service';
import DrillDownShell from './DrillDownShell';
import EmptyState from '../EmptyState';
import { statusColor as getStatusColor, brandColor as getBrandColor } from '@/lib/ui-utils';

interface OrdersDrillDownProps {
  orders: Order[];
  returns: ReturnEntry[];
  calendarMode: 'BS' | 'AD';
  onClose: () => void;
}

export default function OrdersDrillDown({
  orders,
  returns,
  calendarMode,
  onClose,
}: OrdersDrillDownProps) {
  const [activeTab, setActiveTab] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const totalUnits = orders.reduce(
    (acc, o) => acc + o.items.reduce((sum, i) => sum + i.quantity, 0),
    0
  );
  const repeatOrders = orders.filter((o) => o.orderType === 'REPEAT').length;
  const repeatPct = orders.length > 0 ? ((repeatOrders / orders.length) * 100).toFixed(1) : '0.0';

  const tabs = [
    { id: 1, label: 'All Orders', count: orders.length },
    { id: 2, label: 'By Product' },
    { id: 3, label: 'By Channel' },
  ];

  return (
    <DrillDownShell
      isOpen={true}
      title="Orders Intelligence & Drill-Down"
      subtitle="Complete multi-channel sales breakdown, SKUs ordered, and delivery status"
      icon={ShoppingBag}
      iconBgColor="bg-blue-50"
      iconColor="text-blue-600"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onClose={onClose}
    >
      <div className="space-y-6">
        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Orders
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">{orders.length}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Units Ordered
            </div>
            <div className="text-xl font-black text-blue-600 mt-1">{totalUnits}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Repeat Rate
            </div>
            <div className="text-xl font-black text-emerald-600 mt-1">{repeatPct}%</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Avg Units / Order
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {orders.length > 0 ? (totalUnits / orders.length).toFixed(1) : '0.0'}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 1 && (
          <OrdersListTab
            orders={orders}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            calendarMode={calendarMode}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            pageSize={pageSize}
          />
        )}
        {activeTab === 2 && <OrdersByProductTab orders={orders} />}
        {activeTab === 3 && <OrdersByChannelTab orders={orders} returns={returns} />}
      </div>
    </DrillDownShell>
  );
}

function OrdersListTab({
  orders,
  searchQuery,
  setSearchQuery,
  calendarMode,
  currentPage,
  setCurrentPage,
  pageSize,
}: {
  orders: Order[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  calendarMode: 'BS' | 'AD';
  currentPage: number;
  setCurrentPage: (p: number) => void;
  pageSize: number;
}) {
  const filtered = orders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const cust = o.customerName.toLowerCase();
    const phone = o.customerPhone.toLowerCase();
    const prods = o.items.map((i) => i.productName.toLowerCase()).join(' ');
    const id = o.orderNumber.toLowerCase();
    return cust.includes(q) || phone.includes(q) || prods.includes(q) || id.includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (orders.length === 0) {
    return <EmptyState type="orders" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by customer name, phone, product, or order ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Showing {paginated.length} of {filtered.length} orders
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5 whitespace-nowrap">Order ID</th>
              <th className="p-2.5 whitespace-nowrap">Date</th>
              <th className="p-2.5 whitespace-nowrap">Customer</th>
              <th className="p-2.5 whitespace-nowrap">Brand</th>
              <th className="p-2.5">Products</th>
              <th className="p-2.5 whitespace-nowrap text-center">Units</th>
              <th className="p-2.5 whitespace-nowrap">Channel</th>
              <th className="p-2.5 whitespace-nowrap">Type</th>
              <th className="p-2.5 whitespace-nowrap">Delivery</th>
              <th className="p-2.5 whitespace-nowrap">Status</th>
              <th className="p-2.5 whitespace-nowrap">Valley</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {paginated.map((o) => {
              const totalUnits = o.items.reduce((sum, i) => sum + i.quantity, 0);
              const brandColor = getBrandColor(o.brandCode);
              const statusPillColor = getStatusColor(o.status);

              return (
                <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-2.5 whitespace-nowrap font-mono text-slate-900 font-bold">
                    {o.orderNumber}
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-slate-500">
                    {calendarMode === 'BS' ? o.orderDateBs : o.orderDateAd}
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <Link
                      href={`/customers/${encodeURIComponent(o.customerPhone)}`}
                      className="font-semibold text-blue-600 hover:underline"
                    >
                      {o.customerName}
                    </Link>
                    <div className="text-[10px] text-slate-400 font-mono">{o.customerPhone}</div>
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${brandColor}`}>
                      {o.brandCode}
                    </span>
                  </td>
                  <td className="p-2.5 max-w-xs truncate" title={o.items.map((i) => i.productName).join(', ')}>
                    {o.items.map((i, idx) => (
                      <span key={idx}>
                        {idx > 0 && ', '}
                        <Link
                          href={`/products/${i.productId || encodeURIComponent(i.productName)}`}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {i.productName}
                        </Link>
                      </span>
                    ))}
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-center font-bold">{totalUnits}</td>
                  <td className="p-2.5 whitespace-nowrap">
                    {o.isMarketing ? (
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold text-[10px] border border-purple-200 inline-flex items-center gap-1">
                        <span>🎁</span>
                        <span>MARKETING</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium text-[10px] border border-slate-200">
                        {o.platform}
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        o.orderType === 'REPEAT'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {o.orderType}
                    </span>
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-slate-600">{o.deliveryMethod}</td>
                  <td className="p-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusPillColor}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-slate-500">
                    {o.province?.includes('Bagmati') ? 'Inside Valley' : 'Outside Valley'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-white border border-slate-200 rounded text-xs disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-white border border-slate-200 rounded text-xs disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function OrdersByProductTab({ orders }: { orders: Order[] }) {
  const productStats: Record<
    string,
    { name: string; brand: BrandCode; units: number; customers: Set<string> }
  > = {};

  orders.forEach((o) => {
    o.items.forEach((item) => {
      if (!productStats[item.productId]) {
        productStats[item.productId] = {
          name: item.productName,
          brand: item.brandCode || o.brandCode,
          units: 0,
          customers: new Set(),
        };
      }
      productStats[item.productId].units += item.quantity;
      productStats[item.productId].customers.add(o.customerPhone);
    });
  });

  const list = Object.values(productStats).sort((a, b) => b.units - a.units);
  const totalUnits = list.reduce((acc, p) => acc + p.units, 0);

  if (list.length === 0) {
    return <EmptyState type="orders" />;
  }

  const maxUnits = Math.max(...list.map((p) => p.units), 1);

  return (
    <div className="space-y-6">
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Units Ordered by Product
        </h4>
        <div className="space-y-2.5">
          {list.map((p) => {
            const barWidth = Math.round((p.units / maxUnits) * 100);
            const brandObj = db.getBrands().find((b: Brand) => b.code.toUpperCase() === p.brand?.toUpperCase());
            const brandColor = brandObj?.color || '#3b82f6';

            return (
              <div key={p.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-800">{p.name}</span>
                  <span className="font-bold text-slate-900">{p.units} units</span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${barWidth}%`, backgroundColor: brandColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Product</th>
              <th className="p-2.5">Brand</th>
              <th className="p-2.5 text-right">Units Ordered</th>
              <th className="p-2.5 text-right">% of Total</th>
              <th className="p-2.5 text-right">Unique Customers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {list.map((p) => (
              <tr key={p.name} className="hover:bg-slate-50">
                <td className="p-2.5 font-bold text-slate-900">{p.name}</td>
                <td className="p-2.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                    {p.brand}
                  </span>
                </td>
                <td className="p-2.5 text-right font-bold text-slate-900">{p.units}</td>
                <td className="p-2.5 text-right font-semibold text-blue-600">
                  {totalUnits > 0 ? ((p.units / totalUnits) * 100).toFixed(1) : 0}%
                </td>
                <td className="p-2.5 text-right font-medium text-slate-600">{p.customers.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrdersByChannelTab({ orders, returns }: { orders: Order[]; returns: ReturnEntry[] }) {
  const channels = ['Instagram', 'WhatsApp', 'Messenger', 'TikTok', 'Website', 'Walk-in', 'Phone Call', 'Pathao Bazaar'];
  const channelStats = channels.map((ch) => {
    const chOrders = orders.filter((o) => o.platform === ch);
    const delivered = chOrders.filter((o) => o.status === 'DELIVERED').length;
    const chReturns = returns.filter((r) => r.platform === ch).length;

    const deliverySuccessRate =
      chOrders.length > 0 ? ((delivered / chOrders.length) * 100).toFixed(1) : '100.0';
    const returnRate =
      chOrders.length > 0 ? ((chReturns / chOrders.length) * 100).toFixed(1) : '0.0';

    return {
      channel: ch,
      orders: chOrders.length,
      deliverySuccessRate,
      returnRate,
    };
  });

  const totalOrders = orders.length;

  return (
    <div className="space-y-6">
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Order Volume by Channel
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {channelStats.map((c) => (
            <div key={c.channel} className="p-3 rounded-lg border border-slate-100 bg-slate-50/60">
              <div className="text-[11px] font-semibold text-slate-600 truncate">{c.channel}</div>
              <div className="text-lg font-black text-slate-900 mt-1">{c.orders}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {totalOrders > 0 ? ((c.orders / totalOrders) * 100).toFixed(1) : 0}% of orders
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Channel</th>
              <th className="p-2.5 text-right">Orders</th>
              <th className="p-2.5 text-right">% of Total</th>
              <th className="p-2.5 text-right">Avg Delivery Success Rate</th>
              <th className="p-2.5 text-right">Return Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {channelStats.map((c) => (
              <tr key={c.channel} className="hover:bg-slate-50">
                <td className="p-2.5 font-bold text-slate-900">{c.channel}</td>
                <td className="p-2.5 text-right font-bold">{c.orders}</td>
                <td className="p-2.5 text-right text-slate-600">
                  {totalOrders > 0 ? ((c.orders / totalOrders) * 100).toFixed(1) : 0}%
                </td>
                <td className="p-2.5 text-right font-semibold text-emerald-600">
                  {c.deliverySuccessRate}%
                </td>
                <td className="p-2.5 text-right font-semibold text-rose-600">{c.returnRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
