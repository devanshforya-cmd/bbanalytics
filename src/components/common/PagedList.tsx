'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const SIZES = [25, 50, 100];

/**
 * Shows a long list one page at a time, so a page never turns into a scroll inside a scroll.
 * Drop-in for `items.map(render)`: `<PagedList items={items} render={(page) => page.map(render)} />`.
 * In a table body pass `asRow` (with the table's column count if you know it) so the page
 * controls sit in a row of their own. Goes back to page 1 when the list changes (a new filter).
 */
export default function PagedList<T>({ items, render, asRow = false, columns = 99, pageSize = 25, label = 'items' }: {
  items: T[];
  render: (page: T[]) => React.ReactNode;
  asRow?: boolean;
  columns?: number;
  pageSize?: number;
  label?: string;
}) {
  const [size, setSize] = useState(pageSize);
  const [page, setPage] = useState(1);
  const anchor = useRef<HTMLElement | null>(null);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const first = items[0] as unknown as { id?: string } | undefined;
  const signature = `${items.length}:${first && typeof first === 'object' ? first.id ?? '' : ''}`;

  useEffect(() => { setPage(1); }, [signature, size]);
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  const slice = items.length > size ? items.slice(start, start + size) : items;

  const go = (next: number) => {
    setPage(Math.max(1, Math.min(pages, next)));
    // Bring the top of the list back into view, so the new page starts where the eye is.
    requestAnimationFrame(() => {
      const target = anchor.current?.closest('table') || anchor.current?.parentElement;
      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  };

  const controls = items.length > SIZES[0] || items.length > size ? (
    <nav aria-label={`Pages of ${label}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[13px] text-slate-600">
      <span className="tabular-nums">
        {start + 1}–{Math.min(start + size, items.length)} of {items.length.toLocaleString()} {label}
      </span>
      <div className="flex items-center gap-1">
        <label className="mr-2 flex items-center gap-1.5 text-xs text-slate-500">
          Show
          <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-8 rounded-lg border border-black/[0.08] bg-white px-2 text-[13px] text-slate-800">
            {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => go(current - 1)} disabled={current === 1} aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
        {pageNumbers(current, pages).map((n, i) => n === 0
          ? <span key={`gap${i}`} className="px-1 text-slate-400">…</span>
          : <button key={n} type="button" onClick={() => go(n)} aria-current={n === current ? 'page' : undefined}
              className={`h-8 min-w-8 rounded-lg px-2 tabular-nums ${n === current ? 'bg-blue-600 font-medium text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{n}</button>)}
        <button type="button" onClick={() => go(current + 1)} disabled={current === pages} aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </nav>
  ) : null;

  if (asRow) {
    return (
      <>
        {render(slice)}
        {controls && <tr ref={(el) => { anchor.current = el; }} className="bb-pager-row"><td colSpan={columns} className="px-3">{controls}</td></tr>}
      </>
    );
  }
  return (
    <>
      {render(slice)}
      {controls && <div ref={(el) => { anchor.current = el; }} className="col-span-full w-full">{controls}</div>}
    </>
  );
}

/** 1 … 4 5 6 … 20, with 0 marking a gap. */
function pageNumbers(current: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, current - 1, current, current + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: number[] = [];
  sorted.forEach((n, i) => { if (i && n - sorted[i - 1] > 1) out.push(0); out.push(n); });
  return out;
}
