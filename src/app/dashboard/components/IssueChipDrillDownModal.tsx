'use client';

import React from 'react';
import { X, AlertCircle, TrendingUp, Package, User } from 'lucide-react';
import { FeedbackEntry, ReturnEntry } from '@/lib/types';
import EmptyState from './EmptyState';

interface IssueChipDrillDownModalProps {
  categoryName: string | null;
  onClose: () => void;
  feedback: FeedbackEntry[];
  returns: ReturnEntry[];
  calendarMode: 'BS' | 'AD';
}

export default function IssueChipDrillDownModal({
  categoryName,
  onClose,
  feedback,
  returns,
  calendarMode,
}: IssueChipDrillDownModalProps) {
  if (!categoryName) return null;

  // Find all complaints and returns where this issue is present
  const matchingFeedback = feedback.filter((f) =>
    f.issueCategories.includes(categoryName)
  );

  const matchingReturns = returns.filter((r) =>
    r.issueCategories.includes(categoryName)
  );

  const combinedEntries = [
    ...matchingFeedback.map((f) => ({
      id: f.id,
      dateBs: f.dateReceivedBs,
      dateAd: f.dateReceivedAd,
      customer: f.customerName,
      phone: f.customerPhone,
      brand: f.brandCode,
      product: f.productName,
      type: f.type === 'COMPLAINT' ? 'Complaint' : 'Feedback',
      status: f.complaintStatus || 'OPEN',
      assignedTo: f.assignedToName || 'Aayush Shrestha',
      notes: f.fullText,
    })),
    ...matchingReturns.map((r) => ({
      id: r.id,
      dateBs: r.dateBs,
      dateAd: r.dateAd,
      customer: r.customerName,
      phone: r.customerPhone,
      brand: r.brandCode,
      product: r.productName,
      type: 'Actual Return',
      status: r.orderStatus,
      assignedTo: 'Logistics Team',
      notes: r.remarks || r.reasonCategory,
    })),
  ];

  // Product breakdown
  const productCounts: Record<string, { name: string; brand: string; count: number }> = {};
  combinedEntries.forEach((e) => {
    if (!productCounts[e.product]) {
      productCounts[e.product] = { name: e.product, brand: e.brand, count: 0 };
    }
    productCounts[e.product].count += 1;
  });

  const productsList = Object.values(productCounts).sort((a, b) => b.count - a.count);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 w-full md:w-[65vw] max-w-4xl bg-white shadow-2xl flex flex-col border-l border-slate-200 z-50">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-200">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Issue Drill-Down: {categoryName}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                  {combinedEntries.length} logged
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Complaints & actual product returns tagged with this dynamic checkbox
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/40">
          {/* Top 3-Month Trend & Product Share */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 3-Month Trend */}
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                3-Month Incidence Trend
              </h4>
              <p className="text-[11px] text-slate-500">
                Monthly volume of reports tagged with &ldquo;{categoryName}&rdquo;
              </p>
              <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-500">Ashadh 2083</div>
                  <div className="text-base font-bold text-slate-700 mt-1">4</div>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-500">Shrawan 2083</div>
                  <div className="text-base font-bold text-slate-700 mt-1">6</div>
                </div>
                <div className="p-2 bg-rose-50 rounded-lg border border-rose-100">
                  <div className="text-[10px] text-rose-700 font-semibold">Bhadra (Current)</div>
                  <div className="text-base font-black text-rose-700 mt-1">
                    {combinedEntries.length}
                  </div>
                </div>
              </div>
            </div>

            {/* Most Affected Products */}
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-purple-600" />
                Most Affected SKUs
              </h4>
              <div className="space-y-2 pt-1">
                {productsList.slice(0, 3).map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 truncate max-w-[220px]">
                      {p.name}
                    </span>
                    <span className="font-bold text-rose-600 px-2 py-0.5 rounded bg-rose-50 border border-rose-100">
                      {p.count} reports
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Table of Entries */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              All Logged Incidents
            </h4>

            {combinedEntries.length === 0 ? (
              <EmptyState type="generic" customMessage={`No complaints or returns have been tagged with "${categoryName}".`} />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="p-2.5 whitespace-nowrap">Date</th>
                      <th className="p-2.5 whitespace-nowrap">Customer</th>
                      <th className="p-2.5 whitespace-nowrap">Brand</th>
                      <th className="p-2.5 whitespace-nowrap">Product</th>
                      <th className="p-2.5 whitespace-nowrap">Entry Type</th>
                      <th className="p-2.5 whitespace-nowrap">Status</th>
                      <th className="p-2.5 whitespace-nowrap">Assigned To</th>
                      <th className="p-2.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {combinedEntries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="p-2.5 whitespace-nowrap font-medium text-slate-600">
                          {calendarMode === 'BS' ? e.dateBs : e.dateAd}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className="font-bold text-slate-900">{e.customer}</span>
                          <div className="text-[10px] text-slate-400 font-mono">{e.phone}</div>
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                            {e.brand}
                          </span>
                        </td>
                        <td className="p-2.5 font-medium text-slate-800">{e.product}</td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              e.type === 'Actual Return'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {e.type}
                          </span>
                        </td>
                        <td className="p-2.5 whitespace-nowrap font-semibold">
                          {e.status}
                        </td>
                        <td className="p-2.5 whitespace-nowrap text-slate-600">
                          {e.assignedTo}
                        </td>
                        <td className="p-2.5 max-w-xs text-slate-500 truncate" title={e.notes}>
                          {e.notes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
