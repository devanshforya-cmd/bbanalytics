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

  const rawOrders = db.getOrders();
  const rawFailures = db.getDeliveryFailures();
  const rawFeedback = db.getFeedback().filter((f) => f.type === 'COMPLAINT');
  const now = new Date();
  const weekEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const beats = db.getBeatItems();

  // 1. Orders per day (last 30 days dynamically)
  const ordersPerDay = Array.from({ length: 30 }, (_, idx) => {
    const d = new Date(now.getTime() - (29 - idx) * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    const monthShort = d.toLocaleString('en-US', { month: 'short' });
    const dayNum = String(d.getDate()).padStart(2, '0');
    const label = `${monthShort} ${dayNum}`;
    const count = rawOrders.filter((o) => {
      const orderDate = o.orderDateAd || (o.createdAt ? o.createdAt.split('T')[0] : '');
      return orderDate === dateStr;
    }).length;
    const previous = new Date(dateStr + 'T00:00:00Z');
    if (comparisonMode === 'LAST_MONTH') previous.setUTCMonth(previous.getUTCMonth() - 1);
    if (comparisonMode === 'SAME_MONTH_LAST_YEAR') previous.setUTCFullYear(previous.getUTCFullYear() - 1);
    const previousDate = previous.toISOString().slice(0, 10);
    const comparisonCount = rawOrders.filter(order => (order.orderDateAd || order.createdAt?.slice(0, 10)) === previousDate).length;
    return { day: idx + 1, count, comparisonCount, date: label };
  });

  // 2. Delivery failure rate per week (last 8 weeks dynamically)
  const failureRatePerWeek = Array.from({ length: 8 }, (_, idx) => {
    const weekStartMs = weekEnd - (8 - idx) * 7 * 24 * 60 * 60 * 1000;
    const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;
    const weekOrders = rawOrders.filter((o) => {
      const t = new Date(o.orderDateAd || o.createdAt).getTime();
      return t >= weekStartMs && t < weekEndMs;
    }).length;
    const weekFails = rawFailures.filter((f) => {
      const t = new Date(f.dateAd || f.createdAt).getTime();
      return t >= weekStartMs && t < weekEndMs;
    }).length;
    const rate = weekOrders > 0 ? Math.round((weekFails / weekOrders) * 1000) / 10 : 0;
    return { week: `W${idx + 1}`, rate, failures: weekFails, orders: weekOrders };
  });

  // 3. Complaint volume per week (last 8 weeks dynamically)
  const complaintVolumePerWeek = Array.from({ length: 8 }, (_, idx) => {
    const weekStartMs = weekEnd - (8 - idx) * 7 * 24 * 60 * 60 * 1000;
    const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;
    const count = rawFeedback.filter((f) => {
      const t = new Date(f.dateReceivedAd || f.createdAt).getTime();
      return t >= weekStartMs && t < weekEndMs;
    }).length;
    return { week: `W${idx + 1}`, count };
  });

  // Each point uses the scheduled beats for that officer and week.
  const officersCompliance = Array.from({ length: 8 }, (_, idx) => {
    const start = weekEnd - (8 - idx) * 7 * 86400000;
    const end = start + 7 * 86400000;
    const rate = (officerId?: string) => {
      const scheduled = beats.filter(beat => beat.officerId === officerId && Date.parse(beat.dateAd) >= start && Date.parse(beat.dateAd) < end);
      return scheduled.length ? Math.round(scheduled.filter(beat => beat.status === 'VISITED').length / scheduled.length * 100) : 0;
    };
    return { week: `W${idx + 1}`, off1: rate(scorecards[0]?.officerId), off2: rate(scorecards[1]?.officerId), off3: rate(scorecards[2]?.officerId) };
  });
  const { off1: rate1, off2: rate2, off3: rate3 } = officersCompliance[7];
  const orderScale = Math.max(1, ...ordersPerDay.flatMap(day => [day.count, comparisonMode !== 'OFF' && comparisonMode !== 'CUSTOM' ? day.comparisonCount : 0]));
  const complaintScale = Math.max(1, ...complaintVolumePerWeek.map(week => week.count));

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
                const maxVal = orderScale;
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
                    {comparisonMode !== 'OFF' && comparisonMode !== 'CUSTOM' && (() => {
                      const compPoints = ordersPerDay.map((d, idx) => {
                        const x = (idx / 29) * 300;
                        const compCount = d.comparisonCount;
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
            <span>{ordersPerDay[0]?.date || 'Day 1'}</span>
            <span>{ordersPerDay[14]?.date || 'Day 15'}</span>
            <span>{ordersPerDay[29]?.date || 'Today'}</span>
          </div>
        </div>

        {/* CHART 2: Delivery failure rate per week */}
        <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900">2. Delivery Failure Rate / Week</h4>
              <p className="text-[11px] text-slate-500">Weekly rate calculated from real dispatch logs</p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
              Current: {failureRatePerWeek[7]?.rate || 0}%
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
              {complaintVolumePerWeek[7].count} Complaints This Week
            </span>
          </div>

          <div className="h-44 flex items-end justify-between gap-3 pt-6 pb-2 px-2">
            {complaintVolumePerWeek.map((c) => {
              const heightPct = Math.round((c.count / complaintScale) * 100);
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
              <p className="text-[11px] text-slate-500">Longitudinal GPS beat adherence from field reports</p>
            </div>
          </div>

          {scorecards.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-xs text-slate-400 bg-white/60 rounded-xl border border-dashed border-slate-200">
              <Users className="w-6 h-6 mb-1 text-slate-300" />
              <span>No officer scorecards logged yet</span>
            </div>
          ) : (
            <>
              <div className="h-44 relative flex items-end pt-6 pb-2">
                <svg viewBox="0 0 280 120" className="w-full h-full overflow-visible">
                  <line x1="0" y1="30" x2="280" y2="30" stroke="#e2e8f0" strokeDasharray="3 3" />
                  <line x1="0" y1="60" x2="280" y2="60" stroke="#e2e8f0" strokeDasharray="3 3" />
                  <line x1="0" y1="90" x2="280" y2="90" stroke="#e2e8f0" strokeDasharray="3 3" />

                  {/* Officer 1 (Blue) */}
                  {(() => {
                    const points = officersCompliance.map((w, idx) => {
                      const x = (idx / 7) * 280;
                      const y = 110 - (w.off1 / 100) * 90;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    });
                    return (
                      <path d={`M ${points.join(' L ')}`} fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" />
                    );
                  })()}

                  {/* Officer 2 (Purple) */}
                  {scorecards.length > 1 && (() => {
                    const points = officersCompliance.map((w, idx) => {
                      const x = (idx / 7) * 280;
                      const y = 110 - (w.off2 / 100) * 90;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    });
                    return (
                      <path d={`M ${points.join(' L ')}`} fill="none" stroke="#9333ea" strokeWidth="2.2" strokeLinecap="round" />
                    );
                  })()}

                  {/* Officer 3 (Emerald) */}
                  {scorecards.length > 2 && (() => {
                    const points = officersCompliance.map((w, idx) => {
                      const x = (idx / 7) * 280;
                      const y = 110 - (w.off3 / 100) * 90;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    });
                    return (
                      <path d={`M ${points.join(' L ')}`} fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="3 3" />
                    );
                  })()}
                </svg>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold pt-1">
                <div className="flex items-center gap-1.5 text-blue-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                  <span>{off1} ({rate1}%)</span>
                </div>
                {scorecards.length > 1 && (
                  <div className="flex items-center gap-1.5 text-purple-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                    <span>{off2} ({rate2}%)</span>
                  </div>
                )}
                {scorecards.length > 2 && (
                  <div className="flex items-center gap-1.5 text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                    <span>{off3} ({rate3}%)</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
