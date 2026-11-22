'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Link2Off, Phone, Search, UserPlus, UserRound } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import type { Customer } from '@/lib/types';
import { exactCustomer, isFullPhone, namesDiffer, nearMissCustomers, phoneDigits, searchCustomers, type CustomerMatch } from '@/lib/customer-lookup';
import { adLabel, bsLabel } from './DualDateField';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';

export type CustomerLinkState = 'LINKED' | 'NEW' | 'UNLINKED' | null;

export interface CustomerLookupValue {
  /** Ten digits once complete; otherwise whatever has been typed so far. */
  phone: string;
  name: string;
  /** LINKED to an existing customer, NEW profile to be created, UNLINKED (name or handle only), or null while incomplete. */
  link: CustomerLinkState;
  customer?: Customer;
  /** Only when there is no phone: the name or social handle to keep on the entry. */
  handle?: string;
}

export const EMPTY_CUSTOMER_LOOKUP: CustomerLookupValue = { phone: '', name: '', link: null };

/** Why the lookup is not ready to save, or null when it is. */
export function customerLookupError(value: CustomerLookupValue, options: { allowNoPhone?: boolean } = {}): string | null {
  if (value.link === 'LINKED' && value.customer) return null;
  if (value.link === 'UNLINKED') return options.allowNoPhone && (value.handle || value.name).trim() ? null : 'Enter a name or handle.';
  if (!value.phone.trim()) return 'Enter the customer phone number.';
  if (!isFullPhone(value.phone)) return 'Enter the full 10-digit number (starts with 97 or 98), or pick a suggestion.';
  if (value.link === 'NEW' && !value.name.trim()) return 'Enter the customer name for the new profile.';
  return value.link ? null : 'Enter the customer phone number.';
}

interface CustomerLookupProps {
  value: CustomerLookupValue;
  onChange: (value: CustomerLookupValue) => void;
  /** Offer "I only have a name or handle" and allow saving an unlinked entry. */
  allowNoPhone?: boolean;
  /** Shown under the field after a failed save. */
  error?: string | null;
  autoFocus?: boolean;
  phoneLabel?: string;
  /** Do not treat this customer as a match (used when editing an order that already belongs to them). */
  ignoreCustomerId?: string;
  /** The number already saved on the record being edited. No "new customer" notice is shown while it is unchanged. */
  savedPhone?: string;
}

/**
 * Phone-first customer lookup, shared by the order edit, review, delivery
 * failure and returns forms. It always shows whether an entry will attach to
 * an existing customer or create a new one, before anything is saved.
 */
