'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { adToBs, bsToAd, BS_MONTH_DAYS, NEPALI_MONTHS } from '@/lib/nepali-calendar';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';

const BS_YEARS = Object.keys(BS_MONTH_DAYS).map(Number).sort((a, b) => a - b);

function toLocalAd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** "Mangsir 2, 2083" for a YYYY-MM-DD date, or an empty string. */
export function bsLabel(dateAd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateAd || '')) return '';
  const [y, m, d] = dateAd.split('-').map(Number);
  const bs = adToBs(new Date(y, m - 1, d));
  return `${bs.monthName} ${bs.day}, ${bs.year}`;
}

export function adLabel(dateAd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateAd || '')) return '';
  const [y, m, d] = dateAd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface DualDateFieldProps {
  id: string;
  label: string;
  /** YYYY-MM-DD, or '' when optional and empty. */
  valueAd: string;
  /** Both calendars are always returned so both can be stored. */
  onChange: (dateAd: string, dateBs: string) => void;
  required?: boolean;
  minAd?: string;
  maxAd?: string;
  error?: string;
  helper?: string;
  allowClear?: boolean;
}

/**
 * One date, entered in BS or AD. The toggle starts on the user's chosen
 * calendar, and the other calendar's date is always shown underneath.
 */
export default function DualDateField({ id, label, valueAd, onChange, required, minAd, maxAd, error, helper, allowClear }: DualDateFieldProps) {
  const { preference, scope } = useCalendarPreference();
  // Online (D2C) and marketing forms use AD only; both dates are still stored for exports and BS views.
  const adOnly = scope === 'D2C';
  const [chosenMode, setMode] = useState<'BS' | 'AD'>('BS');
  const [touchedMode, setTouchedMode] = useState(false);
  useEffect(() => { if (!touchedMode) setMode(preference === 'AD' ? 'AD' : 'BS'); }, [preference, touchedMode]);
  const mode: 'BS' | 'AD' = adOnly ? 'AD' : chosenMode;

  const bs = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valueAd || '')) return null;
    const [y, m, d] = valueAd.split('-').map(Number);
    return adToBs(new Date(y, m - 1, d));
  }, [valueAd]);

  const emit = (dateAd: string) => onChange(dateAd, bsLabel(dateAd));
  const setBs = (year: number, month: number, day: number) => {
    const days = (BS_MONTH_DAYS[year] || [])[month - 1] || 30;
    emit(toLocalAd(bsToAd(year, month, Math.min(day, days))));
  };
  const outOfRange = !!valueAd && ((!!minAd && valueAd < minAd) || (!!maxAd && valueAd > maxAd));
  const input = `w-full rounded-xl border ${error || outOfRange ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 bg-white'} px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100`;
  const today = bs || adToBs(new Date());
  const daysInMonth = (BS_MONTH_DAYS[today.year] || [])[today.month - 1] || 30;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={`${id}-${mode === 'AD' ? 'ad' : 'bs-day'}`} className="block text-xs font-bold text-slate-700">
          {label} {required && <span className="text-rose-600">*</span>}
        </label>
        {!adOnly && <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[10px] font-bold" role="group" aria-label={`${label} calendar`}>
          {(['BS', 'AD'] as const).map((option) => (
            <button key={option} type="button" aria-pressed={mode === option} onClick={() => { setMode(option); setTouchedMode(true); }}
              className={`rounded-md px-2 py-0.5 transition ${mode === option ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
              {option}
            </button>
          ))}
        </div>}
      </div>
      {mode === 'AD' ? (
        <input id={`${id}-ad`} type="date" value={valueAd} min={minAd} max={maxAd} required={required}
          onChange={(event) => event.target.value ? emit(event.target.value) : allowClear && onChange('', '')} className={input} />
      ) : (
        <div className="grid grid-cols-[1fr_1.4fr_1.1fr] gap-1.5">
          <select id={`${id}-bs-day`} aria-label={`${label} day (BS)`} value={bs ? bs.day : ''} onChange={(event) => setBs(today.year, today.month, Number(event.target.value))} className={input}>
            {!bs && <option value="">Day</option>}
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
          </select>
          <select aria-label={`${label} month (BS)`} value={bs ? bs.month : ''} onChange={(event) => setBs(today.year, Number(event.target.value), bs?.day || today.day)} className={input}>
            {!bs && <option value="">Month</option>}
            {NEPALI_MONTHS.map((month) => <option key={month.index} value={month.index}>{month.en}</option>)}
          </select>
          <select aria-label={`${label} year (BS)`} value={bs ? bs.year : ''} onChange={(event) => setBs(Number(event.target.value), today.month, bs?.day || today.day)} className={input}>
            {!bs && <option value="">Year</option>}
            {BS_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      )}
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        <span className={error || outOfRange ? 'font-medium text-rose-600' : 'text-slate-500'}>
          {error || (outOfRange ? (minAd && valueAd < minAd ? `Cannot be earlier than ${mode === 'BS' ? bsLabel(minAd) : adLabel(minAd)}.` : 'Cannot be in the future.')
            : valueAd ? (adOnly ? helper || adLabel(valueAd) : mode === 'BS' ? `AD: ${adLabel(valueAd)}` : `BS: ${bsLabel(valueAd)}`) : helper || 'No date chosen')}
        </span>
        {allowClear && valueAd && <button type="button" onClick={() => onChange('', '')} className="font-semibold text-slate-500 hover:text-rose-600">Clear</button>}
      </div>
    </div>
  );
}
