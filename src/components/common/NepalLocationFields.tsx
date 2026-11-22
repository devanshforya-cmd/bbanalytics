'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { NEPAL_LOCATIONS, NEPAL_PROVINCES, cityMatchesProvince, filterLocationOptions, normalizeLocationSearch, provinceByName } from '@/lib/nepal-locations';

interface Option { id: string; value: string; title: string; detail?: string; search: string; province?: string }
interface SearchableSelectProps {
  id: string; label: string; value: string; options: Option[]; placeholder: string; required?: boolean;
  allowCustom?: boolean; showSource?: boolean; customError?: (value: string) => string; onSelect: (value: string, option?: Option) => void;
}
const searchText = normalizeLocationSearch;

function SearchableSelect({ id, label, value, options, placeholder, required, allowCustom, showSource, customError, onSelect }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [active, setActive] = useState(-1);
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!open) setQuery(value); }, [value, open]);
  const normalized = searchText(query);
  const filter = query === value ? '' : normalized;
  const matching = useMemo(() => open ? filterLocationOptions(options, filter) : [], [open, options, filter]);
  const shown = matching.slice(0, 40);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, id, open]);
  const typed = query.trim();
  const showCustom = !!allowCustom && !!typed && query !== value && !options.some(option => searchText(option.value) === normalized);
  const customMessage = showCustom ? customError?.(typed) : '';
  const choose = (next: string, option?: Option) => {
    onSelect(next, option); setQuery(next); setActive(-1); input.current?.focus(); setOpen(false);
  };
  return <div ref={wrapper} className="relative min-w-0 text-xs" onBlur={event => {
    if (!wrapper.current?.contains(event.relatedTarget as Node | null)) {
      if (open && query !== value) {
        const exact = matching.filter(option => searchText(option.value) === normalized || searchText(option.title) === normalized);
        const selected = exact.length === 1 ? exact[0] : !allowCustom && matching.length === 1 ? matching[0] : undefined;
        if (!typed) onSelect('');
        else if (selected) onSelect(selected.value, selected);
        else if (allowCustom && !matching.length && !customMessage) onSelect(typed);
      }
      setOpen(false); setActive(-1); setQuery(value);
    }
  }}>
    <label htmlFor={id} className="block font-semibold text-slate-600 mb-1">{label}{required ? ' *' : ' (optional)'}</label>
    <span className="sr-only" aria-live="polite">{open ? `${matching.length} matching choices` : ''}</span>
    <div className="relative">
      <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
        aria-activedescendant={open && active >= 0 && shown[active] ? `${id}-option-${active}` : undefined} aria-required={required || undefined}
        autoComplete="off" maxLength={200} value={open ? query : value} placeholder={placeholder}
        onFocus={event => { setQuery(value); setActive(-1); setOpen(true); event.currentTarget.select(); }}
        onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, shown.length - 1)); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
          else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setQuery(value); setActive(-1); }
          else if (event.key === 'Enter' && open) {
            event.preventDefault();
            const selected = shown[active >= 0 ? active : 0];
            if (selected) choose(selected.value, selected);
            else if (showCustom && !customMessage) choose(typed);
          }
        }}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-9 text-base sm:text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
      <button type="button" tabIndex={-1} aria-label={`Show ${label} choices`} onMouseDown={event => event.preventDefault()}
        onClick={() => { if (open) { setOpen(false); setQuery(value); } else { setQuery(value); setActive(-1); input.current?.focus(); setOpen(true); } }}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500"><ChevronDown className="h-4 w-4" /></button>
    </div>
    {open && <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
      <div id={`${id}-list`} role="listbox" aria-label={`${label} choices`} className="max-h-56 overflow-y-auto py-1">
        {shown.map((option, index) => <button type="button" role="option" id={`${id}-option-${index}`} key={option.id} aria-selected={option.value === value}
          onPointerDown={event => event.preventDefault()} onClick={() => choose(option.value, option)}
          className={`block w-full px-3 py-2 text-left hover:bg-blue-50 ${active === index ? 'bg-blue-50' : ''}`}>
          <span className="block font-semibold text-slate-900">{option.title}</span>{option.detail && <span className="block text-[11px] text-slate-500">{option.detail}</span>}
        </button>)}
        {!shown.length && <p className="px-3 py-2 text-slate-500">No matching locations.</p>}
      </div>
      {matching.length > shown.length && <p className="border-t border-slate-100 px-3 py-2 text-slate-500">Type more to narrow {matching.length} matches.</p>}
      {showCustom && (customMessage ? <p className="border-t border-slate-100 px-3 py-2 text-amber-700">{customMessage}</p> : <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => choose(typed)} className="w-full border-t border-slate-100 px-3 py-2 text-left font-semibold text-blue-700 hover:bg-blue-50">Use “{typed}” as entered</button>)}
      {value && <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => choose('')} className="w-full border-t border-slate-100 px-3 py-2 text-left text-slate-600 hover:bg-slate-50">Clear selection</button>}
      {showSource && <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">Locations: <a className="underline" href="https://github.com/ritushishir/nepali-canonical" target="_blank" rel="noreferrer">nepali-canonical</a> · <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p>}
    </div>}
  </div>;
}

const provinces: Option[] = NEPAL_PROVINCES.map(item => ({ id: item.code, value: item.name, title: item.name, search: `${item.name} ${item.nepali}` }));
const cityOptions = NEPAL_LOCATIONS.map(item => ({ id: item.id, value: item.value, title: item.value,
  detail: `${item.type} · ${item.district} · ${item.province}`, search: `${item.name} ${item.value} ${item.nepali} ${item.district} ${item.type} ${item.province}`, province: item.province }));

export default function NepalLocationFields({ idPrefix, province, city, onChange, required = false }: {
  idPrefix: string; province: string; city: string; onChange: (next: { province: string; city: string }) => void; required?: boolean;
}) {
  const matchedProvince = provinceByName(province);
  const options = useMemo(() => !province.trim() ? cityOptions : matchedProvince ? cityOptions.filter(option => option.province === matchedProvince.name) : [], [province, matchedProvince]);
  const knownElsewhere = (value: string) => {
    if (!matchedProvince || cityMatchesProvince(value, matchedProvince.name)) return '';
    return NEPAL_LOCATIONS.some(item => searchText(item.name) === searchText(value) || searchText(item.value) === searchText(value))
      ? 'This location is listed in another province. Choose the correct province first.' : '';
  };
  return <>
    <SearchableSelect id={`${idPrefix}-province`} label="Province" value={province} options={provinces} placeholder="Search provinces" required={required}
      onSelect={next => {
        const known = city && NEPAL_LOCATIONS.some(item => searchText(item.name) === searchText(city) || searchText(item.value) === searchText(city));
        onChange({ province: next, city: next && known && !cityMatchesProvince(city, next) ? '' : city });
      }} />
    <div className="min-w-0">
      <SearchableSelect id={`${idPrefix}-city`} label="City / district" value={city} options={options} placeholder={province && !matchedProvince ? 'Choose a province first' : 'Search cities or districts'} required={required} allowCustom showSource customError={knownElsewhere}
        onSelect={(next, option) => onChange({ province: !province && option?.province ? option.province : province, city: next })} />
      {knownElsewhere(city) && <p className="mt-1 text-[11px] text-amber-700">The saved location may not match this province. Please review it.</p>}
      {province && !matchedProvince && <p className="mt-1 text-[11px] text-slate-500">Choose a listed province to filter locations.</p>}
    </div>
  </>;
}
