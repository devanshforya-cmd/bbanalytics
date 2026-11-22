'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, X } from 'lucide-react';
import { recordsBehind, type Query } from '@/lib/metrics/engine';
import type { Prepared } from '@/lib/metrics/sources';
import { downloadWorkbook } from '@/lib/export/xlsx';
import { canDownload } from '@/lib/download-access';
import { canSeeSensitive } from '@/lib/permissions';
import { db } from '@/lib/db/db-service';

/** The records behind a number, bar or row, with a link to each and an Excel download. */
export default function RecordsDialog({ prepared, query, title, subtitle, only, onClose }: {
  prepared: Prepared; query: Query; title: string; subtitle: string; only?: { group?: string; bucket?: string }; onClose: () => void;
}) {
  const user = db.getCurrentUser();
  const { lines, noun, money } = recordsBehind(prepared, query, only);
  const showMoney = money && canSeeSensitive(user, 's.money');
  const [limit, setLimit] = useState(100);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = () => downloadWorkbook([{
    name: 'Records', intro: [['Number', title], ['Showing', subtitle]],
    columns: [{ header: 'Date' }, { header: 'Record', width: 40 }, { header: 'Details', width: 60 }, ...(showMoney ? [{ header: 'Amount (NPR)', type: 'money' as const }] : [])],
    rows: lines.map((line) => [line.date, line.title, line.detail, ...(showMoney ? [line.amount ?? null] : [])]),
  }], `${title.replace(/[^\w -]+/g, '').slice(0, 40) || 'records'}.xlsx`, { title });

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="records-title" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="records-title" className="text-base font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle} · {lines.length} {noun}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canDownload(user) && lines.length > 0 && <button type="button" onClick={download} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" aria-hidden="true" /> Excel</button>}
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {!lines.length ? <p className="px-3 py-10 text-center text-sm text-slate-500">No {noun} behind this number.</p> : (
            <ul className="divide-y divide-slate-100">
              {lines.slice(0, limit).map((line) => (
                <li key={line.id}>
                  <Link href={line.href || '#'} className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{line.title}</span>
                      <span className="block truncate text-xs text-slate-500">{line.detail}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-slate-500">
                      {line.date}
                      {showMoney && line.amount !== undefined && <span className="block font-semibold tabular-nums text-slate-800">NPR {Math.round(line.amount).toLocaleString('en-IN')}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {lines.length > limit && <button type="button" onClick={() => setLimit((n) => n + 200)} className="mx-3 my-2 text-xs font-semibold text-blue-700 hover:underline">Show {Math.min(200, lines.length - limit)} more</button>}
        </div>
      </div>
    </div>
  );
}
