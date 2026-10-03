'use client';

import React from 'react';
import Link from 'next/link';
import { Sparkles, ChevronRight } from 'lucide-react';
import { Customer } from '@/lib/types';

export interface CrossSellOpportunity {
  customer: Customer;
  currentBrands: string;
  targetBrand: string;
  suggestedPitch: string;
}

export interface CrossBrandMapData {
  total: number;
  foryaOnly: number;
  peeSafeOnly: number;
  reneeOnly: number;
  foryaPeeSafe: number;
  foryaRenee: number;
  peeSafeRenee: number;
  allThree: number;
  crossSellOpportunities: CrossSellOpportunity[];
}

export interface ChannelLoyaltyRow {
  channel: string;
  customerCount: number;
  orderCount: number;
  avgKarma: number;
  repeatRate: string;
  loyalistPct: string;
}

export interface ProductAffinitySegment {
  segment: string;
  badgeColor: string;
  kpi: string;
  topProducts: { name: string; share: string; brand: string }[];
  strategy: string;
}

interface CrossBrandMapProps {
  crossBrandMap: CrossBrandMapData;
  channelLoyalty: ChannelLoyaltyRow[];
  productAffinity: ProductAffinitySegment[];
}

export default function CrossBrandMap({
  crossBrandMap,
  channelLoyalty,
  productAffinity,
}: CrossBrandMapProps) {
  return (
    <div className="space-y-8">
      {/* 2c. Cross-Brand Behavior Map */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-600 text-white text-xs font-black">
                2c
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Cross-Brand Behavior Map & Portfolio Synergies
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Tracks customer basket overlap across Forya, Pee Safe & FURR, and Renee to unlock cross-sell potential.
            </p>
          </div>
        </div>

        {/* Matrix Distribution Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-center">
          {[
            { label: 'Forya Only', count: crossBrandMap.foryaOnly, bg: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
            { label: 'Pee Safe Only', count: crossBrandMap.peeSafeOnly, bg: 'bg-purple-50 text-purple-800 border-purple-200' },
            { label: 'Renee Only', count: crossBrandMap.reneeOnly, bg: 'bg-rose-50 text-rose-800 border-rose-200' },
            { label: 'Forya + Pee Safe', count: crossBrandMap.foryaPeeSafe, bg: 'bg-blue-50 text-blue-800 border-blue-200' },
            { label: 'Forya + Renee', count: crossBrandMap.foryaRenee, bg: 'bg-amber-50 text-amber-800 border-amber-200' },
            { label: 'Pee Safe + Renee', count: crossBrandMap.peeSafeRenee, bg: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
            { label: 'All 3 Brands', count: crossBrandMap.allThree, bg: 'bg-emerald-100 text-emerald-950 border-emerald-300 font-black' },
          ].map((m) => (
            <div key={m.label} className={`rounded-xl border p-3 ${m.bg} space-y-1`}>
              <div className="text-[10px] font-bold uppercase tracking-wider">{m.label}</div>
              <div className="text-xl font-black">{m.count}</div>
              <div className="text-[10px] opacity-80">
                {Math.round((m.count / crossBrandMap.total) * 100)}% of total
              </div>
            </div>
          ))}
        </div>

        {/* Cross-Sell Opportunities Table */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-purple-600" />
            Cross-Sell Priority Candidates (High Karma, Untapped Brand)
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Current Brands</th>
                  <th className="py-3 px-3">Untapped Brand</th>
                  <th className="py-3 px-3 text-center">Karma</th>
                  <th className="py-3 px-3">Suggested Recommendation Pitch</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {crossBrandMap.crossSellOpportunities.map((item) => (
                  <tr key={item.customer.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3">
                      <Link
                        href={`/customers/${encodeURIComponent(item.customer.phone)}`}
                        className="font-bold text-slate-900 hover:text-purple-600"
                      >
                        {item.customer.name}
                      </Link>
                      <div className="text-[10px] text-slate-400">{item.customer.phone}</div>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-600">{item.currentBrands}</td>
                    <td className="py-3 px-3">
                      <span className="rounded bg-purple-100 text-purple-800 font-bold px-2 py-0.5 text-[10px]">
                        {item.targetBrand}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="rounded-full bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 text-[10px]">
                        {item.customer.karmaScore}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700">{item.suggestedPitch}</td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/customers/${encodeURIComponent(item.customer.phone)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 font-bold text-[10px] border border-purple-200 hover:bg-purple-100 transition"
                      >
                        Suggest <ChevronRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 2g. Channel Loyalty */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500 text-white text-xs font-black">
                2g
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Channel Loyalty & Omnichannel Dynamics
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Evaluates which channels foster repeat loyalty vs. one-off impulse acquisitions.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-3">Acquisition Channel</th>
                <th className="py-3 px-3 text-center">Unique Customers</th>
                <th className="py-3 px-3 text-center">Total Orders</th>
                <th className="py-3 px-3 text-center">Avg Karma</th>
                <th className="py-3 px-3 text-center">Repeat Order Rate</th>
                <th className="py-3 px-3 text-right">Channel Loyalist Share (&gt;80%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {channelLoyalty.map((row) => (
                <tr key={row.channel} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-3 font-bold text-slate-900">{row.channel}</td>
                  <td className="py-3 px-3 text-center font-bold text-slate-700">{row.customerCount}</td>
                  <td className="py-3 px-3 text-center font-semibold text-slate-600">{row.orderCount}</td>
                  <td className="py-3 px-3 text-center">
                    <span className="rounded-full bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 text-[10px]">
                      {row.avgKarma}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center font-black text-blue-700">{row.repeatRate}</td>
                  <td className="py-3 px-3 text-right font-bold text-slate-800">{row.loyalistPct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2k. Product Affinity by Segment */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-600 text-white text-xs font-black">
                2k
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Product Affinity by Customer Segment
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              SKU preference patterns by tier to guide sales officers and automated cross-sell prompts.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {productAffinity.map((seg) => (
            <div key={seg.segment} className="rounded-xl border border-slate-200 p-4 bg-slate-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${seg.badgeColor}`}>
                  {seg.segment}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">{seg.kpi}</span>
              </div>

              <div className="space-y-1.5">
                {seg.topProducts.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-100 text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{p.name}</span>
                      <span className="ml-2 text-[10px] text-slate-400 font-medium">{p.brand}</span>
                    </div>
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      {p.share}
                    </span>
                  </div>
                ))}
              </div>

              <div className="text-[11px] text-slate-600 bg-white/70 p-2.5 rounded-lg border border-slate-100 italic">
                <span className="font-bold not-italic text-slate-700">Directive:</span> {seg.strategy}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
