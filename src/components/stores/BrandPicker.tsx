'use client';

import { Check } from 'lucide-react';

/** Choose the brands a store is given. Each brand is a toggle; "All" selects or clears them all. */
export default function BrandPicker({ brands, value, onChange, label = 'Brands given to this store', hint }: {
  brands: { code: string; name: string }[];
  value: string[];
  onChange: (codes: string[]) => void;
  label?: string;
  hint?: string;
}) {
  const all = brands.length > 0 && brands.every((brand) => value.includes(brand.code));
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((entry) => entry !== code) : [...value, code]);
  return (
    <fieldset className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-xs font-bold text-slate-700">{label} *</legend>
        {brands.length > 1 && (
          <button type="button" onClick={() => onChange(all ? [] : brands.map((brand) => brand.code))} className="text-[11px] font-semibold text-blue-700 hover:underline">
            {all ? 'Clear all' : 'Select all'}
          </button>
        )}
      </div>
      {brands.length === 0 ? (
        <p className="text-xs text-slate-500">No brands yet. Add brands in Settings first.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {brands.map((brand) => {
            const on = value.includes(brand.code);
            return (
              <button key={brand.code} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(brand.code)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`}>
                {on && <Check className="h-3.5 w-3.5" />}{brand.name}
              </button>
            );
          })}
        </div>
      )}
      <p className={`text-[11px] ${value.length ? 'text-slate-500' : 'font-semibold text-rose-700'}`}>
        {value.length ? hint || 'Orders, counts and dispatches for this store show only these brands.' : 'Choose at least one brand.'}
      </p>
    </fieldset>
  );
}
