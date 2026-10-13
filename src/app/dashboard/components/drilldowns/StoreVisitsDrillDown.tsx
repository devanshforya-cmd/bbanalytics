'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Compass, CheckCircle, AlertTriangle, Search } from 'lucide-react';
import { BeatItem, OfficerScorecard } from '@/lib/types';
import DrillDownShell from './DrillDownShell';
import { db } from '@/lib/db';

interface StoreVisitsDrillDownProps {
  beatItems: BeatItem[];
  scorecards: OfficerScorecard[];
  onClose: () => void;
}

export default function StoreVisitsDrillDown({
  beatItems,
  scorecards,
  onClose,
}: StoreVisitsDrillDownProps) {
  const [activeTab, setActiveTab] = useState<number>(1);

  const visitedCount = beatItems.filter((b) => b.status === 'VISITED').length;
  const skippedCount = beatItems.filter((b) => b.status === 'SKIPPED').length;
  const scheduledCount = Math.max(beatItems.length, 1);
  const compliancePct = Math.round((visitedCount / scheduledCount) * 100);

  const tabs = [
    { id: 1, label: "Today's Field Coverage", count: visitedCount },
    { id: 2, label: 'Beat Compliance Trends' },
    { id: 3, label: 'Store Visit Recency & Risk' },
  ];

  return (
    <DrillDownShell
      isOpen={true}
      title="Store Visits & Beat Compliance"
      subtitle="Field coverage auditing, GPS route verification, skip justifications, and visit recency"
      icon={Compass}
      iconBgColor="bg-blue-50"
      iconColor="text-blue-600"
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
              Stores Visited
            </div>
            <div className="text-xl font-black text-emerald-600 mt-1">{visitedCount}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Beat Compliance
            </div>
            <div className="text-xl font-black text-blue-600 mt-1">{compliancePct}%</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Stores Skipped
            </div>
            <div className="text-xl font-black text-amber-600 mt-1">{skippedCount}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Scheduled Route
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">{scheduledCount}</div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 1 && <StoresVisitedTodayTab beatItems={beatItems} scorecards={scorecards} />}
        {activeTab === 2 && <StoresBeatComplianceTrendTab scorecards={scorecards} />}
        {activeTab === 3 && <StoresVisitHistoryTab beatItems={beatItems} />}
      </div>
    </DrillDownShell>
  );
}

