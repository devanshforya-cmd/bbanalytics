'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { ReturnEntry, Order, BrandCode } from '@/lib/types';
import DrillDownShell from './DrillDownShell';
import EmptyState from '../EmptyState';
import { brandColor as getBrandColor } from '@/lib/ui-utils';

interface ReturnsDrillDownProps {
  returns: ReturnEntry[];
  orders: Order[];
  calendarMode: 'BS' | 'AD';
  onClose: () => void;
}

export default function ReturnsDrillDown({
  returns,
  orders,
  calendarMode,
  onClose,
}: ReturnsDrillDownProps) {
  const [activeTab, setActiveTab] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const totalReturnUnits = returns.reduce((acc, r) => acc + r.quantity, 0);
  const totalOrders = Math.max(orders.length, 1);
  const returnRate = ((returns.length / totalOrders) * 100).toFixed(1);
  const resolvedCount = returns.filter(
    (r) => r.orderStatus === 'Exchanged' || r.orderStatus === 'Refunded'
  ).length;

  const tabs = [
    { id: 1, label: 'All Returns', count: returns.length },
    { id: 2, label: 'By Product (Defect Isolation)' },
    { id: 3, label: 'By Dynamic Categories' },
  ];

  return (
    <DrillDownShell
      isOpen={true}
      title="Product Returns Analysis"
      subtitle="Defects, leaks, formulation complaints, and customer return investigations"
      icon={RotateCcw}
      iconBgColor="bg-amber-50"
      iconColor="text-amber-600"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onClose={onClose}
    >
      <div className="space-y-6">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Returns
            </div>
            <div className="text-xl font-black text-rose-600 mt-1">{returns.length}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Return Rate
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">{returnRate}%</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Units Returned
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">{totalReturnUnits}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Resolved / Exchanged
            </div>
            <div className="text-xl font-black text-emerald-600 mt-1">{resolvedCount}</div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 1 && <ReturnsListTab returns={returns} calendarMode={calendarMode} />}
        {activeTab === 2 && <ReturnsByProductTab returns={returns} orders={orders} />}
        {activeTab === 3 && (
          <ReturnsByCategoryTab
            returns={returns}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />
        )}
      </div>
    </DrillDownShell>
  );
}

