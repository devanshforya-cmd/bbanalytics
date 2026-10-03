'use client';

import React from 'react';
import Link from 'next/link';
import { Customer } from '@/lib/types';

export interface TopSliceItem {
  customer: Customer;
  spend: number;
  aov: number;
}

export interface RevenueConcentrationData {
  concentrationPct: number;
  topSlice: TopSliceItem[];
  topRevenue: number;
}

export interface LtvBracket {
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface LtvDistributionData {
  avgLtv: number;
  brackets: LtvBracket[];
}

interface RevenueConcentrationProps {
  revenueConcentration: RevenueConcentrationData;
  ltvDistribution: LtvDistributionData;
}

export default function RevenueConcentration({
  revenueConcentration,
  ltvDistribution,
}: RevenueConcentrationProps) {
  return (
    <div className="space-y-8">
      {/* 2b. Revenue Concentration */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-black">
                2b
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Revenue Concentration (Top 10% Contribution)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Pareto distribution breakdown showcasing customer dependency and key revenue drivers across D2C channels.
            </p>
          </div>
        </div>

        {/* Banner callout */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-blue-900 uppercase tracking-wider">
              Key Concentration Finding
            </div>
            <div className="text-sm sm:text-base font-black text-blue-950 mt-0.5">
              Top {revenueConcentration.topSlice.length} customers (10%) account for NPR{' '}
              {revenueConcentration.topRevenue.toLocaleString()} ({revenueConcentration.concentrationPct}% of total platform revenue).
            </div>
          </div>
          <span className="rounded-xl bg-blue-600 text-white font-black px-3 py-1.5 text-xs whitespace-nowrap shadow-xs">
            {revenueConcentration.concentrationPct}% Concentration
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 text-center">Rank</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3 text-right">Total Spend</th>
                <th className="py-3 px-3 text-center">Orders</th>
                <th className="py-3 px-3 text-right">Avg Order Value (AOV)</th>
                <th className="py-3 px-3 text-center">Karma Score</th>
                <th className="py-3 px-3">Brands Purchased</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {revenueConcentration.topSlice.map((item, idx) => (
                <tr key={item.customer.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-3 text-center font-black text-slate-400">#{idx + 1}</td>
                  <td className="py-3 px-3">
                    <Link
                      href={`/customers/${encodeURIComponent(item.customer.phone)}`}
                      className="font-bold text-slate-900 hover:text-blue-600 flex items-center gap-1.5"
                    >
                      {item.customer.name}
                    </Link>
                    <div className="text-[10px] text-slate-400">{item.customer.phone}</div>
                  </td>
                  <td className="py-3 px-3 text-right font-black text-slate-900">
                    NPR {item.spend.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-slate-700">
                    {item.customer.totalOrders}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-slate-600">
                    NPR {item.aov.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="rounded-full bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 text-[11px]">
                      {item.customer.karmaScore}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-1">
                      {(item.customer.brandsPurchased || []).map((b) => (
                        <span
                          key={b}
                          className="rounded bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 text-[9px]"
                        >
                          {b === 'PEE_SAFE' ? 'Pee Safe & FURR' : b}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2l. LTV Distribution */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-white text-xs font-black">
                2l
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Customer Lifetime Value (LTV) Distribution
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Stratification of customer lifetime spend across NPR value tiers.
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase text-slate-400">Mean Platform LTV</span>
            <div className="text-lg font-black text-slate-900">
              NPR {ltvDistribution.avgLtv.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {ltvDistribution.brackets.map((b) => (
            <div key={b.label} className="rounded-xl border border-slate-200 p-3 bg-slate-50/60 space-y-2">
              <div className="text-[11px] font-bold text-slate-600">{b.label}</div>
              <div className="text-xl font-black text-slate-900">{b.count}</div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Share</span>
                  <span className="font-bold">{b.pct}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full ${b.color}`} style={{ width: `${b.pct}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
