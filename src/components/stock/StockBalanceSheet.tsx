'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardList, Download, ShoppingCart } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { productLabel } from '@/lib/sub-brands';
import { formatDualDate, getTodayAd } from '@/lib/nepali-calendar';
import { balanceSheet, mergeSheets, type BalanceRow, type StockMovement } from '@/lib/store-stock';
import { canDownload } from '@/lib/download-access';
import { downloadCSV, generateCSV } from '@/lib/csv';

type Period = '7' | '30' | 'MONTH' | '90' | 'ALL' | 'CUSTOM';
const PERIODS: { key: Period; label: string }[] = [
  { key: '7', label: 'Last 7 days' }, { key: '30', label: 'Last 30 days' }, { key: 'MONTH', label: 'This month' },
  { key: '90', label: 'Last 90 days' }, { key: 'ALL', label: 'All time' }, { key: 'CUSTOM', label: 'Dates' },
];
const minus = (ad: string, days: number) => new Date(Date.parse(`${ad}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const bs = (ad: string) => formatDualDate(ad).split(' (')[0];

const STATUS: Record<BalanceRow['status'], { label: string; tone: string }> = {
  NEGATIVE: { label: 'Check', tone: 'bg-amber-100 text-amber-900' },
  OUT: { label: 'Out', tone: 'bg-rose-100 text-rose-800' },
  LOW: { label: 'Low', tone: 'bg-amber-100 text-amber-900' },
  OK: { label: 'OK', tone: 'bg-emerald-50 text-emerald-800' },
  NO_SALES: { label: 'Not moving', tone: 'bg-slate-100 text-slate-600' },
};

const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n < 0 ? `−${Math.abs(n).toLocaleString()}` : '0');

function describe(move: StockMovement) {
  if (move.kind === 'RECEIVED') return { what: 'Delivered', detail: move.ref };
  if (move.kind === 'SOLD') return { what: 'Sold', detail: move.by ? `entered by ${move.by}` : 'sales entry' };
  const by = move.by ? ` by ${move.by}` : '';
  if (move.opening) return { what: 'Opening stock', detail: `counted ${move.counted}${by}` };
  const gap = move.change < 0 ? `: ${-move.change} sold since last record` : move.change > 0 ? `: ${move.change} more than recorded` : ': matches the records';
  return { what: 'Shelf count', detail: `counted ${move.counted}${by}${gap}` };
}

/**
 * A store's stock as a balance sheet: for the chosen period, each product's opening stock, what came
 * in, what was sold, what counts corrected, and what is left. Open a product for its statement.
 */
export default function StockBalanceSheet({ storeIds, title, fileLabel, onCount, onSales, version = 0 }: {
  storeIds: string[];
  title?: string;
  fileLabel: string;
  onCount?: () => void;
  onSales?: () => void;
  version?: number;
}) {
  const today = getTodayAd();
  const [period, setPeriod] = useState<Period>('30');
  const [customFrom, setCustomFrom] = useState(minus(today, 29));
  const [customTo, setCustomTo] = useState(today);
  const [brand, setBrand] = useState('ALL');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const user = db.getCurrentUser();

  const range = useMemo(() => {
    if (period === 'CUSTOM') return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom };
    if (period === 'MONTH') return { from: `${today.slice(0, 8)}01`, to: today };
    if (period === 'ALL') return { from: '2000-01-01', to: today };
    return { from: minus(today, Number(period) - 1), to: today };
  }, [period, customFrom, customTo, today]);

  const products = db.getProducts('ALL');
  const brands = db.getBrands('ALL');
  const sheet = useMemo(() => {
    void version;
    const dispatches = db.getDispatches();
    const secondaryOrders = db.getSecondaryOrders({ allBrands: true });
    const stockCounts = db.getStockCounts();
    const sheets = storeIds.map((storeId) => balanceSheet({ storeId, dispatches, secondaryOrders, stockCounts }, range.from, range.to));
    const merged = mergeSheets(sheets);
    // "All time" starts at the first record, so per-day pace is not spread over years.
    if (period === 'ALL') {
      const first = merged.rows.flatMap((row) => row.movements.map((move) => move.dateAd)).sort()[0];
      if (first) return mergeSheets(storeIds.map((storeId) => balanceSheet({ storeId, dispatches, secondaryOrders, stockCounts }, first, range.to)));
    }
    return merged;
  }, [storeIds.join('|'), range.from, range.to, period, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = (row: BalanceRow) => { const product = products.find((p) => p.id === row.productId); return product ? productLabel(product) : row.productName; };
  const brandName = (code: string) => brands.find((b) => b.code === code)?.name || code;
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = sheet.rows.filter((row) => (brand === 'ALL' || row.brandCode === brand) && words.every((w) => `${name(row)} ${row.productName}`.toLowerCase().includes(w)));
  const totals = rows.reduce((sum, row) => ({ opening: sum.opening + row.opening, received: sum.received + row.received, sold: sum.sold + row.sold, entered: sum.entered + row.soldEntered, byCount: sum.byCount + row.soldByCount, found: sum.found + row.found, closing: sum.closing + row.closing, onOrder: sum.onOrder + row.onOrder }), { opening: 0, received: 0, sold: 0, entered: 0, byCount: 0, found: 0, closing: 0, onOrder: 0 });
  const valueNow = rows.reduce((sum, row) => sum + Math.max(0, row.closing) * (products.find((p) => p.id === row.productId)?.mrp || 0), 0);
  const out = rows.filter((row) => row.status === 'OUT').length;
  const low = rows.filter((row) => row.status === 'LOW').length;
  const check = rows.filter((row) => row.status === 'NEGATIVE').length;
  const brandCodes = [...new Set(sheet.rows.map((row) => row.brandCode))];

  const download = () => {
    const csv = generateCSV<BalanceRow>([
      { key: 'productName', label: 'Product', formatter: (_v, row) => name(row) },
      { key: 'brandCode', label: 'Brand', formatter: (v) => brandName(String(v)) },
      { key: 'opening', label: `Opening ${range.from}` }, { key: 'received', label: 'Received' }, { key: 'sold', label: 'Sold' },
      { key: 'soldEntered', label: 'Sold: entered' }, { key: 'soldByCount', label: 'Sold: from counts' }, { key: 'found', label: 'Found by counts' },
      { key: 'closing', label: `Closing ${range.to}` }, { key: 'onOrder', label: 'On order' },
      { key: 'perDay', label: 'Goes per day' }, { key: 'daysLeft', label: 'Days left' }, { key: 'lastCountAd', label: 'Last counted' },
      { key: 'status', label: 'Status', formatter: (v) => STATUS[v as BalanceRow['status']].label },
    ], rows);
    downloadCSV(csv, `${fileLabel}-stock-${range.from}-to-${range.to}`);
  };

  const num = 'px-3 py-2.5 text-right tabular-nums';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="stock-sheet-title">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 id="stock-sheet-title" className="text-sm font-bold text-slate-900">{title || 'Stock balance sheet'}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Opening + received − sold + found = closing. {bs(range.from)} to {bs(range.to)}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onCount && <button type="button" onClick={onCount} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><ClipboardList className="h-3.5 w-3.5" />Stock on shelf now</button>}
          {onSales && <button type="button" onClick={onSales} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"><ShoppingCart className="h-3.5 w-3.5" />Sold today</button>}
          {canDownload(user) && rows.length > 0 && <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />CSV</button>}
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${period === p.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{p.label}</button>
          ))}
          {period === 'CUSTOM' && (
            <span className="flex flex-wrap items-center gap-1.5 text-xs">
              <input type="date" aria-label="From" value={customFrom} max={today} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" />
              <span className="text-slate-500">to</span>
              <input type="date" aria-label="To" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" />
            </span>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Opening', value: totals.opening.toLocaleString(), tone: 'text-slate-900' },
            { label: 'Received', value: signed(totals.received), tone: 'text-emerald-700' },
            { label: 'Sold', value: totals.sold ? `−${totals.sold.toLocaleString()}` : '0', tone: 'text-slate-900', sub: totals.sold ? `${totals.entered.toLocaleString()} entered · ${totals.byCount.toLocaleString()} from counts` : undefined },
            { label: 'Found by counts', value: totals.found ? `+${totals.found.toLocaleString()}` : '0', tone: 'text-slate-900', sub: 'opening stock, or more than recorded' },
            { label: 'In stock now', value: totals.closing.toLocaleString(), tone: 'text-blue-800', sub: valueNow ? `Rs. ${Math.round(valueNow).toLocaleString()} at MRP` : undefined },
            { label: 'On order', value: totals.onOrder.toLocaleString(), tone: 'text-violet-700', sub: 'not delivered yet' },
          ].map((tile) => (
            <div key={tile.label} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <dt className="text-[11px] font-semibold text-slate-500">{tile.label}</dt>
              <dd className={`text-lg font-black tabular-nums ${tile.tone}`}>{tile.value}</dd>
              {tile.sub && <dd className="text-[11px] text-slate-500">{tile.sub}</dd>}
            </div>
          ))}
        </dl>
        {(out > 0 || low > 0 || check > 0) && (
          <p className="text-xs text-slate-700">
            {[out && <span key="o" className="font-semibold text-rose-700">{out} out of stock</span>, low && <span key="l" className="font-semibold text-amber-700">{low} running low (a week or less)</span>, check && <span key="c" className="font-semibold text-amber-800">{check} below zero: more sold than delivered, so a delivery is missing or a count is due</span>].filter(Boolean).reduce<React.ReactNode[]>((acc, node, i) => (i ? [...acc, ' · ', node] : [node]), [])}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {brandCodes.length > 1 && (
            <select aria-label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
              <option value="ALL">All brands</option>
              {brandCodes.map((code) => <option key={code} value={code}>{brandName(code)}</option>)}
            </select>
          )}
          <input type="search" aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" className="w-48 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
        </div>

        {sheet.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-600">
            No stock recorded here yet. Enter the stock on the shelf to set its opening stock; deliveries and sales then keep it up to date.
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">No products match.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200" tabIndex={0}>
            <table className="w-full min-w-[760px] text-xs">
              <thead className="bg-slate-50 text-[11px] text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold">Product</th>
                  <th className="px-3 py-2 text-right font-semibold">Opening</th>
                  <th className="px-3 py-2 text-right font-semibold">Received</th>
                  <th className="px-3 py-2 text-right font-semibold" title="Entered as sold, plus units gone as found by shelf counts">Sold</th>
                  <th className="px-3 py-2 text-right font-semibold" title="Units a count found above the records: opening stock, an unrecorded delivery, or a miscount">Found</th>
                  <th className="bg-blue-50/70 px-3 py-2 text-right font-bold text-blue-900">Closing</th>
                  <th className="px-3 py-2 text-right font-semibold">On order</th>
                  <th className="px-3 py-2 text-right font-semibold">Goes / day</th>
                  <th className="px-3 py-2 text-right font-semibold">Days left</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const expanded = open === row.productId;
                  return (
                    <React.Fragment key={row.productId}>
                      <tr className={`hover:bg-slate-50/70 ${expanded ? 'bg-slate-50/70' : ''}`}>
                        <td className={`sticky left-0 z-10 max-w-[240px] px-3 py-2.5 ${expanded ? 'bg-slate-50' : 'bg-white'}`}>
                          <button type="button" onClick={() => setOpen(expanded ? null : row.productId)} aria-expanded={expanded} className="flex items-start gap-1.5 text-left">
                            {expanded ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />}
                            <span className="min-w-0"><span className="block font-semibold leading-snug text-slate-900">{name(row)}</span><span className="text-[11px] text-slate-500">{brandName(row.brandCode)}{row.lastCountAd ? ` · counted ${bs(row.lastCountAd)}` : ' · never counted'}</span></span>
                          </button>
                        </td>
                        <td className={`${num} text-slate-600`}>{row.opening.toLocaleString()}</td>
                        <td className={`${num} ${row.received ? 'font-semibold text-emerald-700' : 'text-slate-400'}`}>{row.received ? `+${row.received.toLocaleString()}` : '–'}</td>
                        <td className={`${num} ${row.sold ? 'font-semibold text-slate-900' : 'text-slate-400'}`} title={row.sold ? `${row.soldEntered} entered, ${row.soldByCount} from counts` : undefined}>{row.sold ? `−${row.sold.toLocaleString()}` : '–'}</td>
                        <td className={`${num} ${row.found ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>{row.found ? `+${row.found.toLocaleString()}` : '–'}</td>
                        <td className={`${num} bg-blue-50/40 text-sm font-black ${row.closing < 0 ? 'text-amber-800' : row.closing === 0 ? 'text-rose-700' : 'text-blue-900'}`}>{row.closing.toLocaleString()}</td>
                        <td className={`${num} ${row.onOrder ? 'font-semibold text-violet-700' : 'text-slate-400'}`}>{row.onOrder || '–'}</td>
                        <td className={`${num} text-slate-600`}>{row.perDay === null ? '–' : row.perDay}</td>
                        <td className={`${num} ${row.daysLeft !== null && row.daysLeft <= 7 ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>{row.daysLeft === null ? '–' : row.daysLeft}</td>
                        <td className="px-3 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[row.status].tone}`}>{STATUS[row.status].label}</span></td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={10} className="bg-slate-50/70 px-3 pb-3 pt-0">
                            {row.movements.length === 0 ? (
                              <p className="rounded-lg bg-white p-3 text-[11px] text-slate-500">No movements in this period. Opening and closing are both {row.closing}.</p>
                            ) : (
                              <table className="w-full rounded-lg bg-white text-[11px]">
                                <thead className="text-slate-500"><tr><th className="px-3 py-1.5 text-left font-semibold">Date</th><th className="px-3 py-1.5 text-left font-semibold">What</th><th className="px-3 py-1.5 text-right font-semibold">In</th><th className="px-3 py-1.5 text-right font-semibold">Out</th><th className="px-3 py-1.5 text-right font-semibold">Balance</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                  <tr className="text-slate-500"><td className="px-3 py-1.5">{bs(sheet.from)}</td><td className="px-3 py-1.5">Opening balance</td><td /><td /><td className="px-3 py-1.5 text-right font-semibold tabular-nums">{row.opening}</td></tr>
                                  {row.movements.map((move, i) => {
                                    const d = describe(move);
                                    return (
                                      <tr key={i}>
                                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{bs(move.dateAd)}</td>
                                        <td className="px-3 py-1.5"><span className="font-semibold text-slate-800">{d.what}</span> <span className="text-slate-500">{d.detail}</span></td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{move.change > 0 ? `+${move.change}` : ''}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-800">{move.change < 0 ? `−${Math.abs(move.change)}` : ''}</td>
                                        <td className="px-3 py-1.5 text-right font-bold tabular-nums text-slate-900">{move.balanceAfter}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <tr>
                  <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-slate-900">Total ({rows.length} {rows.length === 1 ? 'product' : 'products'})</td>
                  <td className={num}>{totals.opening.toLocaleString()}</td>
                  <td className={`${num} text-emerald-700`}>{totals.received ? `+${totals.received.toLocaleString()}` : '–'}</td>
                  <td className={num}>{totals.sold ? `−${totals.sold.toLocaleString()}` : '–'}</td>
                  <td className={num}>{totals.found ? `+${totals.found.toLocaleString()}` : '–'}</td>
                  <td className={`${num} bg-blue-50/70 text-sm text-blue-900`}>{totals.closing.toLocaleString()}</td>
                  <td className={`${num} text-violet-700`}>{totals.onOrder || '–'}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
