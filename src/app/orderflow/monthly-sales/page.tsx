'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import { db } from '@/lib/db/db-service';
import { canAccessBrand } from '@/lib/permissions';
import { getTodayAd } from '@/lib/nepali-calendar';
import { buildMonthlySalesReport, REPORT_CHANNELS } from '@/lib/monthly-sales-report';
import { downloadCSV, generateCSV } from '@/lib/csv';

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
  const report = useMemo(() => rangeValid && brand ? buildMonthlySalesReport(db.getOrders(brand), db.getProducts(brand), db.getCombos(brand), brand, start, end) : null, [revision, brand, start, end, rangeValid]);
  const changeMonth = (value: string) => { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return; setMonth(value); setStart(`${value}-01`); setEnd(`${value}-${lastDay(value)}`); };
  const channels = report && report.channels.Other === 0 ? REPORT_CHANNELS.filter(value => value !== 'Other') : REPORT_CHANNELS;
  const exportReport = () => {
    if (!report) return;
    const headers = ['Date', 'Day', ...channels, 'Total orders', ...report.items.map(item => `${item.name} (${item.kind})`)];
    const rows: (string | number)[][] = report.days.map(day => [day.date, day.day, ...channels.map(channel => day.channels[channel]), day.orderCount, ...report.items.map(item => day.quantities[item.id] || 0)]);
    rows.push(['Current MRP / price (NPR)', '', ...channels.map(() => ''), '', ...report.items.map(item => item.currentPrice ?? '')]);
    rows.push(['Total orders / units', '', ...channels.map(channel => report.channels[channel]), report.orderCount, ...report.items.map(item => item.quantity)]);
    rows.push(['Value at current price (NPR)', '', ...channels.map(() => ''), '', ...report.items.map(item => item.currentPrice === null ? '' : Math.round(item.quantity * item.currentPrice * 100) / 100)]);
    rows.push(['Recorded sales (NPR)', '', ...channels.map(() => ''), report.salesCents / 100, ...report.items.map(item => item.salesCents / 100)]);
    const keys = headers.map((_, i) => String(i));
    const csv = generateCSV(keys.map((key, i) => ({ key, label: String(safeCell(headers[i])) })), rows.map(row => Object.fromEntries(row.map((value, i) => [keys[i], safeCell(value)]))));
    downloadCSV(`\uFEFF${csv}`, `monthly-sales-${brand}-${start}-to-${end}.csv`);
  };
  const headCell = 'border border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-700 whitespace-nowrap';
  const cell = 'border border-slate-200 px-3 py-2 text-right tabular-nums text-sm text-slate-700';
  return <main className="mx-auto max-w-[1800px] space-y-5 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-900">Monthly sales sheet</h1><p className="mt-1 text-sm text-slate-600">Daily order counts and product quantities, filled from saved orders.</p></div>
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-3"><p className="text-xs font-semibold text-blue-700">Recorded sales · selected dates</p><p className="text-2xl font-bold text-blue-950">NPR {money((report?.salesCents || 0) / 100)}</p></div></div>
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <label className="text-xs font-semibold text-slate-700">Brand<select value={brand} onChange={event => setBrand(event.target.value)} className="mt-1 block min-h-[42px] min-w-40 rounded-lg border border-slate-300 px-3 text-sm">{!brands.length && <option value="">No brand available</option>}{brands.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-700">Month<input type="month" value={month} onChange={event => changeMonth(event.target.value)} className="mt-1 block min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">From<input type="date" min={`${month}-01`} max={`${month}-${lastDay(month)}`} value={start} onChange={event => setStart(event.target.value)} className="mt-1 block min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-700">To<input type="date" min={`${month}-01`} max={`${month}-${lastDay(month)}`} value={end} onChange={event => setEnd(event.target.value)} className="mt-1 block min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-50"><RefreshCw className="h-4 w-4" />{refreshing ? 'Refreshing' : 'Refresh'}</button>
      <button type="button" onClick={exportReport} disabled={!report} className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-50"><Download className="h-4 w-4" />Download CSV</button>
    </div>
    <div className="space-y-1 text-sm text-slate-600"><p>Orders update from the extractor and manual entry. Later cancellations and returns do not change these figures. Facebook and Messenger are combined.</p><p>Use From and To to view a sale period. Enter the agreed price or discount when saving each order. Recorded sales use the saved line amounts; current-price value is an estimate using today’s catalogue prices.</p><p>Combos count separately from individual products. Marketing sends are excluded. {message && <span role="status">{message}.</span>}</p></div>
    {!rangeValid && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">Select a valid date range within the selected month.</p>}
    {!brands.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No accessible brands are available for this report.</p>}
    {report && <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full border-collapse" aria-label="Daily monthly sales report"><thead><tr>
      <th scope="col" className={`${headCell} sticky left-0 z-20`}>Date</th><th scope="col" className={headCell}>Day</th>{channels.map(channel => <th scope="col" key={channel} className={headCell}>{channel}</th>)}<th scope="col" className={`${headCell} bg-blue-50`}>Daily total orders</th>{report.items.map(item => <th scope="col" key={item.id} className={headCell}>{item.name}<span className="mt-1 block text-[10px] font-normal text-slate-500">{item.kind}</span></th>)}
    </tr></thead><tbody>{report.days.map(day => <tr key={day.date}><th scope="row" className={`${cell} sticky left-0 z-10 bg-white text-left font-medium whitespace-nowrap`}>{day.date}</th><td className={`${cell} text-left`}>{day.day}</td>{channels.map(channel => <td key={channel} className={cell}>{day.channels[channel] || '–'}</td>)}<td className={`${cell} bg-blue-50 font-semibold`}>{day.orderCount || '–'}</td>{report.items.map(item => <td key={item.id} className={cell}>{day.quantities[item.id] || '–'}</td>)}</tr>)}</tbody>
    <tfoot className="bg-slate-50 font-semibold"><tr><th scope="row" colSpan={2} className={`${cell} text-left`}>Current MRP / price (NPR)</th>{channels.map(channel => <td key={channel} className={cell} />)}<td className={cell} />{report.items.map(item => <td key={item.id} className={cell}>{item.currentPrice === null ? '—' : money(item.currentPrice)}</td>)}</tr>
      <tr><th scope="row" colSpan={2} className={`${cell} text-left`}>Total orders / units</th>{channels.map(channel => <td key={channel} className={cell}>{report.channels[channel]}</td>)}<td className={cell}>{report.orderCount}</td>{report.items.map(item => <td key={item.id} className={cell}>{item.quantity}</td>)}</tr>
      <tr><th scope="row" colSpan={2} className={`${cell} text-left`}>Value at current price (NPR)</th>{channels.map(channel => <td key={channel} className={cell} />)}<td className={cell} />{report.items.map(item => <td key={item.id} className={cell}>{item.currentPrice === null ? '—' : money(item.currentPrice * item.quantity)}</td>)}</tr>
      <tr className="bg-blue-50"><th scope="row" colSpan={2} className={`${cell} text-left`}>Recorded sales (NPR)</th>{channels.map(channel => <td key={channel} className={cell} />)}<td className={cell}>{money(report.salesCents / 100)}</td>{report.items.map(item => <td key={item.id} className={cell}>{money(item.salesCents / 100)}</td>)}</tr></tfoot></table></div>}
  </main>;
}
export default function MonthlySalesPage() { return <PageGuard feature="orderflow"><MonthlySales /></PageGuard>; }
