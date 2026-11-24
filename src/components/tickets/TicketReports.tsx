'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import PagedList from '@/components/common/PagedList';
import { displayDocumentId } from '@/lib/document-ids';
import { getTodayAd } from '@/lib/nepali-calendar';
import { downloadCSV, generateCSV } from '@/lib/csv';
import type { DeliveryFailure, Order, ReturnEntry } from '@/lib/types';
import { countsAsSale } from '@/lib/order-status';
import {
  issuesByReason, packingErrors, rtoRateBy, rtoRows, ticketCounts, ticketSummary, TICKET_TYPE_LABEL, wasShipped, type RateRow, type RtoRow,
} from '@/lib/order-tickets';

type Range = '30' | '90' | '365' | 'ALL';
const RANGES: { key: Range; label: string }[] = [{ key: '30', label: 'Last 30 days' }, { key: '90', label: 'Last 90 days' }, { key: '365', label: 'Last 12 months' }, { key: 'ALL', label: 'All time' }];
const npr = (value: number) => `NPR ${Math.round(value).toLocaleString()}`;
const th = 'px-3 py-2 text-[11px] font-bold text-slate-500';
const td = 'px-3 py-2';
const num = 'px-3 py-2 text-right font-mono tabular-nums';

function Card({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div><h2 className="text-sm font-bold text-slate-900">{title}</h2>{hint && <p className="text-[11px] text-slate-500">{hint}</p>}</div>{action}
      </header>
      <div className="overflow-x-auto text-xs" tabIndex={0}>{children}</div>
    </section>
  );
}

function RateTable({ rows, label }: { rows: RateRow[]; label: string }) {
  if (!rows.length) return <p className="p-4 text-slate-500">Nothing shipped in this period.</p>;
  return (
    <table className="w-full min-w-[460px] text-left">
      <thead className="bg-slate-50"><tr><th className={th}>{label}</th><th className={`${th} text-right`}>Shipped</th><th className={`${th} text-right`}>RTO</th><th className={`${th} text-right`}>RTO rate</th><th className={`${th} text-right`}>Not back</th><th className={`${th} text-right`}>Value</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.slice(0, 12).map((row) => (
        <tr key={row.key}><td className={`${td} font-semibold text-slate-900`}>{row.key}</td><td className={num}>{row.shipped}</td><td className={num}>{row.rto}</td>
          <td className={`${num} ${row.ratePct >= 10 ? 'font-bold text-rose-700' : row.ratePct >= 5 ? 'text-amber-700' : ''}`}>{row.shipped ? `${row.ratePct}%` : '—'}</td><td className={num}>{row.notBack}</td><td className={num}>{npr(row.value)}</td></tr>
      ))}</tbody>
    </table>
  );
}

