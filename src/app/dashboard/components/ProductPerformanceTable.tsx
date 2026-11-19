'use client';

import React, { useState, useMemo } from 'react';
import { Product, Order, ReturnEntry, DeliveryFailure, FeedbackEntry, BrandCode, Brand } from '@/lib/types';
import { db } from '@/lib/db/db-service';
import { Search, ArrowUpDown, ChevronDown, ChevronUp, Package, AlertTriangle } from 'lucide-react';
import ProductDetailModal from './ProductDetailModal';
import { productMetrics, comboParts, unitsInLines } from '@/lib/product-metrics';
import { countsAsSale } from '@/lib/order-status';
import { compareWindows, inWindow, changeLabel, type CompareMode } from '@/lib/period-compare';

interface ProductPerformanceTableProps {
  products: Product[];
  orders: Order[];
  returns: ReturnEntry[];
  deliveryFailures: DeliveryFailure[];
  feedback: FeedbackEntry[];
  calendarMode: 'BS' | 'AD';
  comparisonMode?: 'OFF' | 'LAST_MONTH' | 'SAME_MONTH_LAST_YEAR' | 'CUSTOM';
}

type SortField =
  | 'name'
  | 'brandCode'
  | 'category'
  | 'totalOrders'
  | 'unitsSold'
  | 'returnRate'
  | 'failureRate'
  | 'complaintCount'
  | 'avgKarma';

