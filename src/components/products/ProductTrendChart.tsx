'use client';

import React, { useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import { productMonthlyTrend, type CalendarMode, type ProductMetricsInput } from '@/lib/product-metrics';

const CALENDAR_KEY = 'bb_trend_calendar_v1';

function readMode(): CalendarMode {
  try { return window.localStorage.getItem(CALENDAR_KEY) === 'AD' ? 'AD' : 'BS'; } catch { return 'BS'; }
}

/** Units sold per month for one product: online and store sales stacked, returns noted under each month. */
export default function ProductTrendChart({ productId, input }: { productId: string; input: ProductMetricsInput }) {
  const [mode, setMode] = useState<CalendarMode>(() => (typeof window === 'undefined' ? 'BS' : readMode()));
  const todayAd = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
  const points = useMemo(() => productMonthlyTrend(productId, input, { mode, todayAd }), [productId, input, mode, todayAd]);

  const choose = (next: CalendarMode) => {
    setMode(next);
    try { window.localStorage.setItem(CALENDAR_KEY, next); } catch { /* storage unavailable */ }
  };

  const totals = points.map((point) => point.d2c + point.b2b);
  const max = Math.max(1, ...totals);
  const sum = totals.reduce((a, b) => a + b, 0);
  const sold = points.filter((point) => point.d2c + point.b2b > 0);
  const best = sold.length ? sold.reduce((a, b) => (b.d2c + b.b2b > a.d2c + a.b2b ? b : a)) : null;
  const averaged = sold.length ? Math.round(sum / sold.length) : 0;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            Units sold, last 12 months
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Online orders and store orders, including units sold inside combos. Cancelled orders, exchanges and free gifts are left out.
          </p>
        </div>
        <div role="group" aria-label="Calendar" className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
          {(['BS', 'AD'] as const).map((option) => (
            <button key={option} type="button" aria-pressed={mode === option} onClick={() => choose(option)}
              className={`rounded-md px-3 py-1 transition-colors ${mode === option ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
              {option === 'BS' ? 'Nepali (BS)' : 'English (AD)'}
            </button>
          ))}
        </div>
      </div>

      {sum === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">No units of this product sold in the last 12 months.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-purple-600" />Online (D2C)</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-600" />Stores (B2B)</span>
            <span className="ml-auto text-slate-500">
              {best && <>Best month <strong className="text-slate-800">{best.longLabel}</strong> ({best.d2c + best.b2b} units) · </>}
              {averaged} a month on average
            </span>
          </div>
          <div className="grid grid-cols-12 gap-1 sm:gap-2 pt-1">
            {points.map((point) => {
              const total = point.d2c + point.b2b;
              const label = `${point.longLabel}: ${total} units (${point.d2c} online, ${point.b2b} in stores)${point.returned ? `, ${point.returned} returned` : ''}`;
              return (
                <div key={point.key} className="flex flex-col items-center min-w-0" title={label} aria-label={label}>
                  <span className="text-[10px] font-bold text-slate-700 font-mono mb-1">{total || ''}</span>
                  <div className={`w-full h-24 flex flex-col justify-end rounded-t bg-slate-50 ${point.current ? 'ring-2 ring-blue-200' : ''}`}>
                    {point.b2b > 0 && <div className="w-full bg-brand-600 first:rounded-t" style={{ height: `${(point.b2b / max) * 100}%` }} />}
                    {point.d2c > 0 && <div className="w-full bg-purple-600 first:rounded-t" style={{ height: `${(point.d2c / max) * 100}%` }} />}
                  </div>
                  <span className={`text-[10px] mt-1.5 font-bold truncate ${point.current ? 'text-blue-700' : 'text-slate-500'}`}>{point.label}</span>
                  <span className="text-[9px] text-amber-700 h-3">{point.returned ? `↩${point.returned}` : ''}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">↩ marks units returned or exchanged that month. The current month is outlined and still filling up.</p>
        </>
      )}
    </div>
  );
}
