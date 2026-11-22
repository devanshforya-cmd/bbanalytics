'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { toast } from './Toast';

export interface CreatableOption { id: string; name: string; hint?: string; group?: string }

interface CreatableSelectProps {
  id?: string;
  label: string;
  options: CreatableOption[];
  /** Selected option IDs. Single-select uses a list of zero or one. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Create an option from typed text and return it. Omit to disable creating. */
  onCreate?: (name: string) => CreatableOption;
  multiple?: boolean;
  required?: boolean;
  placeholder?: string;
  helper?: string;
  error?: string;
  /** What is being created, for the "Create …" row and the toast. */
  noun?: string;
}

/**
 * Searchable pick-list that can add a missing entry on the spot.
 * Typing a name that does not exist offers Create "X"; choosing it saves the
 * entry permanently and selects it, without leaving the form.
 */
export default function CreatableSelect({ id, label, options, value, onChange, onCreate, multiple, required, placeholder, helper, error, noun = 'entry' }: CreatableSelectProps) {
  const autoId = useId();
  const fieldId = id || autoId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const creating = useRef(false);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const selected = value.map((entry) => options.find((option) => option.id === entry)).filter((option): option is CreatableOption => !!option);
  const text = query.trim();
  const filtered = useMemo(() => {
    const term = text.toLowerCase();
    return options.filter((option) => !term || option.name.toLowerCase().includes(term) || option.group?.toLowerCase().includes(term));
  }, [options, text]);
  const exact = options.some((option) => option.name.trim().toLowerCase() === text.toLowerCase());
  const canCreate = !!onCreate && !!text && !exact;
  const rows = filtered.length + (canCreate ? 1 : 0);

  const toggle = (option: CreatableOption) => {
    if (multiple) onChange(value.includes(option.id) ? value.filter((entry) => entry !== option.id) : [...value, option.id]);
    else { onChange([option.id]); setOpen(false); }
    setQuery(''); setActive(0);
    if (multiple) inputRef.current?.focus();
  };
  const create = () => {
    if (!onCreate || !canCreate || creating.current) return;
    creating.current = true; // One click, one record.
    try {
      const made = onCreate(text);
      onChange(multiple ? [...new Set([...value, made.id])] : [made.id]);
      toast.success(`Added "${made.name}"`, `This ${noun} is now available everywhere.`);
      setQuery(''); setActive(0);
      if (!multiple) setOpen(false);
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : `Could not add this ${noun}.`); }
    finally { creating.current = false; }
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, Math.max(rows - 1, 0))); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter') {
      if (!open) return;
      event.preventDefault();
      if (active < filtered.length) toggle(filtered[active]); else if (canCreate) create();
    } else if (event.key === 'Escape') { setOpen(false); setQuery(''); }
    else if (event.key === 'Backspace' && !query && multiple && value.length) onChange(value.slice(0, -1));
  };

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={fieldId} className="mb-1 block text-xs font-bold text-slate-700">{label} {required && <span className="text-rose-600">*</span>}</label>
      <div onClick={() => { setOpen(true); inputRef.current?.focus(); }}
        className={`flex min-h-[38px] cursor-text flex-wrap items-center gap-1 rounded-xl border px-2 py-1 text-xs ${error ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 bg-white'} focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100`}>
        {multiple && selected.map((option) => (
          <span key={option.id} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 font-semibold text-blue-800 border border-blue-200">
            {option.name}
            <button type="button" aria-label={`Remove ${option.name}`} onClick={(event) => { event.stopPropagation(); onChange(value.filter((entry) => entry !== option.id)); }} className="text-blue-500 hover:text-rose-600"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input ref={inputRef} id={fieldId} role="combobox" aria-expanded={open} aria-controls={`${fieldId}-list`} aria-autocomplete="list" autoComplete="off"
          value={open || multiple ? query : selected[0]?.name || ''} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
          placeholder={multiple ? (selected.length ? 'Add another…' : placeholder || 'Search or type to add') : selected[0]?.name || placeholder || 'Search or type to add'}
          className="min-w-[90px] flex-1 bg-transparent py-1 text-xs text-slate-900 outline-none placeholder:text-slate-500" />
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </div>
      {open && (
        <ul id={`${fieldId}-list`} role="listbox" aria-multiselectable={multiple || undefined} className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-xs shadow-lg">
          {filtered.map((option, index) => {
            const isSelected = value.includes(option.id);
            const header = option.group && option.group !== filtered[index - 1]?.group;
            return (
              <React.Fragment key={option.id}>
                {header && <li role="presentation" className="sticky top-0 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">{option.group}</li>}
                <li role="option" aria-selected={isSelected} onMouseDown={(event) => event.preventDefault()} onClick={() => toggle(option)} onMouseEnter={() => setActive(index)}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 ${index === active ? 'bg-blue-50' : ''}`}>
                  <span className="min-w-0"><span className="block truncate font-medium text-slate-800">{option.name}</span>{option.hint && <span className="block truncate text-[11px] text-slate-500">{option.hint}</span>}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
                </li>
              </React.Fragment>
            );
          })}
          {canCreate && (
            <li role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={create} onMouseEnter={() => setActive(filtered.length)}
              className={`flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-2 font-semibold text-blue-700 ${active === filtered.length ? 'bg-blue-50' : ''}`}>
              <Plus className="h-3.5 w-3.5" /> Create &ldquo;{text}&rdquo;
            </li>
          )}
          {!rows && <li className="px-3 py-3 text-center text-slate-500">{onCreate ? `Type a name to add a new ${noun}.` : 'Nothing matches.'}</li>}
        </ul>
      )}
      {(error || helper) && <p className={`mt-1 text-[11px] ${error ? 'font-medium text-rose-600' : 'text-slate-500'}`}>{error || helper}</p>}
    </div>
  );
}
