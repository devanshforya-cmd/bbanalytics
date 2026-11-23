'use client';

import Money from '@/components/common/Money';
import React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Customer } from '@/lib/types';

export interface WinBackItem {
  customer: Customer;
  spend: number;
  daysInactive: number;
  suggestedOffer: string;
  brand: string;
}

interface WinBackListProps {
  winBackList: WinBackItem[];
  contactedMap: Record<string, boolean>;
  toggleContacted: (id: string) => void;
}

export default function WinBackList({
  winBackList,
  contactedMap,
  toggleContacted,
}: WinBackListProps) {
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-emerald-950">
              VIP win-back priority queue
            </h2>
            <span className="rounded-full bg-emerald-200/80 text-emerald-900 text-[11px] font-bold px-2 py-0.5">
              {winBackList.length} High-Karma Dormant
            </span>
          </div>
          <p className="text-xs text-emerald-800 mt-1">
            High-value accounts (Karma ≥ 70, past orders ≥ 2) dormant for over 60 days. High probability of reactivation with tailored incentives.
          </p>
        </div>
        <span className="text-[11px] font-bold text-emerald-700">Sorted by past orders descending</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-emerald-200 bg-white" tabIndex={0}>
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-emerald-50/60 text-[11px] font-bold text-emerald-900 border-b border-emerald-200">
            <tr>
              <th className="py-3 px-3">Customer</th>
              <th className="py-3 px-3 text-right">Lifetime spend</th>
              <th className="py-3 px-3 text-center">Past orders</th>
              <th className="py-3 px-3 text-center">Dormancy</th>
              <th className="py-3 px-3">Preferred brand</th>
              <th className="py-3 px-3">Suggested comeback incentive</th>
              <th className="py-3 px-3 text-right">Status / outreach</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {winBackList.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No dormant VIP profiles requiring immediate win-back.
                </td>
              </tr>
            ) : (
              winBackList.map((item) => {
                const isContacted = contactedMap[item.customer.id];
                return (
                  <tr key={item.customer.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3">
                      <Link
                        href={`/customers/${encodeURIComponent(item.customer.phone)}`}
                        className="font-bold text-slate-900 hover:text-emerald-700 flex items-center gap-1.5"
                      >
                        {item.customer.name}
                      </Link>
                      <div className="text-[11px] text-slate-500">{item.customer.phone}</div>
                    </td>
                    <td className="py-3 px-3 text-right font-black text-slate-900">
                      <Money>{item.spend.toLocaleString()}</Money>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-800">
                      {item.customer.totalOrders}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="rounded bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 text-[11px] border border-rose-200">
                        {item.daysInactive} days
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                        {item.brand}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-emerald-800 font-semibold">
                      {item.suggestedOffer}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isContacted ? (
                        <button
                          onClick={() => toggleContacted(item.customer.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300 cursor-pointer"
                        >
                          <Check className="h-3 w-3 text-emerald-700" /> Contacted Today
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleContacted(item.customer.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 transition cursor-pointer"
                        >
                          Mark contacted
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
