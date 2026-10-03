'use client';

import React, { useState } from 'react';
import { MapPin, ChevronDown, ChevronUp, Globe } from 'lucide-react';
import { Order, ReturnEntry, DeliveryFailure, FeedbackEntry } from '@/lib/types';

interface RegionalPerformanceViewProps {
  orders: Order[];
  returns: ReturnEntry[];
  deliveryFailures: DeliveryFailure[];
  feedback: FeedbackEntry[];
}

const NEPAL_PROVINCES = [
  { name: 'Koshi Province (Province 1)', key: 'Koshi' },
  { name: 'Madhesh Province (Province 2)', key: 'Madhesh' },
  { name: 'Bagmati Province (Province 3)', key: 'Bagmati' },
  { name: 'Gandaki Province (Province 4)', key: 'Gandaki' },
  { name: 'Lumbini Province (Province 5)', key: 'Lumbini' },
  { name: 'Karnali Province (Province 6)', key: 'Karnali' },
  { name: 'Sudurpashchim Province (Province 7)', key: 'Sudurpashchim' },
];

export default function RegionalPerformanceView({
  orders,
  returns,
  deliveryFailures,
  feedback,
}: RegionalPerformanceViewProps) {
  const [isProvinceExpanded, setIsProvinceExpanded] = useState(false);

  // Inside vs Outside Valley
  const insideOrders = orders.filter((o) => o.province.includes('Bagmati'));
  const outsideOrders = orders.filter((o) => !o.province.includes('Bagmati'));

  const insideFailures = deliveryFailures.filter((f) => f.valley === 'Inside');
  const outsideFailures = deliveryFailures.filter((f) => f.valley === 'Outside');

  const insideReturns = returns.filter((r) => r.valley === 'Inside');
  const outsideReturns = returns.filter((r) => r.valley === 'Outside');

  const insideFailureRate =
    insideOrders.length > 0 ? ((insideFailures.length / insideOrders.length) * 100).toFixed(1) : '0.0';
  const outsideFailureRate =
    outsideOrders.length > 0 ? ((outsideFailures.length / outsideOrders.length) * 100).toFixed(1) : '0.0';

  const insideReturnRate =
    insideOrders.length > 0 ? ((insideReturns.length / insideOrders.length) * 100).toFixed(1) : '0.0';
  const outsideReturnRate =
    outsideOrders.length > 0 ? ((outsideReturns.length / outsideOrders.length) * 100).toFixed(1) : '0.0';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-600" />
          Regional Performance (Inside Valley vs Outside Valley)
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Geography-indexed order volume, logistics fulfillment, and return discrepancy analysis
        </p>
      </div>

      {/* Side-by-Side Comparison Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-3 w-1/3">Fulfillment Metric</th>
              <th className="p-3 w-1/3 text-center bg-blue-50/50 text-blue-950 font-bold">
                Inside Valley (Kathmandu Ring Road)
              </th>
              <th className="p-3 w-1/3 text-center bg-amber-50/50 text-amber-950 font-bold">
                Outside Valley (Outstation Hubs)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            <tr className="hover:bg-slate-50">
              <td className="p-3 font-semibold text-slate-800">Total Orders</td>
              <td className="p-3 text-center font-black text-slate-900 text-sm">
                {insideOrders.length}
              </td>
              <td className="p-3 text-center font-black text-slate-900 text-sm">
                {outsideOrders.length}
              </td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="p-3 font-semibold text-slate-800">Delivery Failure Rate</td>
              <td className="p-3 text-center">
                <span className="px-2 py-0.5 rounded font-bold text-slate-900 bg-slate-100">
                  {insideFailureRate}% ({insideFailures.length})
                </span>
              </td>
              <td className="p-3 text-center">
                <span className="px-2 py-0.5 rounded font-bold text-rose-800 bg-rose-100">
                  {outsideFailureRate}% ({outsideFailures.length})
                </span>
              </td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="p-3 font-semibold text-slate-800">Actual Return Rate</td>
              <td className="p-3 text-center">
                <span className="px-2 py-0.5 rounded font-bold text-slate-900 bg-slate-100">
                  {insideReturnRate}% ({insideReturns.length})
                </span>
              </td>
              <td className="p-3 text-center">
                <span className="px-2 py-0.5 rounded font-bold text-amber-800 bg-amber-100">
                  {outsideReturnRate}% ({outsideReturns.length})
                </span>
              </td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="p-3 font-semibold text-slate-800">Avg Delivery Time</td>
              <td className="p-3 text-center font-bold text-emerald-600">Same Day / 24 hrs</td>
              <td className="p-3 text-center font-bold text-slate-700">3 — 5 Days</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="p-3 font-semibold text-slate-800">Top Complaint</td>
              <td className="p-3 text-center text-slate-600">Wrong product shade</td>
              <td className="p-3 text-center text-rose-700 font-medium">
                Leaking in transit / packaging
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Expandable 7 Provinces Accordion */}
      <div className="pt-2">
        <button
          onClick={() => setIsProvinceExpanded(!isProvinceExpanded)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200 text-xs font-bold text-slate-800"
        >
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-600" />
            <span>Granular Breakdown: Nepal&apos;s 7 Provinces</span>
          </div>
          {isProvinceExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isProvinceExpanded && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs animate-in fade-in duration-200">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-2.5">Province</th>
                  <th className="p-2.5 text-right">Orders</th>
                  <th className="p-2.5 text-right">Failures</th>
                  <th className="p-2.5 text-right">Returns</th>
                  <th className="p-2.5">Avg Delivery Time</th>
                  <th className="p-2.5">Top Complaint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {NEPAL_PROVINCES.map((prov) => {
                  const pOrders = orders.filter((o) => o.province.includes(prov.key)).length;
                  const pFailures = deliveryFailures.filter((f) =>
                    orders.some((o) => o.orderNumber === f.orderNumber && o.province.includes(prov.key))
                  ).length;
                  const pReturns = returns.filter((r) =>
                    r.remarks?.includes(prov.key) || (prov.key === 'Gandaki' && r.valley === 'Outside')
                  ).length;

                  return (
                    <tr key={prov.key} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-900">{prov.name}</td>
                      <td className="p-2.5 text-right font-bold text-slate-900">{pOrders}</td>
                      <td className="p-2.5 text-right font-medium text-slate-600">{pFailures}</td>
                      <td className="p-2.5 text-right font-medium text-slate-600">{pReturns}</td>
                      <td className="p-2.5 text-slate-600">
                        {prov.key === 'Bagmati' ? '24 Hours' : '3 — 4 Days'}
                      </td>
                      <td className="p-2.5 text-slate-500">
                        {prov.key === 'Bagmati' ? 'Wrong Shade' : 'Transit leakage'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