export default function CustomerLookup({ value, onChange, allowNoPhone, error, autoFocus, phoneLabel = 'Customer phone', ignoreCustomerId, savedPhone }: CustomerLookupProps) {
  const uid = useId();
  const { preference } = useCalendarPreference();
  const [customers, setCustomers] = useState<Customer[]>(() => db.getCustomers());
  const [query, setQuery] = useState(value.phone);
  const [debounced, setDebounced] = useState(value.phone);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [noPhone, setNoPhone] = useState(value.link === 'UNLINKED');
  const [handleQuery, setHandleQuery] = useState(value.handle || '');
  const typedBeforeLink = useRef('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => setCustomers(db.getCustomers());
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);
  // Suggestions wait about 200 ms after the last keystroke.
  useEffect(() => { const timer = setTimeout(() => setDebounced(noPhone ? handleQuery : query), 200); return () => clearTimeout(timer); }, [query, handleQuery, noPhone]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  // The parent cleared the form.
  useEffect(() => { if (!value.phone && !value.link && !value.name) { setQuery(''); setHandleQuery(''); setNoPhone(false); } }, [value.phone, value.link, value.name]);

  const pool = useMemo(() => ignoreCustomerId ? customers.filter((customer) => customer.id !== ignoreCustomerId) : customers, [customers, ignoreCustomerId]);
  const suggestions: CustomerMatch[] = useMemo(() => value.link === 'LINKED' ? [] : searchCustomers(pool, debounced, 8), [pool, debounced, value.link]);
  const nearMisses = useMemo(() => value.link === 'NEW' ? nearMissCustomers(pool, value.phone) : [], [pool, value.link, value.phone]);
  const formatDate = (dateAd?: string) => !dateAd ? 'no orders yet' : preference === 'AD' ? adLabel(dateAd) : preference === 'BOTH' ? `${bsLabel(dateAd)} (${adLabel(dateAd)})` : bsLabel(dateAd);
  const brandName = (code: string) => db.getBrands('ALL').find((brand) => brand.code === code)?.name || code;

  const link = (customer: Customer) => {
    typedBeforeLink.current = isFullPhone(query) && phoneDigits(query) === phoneDigits(customer.phone) ? '' : noPhone ? '' : query;
    setOpen(false); setQuery(phoneDigits(customer.phone));
    onChange({ phone: phoneDigits(customer.phone), name: customer.name, link: 'LINKED', customer });
  };
  const unlink = () => {
    const restored = typedBeforeLink.current;
    setQuery(restored); setDebounced(restored);
    onChange({ phone: restored, name: '', link: null });
  };
  const onPhoneChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d+\s()-]/g, '').slice(0, 20);
    setQuery(cleaned); setActive(0); setOpen(true);
    if (isFullPhone(cleaned)) {
      const match = exactCustomer(pool, cleaned);
      if (match) { typedBeforeLink.current = ''; setOpen(false); onChange({ phone: phoneDigits(cleaned), name: match.name, link: 'LINKED', customer: match }); return; }
      onChange({ phone: phoneDigits(cleaned), name: value.link === 'NEW' ? value.name : value.name, link: 'NEW' });
      return;
    }
    onChange({ phone: cleaned, name: value.link === 'LINKED' ? '' : value.name, link: null });
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open || !suggestions.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(index + 1, suggestions.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); link(suggestions[active].customer); }
    else if (event.key === 'Escape') setOpen(false);
  };
  const switchNoPhone = (next: boolean) => {
    setNoPhone(next); setOpen(false); setQuery(''); setHandleQuery('');
    onChange(next ? { phone: '', name: '', handle: '', link: 'UNLINKED' } : { phone: '', name: '', link: null });
  };

  const field = 'w-full rounded-xl border px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
  const suggestionList = open && suggestions.length > 0 && (
    <ul id={`${uid}-list`} role="listbox" className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
      {suggestions.map(({ customer }, index) => (
        <li key={customer.id} role="option" aria-selected={index === active} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => link(customer)}
          className={`cursor-pointer px-3 py-2 text-xs ${index === active ? 'bg-blue-50' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-bold text-slate-900">{customer.name || 'Unnamed customer'}</span>
            <span className="shrink-0 font-mono text-[11px] text-slate-600">{phoneDigits(customer.phone)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
            <span>{customer.totalOrders} order{customer.totalOrders === 1 ? '' : 's'}</span>
            <span>Last order {formatDate(customer.lastOrderDate)}</span>
            {customer.brandsPurchased?.length > 0 && <span className="truncate">{customer.brandsPurchased.map(brandName).join(', ')}</span>}
            <span className={`rounded px-1 font-bold ${customer.karmaScore >= 65 ? 'bg-emerald-50 text-emerald-700' : customer.karmaScore >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>Karma {customer.karmaScore}</span>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div ref={rootRef} className="space-y-2">
      {value.link === 'LINKED' && value.customer ? (
        <div>
          <span className="mb-1 block text-xs font-bold text-slate-700">{phoneLabel}</span>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs" role="status">
            <div className="flex min-w-0 items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="font-bold text-emerald-900">Linked to {value.customer.name || 'this customer'} <span className="font-mono font-medium text-emerald-800">· {phoneDigits(value.customer.phone)}</span></p>
                <p className="text-[11px] text-emerald-800">{value.customer.totalOrders} order{value.customer.totalOrders === 1 ? '' : 's'} · last order {formatDate(value.customer.lastOrderDate)}{value.customer.city ? ` · ${value.customer.city}` : ''}</p>
              </div>
            </div>
            <button type="button" onClick={unlink} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-emerald-800 underline hover:bg-emerald-100">Not this person</button>
          </div>
        </div>
      ) : noPhone ? (
        <div className="relative">
          <label htmlFor={`${uid}-handle`} className="mb-1 block text-xs font-bold text-slate-700">Name or handle <span className="text-rose-600">*</span></label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input id={`${uid}-handle`} type="text" role="combobox" aria-expanded={open} aria-controls={`${uid}-list`} autoComplete="off" value={handleQuery} placeholder="e.g. Sita Gurung or @sita.g"
              onChange={(event) => { const text = event.target.value.slice(0, 120); setHandleQuery(text); setOpen(true); setActive(0); onChange({ phone: '', name: text, handle: text, link: 'UNLINKED' }); }}
              onFocus={() => setOpen(true)} onKeyDown={onKeyDown} className={`${field} pl-8 ${error ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 bg-white'}`} />
          </div>
          {suggestionList}
          <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700"><Link2Off className="mt-0.5 h-3 w-3 shrink-0" />
            {handleQuery.trim().length >= 3 && !suggestions.length ? 'No customer matches this name. The entry will be saved as Unlinked and appear in the Needs linking queue.' : 'Pick a customer if they appear. Otherwise the entry is saved as Unlinked so staff can attach a customer later.'}</p>
        </div>
      ) : (
        <div className="relative">
          <label htmlFor={`${uid}-phone`} className="mb-1 block text-xs font-bold text-slate-700">{phoneLabel} <span className="text-rose-600">*</span></label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input id={`${uid}-phone`} type="tel" inputMode="tel" role="combobox" aria-expanded={open} aria-controls={`${uid}-list`} aria-autocomplete="list" autoComplete="off" autoFocus={autoFocus}
              value={query} placeholder="98XXXXXXXX — or the last few digits" onChange={(event) => onPhoneChange(event.target.value)} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
              className={`${field} pl-8 font-mono ${error ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 bg-white'}`} />
          </div>
          {suggestionList}
          {!value.link && phoneDigits(query).length >= 3 && !suggestions.length && debounced === query && !isFullPhone(query) && (
            <p className="mt-1 text-[11px] text-slate-500">No saved customer has these digits yet. Keep typing the full number.</p>
          )}
        </div>
      )}

      {value.link === 'NEW' && !(savedPhone && phoneDigits(savedPhone) === phoneDigits(value.phone)) && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs" role="status">
          <p className="flex items-start gap-2 font-semibold text-amber-900"><UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>New customer. A profile will be created for <span className="font-mono">{phoneDigits(value.phone)}</span> from this entry.</span></p>
          {nearMisses.map((customer) => (
            <button key={customer.id} type="button" onClick={() => link(customer)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-left hover:bg-amber-100">
              <span><span className="font-bold text-slate-900">Did you mean {customer.name}?</span> <span className="font-mono text-slate-600">{phoneDigits(customer.phone)}</span> <span className="text-slate-500">· one digit different · {customer.totalOrders} orders</span></span>
              <span className="shrink-0 font-bold text-blue-700">Use this customer</span>
            </button>
          ))}
        </div>
      )}

      {value.link !== 'UNLINKED' && (
        <div>
          <label htmlFor={`${uid}-name`} className="mb-1 block text-xs font-bold text-slate-700">Customer name {value.link === 'NEW' && <span className="text-rose-600">*</span>}</label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input id={`${uid}-name`} type="text" value={value.name} maxLength={120} placeholder={value.link === 'LINKED' ? '' : 'Fills in when a customer is linked'}
              onChange={(event) => onChange({ ...value, name: event.target.value })} className={`${field} border-slate-300 bg-white pl-8`} />
          </div>
          {value.link === 'LINKED' && value.customer && namesDiffer(value.name, value.customer.name) && (
            <div className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
              <p className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />The name on file for this number is <strong>{value.customer.name}</strong>. The saved profile will not be changed.</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => onChange({ ...value, name: value.customer!.name })} className="rounded-md border border-amber-400 bg-white px-2 py-1 font-bold hover:bg-amber-100">Use the name on file</button>
                <span className="px-1 py-1 text-amber-800">or keep &ldquo;{value.name}&rdquo; on this entry only</span>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-[11px] font-medium text-rose-600" role="alert">{error}</p>}
      {allowNoPhone && value.link !== 'LINKED' && (
        <button type="button" onClick={() => switchNoPhone(!noPhone)} className="text-[11px] font-bold text-blue-700 hover:underline">
          {noPhone ? 'I have a phone number' : 'I only have a name or handle'}
        </button>
      )}
    </div>
  );
}
