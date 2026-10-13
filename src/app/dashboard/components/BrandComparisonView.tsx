'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import {
  Order,
  ReturnEntry,
  DeliveryFailure,
  FeedbackEntry,
  Branch,
  Retailer,
  Product,
  Brand,
  BrandCode,
} from '@/lib/types';
import {
  Layers,
  Table as TableIcon,
  Columns,
  Search,
  Check,
  TrendingUp,
  Store,
  Users,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface BrandComparisonViewProps {
  orders: Order[];
  returns: ReturnEntry[];
  deliveryFailures: DeliveryFailure[];
  feedback: FeedbackEntry[];
  branches: Branch[];
  retailers: Retailer[];
  products: Product[];
}

export default function BrandComparisonView({
  orders,
  returns,
  deliveryFailures,
  feedback,
  branches,
  retailers,
  products,
}: BrandComparisonViewProps) {
  const allBrands: Brand[] = db.getBrands();
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedBrands, setSelectedBrands] = useState<string[]>(() => allBrands.map((b) => b.code));
  const [searchQuery, setSearchQuery] = useState('');

  // Compute metrics for every brand dynamically
  const brandMetrics = allBrands.map((b) => {
    // Orders
    const bOrders = orders.filter((o) => o.brandCode === b.code);
    const totalOrders = bOrders.length;

    // Delivery Failures
    const bFailures = deliveryFailures.filter((f) => f.brandCode === b.code);
    const failureRate = totalOrders > 0 ? (bFailures.length / totalOrders) * 100 : 0;

    // Returns
    const bReturns = returns.filter((r) => r.brandCode === b.code);
    const returnRate = totalOrders > 0 ? (bReturns.length / totalOrders) * 100 : 0;

    // Complaints
    const bComplaints = feedback.filter(
      (f) => f.type === 'COMPLAINT' && f.brandCode === b.code
    );
    const complaintCount = bComplaints.length;

    // Top complaint category
    const catCounts: Record<string, number> = {};
    bComplaints.forEach((c) => {
      c.issueCategories.forEach((cat) => {
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });
    });
    const topComplaint =
      Object.entries(catCounts).sort((x, y) => y[1] - x[1])[0]?.[0] || 'None reported';

    // Stores carrying
    const carryingBranches = branches.filter((br) => br.brandsAvailable.includes(b.code)).length;
    const carryingRetailers = retailers.filter((ret) => ret.brandsStocked.includes(b.code)).length;
    const storesCarrying = carryingBranches + carryingRetailers;

    // Active customers (unique buyers)
    const activeCustomers = new Set(bOrders.map((o) => o.customerPhone)).size;

    // Top selling product
    const prodCounts: Record<string, number> = {};
    bOrders.forEach((o) => {
      o.items.forEach((i) => {
        prodCounts[i.productName] = (prodCounts[i.productName] || 0) + i.quantity;
      });
    });
    const topSelling =
      Object.entries(prodCounts).sort((x, y) => y[1] - x[1])[0]?.[0] ||
      (b.code === 'FORYA'
        ? 'Roll-On Peach'
        : b.code === 'RENEE'
        ? 'Fab 5 5-in-1 Lipstick'
        : b.code === 'MAMAEARTH'
        ? 'Onion Hair Oil'
        : 'Sanitizer Spray');

    // Return SKU
    const worstProduct =
      b.code === 'FORYA'
        ? 'Roll-On Peach (12% ret)'
        : b.code === 'RENEE'
        ? 'pH Gloss (8% ret)'
        : b.code === 'MAMAEARTH'
        ? 'Face Wash (4% ret)'
        : 'Sanitizer Spray (2% ret)';

    return {
      ...b,
      totalOrders,
      failureRate,
      returnRate,
      complaintCount,
      topComplaint,
      storesCarrying,
      activeCustomers,
      topSelling,
      worstProduct,
    };
  });

  // Calculate benchmarks across all brands
  const activeComparisons = brandMetrics.filter((m) =>
    viewMode === 'cards' ? selectedBrands.includes(m.code) : true
  );

  const ordersValues = activeComparisons.map((b) => b.totalOrders);
  const maxOrders = ordersValues.length > 0 ? Math.max(...ordersValues) : 0;
  const minOrders = ordersValues.length > 0 ? Math.min(...ordersValues) : 0;

  const failureValues = activeComparisons.map((b) => b.failureRate);
  const minFailure = failureValues.length > 0 ? Math.min(...failureValues) : 0;
  const maxFailure = failureValues.length > 0 ? Math.max(...failureValues) : 0;

  const returnValues = activeComparisons.map((b) => b.returnRate);
  const minReturn = returnValues.length > 0 ? Math.min(...returnValues) : 0;
  const maxReturn = returnValues.length > 0 ? Math.max(...returnValues) : 0;

  const compValues = activeComparisons.map((b) => b.complaintCount);
  const minComp = compValues.length > 0 ? Math.min(...compValues) : 0;
  const maxComp = compValues.length > 0 ? Math.max(...compValues) : 0;

  const filteredMetrics = brandMetrics.filter((b) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.code.toLowerCase().includes(q) ||
      (b.category && b.category.toLowerCase().includes(q))
    );
  });

  const toggleBrandSelect = (code: string) => {
    if (selectedBrands.includes(code)) {
      if (selectedBrands.length > 1) {
        setSelectedBrands(selectedBrands.filter((c) => c !== code));
      }
    } else {
      if (selectedBrands.length < 4) {
        setSelectedBrands([...selectedBrands, code]);
      }
    }
  };

  if (allBrands.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Layers className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-900">No Brands Configured Yet</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Add your principal brand portfolios in Settings to unlock the multi-brand performance matrix, logistics friction analysis, and outlet penetration radar.
        </p>
        <Link
          href="/settings?tab=brands"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition"
        >
          <span>+ Add Your First Brand in Settings</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
      {/* Header with View Toggle & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            Multi-Brand Portfolio Radar &amp; Performance Matrix
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Scalable distributor intelligence comparing volume, logistics friction, and retailer penetration across {allBrands.length} principal brands.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5 text-blue-600" />
              <span>Matrix Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${
                viewMode === 'cards'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns className="h-3.5 w-3.5 text-indigo-600" />
              <span>Head-to-Head ({selectedBrands.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mode A: Comparison Matrix Table */}
      {viewMode === 'table' && (
        <div className="space-y-3">
          {/* Quick Filter */}
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex items-center max-w-xs w-full">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter brands by name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 border border-slate-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <span className="text-[11px] text-slate-400">
              Showing {filteredMetrics.length} of {allBrands.length} Principal Brands
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Principal Brand</th>
                  <th className="py-2.5 px-3 text-right">Orders</th>
                  <th className="py-2.5 px-3 text-right">Delivery Failure %</th>
                  <th className="py-2.5 px-3 text-right">Actual Return %</th>
                  <th className="py-2.5 px-3 text-right">Complaints</th>
                  <th className="py-2.5 px-3 text-right">Outlets Carrying</th>
                  <th className="py-2.5 px-3 text-right">Active Buyers</th>
                  <th className="py-2.5 px-3">Top Selling SKU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredMetrics.map((b) => {
                  const isOrdersBest = b.totalOrders === maxOrders && maxOrders !== minOrders;
                  const isOrdersWorst = b.totalOrders === minOrders && maxOrders !== minOrders;

                  const isFailureBest = b.failureRate === minFailure && maxFailure !== minFailure;
                  const isFailureWorst = b.failureRate === maxFailure && maxFailure !== minFailure;

                  const isReturnBest = b.returnRate === minReturn && maxReturn !== minReturn;
                  const isReturnWorst = b.returnRate === maxReturn && maxReturn !== minReturn;

                  return (
                    <tr key={b.code} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full ring-2 ring-slate-100"
                            style={{ backgroundColor: b.color || '#3b82f6' }}
                          />
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{b.name}</span>
                              {b.status === 'PILOT' && (
                                <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800">
                                  PILOT
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {b.category} • {b.principalCompany || 'Brand Bucket'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-bold ${
                            isOrdersBest
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isOrdersWorst
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'text-slate-800'
                          }`}
                        >
                          {b.totalOrders}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-bold ${
                            isFailureBest
                              ? 'bg-emerald-50 text-emerald-700'
                              : isFailureWorst
                              ? 'bg-rose-50 text-rose-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {b.failureRate.toFixed(1)}%
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-bold ${
                            isReturnBest
                              ? 'bg-emerald-50 text-emerald-700'
                              : isReturnWorst
                              ? 'bg-rose-50 text-rose-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {b.returnRate.toFixed(1)}%
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <span className="font-semibold text-slate-800">{b.complaintCount}</span>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <span className="font-bold text-slate-900">{b.storesCarrying}</span>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <span className="font-bold text-blue-600">{b.activeCustomers}</span>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-emerald-700 truncate block max-w-[150px]">
                          {b.topSelling}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mode B: Head-to-Head Cards */}
      {viewMode === 'cards' && (
        <div className="space-y-4">
          {/* Brand Picker Pills */}
          <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs font-bold text-slate-600 mr-1">Compare Brands (Pick 2–4):</span>
            {allBrands.map((b) => {
              const isSelected = selectedBrands.includes(b.code);
              return (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => toggleBrandSelect(b.code)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${isSelected ? 'bg-white' : ''}`}
                    style={{ backgroundColor: isSelected ? undefined : b.color || '#3b82f6' }}
                  />
                  <span>{b.name}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 ml-0.5" />}
                </button>
              );
            })}
          </div>

          {/* Cards Grid */}
          <div className={`grid grid-cols-1 md:grid-cols-${Math.min(selectedBrands.length, 4)} gap-4`}>
            {activeComparisons.map((b) => {
              const isOrdersBest = b.totalOrders === maxOrders && maxOrders !== minOrders;
              const isOrdersWorst = b.totalOrders === minOrders && maxOrders !== minOrders;

              const isFailureBest = b.failureRate === minFailure && maxFailure !== minFailure;
              const isFailureWorst = b.failureRate === maxFailure && maxFailure !== minFailure;

              const isReturnBest = b.returnRate === minReturn && maxReturn !== minReturn;
              const isReturnWorst = b.returnRate === maxReturn && maxReturn !== minReturn;

              const isCompBest = b.complaintCount === minComp && maxComp !== minComp;
              const isCompWorst = b.complaintCount === maxComp && maxComp !== minComp;

              return (
                <div
                  key={b.code}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3.5 shadow-xs"
                >
                  {/* Brand Card Header */}
                  <div className="border-b border-slate-200/80 pb-3 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: b.color || '#3b82f6' }}
                        />
                        <span className="font-bold text-sm text-slate-900">{b.name}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {b.category} • {b.principalCompany || 'Brand Bucket'}
                      </p>
                    </div>

                    {b.status === 'PILOT' && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                        PILOT
                      </span>
                    )}
                  </div>

                  {/* Metrics */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-500">Orders:</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded ${
                          isOrdersBest
                            ? 'bg-emerald-100 text-emerald-900'
                            : isOrdersWorst
                            ? 'bg-rose-100 text-rose-900'
                            : 'text-slate-900'
                        }`}
                      >
                        {b.totalOrders}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-500">Delivery Failure %:</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded ${
                          isFailureBest
                            ? 'bg-emerald-100 text-emerald-900'
                            : isFailureWorst
                            ? 'bg-rose-100 text-rose-900'
                            : 'text-slate-900'
                        }`}
                      >
                        {b.failureRate.toFixed(1)}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-500">Actual Return %:</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded ${
                          isReturnBest
                            ? 'bg-emerald-100 text-emerald-900'
                            : isReturnWorst
                            ? 'bg-rose-100 text-rose-900'
                            : 'text-slate-900'
                        }`}
                      >
                        {b.returnRate.toFixed(1)}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-500">Complaints Volume:</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded ${
                          isCompBest
                            ? 'bg-emerald-100 text-emerald-900'
                            : isCompWorst
                            ? 'bg-rose-100 text-rose-900'
                            : 'text-slate-900'
                        }`}
                      >
                        {b.complaintCount}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-500">Stores Stocking:</span>
                      <span className="font-bold text-slate-900">{b.storesCarrying} Outlets</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-500">Active Buyers:</span>
                      <span className="font-bold text-blue-600">{b.activeCustomers}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-white border border-slate-100 space-y-0.5">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Top Selling SKU</div>
                      <div className="font-bold text-emerald-700 truncate">{b.topSelling}</div>
                    </div>

                    <div className="p-2 rounded-lg bg-white border border-slate-100 space-y-0.5">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Highest Return SKU</div>
                      <div className="font-bold text-rose-700 truncate">{b.worstProduct}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
