'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Search } from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import InfoTip from '@/components/common/InfoTip';
import ShelfCountSheet, { type CountTarget } from '@/components/stock/ShelfCountSheet';
import { db } from '@/lib/db/db-service';
import { getScope } from '@/lib/permissions';
import { formatDualDate } from '@/lib/nepali-calendar';
import { storeStockStatus } from '@/lib/stock-count-sheet';
import { shelfForecast } from '@/lib/store-records';
import { productLabel } from '@/lib/sub-brands';

/** A store counted longer ago than this is due for a count. */
const DUE_AFTER_DAYS = 14;
type Filter = 'ALL' | 'OUT' | 'LOW' | 'DUE' | 'NEVER';

const todayAd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });

export default function StockCountsPage() {
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [officer, setOfficer] = useState('ALL');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<CountTarget | null>(null);
  const [openCount, setOpenCount] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setVersion((n) => n + 1);
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  const user = db.getCurrentUser();
  const scope = getScope(user, 'stock_counts');
  const today = todayAd();

  const data = useMemo(() => {
    void version;
    const counts = db.getStockCounts();
    const orders = db.getSecondaryOrders({ allBrands: true });
    const stores = [
      ...db.getRetailers().map((r) => ({ id: r.id, name: r.name, entityType: 'RETAILER' as const, area: [r.area, r.city].filter(Boolean).join(', '), officerId: r.assignedOfficerId, officerName: r.assignedOfficerName, kind: 'Retailer' })),
      ...db.getBranches().map((b) => ({ id: b.id, name: b.name, entityType: 'BRANCH' as const, area: [b.area, b.city].filter(Boolean).join(', '), officerId: b.assignedOfficerId, officerName: b.assignedOfficerName, kind: 'Chain branch' })),
    ].filter((store) => scope !== 'OWN' || store.officerId === user.id);
    const rows = stores.map((store) => ({ ...store, status: storeStockStatus(store.id, counts, orders, today) }));
    const storeIds = new Set(stores.map((store) => store.id));
    const recent = counts.filter((count) => storeIds.has(count.entityId))
      .sort((a, b) => (b.dateAd || b.createdAt).localeCompare(a.dateAd || a.createdAt)).slice(0, 25);
    return { rows, recent, counts, orders };
  }, [version, scope, user.id, today]);

  const isDue = (row: (typeof data.rows)[number]) => row.status.daysSinceCount === null || row.status.daysSinceCount > DUE_AFTER_DAYS;
  const tally = {
    OUT: data.rows.filter((row) => row.status.outOfStock > 0).length,
    LOW: data.rows.filter((row) => row.status.runningLow > 0).length,
    DUE: data.rows.filter(isDue).length,
    NEVER: data.rows.filter((row) => row.status.daysSinceCount === null).length,
    WEEK: data.counts.filter((count) => (count.dateAd || '') >= new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10)).length,
  };
  const officers = [...new Map(data.rows.filter((row) => row.officerId).map((row) => [row.officerId, row.officerName || 'Not named'])).entries()];
  const shown = data.rows
    .filter((row) => filter === 'ALL' || (filter === 'OUT' ? row.status.outOfStock > 0 : filter === 'LOW' ? row.status.runningLow > 0 : filter === 'DUE' ? isDue(row) : row.status.daysSinceCount === null))
    .filter((row) => officer === 'ALL' || row.officerId === officer)
    .filter((row) => !search.trim() || `${row.name} ${row.area}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => b.status.outOfStock - a.status.outOfStock || b.status.runningLow - a.status.runningLow || (b.status.daysSinceCount ?? 9999) - (a.status.daysSinceCount ?? 9999));

  const products = db.getProducts('ALL');
  const chip = (key: Filter, label: string, count?: number) => (
    <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
      {label}{count !== undefined ? ` (${count})` : ''}
    </button>
  );

  return (
    <PageGuard feature="stock_counts">
      <div className="space-y-6 pb-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Stock counts
              <InfoTip label="About this page">Shelf counts at every store. A store is due for a count after {DUE_AFTER_DAYS} days. Running low means about a week of stock or less at the current selling pace.</InfoTip>
            </h1>
            <p className="mt-1 text-sm text-slate-500">Count a store&apos;s shelf, see who is out of stock, and which stores haven&apos;t been counted lately.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Stores with something out of stock', value: tally.OUT, tone: 'text-rose-700', key: 'OUT' as Filter },
            { label: 'Stores running low', value: tally.LOW, tone: 'text-amber-700', key: 'LOW' as Filter },
            { label: `Due for a count (over ${DUE_AFTER_DAYS} days or never)`, value: tally.DUE, tone: 'text-slate-900', key: 'DUE' as Filter },
            { label: 'Counts in the last 7 days', value: tally.WEEK, tone: 'text-blue-700', key: null },
          ].map((tile) => (
            <button key={tile.label} type="button" disabled={!tile.key} onClick={() => tile.key && setFilter(tile.key)}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs enabled:hover:border-slate-300">
              <div className={`text-2xl font-black ${tile.tone}`}>{tile.value}</div>
              <div className="mt-1 text-xs text-slate-500">{tile.label}</div>
            </button>
          ))}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {chip('ALL', 'All stores', data.rows.length)}
              {chip('OUT', 'Out of stock', tally.OUT)}
              {chip('LOW', 'Running low', tally.LOW)}
              {chip('DUE', 'Due for a count', tally.DUE)}
              {chip('NEVER', 'Never counted', tally.NEVER)}
            </div>
            <div className="flex gap-2">
              {scope !== 'OWN' && officers.length > 1 && (
                <select aria-label="Officer" value={officer} onChange={(e) => setOfficer(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs">
                  <option value="ALL">All officers</option>
                  {officers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              )}
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input aria-label="Search stores" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Store or area"
                  className="w-44 rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-blue-400" />
              </label>
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">{data.rows.length ? 'No stores match these filters.' : 'No stores yet. Add stores in Stores & branches.'}</p>
          ) : (
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500">
                    <th className="p-3 font-semibold">Store</th>
                    <th className="p-3 font-semibold">Officer</th>
                    <th className="p-3 font-semibold">Last counted</th>
                    <th className="p-3 text-center font-semibold">Out of stock</th>
                    <th className="p-3 text-center font-semibold">Running low</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="p-3">
                        <Link href={`/offline-sales/stores/${row.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline">{row.name}</Link>
                        <div className="text-[11px] text-slate-500">{[row.kind, row.area].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="p-3 text-slate-600">{row.officerName || 'Not assigned'}</td>
                      <td className="p-3">
                        {row.status.lastCountAd ? (
                          <span className={isDue(row) ? 'font-semibold text-amber-700' : 'text-slate-700'}>
                            {formatDualDate(row.status.lastCountAd).split(' (')[0]}
                            <span className="block text-[11px] font-normal text-slate-500">{row.status.daysSinceCount === 0 ? 'today' : `${row.status.daysSinceCount} days ago`}</span>
                          </span>
                        ) : <span className="font-semibold text-amber-700">Never</span>}
                      </td>
                      <td className="p-3 text-center">{row.status.outOfStock ? <span className="rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-700">{row.status.outOfStock}</span> : <span className="text-slate-400">–</span>}</td>
                      <td className="p-3 text-center">{row.status.runningLow ? <span className="rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-700">{row.status.runningLow}</span> : <span className="text-slate-400">–</span>}</td>
                      <td className="p-3 text-right">
                        <button type="button" onClick={() => setTarget({ storeId: row.id, storeName: row.name, entityType: row.entityType })}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"><ClipboardList className="h-3.5 w-3.5 text-blue-600" /> Count</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900">Recent counts</h2>
          {data.recent.length === 0 ? <p className="mt-2 text-sm text-slate-500">No counts yet.</p> : (
            <ul className="mt-3 divide-y divide-slate-100">
              {data.recent.map((count) => {
                const open = openCount === count.id;
                const forecast = open ? shelfForecast(data.counts.filter((c) => c.entityId === count.entityId), data.orders.filter((o) => o.entityId === count.entityId && o.status !== 'CANCELLED')) : [];
                const out = count.items.filter((item) => item.shelfQty === 0).length;
                return (
                  <li key={count.id} className="py-2.5">
                    <button type="button" onClick={() => setOpenCount(open ? null : count.id)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{count.storeName}</span>
                        <span className="text-[11px] text-slate-500">{count.dateBs || count.dateAd} · {count.officerName || 'not recorded'} · {count.items.length} {count.items.length === 1 ? 'product' : 'products'}{out ? ` · ${out} out of stock` : ''}</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-blue-700">{open ? 'Hide' : 'Show'}</span>
                    </button>
                    {open && (
                      <table className="mt-2 w-full text-left text-xs">
                        <thead><tr className="text-[11px] text-slate-500"><th className="py-1 font-semibold">Product</th><th className="py-1 text-right font-semibold">Shelf</th><th className="py-1 text-right font-semibold">Before</th><th className="py-1 text-right font-semibold">Sells a day</th></tr></thead>
                        <tbody className="divide-y divide-slate-50">
                          {count.items.map((item) => {
                            const product = products.find((p) => p.id === item.productId);
                            const pace = forecast.find((row) => row.productId === item.productId)?.perDay;
                            return (
                              <tr key={item.productId}>
                                <td className="py-1.5 text-slate-800">{product ? productLabel(product) : item.productName}</td>
                                <td className={`py-1.5 text-right font-bold ${item.shelfQty === 0 ? 'text-rose-700' : 'text-slate-900'}`}>{item.shelfQty}</td>
                                <td className="py-1.5 text-right text-slate-500">{item.previousQty}</td>
                                <td className="py-1.5 text-right text-slate-500">{pace == null ? '–' : pace}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <ShelfCountSheet target={target} onSaved={() => setVersion((n) => n + 1)} onClose={() => setTarget(null)} />
    </PageGuard>
  );
}
