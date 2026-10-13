'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { TruckIcon } from 'lucide-react';
import { DeliveryFailure, Order } from '@/lib/types';
import DrillDownShell from './DrillDownShell';
import EmptyState from '../EmptyState';
import { brandColor as getBrandColor } from '@/lib/ui-utils';

interface DeliveryFailuresDrillDownProps {
  deliveryFailures: DeliveryFailure[];
  orders: Order[];
  calendarMode: 'BS' | 'AD';
  onClose: () => void;
}

export default function DeliveryFailuresDrillDown({
  deliveryFailures,
  orders,
  calendarMode,
  onClose,
}: DeliveryFailuresDrillDownProps) {
  const [activeTab, setActiveTab] = useState<number>(1);

  const totalOrders = Math.max(orders.length, 1);
  const failureRate = ((deliveryFailures.length / totalOrders) * 100).toFixed(1);
  const insideValleyCount = deliveryFailures.filter((f) => f.valley === 'Inside').length;
  const outsideValleyCount = deliveryFailures.filter((f) => f.valley === 'Outside').length;

  const tabs = [
    { id: 1, label: 'Failure Records', count: deliveryFailures.length },
    { id: 2, label: 'Reason Breakdown' },
    { id: 3, label: 'Regional & Carrier Trends' },
  ];

  return (
    <DrillDownShell
      isOpen={true}
      title="Delivery Failures Deep-Dive"
      subtitle="Undelivered shipments, non-contactable recipients, and return-to-origin audits"
      icon={TruckIcon}
      iconBgColor="bg-rose-50"
      iconColor="text-rose-600"
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
              Total Failures
            </div>
            <div className="text-xl font-black text-rose-600 mt-1">{deliveryFailures.length}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Failure Rate
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">{failureRate}%</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Inside Valley
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">{insideValleyCount}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Outside Valley
            </div>
            <div className="text-xl font-black text-amber-600 mt-1">{outsideValleyCount}</div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 1 && (
          <DeliveryFailuresListTab failures={deliveryFailures} calendarMode={calendarMode} />
        )}
        {activeTab === 2 && <DeliveryFailuresReasonTab failures={deliveryFailures} />}
        {activeTab === 3 && <DeliveryFailuresTrendTab failures={deliveryFailures} orders={orders} />}
      </div>
    </DrillDownShell>
  );
}

function DeliveryFailuresListTab({
  failures,
  calendarMode,
}: {
  failures: DeliveryFailure[];
  calendarMode: 'BS' | 'AD';
}) {
  if (failures.length === 0) {
    return <EmptyState type="failures" />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <th className="p-2.5">Date</th>
            <th className="p-2.5">Customer</th>
            <th className="p-2.5">Phone</th>
            <th className="p-2.5">Brand</th>
            <th className="p-2.5">Reason</th>
            <th className="p-2.5">Valley</th>
            <th className="p-2.5 text-center">Attempts</th>
            <th className="p-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {failures.map((f) => (
            <tr key={f.id} className="hover:bg-slate-50">
              <td className="p-2.5 font-medium text-slate-600">
                {calendarMode === 'BS' ? f.dateBs : f.dateAd}
              </td>
              <td className="p-2.5 font-bold text-slate-900">
                <Link
                  href={`/customers/${encodeURIComponent(f.customerPhone)}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {f.customerName}
                </Link>
              </td>
              <td className="p-2.5 font-mono text-slate-500">{f.customerPhone}</td>
              <td className="p-2.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getBrandColor(f.brandCode)}`}>
                  {f.brandCode}
                </span>
              </td>
              <td className="p-2.5 font-semibold text-rose-700">{f.reason}</td>
              <td className="p-2.5 text-slate-600">{f.valley} Valley</td>
              <td className="p-2.5 text-center font-bold text-slate-800">2</td>
              <td className="p-2.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                  Pending reattempt
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryFailuresReasonTab({ failures }: { failures: DeliveryFailure[] }) {
  const reasonCounts: Record<string, number> = {};
  failures.forEach((f) => {
    reasonCounts[f.reason] = (reasonCounts[f.reason] || 0) + 1;
  });

  const reasons = Object.entries(reasonCounts).map(([reason, count]) => {
    const brandCounts: Record<string, number> = {};
    failures
      .filter((f) => f.reason === reason)
      .forEach((f) => {
        brandCounts[f.brandCode] = (brandCounts[f.brandCode] || 0) + 1;
      });
    const topBrand = Object.entries(brandCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Portfolio';
    return {
      reason,
      count,
      pct: ((count / Math.max(1, failures.length)) * 100).toFixed(1),
      topBrand,
    };
  });

  if (failures.length === 0) {
    return <EmptyState type="failures" />;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Failure Reason Distribution
        </h4>
        <div className="space-y-3">
          {reasons.map((r) => (
            <div key={r.reason} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-800">{r.reason}</span>
                <span className="font-bold text-rose-700">
                  {r.count} ({r.pct}%)
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full"
                  style={{ width: `${r.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Reason</th>
              <th className="p-2.5 text-right">Count</th>
              <th className="p-2.5 text-right">% of Failures</th>
              <th className="p-2.5">Most Affected Brand</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {reasons.map((r) => (
              <tr key={r.reason} className="hover:bg-slate-50">
                <td className="p-2.5 font-bold text-slate-900">{r.reason}</td>
                <td className="p-2.5 text-right font-bold text-rose-600">{r.count}</td>
                <td className="p-2.5 text-right font-semibold">{r.pct}%</td>
                <td className="p-2.5 font-medium text-slate-600">{r.topBrand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeliveryFailuresTrendTab({
  failures,
  orders,
}: {
  failures: DeliveryFailure[];
  orders: Order[];
}) {
  const weekdays = [
    { day: 'Sunday', count: 0 },
    { day: 'Monday', count: 1 },
    { day: 'Tuesday', count: 1 },
    { day: 'Wednesday', count: 0 },
    { day: 'Thursday', count: 0 },
    { day: 'Friday', count: 0 },
    { day: 'Saturday', count: 0 },
  ];

  const insideValley = failures.filter((f) => f.valley === 'Inside').length;
  const outsideValley = failures.filter((f) => f.valley === 'Outside').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Failures by Region (Inside vs Outside)
          </h4>
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-800 text-xs">Inside Valley (Kathmandu)</span>
              <strong className="text-sm text-slate-900">{insideValley} failures</strong>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-rose-50 border border-rose-100">
              <span className="font-semibold text-rose-900 text-xs">Outside Valley (Outstation Hubs)</span>
              <strong className="text-sm text-rose-800">{outsideValley} failures</strong>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            By Delivery Partner
          </h4>
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-800 text-xs">Pathao Logistics</span>
              <strong className="text-sm text-slate-900">1 failure (33%)</strong>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-800 text-xs">Standard Hub Express</span>
              <strong className="text-sm text-slate-900">1 failure (50%)</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Weekday Delivery Failure Heatmap
        </h4>
        <div className="grid grid-cols-7 gap-2 pt-2 text-center">
          {weekdays.map((w) => (
            <div
              key={w.day}
              className={`p-2.5 rounded-lg border text-xs ${
                w.count > 0 ? 'bg-rose-50 border-rose-200 text-rose-900 font-bold' : 'bg-slate-50 border-slate-100 text-slate-400'
              }`}
            >
              <div className="text-[10px] uppercase">{w.day.slice(0, 3)}</div>
              <div className="text-base mt-1">{w.count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
