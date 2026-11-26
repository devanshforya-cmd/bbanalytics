'use client';

import React, { useState } from 'react';
import NumberInput from '@/components/common/NumberInput';
import { CREDIT_PRESETS, MAX_CREDIT_DAYS, formatTerms, hasCreditLimit, parseTerms, type TermsKind } from '@/lib/payment-terms';

interface Props {
  terms: string;
  onTermsChange: (terms: string) => void;
  /** Leave out to hide the credit limit box. Empty means no limit. */
  creditLimit?: number | null;
  onCreditLimitChange?: (limit: number | undefined) => void;
  idPrefix?: string;
}

/** Payment terms with any number of credit days, and an optional credit limit (empty = no limit). */
export default function PaymentTermsField({ terms, onTermsChange, creditLimit, onCreditLimitChange, idPrefix = 'terms' }: Props) {
  const parsed = parseTerms(terms);
  const [kind, setKind] = useState<TermsKind>(parsed.kind);
  const [days, setDays] = useState<number>(parsed.days || 30);
  const [limitOn, setLimitOn] = useState(hasCreditLimit(creditLimit));
  const pick = (next: TermsKind, nextDays = days) => { setKind(next); setDays(nextDays); onTermsChange(formatTerms(next, nextDays)); };
  const chip = (active: boolean) => `rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'}`;

  return (
    <div className="space-y-3 text-xs">
      <fieldset>
        <legend className="mb-1 block font-bold text-slate-700">Payment terms</legend>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={kind === 'COD'} onClick={() => pick('COD')} className={chip(kind === 'COD')}>Cash on delivery</button>
          <button type="button" aria-pressed={kind === 'ADVANCE'} onClick={() => pick('ADVANCE')} className={chip(kind === 'ADVANCE')}>Advance</button>
          <button type="button" aria-pressed={kind === 'CREDIT'} onClick={() => pick('CREDIT')} className={chip(kind === 'CREDIT')}>Credit</button>
        </div>
      </fieldset>

      {kind === 'CREDIT' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label htmlFor={`${idPrefix}-days`} className="block font-bold text-slate-700">Credit days</label>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <NumberInput id={`${idPrefix}-days`} type="number" min={1} max={MAX_CREDIT_DAYS} value={days}
              onChange={(event) => { const next = Math.min(MAX_CREDIT_DAYS, Math.max(1, Math.round(Number(event.target.value)) || 1)); setDays(next); onTermsChange(formatTerms('CREDIT', next)); }}
              className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center font-bold" />
            <span className="text-slate-500">days ·</span>
            {CREDIT_PRESETS.map((preset) => (
              <button key={preset} type="button" onClick={() => pick('CREDIT', preset)} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${days === preset ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}>{preset}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Payment due {days} day{days === 1 ? '' : 's'} after each dispatch.</p>
        </div>
      )}

      {onCreditLimitChange && (
        <div>
          <span className="block font-bold text-slate-700">Credit limit</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5"><input type="radio" name={`${idPrefix}-limit`} checked={!limitOn} onChange={() => { setLimitOn(false); onCreditLimitChange(undefined); }} />No limit</label>
            <label className="flex items-center gap-1.5"><input type="radio" name={`${idPrefix}-limit`} checked={limitOn} onChange={() => setLimitOn(true)} />Up to</label>
            {limitOn && (
              <span className="flex items-center gap-1">NPR
                <NumberInput aria-label="Credit limit in NPR" type="number" min={0} step={1000} value={creditLimit ?? ''} placeholder="e.g. 100000"
                  onChange={(event) => { const next = Math.max(0, Math.round(Number(event.target.value)) || 0); onCreditLimitChange(next || undefined); }}
                  className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-bold" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
