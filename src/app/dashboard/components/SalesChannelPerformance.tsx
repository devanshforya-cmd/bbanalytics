'use client';

import React from 'react';
import { Order, ReturnEntry, FeedbackEntry } from '@/lib/types';
import { Share2, Filter, ArrowUpRight } from 'lucide-react';

interface SalesChannelPerformanceProps {
  orders: Order[];
  returns: ReturnEntry[];
  feedback: FeedbackEntry[];
  selectedChannel?: string;
  onSelectChannel: (channel: string) => void;
}

const ALL_CHANNELS = [
  'Instagram',
  'WhatsApp',
  'Messenger',
  'TikTok',
  'Website',
  'Walk-in',
  'Phone Call',
  'Pathao Bazaar',
  'Field Order',
];

export default function SalesChannelPerformance({
  orders,
  returns,
  feedback,
  selectedChannel,
  onSelectChannel,
}: SalesChannelPerformanceProps) {
  const totalOrders = orders.length;

  const channelData = ALL_CHANNELS.map((ch) => {
    const chOrders = orders.filter((o) => o.platform === ch);
    const orderCount = chOrders.length;
    const pctOfTotal = totalOrders > 0 ? ((orderCount / totalOrders) * 100).toFixed(1) : '0.0';

    const deliveredCount = chOrders.filter((o) => o.status === 'DELIVERED').length;
    const deliverySuccessRate =
      orderCount > 0 ? ((deliveredCount / orderCount) * 100).toFixed(1) : '100.0';

    const chReturns = returns.filter((r) => r.platform === ch);
    const returnRate =
      orderCount > 0 ? ((chReturns.length / orderCount) * 100).toFixed(1) : '0.0';

    const chComplaints = feedback.filter((f) => f.type === 'COMPLAINT' && f.channel.toLowerCase().includes(ch.toLowerCase()));
    const complaintRate =
      orderCount > 0 ? ((chComplaints.length / orderCount) * 100).toFixed(1) : '0.0';

    // Top product
    const prodCounts: Record<string, number> = {};
    chOrders.forEach((o) => {
      o.items.forEach((i) => {
        prodCounts[i.productName] = (prodCounts[i.productName] || 0) + i.quantity;
      });
    });
    const topProduct = Object.entries(prodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    return {
      channel: ch,
      orders: orderCount,
      pctOfTotal,
      deliverySuccessRate,
      returnRate,
      complaintRate,
      topProduct,
    };
  });

  const maxOrders = Math.max(...channelData.map((c) => c.orders), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Share2 className="w-4 h-4 text-blue-600" />
            Sales Channel Performance
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Compare conversion channels, expectation alignment, and customer return rates (Click row to filter dashboard)
          </p>
        </div>

        {selectedChannel && (
          <button
            onClick={() => onSelectChannel('')}
            className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            Clear Channel Filter ({selectedChannel})
          </button>
        )}
      </div>

      {/* Horizontal Bar Chart */}
      <div className="space-y-2 pt-1">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Order Volume by Channel
        </h4>
        <div className="space-y-2">
          {channelData
            .filter((c) => c.orders > 0)
            .map((c) => {
              const barWidth = Math.round((c.orders / maxOrders) * 100);
              const isSelected = selectedChannel === c.channel;

              return (
                <div
                  key={c.channel}
                  onClick={() => onSelectChannel(isSelected ? '' : c.channel)}
                  className="space-y-1 cursor-pointer group"
                >
                  <div className="flex justify-between text-xs">
                    <span
                      className={`font-semibold group-hover:text-blue-600 transition-colors ${
                        isSelected ? 'text-blue-600 font-bold' : 'text-slate-800'
                      }`}
                    >
                      {c.channel}
                    </span>
                    <span className="font-bold text-slate-900">
                      {c.orders} orders ({c.pctOfTotal}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isSelected ? 'bg-blue-600' : 'bg-slate-400 group-hover:bg-blue-500'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Channel</th>
              <th className="p-2.5 text-right">Orders</th>
              <th className="p-2.5 text-right">% of Total</th>
              <th className="p-2.5 text-right">Delivery Success</th>
              <th className="p-2.5 text-right">Return Rate</th>
              <th className="p-2.5 text-right">Complaint Rate</th>
              <th className="p-2.5">Top Product</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {channelData.map((c) => {
              const isSelected = selectedChannel === c.channel;
              return (
                <tr
                  key={c.channel}
                  onClick={() => onSelectChannel(isSelected ? '' : c.channel)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50/80 font-bold' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="p-2.5 font-bold text-slate-900 flex items-center gap-1.5">
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>}
                    <span>{c.channel}</span>
                  </td>
                  <td className="p-2.5 text-right font-bold text-slate-900">{c.orders}</td>
                  <td className="p-2.5 text-right text-slate-600">{c.pctOfTotal}%</td>
                  <td className="p-2.5 text-right font-semibold text-emerald-600">
                    {c.deliverySuccessRate}%
                  </td>
                  <td className="p-2.5 text-right font-semibold text-amber-700">
                    {c.returnRate}%
                  </td>
                  <td className="p-2.5 text-right font-semibold text-rose-600">
                    {c.complaintRate}%
                  </td>
                  <td className="p-2.5 max-w-[200px] truncate text-slate-700 font-medium" title={c.topProduct}>
                    {c.topProduct}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