export default function ProductPerformanceTable({
  products,
  orders,
  returns,
  deliveryFailures,
  feedback,
  calendarMode,
  comparisonMode = 'OFF',
}: ProductPerformanceTableProps) {
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<BrandCode | 'ALL'>('ALL');
  const [sortField, setSortField] = useState<SortField>('totalOrders');
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const pageSize = 25;

  // Compute performance metrics for all products
  const compareMode: CompareMode = comparisonMode === 'LAST_MONTH' || comparisonMode === 'SAME_MONTH_LAST_YEAR' ? comparisonMode : 'OFF';
  const windows = useMemo(() => compareWindows(compareMode, new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' })), [compareMode]);
  const allOrders = useMemo(() => (windows ? db.getOrders() : []), [windows]);
  const computedProducts = useMemo(() => {
    const combos = db.getCombos();
    const karmaByPhone = new Map(db.getCustomers().map((customer) => [customer.phone, customer.karmaScore]));
    return products.map((prod) => {
      const metrics = productMetrics(prod.id, { orders, secondaryOrders: [], combos, returns, feedback, deliveryFailures });
      const parts = comboParts(combos);
      // Karma of the customers who actually bought this product.
      const buyers = new Set<string>();
      for (const order of orders) {
        if (!countsAsSale(order)) continue;
        const units = unitsInLines(order.items || [], prod.id, parts);
        if (units.direct + units.viaCombo > 0 && order.customerPhone) buyers.add(order.customerPhone);
      }
      const karmas = [...buyers].map((phone) => karmaByPhone.get(phone)).filter((value): value is number => typeof value === 'number');
      const avgKarma = karmas.length ? Math.round(karmas.reduce((x, y) => x + y, 0) / karmas.length) : null;
      // Units in the last 30 days against the comparison window, from all orders (not the page's date filter).
      let unitsNow = 0, unitsBefore = 0;
      if (windows) {
        for (const order of allOrders) {
          if (!countsAsSale(order)) continue;
          const inNow = inWindow(order.orderDateAd, windows.current), inBefore = inWindow(order.orderDateAd, windows.previous);
          if (!inNow && !inBefore) continue;
          const units = unitsInLines(order.items || [], prod.id, parts);
          if (inNow) unitsNow += units.direct + units.viaCombo; else unitsBefore += units.direct + units.viaCombo;
        }
      }
      return {
        ...prod,
        totalOrders: metrics.d2c.orders,
        unitsSold: metrics.d2c.units,
        returnRate: metrics.returns.ratePct,
        failureRate: metrics.failures.ratePct,
        complaintCount: metrics.feedback.complaints,
        topIssue: metrics.feedback.topIssue || 'None reported',
        avgKarma,
        unitsNow,
        unitsBefore,
      };
    });
  }, [products, orders, returns, deliveryFailures, feedback, windows, allOrders]);

  // Filtering
  const filtered = useMemo(() => {
    return computedProducts.filter((p) => {
      if (brandFilter !== 'ALL' && p.brandCode !== brandFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [computedProducts, brandFilter, search]);

  // Sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let valA: any = a[sortField] ?? -1;
      let valB: any = b[sortField] ?? -1;
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [filtered, sortField, sortAsc]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      {/* Title & Brand Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            Product Performance — All Brands
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-brand SKU level velocity, defect rates, and delivery success metrics
          </p>
        </div>

        {/* Brand Selector */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold self-start sm:self-auto overflow-x-auto max-w-full">
          {['ALL', ...db.getBrands().map((b: Brand) => b.code)].map((b) => {
            const brandObj = db.getBrands().find((item: Brand) => item.code === b);
            return (
              <button
                key={b}
                onClick={() => {
                  setBrandFilter(b);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                  brandFilter === b
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {b === 'ALL' ? 'All Brands' : brandObj?.name || b}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by product name, SKU, or category…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Showing {paginated.length} of {sorted.length} SKUs (Click row for Product 360)
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs" tabIndex={0}>
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold select-none">
              <th
                onClick={() => handleSort('name')}
                className="p-2.5 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
              >
                <div className="flex items-center gap-1">
                  <span>Product Name</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('brandCode')}
                className="p-2.5 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
              >
                <div className="flex items-center gap-1">
                  <span>Brand</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('category')}
                className="p-2.5 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
              >
                <div className="flex items-center gap-1">
                  <span>Category</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('totalOrders')}
                className="p-2.5 cursor-pointer hover:bg-slate-100 text-right whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Total Orders</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('unitsSold')}
                className="p-2.5 cursor-pointer hover:bg-slate-100 text-right whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Units Sold</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              {comparisonMode !== 'OFF' && (
                <th className="p-2.5 text-right whitespace-nowrap text-blue-700 bg-blue-50/60">
                  <span title="Units sold in the last 30 days, against the comparison window">Last 30 days</span>
                </th>
              )}
              <th
                onClick={() => handleSort('returnRate')}
                className="p-2.5 cursor-pointer hover:bg-slate-100 text-right whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Return Rate</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('failureRate')}
                className="p-2.5 cursor-pointer hover:bg-slate-100 text-right whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Failure Rate</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('complaintCount')}
                className="p-2.5 cursor-pointer hover:bg-slate-100 text-right whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Complaints</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="p-2.5 whitespace-nowrap">Top Issue</th>
              <th
                onClick={() => handleSort('avgKarma')}
                className="p-2.5 cursor-pointer hover:bg-slate-100 text-right whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Avg Karma</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {paginated.map((p) => {
              const isHighReturn = p.returnRate > 10;
              const isMediumReturn = p.returnRate > 5 && p.returnRate <= 10;

              return (
                <tr
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                >
                  <td className="p-2.5 font-bold text-slate-900 whitespace-nowrap">
                    {p.name}
                    <div className="text-[10px] text-slate-500 font-mono">{p.sku}</div>
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                      {p.brandCode}
                    </span>
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-slate-600">{p.category}</td>
                  <td className="p-2.5 text-right font-bold text-slate-900">{p.totalOrders}</td>
                  <td className="p-2.5 text-right font-bold text-blue-600">{p.unitsSold}</td>
                  {comparisonMode !== 'OFF' && (
                    <td className="p-2.5 text-right whitespace-nowrap bg-blue-50/30 font-semibold text-[11px]">
                      {(() => { const change = changeLabel(p.unitsNow, p.unitsBefore); return (
                        <span className={change.direction === 'up' ? 'text-emerald-700' : change.direction === 'down' ? 'text-rose-700' : 'text-slate-500'} title={`${p.unitsNow} units now, ${p.unitsBefore} before`}>
                          {p.unitsNow} <span className="font-normal">({change.text})</span>
                        </span>
                      ); })()}
                    </td>
                  )}
                  <td className="p-2.5 text-right whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                        isHighReturn
                          ? 'bg-rose-100 text-rose-800'
                          : isMediumReturn
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {p.returnRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="p-2.5 text-right whitespace-nowrap text-slate-600">
                    {p.failureRate.toFixed(1)}%
                  </td>
                  <td className="p-2.5 text-right font-bold text-slate-900">
                    {p.complaintCount}
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-slate-600 text-[11px]">
                    {p.topIssue}
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                    {p.avgKarma ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
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

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        orders={orders}
        returns={returns}
        feedback={feedback}
        calendarMode={calendarMode}
      />
    </div>
  );
}
