'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import { db } from '@/lib/db/db-service';
import { canAccessBrand } from '@/lib/permissions';
import { getTodayAd } from '@/lib/nepali-calendar';
import { buildMonthlySalesReport, REPORT_CHANNELS } from '@/lib/monthly-sales-report';
import { downloadCSV, generateCSV } from '@/lib/csv';
import Link from 'next/link';
import InfoTip from '@/components/common/InfoTip';

const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const money = (value: number) => new Intl.NumberFormat('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const safeCell = (value: string | number) => typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;

function MonthlySales() {
  const [month, setMonth] = useState(() => getTodayAd().slice(0, 7));
  const [start, setStart] = useState(() => `${getTodayAd().slice(0, 7)}-01`);
  const [end, setEnd] = useState(() => { const m = getTodayAd().slice(0, 7); return `${m}-${lastDay(m)}`; });
  const [brand, setBrand] = useState('');
  const [revision, setRevision] = useState(0), [refreshing, setRefreshing] = useState(false), [message, setMessage] = useState('');
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    window.addEventListener('bb-db-updated', reload);
    return () => window.removeEventListener('bb-db-updated', reload);
  }, [reload]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { const result = await db.syncWithSupabase(); setMessage(result.success ? 'Up to date' : `Showing this device’s saved data. ${result.message}`); }
    catch { setMessage('Showing this device’s saved data. Refresh when connected.'); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000); return () => window.clearInterval(timer); }, [refresh]);
  const brands = useMemo(() => db.getBrands('ALL').filter(item => canAccessBrand(db.getCurrentUser(), item.code)), [revision]);
  useEffect(() => { if (!brands.some(item => item.code === brand)) setBrand(brands[0]?.code || ''); }, [brands, brand]);
  const rangeValid = /^\d{4}-\d{2}$/.test(month) && start.startsWith(`${month}-`) && end.startsWith(`${month}-`) && start <= end;
  const report = useMemo(() => rangeValid && brand ? buildMonthlySalesReport(db.getOrders(brand), db.getProducts(brand), db.getCombos(brand), brand, start, end, db.getCampaigns()) : null, [revision, brand, start, end, rangeValid]);
  const changeMonth = (value: string) => { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return; setMonth(value); setStart(`${value}-01`); setEnd(`${value}-${lastDay(value)}`); };
  const channels = report && report.channels.Other === 0 ? REPORT_CHANNELS.filter(value => value !== 'Other') : REPORT_CHANNELS;
  const exportReport = () => {
    if (!report) return;
    const n = (cents: number) => Math.round(cents) / 100;
    const headers = ['Date', 'Day', 'Sale running', ...channels, 'Orders placed', 'Cancelled', 'Net sales (NPR)', ...report.items.map(item => `${item.name} (${item.kind})`)];
    const pad = (label: string, perChannel: (string | number)[], orders: string | number, cancelled: string | number, net: string | number, perItem: (string | number)[]) => [label, '', '', ...perChannel, orders, cancelled, net, ...perItem];
    const rows: (string | number)[][] = report.days.map(day => [day.date, day.day, day.sales.join(' + '), ...channels.map(channel => day.channels[channel]), day.orderCount, day.cancelled, n(day.netCents), ...report.items.map(item => day.quantities[item.id] || 0)]);
    rows.push(pad('Current MRP / price (NPR)', channels.map(() => ''), '', '', '', report.items.map(item => item.currentPrice ?? '')));
    rows.push(pad('Orders placed / units sold', channels.map(channel => report.channels[channel]), report.orderCount, report.cancelledCount, '', report.items.map(item => item.quantity)));
    rows.push(pad('Free gift units', channels.map(() => ''), '', '', report.giftUnits, report.items.map(item => item.giftUnits || '')));
    rows.push(pad('Value at MRP (NPR)', channels.map(() => ''), '', '', n(report.mrpCents), report.items.map(item => n(item.mrpCents))));
    rows.push(pad('Sale and offer discounts (NPR)', channels.map(() => ''), '', '', n(report.offerCents), report.items.map(item => n(item.offerCents))));
    rows.push(pad('Customer discounts (NPR)', channels.map(() => ''), '', '', n(report.customerCents), report.items.map(item => n(item.customerCents))));
    rows.push(pad('Net sales (NPR)', channels.map(channel => n(report.channelSales[channel])), '', '', n(report.salesCents), report.items.map(item => n(item.salesCents))));
    const keys = headers.map((_, i) => String(i));
    const csv = generateCSV(keys.map((key, i) => ({ key, label: String(safeCell(headers[i])) })), rows.map(row => Object.fromEntries(row.map((value, i) => [keys[i], safeCell(value)]))));
    downloadCSV(`\uFEFF${csv}`, `monthly-sales-${brand}-${start}-to-${end}.csv`);
  };
  const headCell = 'border border-slate-200 bg-slate-50 px-1.5 py-2 text-left text-[11px] font-bold leading-tight text-slate-700 break-words';
  const cell = 'border border-slate-200 px-1.5 py-1 text-right tabular-nums text-xs text-slate-700 [overflow-wrap:anywhere]';
  return <main className="mx-auto max-w-[1800px] space-y-5 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-1.5 text-2xl font-bold text-slate-900">Monthly sales sheet<InfoTip label="About this sheet">Orders placed by day and channel, units sold per product, and money from MRP to net: sale and offer discounts, then one-off customer discounts. Cancelled orders are counted as placed but add no sales. Exchange replacements and marketing sends are left out. Free gifts are counted apart.</InfoTip></h1></div>
      {report && <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3"><p className="text-xs font-semibold text-blue-700">Net sales</p><p className="text-2xl font-bold text-blue-950">NPR {money(report.salesCents / 100)}</p><p className="text-[11px] text-blue-800">{report.units} units · {report.orderCount - report.cancelledCount} orders</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs font-semibold text-slate-600">Discounts</p><p className="text-2xl font-bold text-slate-900">NPR {money((report.offerCents + report.customerCents) / 100)}</p><p className="text-[11px] text-slate-600">Offers {money(report.offerCents / 100)} · customer {money(report.customerCents / 100)}{report.mrpCents ? ` · ${Math.round(((report.offerCents + report.customerCents) / report.mrpCents) * 1000) / 10}% of MRP` : ''}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs font-semibold text-slate-600">Free gifts</p><p className="text-2xl font-bold text-slate-900">{report.giftUnits} unit{report.giftUnits === 1 ? '' : 's'}</p><p className="text-[11px] text-slate-600">NPR {money(report.giftCents / 100)} at MRP</p></div>
      </div>}</div>
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <label className="text-xs font-semibold text-slate-700">Brand<select value={brand} onChange={event => setBrand(event.target.value)} className="mt-1 block min-h-[42px] min-w-40 rounded-lg border border-slate-300 px-3 text-sm">{!brands.length && <option value="">No brand available</option>}{brands.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-700">Month<input type="month" value={month} onChange={event => changeMonth(event.target.value)} className="mt-1 block min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">From<input type="date" min={`${month}-01`} max={`${month}-${lastDay(month)}`} value={start} onChange={event => setStart(event.target.value)} className="mt-1 block min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">To<input type="date" min={`${month}-01`} max={`${month}-${lastDay(month)}`} value={end} onChange={event => setEnd(event.target.value)} className="mt-1 block min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-50"><RefreshCw className="h-4 w-4" />{refreshing ? 'Refreshing' : 'Refresh'}</button>
      <button type="button" onClick={exportReport} disabled={!report} className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-50"><Download className="h-4 w-4" />Download CSV</button>
    </div>
    {message && <p role="status" className="text-xs text-slate-500">{message}.</p>}
    {!rangeValid && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">Select a valid date range within the selected month.</p>}
    {!brands.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No accessible brands are available for this report.</p>}
    {report && <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full table-fixed border-collapse" style={{ minWidth: 92 + 44 + 110 + channels.length * 76 + 82 + 70 + 100 + report.items.length * 100 }} aria-label="Daily monthly sales report"><colgroup><col style={{ width: 92 }} /><col style={{ width: 44 }} /><col style={{ width: 110 }} />{channels.map(channel => <col key={channel} style={{ width: 76 }} />)}<col style={{ width: 82 }} /><col style={{ width: 70 }} /><col style={{ width: 100 }} />{report.items.map(item => <col key={item.id} style={{ width: 100 }} />)}</colgroup><thead><tr>
      <th scope="col" className={`${headCell} sticky left-0 z-20`}>Date</th><th scope="col" className={headCell}>Day</th><th scope="col" className={headCell}>Sale running</th>{channels.map(channel => <th scope="col" key={channel} className={headCell}>{channel}</th>)}<th scope="col" className={`${headCell} bg-blue-50`}>Orders placed</th><th scope="col" className={headCell}>Cancelled</th><th scope="col" className={`${headCell} bg-blue-50`}>Net sales (NPR)</th>{report.items.map(item => <th scope="col" key={item.id} className={headCell}>{item.name}<span className="mt-1 block text-[10px] font-normal text-slate-500">{item.kind}</span></th>)}
    </tr></thead><tbody>{report.days.map(day => <tr key={day.date} className={day.sales.length ? 'bg-emerald-50/40' : undefined}><th scope="row" className={`${cell} sticky left-0 z-10 bg-white text-left font-medium whitespace-nowrap`}>{day.date}</th><td className={`${cell} text-left`}>{day.day}</td><td className={`${cell} text-left text-[11px] text-emerald-800`}>{day.sales.join(' + ') || ''}</td>{channels.map(channel => <td key={channel} className={cell}>{day.channels[channel] || '–'}</td>)}<td className={`${cell} bg-blue-50 font-semibold`}>{day.orderCount || '–'}</td><td className={cell}>{day.cancelled || '–'}</td><td className={`${cell} bg-blue-50 font-semibold`}>{day.netCents ? money(day.netCents / 100) : '–'}</td>{report.items.map(item => <td key={item.id} className={cell}>{day.quantities[item.id] || '–'}</td>)}</tr>)}</tbody>
    <tfoot className="bg-slate-50 font-semibold">
      {([
        ['Current MRP / price (NPR)', channels.map(() => ''), '', '', '', report.items.map(item => item.currentPrice === null ? '—' : money(item.currentPrice))],
        ['Orders placed / units sold', channels.map(channel => String(report.channels[channel])), String(report.orderCount), String(report.cancelledCount), '', report.items.map(item => String(item.quantity))],
        ['Free gift units', channels.map(() => ''), '', '', String(report.giftUnits || ''), report.items.map(item => item.giftUnits ? String(item.giftUnits) : '')],
        ['Value at MRP (NPR)', channels.map(() => ''), '', '', money(report.mrpCents / 100), report.items.map(item => money(item.mrpCents / 100))],
        ['Sale and offer discounts (NPR)', channels.map(() => ''), '', '', money(report.offerCents / 100), report.items.map(item => item.offerCents ? money(item.offerCents / 100) : '–')],
        ['Customer discounts (NPR)', channels.map(() => ''), '', '', money(report.customerCents / 100), report.items.map(item => item.customerCents ? money(item.customerCents / 100) : '–')],
        ['Net sales (NPR)', channels.map(channel => money(report.channelSales[channel] / 100)), '', '', money(report.salesCents / 100), report.items.map(item => money(item.salesCents / 100))],
      ] as [string, string[], string, string, string, string[]][]).map(([label, perChannel, orders, cancelled, net, perItem], index, all) => (
        <tr key={label} className={index === all.length - 1 ? 'bg-blue-50' : undefined}><th scope="row" colSpan={3} className={`${cell} text-left`}>{label}</th>{perChannel.map((value, i) => <td key={i} className={cell}>{value}</td>)}<td className={cell}>{orders}</td><td className={cell}>{cancelled}</td><td className={cell}>{net}</td>{perItem.map((value, i) => <td key={i} className={cell}>{value}</td>)}</tr>
      ))}
    </tfoot></table></div>}
    {report && (report.sales.length > 0 || report.discountReasons.length > 0) && <div className="grid gap-4 md:grid-cols-2">
      {report.sales.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-semibold text-slate-900">Sales and offers in these dates</h2>
        <table className="mt-2 w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1 font-medium">Sale</th><th className="py-1 text-right font-medium">Orders</th><th className="py-1 text-right font-medium">Net sales</th><th className="py-1 text-right font-medium">Discount given</th><th className="py-1 text-right font-medium">Gifts</th></tr></thead>
          <tbody>{report.sales.map(row => <tr key={row.id} className="border-t border-slate-100"><td className="py-1.5"><Link href={`/orderflow/sales/${row.id}`} className="font-semibold text-blue-700 hover:underline">{row.name}</Link></td><td className="py-1.5 text-right tabular-nums">{row.orders}</td><td className="py-1.5 text-right tabular-nums">NPR {money(row.netCents / 100)}</td><td className="py-1.5 text-right tabular-nums">NPR {money(row.offerCents / 100)}</td><td className="py-1.5 text-right tabular-nums">{row.giftUnits || '–'}</td></tr>)}</tbody></table></section>}
      {report.discountReasons.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-semibold text-slate-900">Customer discounts by reason</h2><p className="text-[11px] text-slate-500">{report.ordersWithCustomerDiscount} order{report.ordersWithCustomerDiscount === 1 ? '' : 's'} sold below the sale or MRP price.</p>
        <ul className="mt-2 space-y-1 text-xs">{report.discountReasons.map(row => <li key={row.reason} className="flex justify-between border-t border-slate-100 pt-1"><span>{row.reason} <span className="text-slate-500">· {row.orders} order{row.orders === 1 ? '' : 's'}</span></span><span className="tabular-nums">NPR {money(row.cents / 100)}</span></li>)}</ul></section>}
    </div>}
  </main>;
}
export default function MonthlySalesPage() { return <PageGuard feature="orderflow"><MonthlySales /></PageGuard>; }
