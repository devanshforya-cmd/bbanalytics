'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MessageSquareWarning } from 'lucide-react';
import { FeedbackEntry, Order, Priority } from '@/lib/types';
import DrillDownShell from './DrillDownShell';
import EmptyState from '../EmptyState';
import { brandColor as getBrandColor, priorityColor as getPriorityColor } from '@/lib/ui-utils';

interface ComplaintsDrillDownProps {
  feedback: FeedbackEntry[];
  orders: Order[];
  calendarMode: 'BS' | 'AD';
  onClose: () => void;
}

export default function ComplaintsDrillDown({
  feedback,
  orders,
  calendarMode,
  onClose,
}: ComplaintsDrillDownProps) {
  const [activeTab, setActiveTab] = useState<number>(1);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const complaints = feedback.filter((f) => f.type === 'COMPLAINT');
  const unresolved = complaints.filter(
    (c) => c.complaintStatus !== 'RESOLVED' && c.complaintStatus !== 'CLOSED'
  ).length;
  const urgentCount = complaints.filter(
    (c) => c.priority === 'URGENT' || c.priority === 'HIGH'
  ).length;

  const tabs = [
    { id: 1, label: 'All Complaints', count: complaints.length },
    { id: 2, label: 'Categories Breakdown' },
    { id: 3, label: 'Resolution Metrics & Team SLA' },
  ];

  return (
    <DrillDownShell
      isOpen={true}
      title="Customer Complaints Management"
      subtitle="Escalations, unresolved tickets, quality feedbacks, and brand manager resolution SLAs"
      icon={MessageSquareWarning}
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
              Total Complaints
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">{complaints.length}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Unresolved Tickets
            </div>
            <div className="text-xl font-black text-rose-600 mt-1">{unresolved}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              High / Urgent
            </div>
            <div className="text-xl font-black text-amber-600 mt-1">{urgentCount}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Avg Resolution SLA
            </div>
            <div className="text-xl font-black text-emerald-600 mt-1">1.5 Days</div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 1 && (
          <ComplaintsListTab
            feedback={feedback}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            calendarMode={calendarMode}
          />
        )}
        {activeTab === 2 && (
          <ComplaintsCategoryTab
            feedback={feedback}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />
        )}
        {activeTab === 3 && (
          <ComplaintsResolutionMetricsTab feedback={feedback} orders={orders} />
        )}
      </div>
    </DrillDownShell>
  );
}

