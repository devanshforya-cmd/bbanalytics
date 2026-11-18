'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import { db } from '@/lib/db/db-service';
import { canAccessBrand } from '@/lib/permissions';
import { getTodayAd } from '@/lib/nepali-calendar';
import { buildMonthlySalesReport } from '@/lib/monthly-sales-report';
import { MonthlySalesBreakdown, MonthlySalesCards, MonthlySalesTable, monthlySalesCsv } from '@/components/reports/MonthlySalesView';
import { downloadCSV } from '@/lib/csv';
import InfoTip from '@/components/common/InfoTip';

const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

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
  const exportReport = () => { if (report) downloadCSV(monthlySalesCsv(report), `monthly-sales-${brand}-${start}-to-${end}.csv`); };
  return <main className="mx-auto max-w-[1800px] space-y-5 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-1.5 text-2xl font-bold text-slate-900">Monthly sales sheet<InfoTip label="About this sheet">Orders placed by day and channel, units sold per product, and money from MRP to net: sale and offer discounts, then one-off customer discounts. Cancelled orders are counted as placed but add no sales. Exchange replacements and marketing sends are left out. Free gifts are counted apart.</InfoTip></h1></div>
      {report && <MonthlySalesCards report={report} />}</div>
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
    {report && <MonthlySalesTable report={report} />}
    {report && <MonthlySalesBreakdown report={report} linkSales />}
  </main>;
}
export default function MonthlySalesPage() { return <PageGuard feature="orderflow"><MonthlySales /></PageGuard>; }
