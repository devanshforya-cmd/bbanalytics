'use client';

import React, { useState } from 'react';
import { TrendingUp, Calendar, AlertTriangle, Users, BarChart3 } from 'lucide-react';
import { db } from '@/lib/db';

interface ThirtyDayTrendChartsProps {
  comparisonMode?: 'OFF' | 'LAST_MONTH' | 'SAME_MONTH_LAST_YEAR' | 'CUSTOM';
}

export default function ThirtyDayTrendCharts({ comparisonMode = 'OFF' }: ThirtyDayTrendChartsProps) {
  const [hoveredOrderDay, setHoveredOrderDay] = useState<{ day: number; count: number; date: string } | null>(null);

  const scorecards = db.getScorecards();
  const off1 = scorecards[0]?.officerName || 'Officer 1';
  const off2 = scorecards[1]?.officerName || 'Officer 2';
  const off3 = scorecards[2]?.officerName || 'Officer 3';
  const rate1 = scorecards[0]?.beatCompliancePct || 87.5;
  const rate2 = scorecards[1]?.beatCompliancePct || 93.9;
  const rate3 = scorecards[2]?.beatCompliancePct || 75.8;

  // 1. Orders per day (30 days data)
  const ordersPerDay = [
    { day: 1, count: 2, date: 'Aug 10' },
    { day: 2, count: 1, date: 'Aug 11' },
    { day: 3, count: 3, date: 'Aug 12' },
    { day: 4, count: 2, date: 'Aug 13' },
    { day: 5, count: 4, date: 'Aug 14' },
    { day: 6, count: 1, date: 'Aug 15' },
    { day: 7, count: 3, date: 'Aug 16' },
    { day: 8, count: 5, date: 'Aug 17' },
    { day: 9, count: 2, date: 'Aug 18' },
    { day: 10, count: 4, date: 'Aug 19' },
    { day: 11, count: 6, date: 'Aug 20' },
    { day: 12, count: 3, date: 'Aug 21' },
    { day: 13, count: 4, date: 'Aug 22' },
    { day: 14, count: 5, date: 'Aug 23' },
    { day: 15, count: 3, date: 'Aug 24' },
    { day: 16, count: 4, date: 'Aug 25' },
    { day: 17, count: 7, date: 'Aug 26' },
    { day: 18, count: 5, date: 'Aug 27' },
    { day: 19, count: 6, date: 'Aug 28' },
    { day: 20, count: 4, date: 'Aug 29' },
    { day: 21, count: 5, date: 'Aug 30' },
    { day: 22, count: 6, date: 'Aug 31' },
    { day: 23, count: 4, date: 'Sep 01' },
    { day: 24, count: 5, date: 'Sep 02' },
    { day: 25, count: 7, date: 'Sep 03' },
    { day: 26, count: 6, date: 'Sep 04' },
    { day: 27, count: 5, date: 'Sep 05' },
    { day: 28, count: 6, date: 'Sep 06' },
    { day: 29, count: 4, date: 'Sep 07' },
    { day: 30, count: 3, date: 'Sep 08' },
  ];

  // 2. Delivery failure rate per week (last 8 weeks)
  const failureRatePerWeek = [
    { week: 'W1 (Jul)', rate: 18.5 },
    { week: 'W2 (Jul)', rate: 15.2 },
    { week: 'W3 (Jul)', rate: 16.0 },
    { week: 'W4 (Jul)', rate: 14.1 },
    { week: 'W5 (Aug)', rate: 12.8 },
    { week: 'W6 (Aug)', rate: 11.5 },
    { week: 'W7 (Aug)', rate: 9.2 },
    { week: 'W8 (Sep)', rate: 7.4 },
  ];

  // 3. Complaint volume per week (last 8 weeks)
  const complaintVolumePerWeek = [
    { week: 'W1', count: 6 },
    { week: 'W2', count: 5 },
    { week: 'W3', count: 7 },
    { week: 'W4', count: 4 },
    { week: 'W5', count: 5 },
    { week: 'W6', count: 3 },
    { week: 'W7', count: 2 },
    { week: 'W8', count: 1 },
  ];

  // 4. Beat compliance per week per officer
  const officersCompliance = [
    { week: 'W1', ravi: 80, pooja: 85, suman: 70 },
    { week: 'W2', ravi: 82, pooja: 88, suman: 72 },
    { week: 'W3', ravi: 85, pooja: 90, suman: 74 },
    { week: 'W4', ravi: 84, pooja: 89, suman: 71 },
    { week: 'W5', ravi: 86, pooja: 92, suman: 75 },
    { week: 'W6', ravi: 87, pooja: 93, suman: 76 },
    { week: 'W7', ravi: 88, pooja: 94, suman: 75 },
    { week: 'W8', ravi: 87.5, pooja: 93.9, suman: 75.8 },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          30-Day Trends & Longitudinal Intelligence
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          2×2 operational radar tracking daily order intake, weekly failure reductions, complaint resolution, and rep compliance
        </p>
      </div>

      {/* 2x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* CHART 1: Orders per day */}
        <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900">1. Orders Per Day (30 Days)</h4>
              <p className="text-[11px] text-slate-500">Daily intake velocity with interactive point tooltips</p>
            </div>
            {hoveredOrderDay && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white shadow-xs">
                {hoveredOrderDay.date}: {hoveredOrderDay.count} orders
              </span>
            )}
          </div>

          <div className="h-44 relative flex items-end pt-6 pb-2">
            <svg viewBox="0 0 300 120" className="w-full h-full overflow-visible">
              {/* Grid lines */}
              <line x1="0" y1="30" x2="300" y2="30" stroke="#e2e8f0" strokeDasharray="3 3" />
              <line x1="0" y1="60" x2="300" y2="60" stroke="#e2e8f0" strokeDasharray="3 3" />
              <line x1="0" y1="90" x2="300" y2="90" stroke="#e2e8f0" strokeDasharray="3 3" />

              {/* Area fill */}
              {(() => {
                const maxVal = 8;
                const points = ordersPerDay.map((d, idx) => {
                  const x = (idx / 29) * 300;
                  const y = 110 - (d.count / maxVal) * 90;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                const dPath = `M ${points.join(' L ')}`;
                const fPath = `M 0,110 L ${points.join(' L ')} L 300,110 Z`;

                return (
                  <>
                    <path d={fPath} fill="#3b82f6" fillOpacity="0.1" />
                    {comparisonMode !== 'OFF' && (() => {
                      const compPoints = ordersPerDay.map((d, idx) => {
                        const x = (idx / 29) * 300;
                        const compCount = Math.max(1, d.count - 1 + ((idx % 3) - 1));
                        const y = 110 - (compCount / maxVal) * 90;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      });
                      return (
                        <path
                          d={`M ${compPoints.join(' L ')}`}
                          fill="none"
                          stroke="#94a3b8"
                          strokeWidth="2"
                          strokeDasharray="4 4"
                          strokeLinecap="round"
                        />
                      );
                    })()}
                    <path d={dPath} fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    {ordersPerDay.map((d, idx) => {
                      const cx = (idx / 29) * 300;
                      const cy = 110 - (d.count / maxVal) * 90;
                      return (
                        <circle
                          key={d.day}
                          cx={cx}
                          cy={cy}
                          r="3"
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth="2"
                          className="cursor-pointer hover:r-5 transition-all"
                          onMouseEnter={() => setHoveredOrderDay(d)}
                        />
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
          {comparisonMode !== 'OFF' && (
            <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-600 pt-1">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-blue-600 inline-block"></span>
                <span>This Month</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="w-3 h-0.5 bg-slate-400 border-t border-dashed border-slate-400 inline-block"></span>
                <span>Last Month</span>
              </span>
            </div>
          )}
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>Aug 10 (Day 1)</span>
            <span>Aug 24 (Day 15)</span>
            <span>Sep 08 (Today)</span>
          </div>
        </div>

        {/* CHART 2: Delivery failure rate per week */}
        <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900">2. Delivery Failure Rate / Week</h4>
              <p className="text-[11px] text-slate-500">Weekly rate declining from 18.5% down to 7.4%</p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
              -60% Failure Reduction
            </span>
          </div>

          <div className="h-44 relative flex items-end pt-6 pb-2">
            <svg viewBox="0 0 280 120" className="w-full h-full overflow-visible">
              <line x1="0" y1="30" x2="280" y2="30" stroke="#e2e8f0" strokeDasharray="3 3" />
              <line x1="0" y1="60" x2="280" y2="60" stroke="#e2e8f0" strokeDasharray="3 3" />
              <line x1="0" y1="90" x2="280" y2="90" stroke="#e2e8f0" strokeDasharray="3 3" />

              {(() => {
                const maxVal = 20;
                const points = failureRatePerWeek.map((w, idx) => {
                  const x = (idx / (failureRatePerWeek.length - 1)) * 280;
                  const y = 110 - (w.rate / maxVal) * 90;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                const dPath = `M ${points.join(' L ')}`;
                const fPath = `M 0,110 L ${points.join(' L ')} L 280,110 Z`;

                return (
                  <>
                    <path d={fPath} fill="#f43f5e" fillOpacity="0.08" />
                    <path d={dPath} fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" />
                    {failureRatePerWeek.map((w, idx) => {
                      const cx = (idx / (failureRatePerWeek.length - 1)) * 280;
                      const cy = 110 - (w.rate / maxVal) * 90;
                      return (
                        <g key={w.week}>
                          <circle cx={cx} cy={cy} r="3.5" fill="#ffffff" stroke="#e11d48" strokeWidth="2" />
                          <text x={cx} y={cy - 8} fontSize="9" textAnchor="middle" fill="#e11d48" fontWeight="bold">
                            {w.rate}%
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>Week 1</span>
            <span>Week 4</span>
            <span>Week 8 (Current)</span>
          </div>
        </div>

        {/* CHART 3: Complaint volume per week */}
        <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900">3. Complaint Volume / Week</h4>
              <p className="text-[11px] text-slate-500">Weekly ticket volume from packaging & courier defects</p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
              1 Active This Week
            </span>
          </div>

          <div className="h-44 flex items-end justify-between gap-3 pt-6 pb-2 px-2">
            {complaintVolumePerWeek.map((c) => {
              const heightPct = Math.round((c.count / 8) * 100);
              return (
                <div key={c.week} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-[10px] font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    {c.count}
                  </span>
                  <div className="w-full h-28 bg-slate-200/60 rounded-t flex items-end overflow-hidden">
                    <div
                      className="w-full bg-amber-500 group-hover:bg-amber-600 rounded-t transition-all"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">{c.week}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* CHART 4: Beat compliance per week per officer */}
        <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900">4. Beat Compliance / Week (Per Officer)</h4>
              <p className="text-[11px] text-slate-500">Longitudinal GPS beat adherence across 3 field reps</p>
            </div>
          </div>

          <div className="h-44 relative flex items-end pt-6 pb-2">
            <svg viewBox="0 0 280 120" className="w-full h-full overflow-visible">
              <line x1="0" y1="30" x2="280" y2="30" stroke="#e2e8f0" strokeDasharray="3 3" />
              <line x1="0" y1="60" x2="280" y2="60" stroke="#e2e8f0" strokeDasharray="3 3" />
              <line x1="0" y1="90" x2="280" y2="90" stroke="#e2e8f0" strokeDasharray="3 3" />

              {/* Pooja (Purple) */}
              {(() => {
                const points = officersCompliance.map((w, idx) => {
                  const x = (idx / 7) * 280;
                  const y = 120 - ((w.pooja - 60) / 40) * 100;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                return (
                  <path d={`M ${points.join(' L ')}`} fill="none" stroke="#9333ea" strokeWidth="2.2" strokeLinecap="round" />
                );
              })()}

              {/* Ravi (Blue) */}
              {(() => {
                const points = officersCompliance.map((w, idx) => {
                  const x = (idx / 7) * 280;
                  const y = 120 - ((w.ravi - 60) / 40) * 100;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                return (
                  <path d={`M ${points.join(' L ')}`} fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" />
                );
              })()}

              {/* Suman (Emerald) */}
              {(() => {
                const points = officersCompliance.map((w, idx) => {
                  const x = (idx / 7) * 280;
                  const y = 120 - ((w.suman - 60) / 40) * 100;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                return (
                  <path d={`M ${points.join(' L ')}`} fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="3 3" />
                );
              })()}
            </svg>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 text-xs font-semibold pt-1">
            <div className="flex items-center gap-1.5 text-purple-700">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
              <span>{off2} ({rate2}%)</span>
            </div>
            <div className="flex items-center gap-1.5 text-blue-700">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              <span>{off1} ({rate1}%)</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              <span>{off3} ({rate3}%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
