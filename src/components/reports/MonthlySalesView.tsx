'use client';

import React from 'react';
import Link from 'next/link';
import { REPORT_CHANNELS, type buildMonthlySalesReport } from '@/lib/monthly-sales-report';
import { generateCSV } from '@/lib/csv';

/** The monthly sales sheet as shown in the app and on shared links. */
export type MonthlySalesData = ReturnType<typeof buildMonthlySalesReport>;

const money = (value: number) => new Intl.NumberFormat('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const safeCell = (value: string | number) => typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
export const reportChannels = (report: MonthlySalesData) => report.channels.Other === 0 ? REPORT_CHANNELS.filter((value) => value !== 'Other') : [...REPORT_CHANNELS];

/** The sheet as CSV. Without rupee amounts, only orders and units are written. */
export function monthlySalesCsv(report: MonthlySalesData, showMoney = true): string {
  const channels = reportChannels(report);
  const n = (cents: number) => Math.round(cents) / 100;
  const headers = ['Date', 'Day', 'Sale running', ...channels, 'Orders placed', 'Cancelled', ...(showMoney ? ['Net sales (NPR)'] : []), ...report.items.map((item) => `${item.name} (${item.kind})`)];
  const pad = (label: string, perChannel: (string | number)[], orders: string | number, cancelled: string | number, net: string | number, perItem: (string | number)[]) => [label, '', '', ...perChannel, orders, cancelled, ...(showMoney ? [net] : []), ...perItem];
  const rows: (string | number)[][] = report.days.map((day) => [day.date, day.day, day.sales.join(' + '), ...channels.map((channel) => day.channels[channel]), day.orderCount, day.cancelled, ...(showMoney ? [n(day.netCents)] : []), ...report.items.map((item) => day.quantities[item.id] || 0)]);
  if (showMoney) rows.push(pad('Current MRP / price (NPR)', channels.map(() => ''), '', '', '', report.items.map((item) => item.currentPrice ?? '')));
  rows.push(pad('Orders placed / units sold', channels.map((channel) => report.channels[channel]), report.orderCount, report.cancelledCount, '', report.items.map((item) => item.quantity)));
  rows.push(pad('Free gift units', channels.map(() => ''), '', '', report.giftUnits, report.items.map((item) => item.giftUnits || '')));
  if (showMoney) {
    rows.push(pad('Value at MRP (NPR)', channels.map(() => ''), '', '', n(report.mrpCents), report.items.map((item) => n(item.mrpCents))));
    rows.push(pad('Sale and offer discounts (NPR)', channels.map(() => ''), '', '', n(report.offerCents), report.items.map((item) => n(item.offerCents))));
    rows.push(pad('Customer discounts (NPR)', channels.map(() => ''), '', '', n(report.customerCents), report.items.map((item) => n(item.customerCents))));
    rows.push(pad('Net sales (NPR)', channels.map((channel) => n(report.channelSales[channel])), '', '', n(report.salesCents), report.items.map((item) => n(item.salesCents))));
  }
  const keys = headers.map((_, i) => String(i));
  return `﻿${generateCSV(keys.map((key, i) => ({ key, label: String(safeCell(headers[i])) })), rows.map((row) => Object.fromEntries(row.map((value, i) => [keys[i], safeCell(value)]))))}`;
}

export function MonthlySalesCards({ report, showMoney = true }: { report: MonthlySalesData; showMoney?: boolean }) {
  return (
    <div className={`grid grid-cols-1 gap-2 ${showMoney ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {showMoney ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3"><p className="text-xs font-semibold text-blue-700">Net sales</p><p className="text-2xl font-bold text-blue-950">NPR {money(report.salesCents / 100)}</p><p className="text-[11px] text-blue-800">{report.units} units · {report.orderCount - report.cancelledCount} orders</p></div>
      ) : (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3"><p className="text-xs font-semibold text-blue-700">Orders</p><p className="text-2xl font-bold text-blue-950">{report.orderCount - report.cancelledCount}</p><p className="text-[11px] text-blue-800">{report.units} units sold · {report.cancelledCount} cancelled</p></div>
      )}
      {showMoney && <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs font-semibold text-slate-600">Discounts</p><p className="text-2xl font-bold text-slate-900">NPR {money((report.offerCents + report.customerCents) / 100)}</p><p className="text-[11px] text-slate-600">Offers {money(report.offerCents / 100)} · customer {money(report.customerCents / 100)}{report.mrpCents ? ` · ${Math.round(((report.offerCents + report.customerCents) / report.mrpCents) * 1000) / 10}% of MRP` : ''}</p></div>}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs font-semibold text-slate-600">Free gifts</p><p className="text-2xl font-bold text-slate-900">{report.giftUnits} unit{report.giftUnits === 1 ? '' : 's'}</p>{showMoney && <p className="text-[11px] text-slate-600">NPR {money(report.giftCents / 100)} at MRP</p>}</div>
    </div>
  );
}

export function MonthlySalesTable({ report, showMoney = true }: { report: MonthlySalesData; showMoney?: boolean }) {
  const channels = reportChannels(report);
  const headCell = 'border border-slate-200 bg-slate-50 px-1.5 py-2 text-left text-[11px] font-bold leading-tight text-slate-700 break-words';
  const cell = 'border border-slate-200 px-1.5 py-1 text-right tabular-nums text-xs text-slate-700 [overflow-wrap:anywhere]';
  const footer: [string, string[], string, string, string, string[]][] = [
    ...(showMoney ? [['Current MRP / price (NPR)', channels.map(() => ''), '', '', '', report.items.map((item) => item.currentPrice === null ? '—' : money(item.currentPrice))] as [string, string[], string, string, string, string[]]] : []),
    ['Orders placed / units sold', channels.map((channel) => String(report.channels[channel])), String(report.orderCount), String(report.cancelledCount), '', report.items.map((item) => String(item.quantity))],
    ['Free gift units', channels.map(() => ''), '', '', String(report.giftUnits || ''), report.items.map((item) => item.giftUnits ? String(item.giftUnits) : '')],
    ...(showMoney ? [
      ['Value at MRP (NPR)', channels.map(() => ''), '', '', money(report.mrpCents / 100), report.items.map((item) => money(item.mrpCents / 100))],
      ['Sale and offer discounts (NPR)', channels.map(() => ''), '', '', money(report.offerCents / 100), report.items.map((item) => item.offerCents ? money(item.offerCents / 100) : '–')],
      ['Customer discounts (NPR)', channels.map(() => ''), '', '', money(report.customerCents / 100), report.items.map((item) => item.customerCents ? money(item.customerCents / 100) : '–')],
      ['Net sales (NPR)', channels.map((channel) => money(report.channelSales[channel] / 100)), '', '', money(report.salesCents / 100), report.items.map((item) => money(item.salesCents / 100))],
    ] as [string, string[], string, string, string, string[]][] : []),
  ];
  const width = 92 + 44 + 110 + channels.length * 76 + 82 + 70 + (showMoney ? 100 : 0) + report.items.length * 100;
  return (
    <div tabIndex={0} role="region" aria-label="Monthly sales sheet" className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-blue-600">
      <table className="w-full table-fixed border-collapse" style={{ minWidth: width }} aria-label="Daily monthly sales report">
        <colgroup><col style={{ width: 92 }} /><col style={{ width: 44 }} /><col style={{ width: 110 }} />{channels.map((channel) => <col key={channel} style={{ width: 76 }} />)}<col style={{ width: 82 }} /><col style={{ width: 70 }} />{showMoney && <col style={{ width: 100 }} />}{report.items.map((item) => <col key={item.id} style={{ width: 100 }} />)}</colgroup>
        <thead><tr>
          <th scope="col" className={`${headCell} sticky left-0 z-20`}>Date</th><th scope="col" className={headCell}>Day</th><th scope="col" className={headCell}>Sale running</th>
          {channels.map((channel) => <th scope="col" key={channel} className={headCell}>{channel}</th>)}
          <th scope="col" className={`${headCell} bg-blue-50`}>Orders placed</th><th scope="col" className={headCell}>Cancelled</th>{showMoney && <th scope="col" className={`${headCell} bg-blue-50`}>Net sales (NPR)</th>}
          {report.items.map((item) => <th scope="col" key={item.id} className={headCell}>{item.name}<span className="mt-1 block text-[10px] font-normal text-slate-500">{item.kind}</span></th>)}
        </tr></thead>
        <tbody>{report.days.map((day) => (
          <tr key={day.date} className={day.sales.length ? 'bg-emerald-50/40' : undefined}>
            <th scope="row" className={`${cell} sticky left-0 z-10 bg-white text-left font-medium whitespace-nowrap`}>{day.date}</th><td className={`${cell} text-left`}>{day.day}</td>
            <td className={`${cell} text-left text-[11px] text-emerald-800`}>{day.sales.join(' + ') || ''}</td>
            {channels.map((channel) => <td key={channel} className={cell}>{day.channels[channel] || '–'}</td>)}
            <td className={`${cell} bg-blue-50 font-semibold`}>{day.orderCount || '–'}</td><td className={cell}>{day.cancelled || '–'}</td>
            {showMoney && <td className={`${cell} bg-blue-50 font-semibold`}>{day.netCents ? money(day.netCents / 100) : '–'}</td>}
            {report.items.map((item) => <td key={item.id} className={cell}>{day.quantities[item.id] || '–'}</td>)}
          </tr>
        ))}</tbody>
        <tfoot className="bg-slate-50 font-semibold">
          {footer.map(([label, perChannel, orders, cancelled, net, perItem], index, all) => (
            <tr key={label} className={showMoney && index === all.length - 1 ? 'bg-blue-50' : undefined}>
              <th scope="row" colSpan={3} className={`${cell} text-left`}>{label}</th>{perChannel.map((value, i) => <td key={i} className={cell}>{value}</td>)}
              <td className={cell}>{orders}</td><td className={cell}>{cancelled}</td>{showMoney && <td className={cell}>{net}</td>}{perItem.map((value, i) => <td key={i} className={cell}>{value}</td>)}
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}

/** Sales that ran in these dates, and customer discounts by reason. */
export function MonthlySalesBreakdown({ report, showMoney = true, linkSales = false }: { report: MonthlySalesData; showMoney?: boolean; linkSales?: boolean }) {
  const showReasons = showMoney && report.discountReasons.length > 0;
  if (!report.sales.length && !showReasons) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {report.sales.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-semibold text-slate-900">Sales and offers in these dates</h2>
          <table className="mt-2 w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1 font-medium">Sale</th><th className="py-1 text-right font-medium">Orders</th>{showMoney && <><th className="py-1 text-right font-medium">Net sales</th><th className="py-1 text-right font-medium">Discount given</th></>}<th className="py-1 text-right font-medium">Gifts</th></tr></thead>
            <tbody>{report.sales.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="py-1.5">{linkSales ? <Link href={`/orderflow/sales/${row.id}`} className="font-semibold text-blue-700 hover:underline">{row.name}</Link> : <span className="font-semibold text-slate-900">{row.name}</span>}</td>
                <td className="py-1.5 text-right tabular-nums">{row.orders}</td>
                {showMoney && <><td className="py-1.5 text-right tabular-nums">NPR {money(row.netCents / 100)}</td><td className="py-1.5 text-right tabular-nums">NPR {money(row.offerCents / 100)}</td></>}
                <td className="py-1.5 text-right tabular-nums">{row.giftUnits || '–'}</td>
              </tr>
            ))}</tbody></table>
        </section>
      )}
      {showReasons && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-semibold text-slate-900">Customer discounts by reason</h2>
          <p className="text-[11px] text-slate-500">{report.ordersWithCustomerDiscount} order{report.ordersWithCustomerDiscount === 1 ? '' : 's'} sold below the sale or MRP price.</p>
          <ul className="mt-2 space-y-1 text-xs">{report.discountReasons.map((row) => <li key={row.reason} className="flex justify-between border-t border-slate-100 pt-1"><span>{row.reason} <span className="text-slate-500">· {row.orders} order{row.orders === 1 ? '' : 's'}</span></span><span className="tabular-nums">NPR {money(row.cents / 100)}</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
