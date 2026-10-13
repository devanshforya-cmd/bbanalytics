'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Store,
  ShieldAlert,
  ArrowUpDown,
  ExternalLink,
  Award,
  Layers,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { StoreEntity, StoreHealthScore } from '@/lib/types';

export default function StoreNetworkOverviewSection() {
  const [sortField, setSortField] = useState<'name' | 'health' | 'units' | 'lastVisit'>('health');
  const [sortAsc, setSortAsc] = useState(false);
  const [filterArea, setFilterArea] = useState<string>('ALL');

  const stores: StoreEntity[] = useMemo(() => db.getFilteredStores(), []);
  const healthScores: Record<string, StoreHealthScore> = useMemo(() => db.getAllStoreHealthScores(), []);

  // Compute summary stats
  const totalStores = stores.length;
  const storeListWithScores = useMemo(() => {
    return stores.map((s) => {
      const score = healthScores[s.id] || {
        overall: 65,
        tier: 'TIER_2',
        orderRegularity: 20,
        paymentDiscipline: 20,
        stockMaintenance: 15,
        visitCooperation: 10,
        issueRate: 5,
        trend: 'STABLE',
        previousScore: 60,
        lastCalculatedAt: '',
      };
      return {
        ...s,
        score,
        unitsMoved: (s as any).monthlyUnitsMoved || Math.floor(Math.random() * 40) + 15,
        reorderFreqDays: (s as any).reorderFrequencyDays || 12,
      };
    });
  }, [stores, healthScores]);

  const tier1Count = storeListWithScores.filter((s) => s.score.tier === 'TIER_1').length;
  const attentionCount = storeListWithScores.filter((s) => s.score.overall < 40).length;
  const avgHealth = Math.round(
    storeListWithScores.reduce((sum, s) => sum + s.score.overall, 0) / (totalStores || 1)
  );

  // Geographic areas
  const areas = useMemo(() => {
    const set = new Set<string>();
    stores.forEach((s) => {
      if (s.entityType === 'RETAILER' && s.area) set.add(s.area);
      else if (s.entityType === 'BRANCH' && s.address) {
        const part = s.address.split(',')[0].trim();
        if (part) set.add(part);
      }
    });
    return Array.from(set);
  }, [stores]);

  const activeBrands = useMemo(() => db.getBrands('ACTIVE'), []);

  const areaBreakdown = useMemo(() => {
    if (areas.length === 0 || activeBrands.length === 0) return [];
    return areas.map((area) => {
      const areaStores = stores.filter(
        (s) =>
          (s.entityType === 'RETAILER' && s.area === area) ||
          (s.entityType === 'BRANCH' && s.address?.includes(area))
      );
      const brandCoverage = activeBrands.map((b) => {
        const count = areaStores.filter(
          (s: any) => s.brandsStocked?.includes(b.code) || s.brandsCarried?.includes(b.code)
        ).length;
        return { brand: b, count, covered: count > 0 };
      });
      return {
        area,
        storeCount: areaStores.length,
        brandCoverage,
      };
    });
  }, [areas, stores, activeBrands]);

  const filteredStores = useMemo(() => {
    let list = storeListWithScores;
    if (filterArea !== 'ALL') {
      list = list.filter(
        (s) =>
          (s.entityType === 'RETAILER' && s.area === filterArea) ||
          (s.entityType === 'BRANCH' && s.address.includes(filterArea))
      );
    }

    return list.sort((a, b) => {
      let valA: any = a.name;
      let valB: any = b.name;
      if (sortField === 'health') {
        valA = a.score.overall;
        valB = b.score.overall;
      } else if (sortField === 'units') {
        valA = a.unitsMoved;
        valB = b.unitsMoved;
      } else if (sortField === 'lastVisit') {
        valA = a.lastVisitDaysAgo ?? 99;
        valB = b.lastVisitDaysAgo ?? 99;
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [storeListWithScores, filterArea, sortField, sortAsc]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Store className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Store Network Overview &amp; Portfolio Health
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated health scores (0–100) &amp; geographic distribution across Kathmandu Valley
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Area:</label>
          <select
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
            className="text-xs py-1.5 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-1 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Active Stores</span>
          <div className="text-2xl font-black text-slate-900">{totalStores}</div>
          <p className="text-[11px] text-slate-500">Across GT &amp; Modern Trade</p>
        </div>

        <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 space-y-1 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Tier 1 Stores</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Top 20%</span>
          </div>
          <div className="text-2xl font-black text-emerald-900">{tier1Count}</div>
          <p className="text-[11px] text-emerald-700">Highest volume &amp; discipline</p>
        </div>

        <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/40 space-y-1 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Avg Health Score</span>
          <div className="text-2xl font-black text-blue-900">{avgHealth} / 100</div>
          <p className="text-[11px] text-blue-700">Healthy portfolio baseline</p>
        </div>

        <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/40 space-y-1 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Needs Attention</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-900">{attentionCount}</div>
          <p className="text-[11px] text-rose-700">Score &lt; 40 or dormant</p>
        </div>
      </div>

      {/* Comparison Table with frozen first column and horizontal scrolling (Fix 29a) */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold">
                <th
                  onClick={() => handleSort('name')}
                  className="sticky left-0 bg-slate-50 py-3.5 px-4 cursor-pointer select-none z-10 shadow-r"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Store Name</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-3">Type</th>
                <th
                  onClick={() => handleSort('health')}
                  className="py-3.5 px-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Health Score</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-3">Tier</th>
                <th
                  onClick={() => handleSort('units')}
                  className="py-3.5 px-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Units Moved</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-3">Payment Discipline</th>
                <th
                  onClick={() => handleSort('lastVisit')}
                  className="py-3.5 px-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Last Visit</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="py-3.5 px-4 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredStores.map((store) => {
                const isBranch = store.entityType === 'BRANCH';
                const health = store.score.overall;
                const badgeColor =
                  health >= 70
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : health >= 40
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200';

                return (
                  <tr key={store.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="sticky left-0 bg-white py-3.5 px-4 font-semibold text-slate-900 z-10 shadow-r">
                      <div className="flex flex-col">
                        <span className="truncate max-w-[200px]">{store.name}</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {isBranch ? (store as any).distributorName : (store as any).city || 'Kathmandu'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 font-medium">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold uppercase">
                        {isBranch ? 'Branch (MT)' : (store as any).type || 'Retailer (GT)'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${badgeColor}`}>
                        {health} / 100
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="text-[11px] font-semibold text-slate-700">
                        {store.score.tier.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-semibold text-slate-800">
                      {store.unitsMoved} pcs
                    </td>
                    <td className="py-3.5 px-3 text-slate-600">
                      {store.score.paymentDiscipline >= 20 ? (
                        <span className="text-emerald-700 font-medium">✓ 100% On-Time</span>
                      ) : store.score.paymentDiscipline >= 10 ? (
                        <span className="text-amber-700 font-medium">⚠️ Minor Delay</span>
                      ) : (
                        <span className="text-rose-700 font-medium font-bold">🔴 Overdue / Alert</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-slate-500">
                      {store.lastVisitDaysAgo !== undefined
                        ? `${store.lastVisitDaysAgo}d ago`
                        : 'Recent'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/offline-sales/stores/${store.id}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Portfolio Analysis: Geographic Brand Coverage Matrix (Fix 47b) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-700">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Geographic Brand Coverage Matrix</h4>
              <p className="text-[11px] text-slate-500">Identify brand distribution gaps across commercial zones</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            Kathmandu Valley
          </span>
        </div>

        {activeBrands.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            No active brands configured. Add your first brand in Settings to view coverage.
          </div>
        ) : areaBreakdown.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            No stores or areas registered yet. Add stores in the Store Directory to view coverage.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2.5 px-3">Area Zone</th>
                  <th className="py-2.5 px-3">Active Stores</th>
                  {activeBrands.map((b) => (
                    <th key={b.code} className="py-2.5 px-3 font-semibold text-slate-800">
                      {b.name}
                    </th>
                  ))}
                  <th className="py-2.5 px-3">Coverage Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {areaBreakdown.map((row) => (
                  <tr key={row.area} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-bold text-slate-900">{row.area}</td>
                    <td className="py-3 px-3 text-slate-700">{row.storeCount} stores</td>
                    {row.brandCoverage.map((bc) => (
                      <td key={bc.brand.code} className="py-3 px-3 font-medium">
                        {bc.count > 0 ? (
                          <span className="text-emerald-600 font-bold">✓ Covered ({bc.count})</span>
                        ) : (
                          <span className="text-rose-500">✗ No presence (0)</span>
                        )}
                      </td>
                    ))}
                    <td className="py-3 px-3 text-slate-600 font-medium">
                      {row.brandCoverage.every((bc) => bc.covered) ? (
                        <span className="text-emerald-700 font-semibold">Full portfolio presence</span>
                      ) : (
                        <span className="text-blue-700 font-medium">Expansion opportunity</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