/** Detailed tables for RTO, packing errors and every ticket type. All figures come from saved records, nothing is estimated. */
export default function TicketReports({ tickets, failures, orders }: { tickets: ReturnEntry[]; failures: DeliveryFailure[]; orders: Order[] }) {
  const [range, setRange] = useState<Range>('90');
  const [notBackOnly, setNotBackOnly] = useState(false);
  const today = getTodayAd();
  const from = range === 'ALL' ? '' : new Date(Date.parse(today) - Number(range) * 86400000).toISOString().slice(0, 10);
  const inRange = (date?: string) => !from || (!!date && date >= from);

  const data = useMemo(() => {
    const periodOrders = orders.filter((order) => countsAsSale(order) && inRange(order.orderDateAd));
    const periodTickets = tickets.filter((entry) => inRange(entry.dateAd));
    // Same base as the rates: parcels whose order was placed in the period.
    const rto = rtoRows(failures, tickets, orders, today).filter((row) => inRange(row.orderDateAd || row.failedDateAd));
    const shipped = periodOrders.filter(wasShipped).length;
    const counts = ticketCounts(periodTickets);
    return {
      rto, shipped, counts, periodTickets,
      byCourier: rtoRateBy(rto, periodOrders, (order) => order.deliveryMethod, (row) => row.courier),
      byDistrict: rtoRateBy(rto, periodOrders, (order) => order.district, (row) => row.district),
      byMonth: rtoRateBy(rto, periodOrders, (order) => order.orderDateAd.slice(0, 7), (row) => (row.orderDateAd || row.failedDateAd).slice(0, 7)).sort((a, b) => b.key.localeCompare(a.key)),
      packingByProduct: packingErrors(periodTickets, 'product'), packingByPacker: packingErrors(periodTickets, 'packer'),
      summary: ticketSummary(periodTickets), reasons: issuesByReason(periodTickets),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, failures, orders, range]);

  const rtoList = notBackOnly ? data.rto.filter((row) => !row.back) : data.rto;
  const rtoValue = data.rto.reduce((sum, row) => sum + row.value, 0);
  const notBack = data.rto.filter((row) => !row.back);
  const tiles = [
    { label: 'RTO parcels', value: String(data.rto.length), hint: data.shipped ? `${Math.round((data.rto.length / data.shipped) * 1000) / 10}% of ${data.shipped} shipped · ${npr(rtoValue)}` : 'No shipped orders in this period' },
    { label: 'RTO not back yet', value: String(notBack.length), hint: notBack.length ? `${npr(notBack.reduce((sum, row) => sum + row.value, 0))} still out` : 'Every RTO parcel is checked in', tone: notBack.length ? 'text-amber-700' : '' },
    { label: 'Packing errors', value: String(data.counts.packing), hint: data.shipped ? `${Math.round((data.counts.packing / data.shipped) * 1000) / 10}% of shipped orders` : 'Short shipped and wrong items' },
    { label: 'Open tickets', value: String(data.counts.open), hint: `${data.counts.awaitingGoods} waiting for goods` },
  ];

  const exportRto = () => downloadCSV(generateCSV<RtoRow>([
    { key: 'orderNumber', label: 'Order' }, { key: 'customerName', label: 'Customer' }, { key: 'courier', label: 'Courier' }, { key: 'district', label: 'District' },
    { key: 'reason', label: 'Failure reason' }, { key: 'attempts', label: 'Attempts' }, { key: 'orderDateAd', label: 'Ordered' }, { key: 'dispatchedDateAd', label: 'Dispatched' },
    { key: 'failedDateAd', label: 'Last failed' }, { key: 'rtoDateAd', label: 'Marked RTO' }, { key: 'receivedDateAd', label: 'Received in-house' },
    { key: 'daysToReturn', label: 'Days to come back' }, { key: 'daysWaiting', label: 'Days waiting' }, { key: 'units', label: 'Units' }, { key: 'value', label: 'Order value (NPR)' },
  ], rtoList), `rto-${range}-${today}.csv`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Report period">
        {RANGES.map((entry) => (
          <button key={entry.key} type="button" role="radio" aria-checked={range === entry.key} onClick={() => setRange(entry.key)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${range === entry.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>{entry.label}</button>
        ))}
        <span className="ml-1 text-[11px] text-slate-500">Everything here counts orders placed in the period. Rates are out of the orders that left the warehouse.</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="text-[11px] font-bold text-slate-500">{tile.label}</p>
            <p className={`mt-1 text-2xl font-black tabular-nums ${tile.tone || 'text-slate-900'}`}>{tile.value}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{tile.hint}</p>
          </div>
        ))}
      </div>

      <Card title="Returned to origin (RTO)" hint="Every parcel marked returned-to-warehouse on the Delivery failures page, and whether it is back."
        action={<div className="flex items-center gap-3"><label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><input type="checkbox" checked={notBackOnly} onChange={(event) => setNotBackOnly(event.target.checked)} />Not back yet only</label>
          <button type="button" onClick={exportRto} disabled={!rtoList.length} className="btn btn-secondary disabled:opacity-50"><Download className="h-4 w-4" />CSV</button></div>}>
        {!rtoList.length ? <p className="p-4 text-slate-500">{notBackOnly ? 'Every RTO parcel in this period is back.' : 'No parcels were returned to origin in this period.'}</p> : (
          <table className="w-full min-w-[1100px] text-left">
            <thead className="bg-slate-50"><tr>{['Order', 'Customer', 'Courier', 'District', 'Failure reason', 'Attempts', 'Dispatched', 'Marked RTO', 'Received', 'Days', 'Units', 'Value'].map((label, i) => <th key={label} className={`${th} ${i >= 9 || i === 5 ? 'text-right' : ''}`}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              <PagedList items={rtoList.map((row) => ({ ...row, id: row.failureId }))} label="RTO parcels" asRow columns={12} render={(page) => page.map((row) => (
                <tr key={row.failureId}>
                  <td className={td}><Link href={`/orderflow/orders/${row.orderId}`} className="font-mono font-bold text-blue-700 hover:underline">{displayDocumentId(row.orderNumber)}</Link></td>
                  <td className={`${td} text-slate-900`}>{row.customerName}</td><td className={td}>{row.courier}</td><td className={td}>{row.district || '—'}</td>
                  <td className={`${td} max-w-[180px] truncate`} title={row.reason}>{row.reason}</td><td className={num}>{row.attempts}</td>
                  <td className={td}>{row.dispatchedDateAd || '—'}</td><td className={td}>{row.rtoDateAd || '—'}</td>
                  <td className={td}>{row.back ? <span className="font-semibold text-teal-700">{row.receivedDateAd}</span> : row.tracked ? <span className="font-semibold text-amber-700">Not yet</span> : <span className="text-slate-400" title="Marked RTO before tickets existed">Not tracked</span>}</td>
                  <td className={`${num} ${!row.back && (row.daysWaiting || 0) > 7 ? 'font-bold text-rose-700' : ''}`}>{row.back ? (row.daysToReturn ?? '—') : row.daysWaiting !== null ? `${row.daysWaiting} waiting` : '—'}</td>
                  <td className={num}>{row.units}</td><td className={num}>{npr(row.value)}</td>
                </tr>
              ))} />
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="RTO rate by courier"><RateTable rows={data.byCourier} label="Courier" /></Card>
        <Card title="RTO rate by district"><RateTable rows={data.byDistrict} label="District" /></Card>
        <Card title="RTO rate by month" hint="By the month the order was placed."><RateTable rows={data.byMonth} label="Month" /></Card>
        <Card title="Tickets by type" hint="Median days from opening to resolution.">
          <table className="w-full min-w-[460px] text-left">
            <thead className="bg-slate-50"><tr>{['Type', 'Total', 'Open', 'Waiting for goods', 'Resolved', 'Rejected', 'Median days'].map((label, i) => <th key={label} className={`${th} ${i ? 'text-right' : ''}`}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{data.summary.map((row) => (
              <tr key={row.type}><td className={`${td} font-semibold text-slate-900`}>{TICKET_TYPE_LABEL[row.type]}</td><td className={num}>{row.total}</td><td className={num}>{row.open}</td><td className={num}>{row.awaitingGoods}</td><td className={num}>{row.resolved}</td><td className={num}>{row.rejected}</td><td className={num}>{row.medianDaysToResolve ?? '—'}</td></tr>
            ))}</tbody>
          </table>
        </Card>
        <Card title="Packing errors by product" hint="Counted against the product the customer should have received.">
          {!data.packingByProduct.length ? <p className="p-4 text-slate-500">No packing errors in this period.</p> : (
            <table className="w-full min-w-[420px] text-left">
              <thead className="bg-slate-50"><tr>{['Product', 'Tickets', 'Units', 'Short shipped', 'Wrong item'].map((label, i) => <th key={label} className={`${th} ${i ? 'text-right' : ''}`}>{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{data.packingByProduct.slice(0, 15).map((row) => (
                <tr key={row.key}><td className={`${td} font-semibold text-slate-900`}>{row.key}</td><td className={num}>{row.tickets}</td><td className={num}>{row.units}</td><td className={num}>{row.shortShipped}</td><td className={num}>{row.wrongItem}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card title="Packing errors by packer" hint="From the Packed by field on each ticket.">
          {!data.packingByPacker.length ? <p className="p-4 text-slate-500">No packing errors in this period.</p> : (
            <table className="w-full min-w-[420px] text-left">
              <thead className="bg-slate-50"><tr>{['Packed by', 'Tickets', 'Units', 'Short shipped', 'Wrong item'].map((label, i) => <th key={label} className={`${th} ${i ? 'text-right' : ''}`}>{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{data.packingByPacker.map((row) => (
                <tr key={row.key}><td className={`${td} font-semibold text-slate-900`}>{row.key}</td><td className={num}>{row.tickets}</td><td className={num}>{row.units}</td><td className={num}>{row.shortShipped}</td><td className={num}>{row.wrongItem}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title="Issues by reason" hint="Every ticket type, with the units involved.">
        {!data.reasons.length ? <p className="p-4 text-slate-500">No tickets in this period.</p> : (
          <table className="w-full min-w-[460px] text-left">
            <thead className="bg-slate-50"><tr><th className={th}>Reason</th><th className={th}>Type</th><th className={`${th} text-right`}>Tickets</th><th className={`${th} text-right`}>Units</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{data.reasons.map((row) => (
              <tr key={`${row.type}${row.reason}`}><td className={`${td} font-semibold text-slate-900`}>{row.reason}</td><td className={td}>{TICKET_TYPE_LABEL[row.type]}</td><td className={num}>{row.tickets}</td><td className={num}>{row.units}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
