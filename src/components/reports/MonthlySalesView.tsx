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

interface SheetColumn { key: string; label: React.ReactNode; title: string; width: number; align?: 'left'; tint?: boolean; day: (day: MonthlySalesData['days'][number]) => React.ReactNode; foot: (row: number) => React.ReactNode }
interface SheetLayout { frozenRows: number; frozenCols: number; pinTotals: boolean; hidden: string[]; widths: Record<string, number> }
const LAYOUT_KEY = 'bb_monthly_sheet_layout_v1';
const DEFAULT_LAYOUT: SheetLayout = { frozenRows: 1, frozenCols: 1, pinTotals: false, hidden: [], widths: {} };
const readLayout = (): SheetLayout => { try { return { ...DEFAULT_LAYOUT, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') }; } catch { return DEFAULT_LAYOUT; } };

/**
 * The monthly sheet with spreadsheet controls: freeze rows and columns, pin the totals,
 * hide columns and drag column edges to resize. The layout is remembered on this device.
 */
export function MonthlySalesTable({ report, showMoney = true }: { report: MonthlySalesData; showMoney?: boolean }) {
  const channels = reportChannels(report);
  const [layout, setLayoutState] = React.useState<SheetLayout>(DEFAULT_LAYOUT);
  const [menu, setMenu] = React.useState(false);
  React.useEffect(() => { setLayoutState(readLayout()); }, []);
  const setLayout = (patch: Partial<SheetLayout>) => setLayoutState((current) => { const next = { ...current, ...patch }; try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch { /* stays for this visit */ } return next; });

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

  const all: SheetColumn[] = [
    { key: 'date', label: 'Date', title: 'Date', width: 124, align: 'left', day: (d) => d.date, foot: (r) => footer[r][0] },
    { key: 'day', label: 'Day', title: 'Day', width: 48, align: 'left', day: (d) => d.day, foot: () => '' },
    { key: 'sale', label: 'Sale running', title: 'Sale running', width: 120, align: 'left', day: (d) => <span className="text-[11px] text-emerald-800">{d.sales.join(' + ')}</span>, foot: () => '' },
    ...channels.map((channel, i): SheetColumn => ({ key: `ch:${channel}`, label: channel, title: channel, width: 76, day: (d) => d.channels[channel] || '–', foot: (r) => footer[r][1][i] })),
    { key: 'orders', label: 'Orders placed', title: 'Orders placed', width: 82, tint: true, day: (d) => <strong>{d.orderCount || '–'}</strong>, foot: (r) => footer[r][2] },
    { key: 'cancelled', label: 'Cancelled', title: 'Cancelled', width: 72, day: (d) => d.cancelled || '–', foot: (r) => footer[r][3] },
    ...(showMoney ? [{ key: 'net', label: 'Net sales (NPR)', title: 'Net sales (NPR)', width: 104, tint: true, day: (d: MonthlySalesData['days'][number]) => <strong>{d.netCents ? money(d.netCents / 100) : '–'}</strong>, foot: (r: number) => footer[r][4] } as SheetColumn] : []),
    ...report.items.map((item, i): SheetColumn => ({ key: `it:${item.id}`, label: <>{item.name}<span className="mt-1 block text-[11px] font-normal text-slate-500">{item.kind}</span></>, title: item.name, width: 104, day: (d) => d.quantities[item.id] || '–', foot: (r) => footer[r][5][i] })),
  ];
  const columns = all.filter((column) => column.key === 'date' || !layout.hidden.includes(column.key));
  const widthOf = (column: SheetColumn) => layout.widths[column.key] || column.width;
  const frozenCols = Math.min(layout.frozenCols, columns.length);
  const lefts: number[] = []; columns.reduce((x, column, i) => { lefts[i] = x; return x + widthOf(column); }, 0);
  const total = columns.reduce((sum, column) => sum + widthOf(column), 0);

  // Measured heights, so frozen rows stack exactly under the header.
  const headRef = React.useRef<HTMLTableRowElement>(null);
  const rowRefs = React.useRef<(HTMLTableRowElement | null)[]>([]);
  const footRefs = React.useRef<(HTMLTableRowElement | null)[]>([]);
  const [heights, setHeights] = React.useState<{ head: number; rows: number[]; foot: number[] }>({ head: 40, rows: [], foot: [] });
  React.useLayoutEffect(() => {
    setHeights({ head: headRef.current?.offsetHeight || 40, rows: rowRefs.current.slice(0, 12).map((row) => row?.offsetHeight || 28), foot: footRefs.current.map((row) => row?.offsetHeight || 30) });
  }, [layout, report]);
  const frozenDays = Math.max(0, layout.frozenRows - 1);
  const topOf = (index: number) => heights.head + heights.rows.slice(0, index).reduce((a, b) => a + b, 0);

  const resize = (column: SheetColumn, event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX, startW = widthOf(column);
    const move = (e: PointerEvent) => setLayoutState((current) => ({ ...current, widths: { ...current.widths, [column.key]: Math.max(44, Math.min(400, Math.round(startW + e.clientX - startX))) } }));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setLayoutState((current) => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(current)); } catch { /* ignore */ } return current; }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const base = 'border-b border-r border-slate-200 px-1.5 text-xs tabular-nums';
  const colStyle = (i: number, z: number): React.CSSProperties => i < frozenCols ? { position: 'sticky', left: lefts[i], zIndex: z } : {};
  const frozenEdge = (i: number) => i === frozenCols - 1 ? 'shadow-[2px_0_0_0_rgb(148_163_184)]' : '';
  const select = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5 font-semibold text-slate-600">Freeze rows
          <select className={select} value={layout.frozenRows} onChange={(e) => setLayout({ frozenRows: Number(e.target.value) })}>
            <option value={0}>No rows</option><option value={1}>Header</option>
            {[1, 2, 3, 5, 7].filter((n) => n <= report.days.length).map((n) => <option key={n} value={n + 1}>Header + {n} day{n === 1 ? '' : 's'}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 font-semibold text-slate-600">Freeze columns
          <select className={select} value={frozenCols} onChange={(e) => setLayout({ frozenCols: Number(e.target.value) })}>
            <option value={0}>No columns</option>
            {columns.slice(0, 8).map((column, i) => <option key={column.key} value={i + 1}>Up to {column.title}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 font-semibold text-slate-600"><input type="checkbox" checked={layout.pinTotals} onChange={(e) => setLayout({ pinTotals: e.target.checked })} />Pin totals at the bottom</label>
        <div className="relative">
          <button type="button" aria-expanded={menu} onClick={() => setMenu((open) => !open)} className={select}>Columns{layout.hidden.length ? ` (${layout.hidden.length} hidden)` : ''}</button>
          {menu && (
            <div className="absolute left-0 top-full z-40 mt-1 max-h-80 w-64 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              {all.slice(1).map((column) => (
                <label key={column.key} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-50">
                  <input type="checkbox" checked={!layout.hidden.includes(column.key)} onChange={(e) => setLayout({ hidden: e.target.checked ? layout.hidden.filter((key) => key !== column.key) : [...layout.hidden, column.key] })} />
                  <span className="truncate">{column.title}</span>
                </label>
              ))}
              <button type="button" onClick={() => { setLayout({ hidden: [] }); setMenu(false); }} className="mt-1 w-full rounded-md px-2 py-1 text-left font-semibold text-blue-700 hover:bg-blue-50">Show all columns</button>
            </div>
          )}
        </div>
        <button type="button" onClick={() => setLayout(DEFAULT_LAYOUT)} className="font-semibold text-slate-500 hover:text-blue-700">Reset layout</button>
        <span className="text-[11px] text-slate-400">Drag a column&apos;s right edge to resize. Saved on this device.</span>
      </div>
      <div tabIndex={0} role="region" aria-label="Monthly sales sheet" className="max-h-[calc(100dvh-14rem)] min-h-[320px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-blue-600">
        <table className="table-fixed border-separate border-spacing-0" style={{ width: total }} aria-label="Daily monthly sales report">
          <colgroup>{columns.map((column) => <col key={column.key} style={{ width: widthOf(column) }} />)}</colgroup>
          <thead><tr ref={headRef}>
            {columns.map((column, i) => (
              <th key={column.key} scope="col" title={column.title}
                className={`${base} relative bg-slate-50 py-2 text-left align-bottom text-[11px] font-bold leading-tight text-slate-700 break-words ${column.tint ? 'bg-blue-50' : ''} ${frozenEdge(i)}`}
                style={{ ...(layout.frozenRows > 0 ? { position: 'sticky', top: 0, zIndex: i < frozenCols ? 30 : 20 } : {}), ...colStyle(i, layout.frozenRows > 0 ? 30 : 15) }}>
                {column.label}
                <span role="separator" aria-orientation="vertical" aria-label={`Resize ${column.title}`} onPointerDown={(e) => resize(column, e)} onDoubleClick={() => setLayout({ widths: Object.fromEntries(Object.entries(layout.widths).filter(([key]) => key !== column.key)) })}
                  className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none hover:bg-blue-400/40" />
              </th>
            ))}
          </tr></thead>
          <tbody>{report.days.map((day, r) => {
            const frozenRow = r < frozenDays;
            return (
              <tr key={day.date} ref={(el) => { rowRefs.current[r] = el; }}>
                {columns.map((column, i) => {
                  const Tag = i === 0 ? 'th' : 'td';
                  return (
                    <Tag key={column.key} {...(i === 0 ? { scope: 'row' } : {})}
                      className={`${base} py-1 whitespace-nowrap overflow-hidden text-ellipsis ${column.align === 'left' ? 'text-left' : 'text-right'} ${i === 0 ? 'font-medium' : ''} ${column.tint ? 'bg-blue-50' : day.sales.length ? 'bg-emerald-50' : 'bg-white'} text-slate-700 ${frozenEdge(i)} ${frozenRow && r === frozenDays - 1 ? 'shadow-[0_2px_0_0_rgb(148_163_184)]' : ''}`}
                      style={{ ...(frozenRow ? { position: 'sticky', top: topOf(r), zIndex: i < frozenCols ? 25 : 18 } : {}), ...colStyle(i, frozenRow ? 25 : 10) }}>
                      {column.day(day)}
                    </Tag>
                  );
                })}
              </tr>
            );
          })}</tbody>
          <tfoot>
            {footer.map(([label], r) => (
              <tr key={label} ref={(el) => { footRefs.current[r] = el; }}>
                {columns.map((column, i) => (
                  <td key={column.key} className={`${base} py-1 font-semibold ${i === 0 ? 'text-left whitespace-normal' : 'text-right'} ${showMoney && r === footer.length - 1 ? 'bg-blue-50' : 'bg-slate-50'} ${frozenEdge(i)}`}
                    style={{ ...(layout.pinTotals ? { position: 'sticky', bottom: heights.foot.slice(r + 1).reduce((a, b) => a + b, 0), zIndex: i < frozenCols ? 25 : 18 } : {}), ...colStyle(i, layout.pinTotals ? 25 : 10) }}>
                    {column.foot(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
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