function StoresVisitedTodayTab({
  beatItems,
  scorecards,
}: {
  beatItems: BeatItem[];
  scorecards: OfficerScorecard[];
}) {
  const allStaff = db.getUsers().filter((u) => u.role === 'SALES_OFFICER');
  const allBeats = db.getBeatItems();

  const officers = allStaff.map((off) => {
    const offBeats = allBeats.filter((b) => b.officerId === off.id);
    const visited = offBeats.filter((b) => b.status === 'VISITED');
    return {
      id: off.id,
      name: off.fullName,
      area: off.territory || 'Assigned Territory',
      compliance: offBeats.length > 0 ? `${visited.length}/${offBeats.length} stores (${Math.round((visited.length / offBeats.length) * 100)}%)` : '0 stores assigned',
      stores: offBeats.map((b) => ({
        name: b.storeName,
        status: b.status,
        skipReason: b.skipReason,
        time: (b as any).checkedInAt || (b as any).time || '',
        duration: '',
      })),
    };
  });

  if (officers.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
        No field officers or daily beat visits recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {officers.map((off) => (
        <div key={off.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2.5 gap-1">
            <div>
              <Link
                href={`/offline-sales/scorecard?officer=${encodeURIComponent(off.name)}`}
                className="text-sm font-bold text-slate-900 hover:text-blue-600 hover:underline"
              >
                {off.name}
              </Link>
              <p className="text-xs text-slate-500">{off.area}</p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200 self-start sm:self-auto">
              Beat Compliance: {off.compliance}
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {off.stores.map((s, idx) => (
              <div key={idx} className="py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {s.status === 'VISITED' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                  <Link
                    href={`/offline-sales/stores/${encodeURIComponent(s.name)}`}
                    className="font-semibold text-slate-800 hover:text-blue-600 hover:underline"
                  >
                    {s.name}
                  </Link>
                </div>

                {s.status === 'VISITED' ? (
                  <div className="text-slate-500 text-[11px] font-mono">
                    {s.time} • <strong className="text-slate-700">{s.duration}</strong>
                  </div>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                    SKIPPED — &ldquo;{s.skipReason}&rdquo;
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StoresBeatComplianceTrendTab({
  scorecards,
}: {
  scorecards: OfficerScorecard[];
}) {
  return (
    <div className="space-y-6">
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          2-Month Beat Compliance Trend per Officer
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {scorecards.map((sc) => (
            <div key={sc.officerId} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div className="text-xs font-bold text-slate-900">{sc.officerName}</div>
              <div className="text-xl font-black text-blue-600 mt-1">{sc.beatCompliancePct}%</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Avg Duration: {sc.avgVisitDurationMinutes} mins/store
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Officer</th>
              <th className="p-2.5 text-right">Total Skips (Month)</th>
              <th className="p-2.5 text-right">Other Task</th>
              <th className="p-2.5 text-right">Store Closed</th>
              <th className="p-2.5 text-right">Travel Issue</th>
              <th className="p-2.5 text-right">No Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {scorecards.map((sc) => (
              <tr key={sc.officerId} className="hover:bg-slate-50">
                <td className="p-2.5 font-bold text-slate-900">{sc.officerName}</td>
                <td className="p-2.5 text-right font-bold text-rose-600">{sc.storesSkipped}</td>
                <td className="p-2.5 text-right font-medium">
                  {sc.skipReasonsBreakdown?.['Other task assigned'] || 0}
                </td>
                <td className="p-2.5 text-right font-medium">
                  {sc.skipReasonsBreakdown?.['Store closed'] || 0}
                </td>
                <td className="p-2.5 text-right font-medium">
                  {sc.skipReasonsBreakdown?.['Travel issue'] || 0}
                </td>
                <td className="p-2.5 text-right font-medium">
                  {sc.skipReasonsBreakdown?.['No time'] || 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StoresVisitHistoryTab({ beatItems }: { beatItems: BeatItem[] }) {
  const [search, setSearch] = useState('');

  const allStoreEntities = db.getStoresUnified();
  const stores = allStoreEntities.map((s) => ({
    name: s.name,
    branch: s.area || s.city || 'Kathmandu',
    type: s.storeType || 'Store',
    officer: (s as any).assignedOfficerName || s.assignedOfficerId || 'Field Officer',
    lastVisited: (s as any).lastVisited || (s as any).lastVisitDate || 'Pending Visit',
    daysAgo: (s as any).daysSinceLastVisit || (s as any).lastVisitDaysAgo || 0,
    freq: (s as any).visitFrequency || 'Weekly',
  }));

  const filtered = stores.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.officer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Search stores or assigned officer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Store</th>
              <th className="p-2.5">Branch</th>
              <th className="p-2.5">Type</th>
              <th className="p-2.5">Assigned Officer</th>
              <th className="p-2.5">Last Visited</th>
              <th className="p-2.5 text-right">Days Since Visit</th>
              <th className="p-2.5 text-right">Visit Frequency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filtered.map((s) => {
              const isRed = s.daysAgo >= 14;
              const isAmber = s.daysAgo >= 7 && s.daysAgo < 14;
              return (
                <tr
                  key={s.name}
                  className={`hover:bg-slate-50 ${
                    isRed ? 'bg-rose-50/60 font-semibold' : isAmber ? 'bg-amber-50/50' : ''
                  }`}
                >
                  <td className="p-2.5 font-bold text-slate-900">
                    <Link
                      href={`/offline-sales/stores/${encodeURIComponent(s.name)}`}
                      className="hover:text-blue-600 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="p-2.5 text-slate-600">{s.branch}</td>
                  <td className="p-2.5 text-slate-600">{s.type}</td>
                  <td className="p-2.5 font-medium text-slate-700">
                    <Link
                      href={`/offline-sales/scorecard?officer=${encodeURIComponent(s.officer)}`}
                      className="hover:text-blue-600 hover:underline"
                    >
                      {s.officer}
                    </Link>
                  </td>
                  <td className="p-2.5 text-slate-600">{s.lastVisited}</td>
                  <td className="p-2.5 text-right">
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        isRed
                          ? 'bg-rose-200 text-rose-900'
                          : isAmber
                          ? 'bg-amber-200 text-amber-900'
                          : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {s.daysAgo} days
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-medium text-slate-600">{s.freq}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
