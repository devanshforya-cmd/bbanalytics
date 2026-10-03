'use client';

import React from 'react';
import { MapPin } from 'lucide-react';

export interface GeographicIntelRow {
  city: string;
  province: string;
  isOutsideValley: boolean;
  customers: number;
  orders: number;
  revenue: number;
  growth: string;
  topBrand: string;
  avgKarma: number;
}

interface GeographicIntelProps {
  geographicIntel: GeographicIntelRow[];
}

export default function GeographicIntel({ geographicIntel }: GeographicIntelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-white text-xs font-black">
              2j
            </span>
            <h2 className="text-base font-bold text-slate-900">
              Geographic Intelligence (Nepal Valley & Province Breakdown)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Regional revenue volume, growth velocity, and top-selling brand across provincial and metropolitan centers.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th className="py-3 px-3">City / Center</th>
              <th className="py-3 px-3">Province</th>
              <th className="py-3 px-3 text-center">Customers</th>
              <th className="py-3 px-3 text-center">Total Orders</th>
              <th className="py-3 px-3 text-right">Revenue (NPR)</th>
              <th className="py-3 px-3 text-center">Growth vs MoM</th>
              <th className="py-3 px-3">Leading Brand</th>
              <th className="py-3 px-3 text-center">Avg Karma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {geographicIntel.map((row) => (
              <tr key={row.city} className="hover:bg-slate-50 transition">
                <td className="py-3 px-3">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{row.city}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {row.isOutsideValley ? 'Outside Valley Hub' : 'Kathmandu Valley'}
                  </span>
                </td>
                <td className="py-3 px-3 text-slate-600 font-medium">{row.province}</td>
                <td className="py-3 px-3 text-center font-bold text-slate-700">{row.customers}</td>
                <td className="py-3 px-3 text-center font-semibold text-slate-700">{row.orders}</td>
                <td className="py-3 px-3 text-right font-black text-slate-900">
                  NPR {row.revenue.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-center">
                  <span className="rounded bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 text-[10px]">
                    {row.growth}
                  </span>
                </td>
                <td className="py-3 px-3 font-semibold text-slate-800">{row.topBrand}</td>
                <td className="py-3 px-3 text-center">
                  <span className="rounded-full bg-slate-100 text-slate-800 font-bold px-2 py-0.5 text-[10px]">
                    {row.avgKarma}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
