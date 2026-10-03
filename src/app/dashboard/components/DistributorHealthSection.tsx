'use client';

import React, { useState } from 'react';
import { Building2, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react';
import { Distributor, Branch, Retailer, Cheque } from '@/lib/types';
import { db } from '@/lib/db/db-service';
import DistributorDetailModal from './DistributorDetailModal';

interface DistributorHealthSectionProps {
  distributors: Distributor[];
  branches: Branch[];
  retailers: Retailer[];
  cheques: Cheque[];
}

export default function DistributorHealthSection({
  distributors,
  branches,
  retailers,
  cheques,
}: DistributorHealthSectionProps) {
  const [selectedDistributor, setSelectedDistributor] = useState<Distributor | null>(null);

  // Compute metrics for each distributor
  const distRows = distributors.map((d) => {
    const distBranches = branches.filter((b) => b.distributorId === d.id);
    const branchCount = distBranches.length;
    const health = db.getStoreHealthScore(d.id);

    // Estimated current stock
    const currentStock = branchCount > 0 ? branchCount * 140 : 450;
    const isStockLow = currentStock < 200;

    // Last dispatch
    const lastDispatchDate = '2026-09-02';
    const daysSinceDispatch = 6;

    // Branches visited this week
    const visitedCount = distBranches.filter((b) => (b.lastVisitDaysAgo || 0) <= 7).length;
    const noVisitAlert = branchCount > 0 && visitedCount === 0;

    // Pending cheques
    const distCheques = cheques.filter((c) =>
      distBranches.some((b) => b.id === c.entityId || b.name === c.storeName)
    );
    const pendingChequesCount = distCheques.filter(
      (c) => c.status === 'COLLECTED_IN_FIELD' || c.status === 'PENDING'
    ).length;
    const overdueChequesCount = distCheques.filter(
      (c) => c.status === 'DELAYED' || c.status === 'BOUNCED'
    ).length;

    // Pending documents
    const pendingDocumentsCount = d.id === 'dist_bb' ? 1 : 0;

    const hasAlert = isStockLow || noVisitAlert || overdueChequesCount > 0 || pendingDocumentsCount > 0;

    return {
      ...d,
      branchCount,
      currentStock,
      isStockLow,
      lastDispatchDate,
      daysSinceDispatch,
      visitedCount,
      noVisitAlert,
      pendingChequesCount,
      overdueChequesCount,
      pendingDocumentsCount,
      hasAlert,
      health,
    };
  });

  // Fix 45e: Sort by health score ascending (lowest scoring vendors at top for urgent attention)
  distRows.sort((a, b) => a.health.overall - b.health.overall);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-purple-600" />
            Distributor & Retailer Network (GT / MT Summary)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Wholesale channel health, store visit coverage, stock thresholds, and cheque collection alerts
          </p>
        </div>
        <span className="text-[11px] text-slate-400 font-medium">
          Click row for branch breakdown & document log
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Distributor / Account</th>
              <th className="p-2.5 text-center">Health Score</th>
              <th className="p-2.5 text-center">Branches</th>
              <th className="p-2.5">Brands Carried</th>
              <th className="p-2.5 text-right">Current Stock</th>
              <th className="p-2.5">Last Dispatch</th>
              <th className="p-2.5 text-right">Days Elapsed</th>
              <th className="p-2.5 text-center">Visited (This Wk)</th>
              <th className="p-2.5 text-center">Pending Cheques</th>
              <th className="p-2.5 text-center">Pending Docs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {distRows.map((d) => (
              <tr
                key={d.id}
                onClick={() => setSelectedDistributor(d)}
                className={`cursor-pointer transition-colors ${
                  d.hasAlert ? 'bg-rose-50/30 hover:bg-rose-50/60' : 'hover:bg-slate-50'
                }`}
              >
                <td className="p-2.5 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {d.hasAlert ? (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    <div>
                      <div className="font-bold text-slate-900">{d.name}</div>
                      <div className="text-[10px] text-slate-400">{d.city} • {d.type}</div>
                    </div>
                  </div>
                </td>

                <td className="p-2.5 text-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      d.health.overall >= 70
                        ? 'bg-emerald-100 text-emerald-800'
                        : d.health.overall >= 40
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {d.health.overall} / 100
                  </span>
                </td>

                <td className="p-2.5 text-center font-bold text-slate-800">
                  {d.branchCount > 0 ? d.branchCount : 'Direct'}
                </td>

                <td className="p-2.5">
                  <div className="flex flex-wrap gap-1">
                    {d.brandsCarried.map((b) => (
                      <span
                        key={b}
                        className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </td>

                <td className="p-2.5 text-right font-mono font-bold">
                  <span className={d.isStockLow ? 'text-rose-700 font-black' : 'text-slate-900'}>
                    {d.currentStock} units
                  </span>
                </td>

                <td className="p-2.5 whitespace-nowrap text-slate-600">
                  {d.lastDispatchDate}
                </td>

                <td className="p-2.5 text-right whitespace-nowrap font-medium text-slate-700">
                  {d.daysSinceDispatch} days ago
                </td>

                <td className="p-2.5 text-center">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      d.noVisitAlert
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {d.visitedCount} / {d.branchCount || 1}
                  </span>
                </td>

                <td className="p-2.5 text-center">
                  {d.pendingChequesCount > 0 ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                      {d.pendingChequesCount} active
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium">0</span>
                  )}
                </td>

                <td className="p-2.5 text-center">
                  {d.pendingDocumentsCount > 0 ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      {d.pendingDocumentsCount} pending
                    </span>
                  ) : (
                    <span className="text-emerald-600 font-bold text-[11px]">✓ Cleared</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Distributor Detail Modal */}
      <DistributorDetailModal
        distributor={selectedDistributor}
        onClose={() => setSelectedDistributor(null)}
        branches={branches}
        retailers={retailers}
        cheques={cheques}
      />
    </div>
  );
}
