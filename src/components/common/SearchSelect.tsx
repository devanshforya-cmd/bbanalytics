'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchOption {
  value: string;
  label: string;
  /** Second line, e.g. "MT · Kathmandu". Also searched. */
  hint?: string;
  /** Group heading the option is listed under. */
  group?: string;
}

/**
 * A dropdown you can type into. Type part of a name, area or type to narrow the list;
 * arrow keys and Enter pick, Escape closes.
 */
export default function SearchSelect({
  id, label, options, value, onChange, placeholder = 'Search…', emptyText = 'Nothing matches', allowClear = false, clearLabel = 'None', disabled = false, className = '',
}: {
  id?: string;
  label?: string;
  options: SearchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  allowClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const autoId = useId();
  const inputId = id || `search-select-${autoId}`;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = words.length ? options.filter((o) => words.every((w) => `${o.label} ${o.hint || ''} ${o.group || ''}`.toLowerCase().includes(w))) : options;
    return list.slice(0, 200);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (next: string) => { onChange(next); setOpen(false); setQuery(''); };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, shown.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter') { if (open && shown[active]) { event.preventDefault(); pick(shown[active].value); } }
    else if (event.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  let lastGroup: string | undefined;
  return (
    <div ref={box} className={`relative ${className}`}>
      {label && <label htmlFor={inputId} className="mb-1 block text-xs font-bold text-slate-700">{label}</label>}
      <div className={`flex min-h-[42px] items-center gap-2 rounded-xl border bg-white px-3 ${open ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-300'} ${disabled ? 'opacity-60' : ''}`}>
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          ref={input}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={open ? query : selected?.label || ''}
          placeholder={selected ? selected.label : placeholder}
          onFocus={() => { setOpen(true); setActive(0); }}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
          onKeyDown={onKey}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500"
        />
        {allowClear && value && !disabled && (
          <button type="button" aria-label={`Clear ${label || 'choice'}`} onClick={() => pick('')} className="rounded p-1 text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </div>
      {selected?.hint && !open && <p className="mt-1 text-[11px] text-slate-500">{selected.hint}</p>}
      {open && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {allowClear && !query && (
            <li role="option" aria-selected={!value} onMouseDown={(e) => { e.preventDefault(); pick(''); }} className="cursor-pointer px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">{clearLabel}</li>
          )}
          {shown.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">{emptyText}</li>}
          {shown.map((option, index) => {
            const heading = option.group && option.group !== lastGroup ? option.group : null;
            lastGroup = option.group;
            return (
              <li key={option.value} role="presentation">
                {heading && <div className="px-3 pb-1 pt-2 text-[11px] font-bold text-slate-500">{heading}</div>}
                <div
                  role="option"
                  aria-selected={option.value === value}
                  onMouseDown={(e) => { e.preventDefault(); pick(option.value); }}
                  onMouseEnter={() => setActive(index)}
                  className={`flex cursor-pointer items-start justify-between gap-2 px-3 py-2 text-sm ${index === active ? 'bg-blue-50' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{option.label}</span>
                    {option.hint && <span className="block truncate text-xs text-slate-500">{option.hint}</span>}
                  </span>
                  {option.value === value && <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
