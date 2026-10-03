'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Compass, CheckCircle, AlertTriangle, Search } from 'lucide-react';
import { BeatItem, OfficerScorecard } from '@/lib/types';
import DrillDownShell from './DrillDownShell';

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
  const officers = [
    {
      id: 'user_officer_ravi',
      name: 'Ravi Sharma',
      area: 'Kathmandu Valley North & East',
      compliance: '4/6 stores (66.7%)',
      stores: [
        { name: 'Bhatbhateni Maharajgunj', status: 'VISITED', time: '9:42 AM – 10:15 AM', duration: '33 min' },
        { name: 'Bhatbhateni Koteshwor', status: 'VISITED', time: '10:45 AM – 11:20 AM', duration: '35 min' },
        { name: 'Nepal Mart Baneshwor', status: 'VISITED', time: '11:50 AM – 12:10 PM', duration: '20 min' },
        { name: 'Krishna Store Chabahil', status: 'VISITED', time: '1:30 PM – 1:55 PM', duration: '25 min' },
        { name: 'Norvic Pharmacy Thapathali', status: 'SKIPPED', skipReason: 'Other task assigned' },
        { name: 'Saleways Kalimati', status: 'SKIPPED', skipReason: 'No time' },
      ],
    },
    {
      id: 'user_officer_pooja',
      name: 'Pooja Karki',
      area: 'Lalitpur & Bhaktapur',
      compliance: '5/6 stores (83.3%)',
      stores: [
        { name: 'Bhatbhateni Pulchowk', status: 'VISITED', time: '9:30 AM – 10:05 AM', duration: '35 min' },
        { name: 'BigMart Jhamsikhel', status: 'VISITED', time: '10:20 AM – 10:50 AM', duration: '30 min' },
        { name: 'Saleways Jawalakhel', status: 'VISITED', time: '11:15 AM – 11:45 AM', duration: '30 min' },
        { name: 'Bhaktapur Mini Mart', status: 'VISITED', time: '1:10 PM – 1:40 PM', duration: '30 min' },
        { name: 'Radhe Radhe Department Store', status: 'VISITED', time: '2:15 PM – 2:40 PM', duration: '25 min' },
        { name: 'Suryabinayak Cosmetics', status: 'SKIPPED', skipReason: 'Store closed' },
      ],
    },
  ];

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

  const stores = [
    { name: 'Bhatbhateni Maharajgunj', branch: 'Maharajgunj', type: 'Supermarket', officer: 'Ravi Sharma', lastVisited: '2 days ago', daysAgo: 2, freq: '3x/week' },
    { name: 'Krishna General Store', branch: 'Maharajgunj', type: 'GT Store', officer: 'Ravi Sharma', lastVisited: '11 days ago', daysAgo: 11, freq: '1x/week' },
    { name: 'Bhatbhateni Pulchowk', branch: 'Pulchowk', type: 'Supermarket', officer: 'Pooja Karki', lastVisited: 'Today', daysAgo: 0, freq: '4x/week' },
    { name: 'Norvic Pharmacy', branch: 'Thapathali', type: 'Pharmacy', officer: 'Ravi Sharma', lastVisited: '15 days ago', daysAgo: 15, freq: '1x/fortnight' },
    { name: 'Saleways Kalimati', branch: 'Kalimati', type: 'Supermarket', officer: 'Suman Adhikari', lastVisited: '8 days ago', daysAgo: 8, freq: '2x/week' },
  ];

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
