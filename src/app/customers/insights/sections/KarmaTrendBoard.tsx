'use client';

import PagedList from '@/components/common/PagedList';
import React from 'react';
import Link from 'next/link';
import { Customer } from '@/lib/types';

export interface KarmaTrendItem {
  customer: Customer;
  currentKarma: number;
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
            <h2 className="text-base font-bold text-slate-900">
              Lowest karma customers
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Customers with the lowest scores, and what actually pulled them down: failed deliveries, returns, cancellations and complaints.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200" tabIndex={0}>
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-3 px-3">Customer</th>
              <th className="py-3 px-3 text-center">Karma</th>
              <th className="py-3 px-3">What pulled it down</th>
              <th className="py-3 px-3">Current segment</th>
              <th className="py-3 px-3 text-right">Suggested next step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {<PagedList items={karmaTrendBoard} label="customers" pageSize={10} asRow render={(pageRows) => pageRows.map((item) => (
              <tr key={item.customer.id} className="hover:bg-slate-50 transition">
                <td className="py-3 px-3">
                  <Link
                    href={`/customers/${encodeURIComponent(item.customer.phone)}`}
                    className="font-bold text-slate-900 hover:text-blue-600"
                  >
                    {item.customer.name}
                  </Link>
                  <div className="text-[11px] text-slate-500">{item.customer.phone}</div>
                </td>
                <td className="py-3 px-3 text-center font-medium tabular-nums text-rose-700">{item.currentKarma}</td>
                <td className="py-3 px-3 text-slate-600 font-medium">{item.reason}</td>
                <td className="py-3 px-3">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-bold ${
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
            ))} />}
          </tbody>
        </table>
      </div>
    </section>
  );
}
