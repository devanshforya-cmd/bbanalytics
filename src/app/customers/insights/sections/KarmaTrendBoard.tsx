'use client';

import React from 'react';
import Link from 'next/link';
import { Customer } from '@/lib/types';

export interface KarmaTrendItem {
  customer: Customer;
  prevKarma: number;
  currentKarma: number;
  change: number;
  reason: string;
  action: string;
}

interface KarmaTrendBoardProps {
  karmaTrendBoard: KarmaTrendItem[];
}

export default function KarmaTrendBoard({ karmaTrendBoard }: KarmaTrendBoardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-white text-xs font-black">
              2h
            </span>
            <h2 className="text-base font-bold text-slate-900">
              Karma Trend Board (Recent Score Declines)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Monitors customers experiencing negative karma trajectory due to rejected shipments, delivery misses, or quality disputes.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th className="py-3 px-3">Customer</th>
              <th className="py-3 px-3 text-center">Previous Karma</th>
              <th className="py-3 px-3 text-center">Current Karma</th>
              <th className="py-3 px-3 text-center">Point Change</th>
              <th className="py-3 px-3">Primary Factor</th>
              <th className="py-3 px-3">Current Segment</th>
              <th className="py-3 px-3 text-right">Action Directive</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {karmaTrendBoard.map((item) => (
              <tr key={item.customer.id} className="hover:bg-slate-50 transition">
                <td className="py-3 px-3">
                  <Link
                    href={`/customers/${encodeURIComponent(item.customer.phone)}`}
                    className="font-bold text-slate-900 hover:text-blue-600"
                  >
                    {item.customer.name}
                  </Link>
                  <div className="text-[10px] text-slate-400">{item.customer.phone}</div>
                </td>
                <td className="py-3 px-3 text-center font-bold text-slate-500">{item.prevKarma}</td>
                <td className="py-3 px-3 text-center font-black text-rose-700">{item.currentKarma}</td>
                <td className="py-3 px-3 text-center">
                  <span className="rounded bg-rose-100 text-rose-800 font-bold px-2 py-0.5 text-[10px]">
                    {item.change} pts
                  </span>
                </td>
                <td className="py-3 px-3 text-slate-600 font-medium">{item.reason}</td>
                <td className="py-3 px-3">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      item.customer.segment === 'BLACKLISTED'
                        ? 'bg-red-900 text-white'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {item.customer.segment}
                  </span>
                </td>
                <td className="py-3 px-3 text-right font-semibold text-slate-700">{item.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