function ReturnsListTab({
  returns,
  calendarMode,
}: {
  returns: ReturnEntry[];
  calendarMode: 'BS' | 'AD';
}) {
  if (returns.length === 0) {
    return <EmptyState type="returns" />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <th className="p-2.5">Return Date</th>
            <th className="p-2.5">Customer</th>
            <th className="p-2.5">Brand</th>
            <th className="p-2.5">Product</th>
            <th className="p-2.5 text-center">Qty</th>
            <th className="p-2.5">Reason</th>
            <th className="p-2.5">Dynamic Issue Chips</th>
            <th className="p-2.5">Resolution</th>
            <th className="p-2.5">Valley</th>
            <th className="p-2.5">Remarks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {returns.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="p-2.5 font-medium text-slate-600 whitespace-nowrap">
                {calendarMode === 'BS' ? r.dateBs : r.dateAd}
              </td>
              <td className="p-2.5 whitespace-nowrap font-bold text-slate-900">
                <Link
                  href={`/customers/${encodeURIComponent(r.customerPhone)}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {r.customerName}
                </Link>
                <div className="text-[10px] text-slate-400 font-mono">{r.customerPhone}</div>
              </td>
              <td className="p-2.5 whitespace-nowrap">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getBrandColor(r.brandCode)}`}>
                  {r.brandCode}
                </span>
              </td>
              <td className="p-2.5 font-medium text-slate-800">
                <Link
                  href={`/products/${encodeURIComponent(r.productName)}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {r.productName}
                </Link>
              </td>
              <td className="p-2.5 text-center font-bold">{r.quantity}</td>
              <td className="p-2.5 whitespace-nowrap font-semibold text-rose-700">
                {r.reasonCategory}
              </td>
              <td className="p-2.5">
                <div className="flex flex-wrap gap-1">
                  {r.issueCategories.map((c) => (
                    <span
                      key={c}
                      className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-700"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </td>
              <td className="p-2.5 whitespace-nowrap">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  {r.orderStatus}
                </span>
              </td>
              <td className="p-2.5 whitespace-nowrap text-slate-600">{r.valley} Valley</td>
              <td className="p-2.5 text-slate-500 max-w-xs truncate">{r.remarks || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReturnsByProductTab({
  returns,
  orders,
}: {
  returns: ReturnEntry[];
  orders: Order[];
}) {
  const productStats: Record<
    string,
    { name: string; brand: BrandCode; orders: number; returns: number; reasons: string[] }
  > = {};

  orders.forEach((o) => {
    o.items.forEach((item) => {
      if (!productStats[item.productId]) {
        productStats[item.productId] = {
          name: item.productName,
          brand: item.brandCode || o.brandCode,
          orders: 0,
          returns: 0,
          reasons: [],
        };
      }
      productStats[item.productId].orders += item.quantity;
    });
  });

  returns.forEach((r) => {
    if (!productStats[r.productId]) {
      productStats[r.productId] = {
        name: r.productName,
        brand: r.brandCode,
        orders: 1,
        returns: 0,
        reasons: [],
      };
    }
    productStats[r.productId].returns += r.quantity;
    productStats[r.productId].reasons.push(r.reasonCategory);
  });

  const list = Object.values(productStats)
    .map((p) => {
      const rate = p.orders > 0 ? (p.returns / p.orders) * 100 : 0;
      return {
        ...p,
        returnRate: rate,
      };
    })
    .sort((a, b) => b.returnRate - a.returnRate);

  if (list.length === 0) {
    return <EmptyState type="returns" />;
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-medium">
        Products with <strong>&gt;10% return rate</strong> are flagged in red to isolate packaging defects and formulation complaints.
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Product</th>
              <th className="p-2.5">Brand</th>
              <th className="p-2.5 text-right">Orders</th>
              <th className="p-2.5 text-right">Returns</th>
              <th className="p-2.5 text-right">Return Rate %</th>
              <th className="p-2.5">Top Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {list.map((p) => {
              const isHighAlert = p.returnRate > 10;
              return (
                <tr
                  key={p.name}
                  className={`hover:bg-slate-50 ${isHighAlert ? 'bg-rose-50/60 font-semibold' : ''}`}
                >
                  <td className="p-2.5 font-bold text-slate-900">{p.name}</td>
                  <td className="p-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getBrandColor(p.brand)}`}>
                      {p.brand}
                    </span>
                  </td>
                  <td className="p-2.5 text-right">{p.orders}</td>
                  <td className="p-2.5 text-right font-bold text-rose-700">{p.returns}</td>
                  <td className="p-2.5 text-right">
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        isHighAlert
                          ? 'bg-rose-200 text-rose-900'
                          : p.returnRate > 5
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {p.returnRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="p-2.5 text-slate-600">{p.reasons[0] || 'None'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReturnsByCategoryTab({
  returns,
  selectedCategory,
  onSelectCategory,
}: {
  returns: ReturnEntry[];
  selectedCategory: string | null;
  onSelectCategory: (cat: string | null) => void;
}) {
  const categoryMap: Record<
    string,
    { count: number; resolved: number; products: Record<string, number> }
  > = {};

  returns.forEach((r) => {
    r.issueCategories.forEach((cat) => {
      if (!categoryMap[cat]) {
        categoryMap[cat] = { count: 0, resolved: 0, products: {} };
      }
      categoryMap[cat].count += 1;
      if (r.orderStatus === 'Exchanged' || r.orderStatus === 'Refunded') {
        categoryMap[cat].resolved += 1;
      }
      categoryMap[cat].products[r.productName] = (categoryMap[cat].products[r.productName] || 0) + 1;
    });
  });

  const categories = Object.entries(categoryMap).map(([name, data]) => ({
    name,
    count: data.count,
    pctResolved: ((data.resolved / data.count) * 100).toFixed(0),
  }));

  const filteredReturns = selectedCategory
    ? returns.filter((r) => r.issueCategories.includes(selectedCategory))
    : returns;

  return (
    <div className="space-y-6">
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Click a Dynamic Category to Filter
          </h4>
          {selectedCategory && (
            <button
              onClick={() => onSelectCategory(null)}
              className="text-xs font-bold text-rose-600 hover:underline"
            >
              Clear Filter
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.name}
              onClick={() => onSelectCategory(selectedCategory === c.name ? null : c.name)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedCategory === c.name
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{c.name}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  selectedCategory === c.name ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {c.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Customer</th>
              <th className="p-2.5">Product</th>
              <th className="p-2.5">Brand</th>
              <th className="p-2.5">Matching Categories</th>
              <th className="p-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredReturns.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="p-2.5 font-bold text-slate-900">
                  <Link
                    href={`/customers/${encodeURIComponent(r.customerPhone)}`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {r.customerName}
                  </Link>
                </td>
                <td className="p-2.5">
                  <Link
                    href={`/products/${encodeURIComponent(r.productName)}`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {r.productName}
                  </Link>
                </td>
                <td className="p-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getBrandColor(r.brandCode)}`}>
                    {r.brandCode}
                  </span>
                </td>
                <td className="p-2.5">
                  <div className="flex flex-wrap gap-1">
                    {r.issueCategories.map((cat) => (
                      <span
                        key={cat}
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          cat === selectedCategory
                            ? 'bg-blue-100 text-blue-800 font-bold'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-2.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {r.orderStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