function ComplaintsListTab({
  feedback,
  statusFilter,
  setStatusFilter,
  calendarMode,
}: {
  feedback: FeedbackEntry[];
  statusFilter: 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  setStatusFilter: (s: 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED') => void;
  calendarMode: 'BS' | 'AD';
}) {
  const complaints = feedback.filter((f) => f.type === 'COMPLAINT');

  const filtered = complaints
    .filter((c) => {
      if (statusFilter === 'ALL') return true;
      return c.complaintStatus === statusFilter;
    })
    .sort((a, b) => {
      const aResolved = a.complaintStatus === 'RESOLVED' || a.complaintStatus === 'CLOSED' ? 1 : 0;
      const bResolved = b.complaintStatus === 'RESOLVED' || b.complaintStatus === 'CLOSED' ? 1 : 0;
      return aResolved - bResolved;
    });

  if (complaints.length === 0) {
    return <EmptyState type="complaints" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-slate-500 font-medium mr-1">Filter by Status:</span>
        {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded-lg font-bold border transition-colors ${
              statusFilter === s
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Date</th>
              <th className="p-2.5">Customer</th>
              <th className="p-2.5">Brand</th>
              <th className="p-2.5">Product</th>
              <th className="p-2.5">Priority</th>
              <th className="p-2.5">Category Chips</th>
              <th className="p-2.5">Assigned To</th>
              <th className="p-2.5">Status</th>
              <th className="p-2.5 text-center">Days Open</th>
              <th className="p-2.5 text-center">Proof</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filtered.map((c) => {
              const isUnresolved = c.complaintStatus !== 'RESOLVED' && c.complaintStatus !== 'CLOSED';
              const priorityClass = getPriorityColor(c.priority || 'MEDIUM');
              return (
                <tr
                  key={c.id}
                  className={`hover:bg-slate-50 ${isUnresolved ? 'bg-amber-50/30' : ''}`}
                >
                  <td className="p-2.5 font-medium text-slate-600 whitespace-nowrap">
                    {calendarMode === 'BS' ? c.dateReceivedBs : c.dateReceivedAd}
                  </td>
                  <td className="p-2.5 whitespace-nowrap font-bold text-slate-900">
                    <Link
                      href={`/customers/${encodeURIComponent(c.customerPhone)}`}
                      className="hover:text-blue-600 hover:underline"
                    >
                      {c.customerName}
                    </Link>
                    <div className="text-[10px] text-slate-400 font-mono">{c.customerPhone}</div>
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getBrandColor(c.brandCode)}`}>
                      {c.brandCode}
                    </span>
                  </td>
                  <td className="p-2.5 font-medium text-slate-800">
                    <Link
                      href={`/products/${encodeURIComponent(c.productName)}`}
                      className="hover:text-blue-600 hover:underline"
                    >
                      {c.productName}
                    </Link>
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${priorityClass}`}>
                      {c.priority || 'MEDIUM'}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <div className="flex flex-wrap gap-1">
                      {c.issueCategories.map((cat) => (
                        <span
                          key={cat}
                          className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-700"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2.5 whitespace-nowrap font-medium text-slate-600">
                    {c.assignedToName || 'Unassigned'}
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.complaintStatus === 'RESOLVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.complaintStatus === 'IN_PROGRESS'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {c.complaintStatus || 'OPEN'}
                    </span>
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-center font-bold text-slate-900">
                    2
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-center">
                    {c.hasScreenshot ? (
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 font-bold rounded text-[10px]">
                        Yes
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">No</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComplaintsCategoryTab({
  feedback,
  selectedCategory,
  onSelectCategory,
}: {
  feedback: FeedbackEntry[];
  selectedCategory: string | null;
  onSelectCategory: (cat: string | null) => void;
}) {
  const complaints = feedback.filter((f) => f.type === 'COMPLAINT');
  const catCount: Record<string, number> = {};

  complaints.forEach((c) => {
    c.issueCategories.forEach((cat) => {
      catCount[cat] = (catCount[cat] || 0) + 1;
    });
  });

  const categories = Object.entries(catCount).map(([name, count]) => ({
    name,
    count,
  }));

  return (
    <div className="space-y-6">
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Complaints by Dynamic Issue Category
        </h4>
        <div className="space-y-2.5">
          {categories.map((c) => (
            <div key={c.name} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-800">{c.name}</span>
                <span className="font-bold text-rose-600">{c.count} complaints</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full"
                  style={{ width: `${Math.min(100, c.count * 40)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ComplaintsResolutionMetricsTab({
  feedback,
  orders,
}: {
  feedback: FeedbackEntry[];
  orders: Order[];
}) {
  const complaints = feedback.filter((f) => f.type === 'COMPLAINT');
  const resolved = complaints.filter((c) => c.complaintStatus === 'RESOLVED').length;
  const resolutionRate = complaints.length > 0 ? ((resolved / complaints.length) * 100).toFixed(0) : '100';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-slate-500">Avg Resolution Time</div>
          <div className="text-2xl font-black text-slate-900 mt-1">1.5 days</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Target &lt; 2.0 days</div>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-slate-500">Resolution Rate</div>
          <div className="text-2xl font-black text-blue-600 mt-1">{resolutionRate}%</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{resolved} of {complaints.length} closed</div>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-slate-500">Complaints per Order</div>
          <div className="text-2xl font-black text-rose-600 mt-1">
            {orders.length > 0 ? ((complaints.length / orders.length) * 100).toFixed(1) : 0}%
          </div>
          <div className="text-[10px] text-rose-700 mt-0.5">Industry benchmark &lt; 3%</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Assignee</th>
              <th className="p-2.5 text-right">Assigned</th>
              <th className="p-2.5 text-right">Resolved</th>
              <th className="p-2.5 text-right">Open</th>
              <th className="p-2.5 text-right">Avg Response Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            <tr className="hover:bg-slate-50">
              <td className="p-2.5 font-bold text-slate-900">Brand Operations Team</td>
              <td className="p-2.5 text-right font-semibold">2</td>
              <td className="p-2.5 text-right font-semibold text-emerald-600">1</td>
              <td className="p-2.5 text-right font-bold text-rose-600">1</td>
              <td className="p-2.5 text-right text-slate-600">1.2 days</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
