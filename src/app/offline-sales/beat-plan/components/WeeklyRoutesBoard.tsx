'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X, MapPinOff, Search } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { hasAccess } from '@/lib/permissions';
import { getTodayAd } from '@/lib/nepali-calendar';
import { pinnedLocation } from '@/lib/gps-validation';
import type { RecurringScheduleEntry, Weekday } from '@/lib/types';
import { PRIORITY_LABEL, PRIORITY_RANK, WEEKDAYS, WEEKDAY_LABEL, WEEKDAY_SHORT, weekdayOf, type StopPriority } from '@/lib/weekly-beat';
import { priorityColor } from '@/lib/ui-utils';
import SlideOverPanel from '@/components/common/SlideOverPanel';
import { toast } from '@/components/common/Toast';

interface StoreRow { id: string; name: string; kind: 'Retailer' | 'MT outlet'; area: string; pinned: boolean; officerId?: string }

/**
 * Each rider's standing week: which stores they visit on which day. A stop stays every week until it is changed here,
 * and today's route picks up changes straight away. Other jobs keep the priority they were given.
 */
export default function WeeklyRoutesBoard({ initialOfficerId }: { initialOfficerId?: string }) {
  const staff = useMemo(() => db.getUsers().filter((user) => user.active !== false && (hasAccess(user, 'beat_plans') || user.role === 'SALES_OFFICER')).sort((a, b) => a.fullName.localeCompare(b.fullName)), []);
  // Start on the chosen rider, else the rider with the most standing stops, else the first field officer.
  const [officerId, setOfficerId] = useState(() => {
    if (initialOfficerId && staff.some((user) => user.id === initialOfficerId)) return initialOfficerId;
    const counts = new Map<string, number>();
    for (const entry of db.getRecurringSchedules()) counts.set(entry.officerId, (counts.get(entry.officerId) || 0) + 1);
    const busiest = [...staff].sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0))[0];
    return (busiest && counts.get(busiest.id) ? busiest.id : staff.find((user) => user.role === 'SALES_OFFICER')?.id) || staff[0]?.id || '';
  });
  const [schedules, setSchedules] = useState<RecurringScheduleEntry[]>(() => db.getRecurringSchedules());
  const [pickerDay, setPickerDay] = useState<Weekday | null>(null);
  useEffect(() => {
    const refresh = () => setSchedules([...db.getRecurringSchedules()]);
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  const stores: StoreRow[] = useMemo(() => [
    ...db.getRetailers().map((r) => ({ id: r.id, name: r.name, kind: 'Retailer' as const, area: [r.area, r.city].filter(Boolean).join(', '), pinned: pinnedLocation(r.lat, r.lng), officerId: r.assignedOfficerId })),
    ...db.getBranches().map((b) => ({ id: b.id, name: b.name, kind: 'MT outlet' as const, area: [b.area, b.city, b.distributorName].filter(Boolean).join(', '), pinned: pinnedLocation(b.lat, b.lng), officerId: b.assignedOfficerId })),
  ].sort((a, b) => a.name.localeCompare(b.name)), []);
  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const mine = schedules.filter((entry) => entry.officerId === officerId && entry.active !== false);
  const today = weekdayOf(getTodayAd());

  const change = (storeId: string, day: Weekday, on: boolean, priority?: StopPriority, managerNote?: string) => {
    db.setWeeklyStop({ officerId, storeId, day, on, priority, managerNote });
  };
  const remove = (entry: RecurringScheduleEntry, day: Weekday) => {
    try { change(entry.storeId, day, false); setSchedules([...db.getRecurringSchedules()]); toast.success(`${entry.storeName} taken off ${WEEKDAY_LABEL[day]}`); }
    catch (problem) { toast.error(problem instanceof Error ? problem.message : 'Not changed.'); }
  };
  const cyclePriority = (entry: RecurringScheduleEntry, day: Weekday) => {
    const next: StopPriority = entry.priority === 'HIGH' ? 'ROUTINE' : entry.priority === 'MEDIUM' ? 'HIGH' : 'MEDIUM';
    try { change(entry.storeId, day, true, next); setSchedules([...db.getRecurringSchedules()]); }
    catch (problem) { toast.error(problem instanceof Error ? problem.message : 'Not changed.'); }
  };

  const total = new Set(mine.map((entry) => entry.storeId)).size;
  const officer = staff.find((user) => user.id === officerId);

  return (
    <section className="space-y-4" aria-labelledby="weekly-routes">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="weekly-routes" className="text-[15px] font-medium text-slate-900">Weekly routes</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] text-slate-500">Set which stores each rider visits on each day. Stops repeat every week until you change them, and today’s route updates straight away. A store without a pinned location can still be on a route.</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-slate-500">Rider
          <select value={officerId} onChange={(event) => setOfficerId(event.target.value)} className="h-9 rounded-lg border border-black/[0.08] bg-white px-3 text-slate-800">
            {staff.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
          </select>
        </label>
      </div>
      {!officer ? <p className="rounded-xl border border-dashed p-6 text-center text-xs text-slate-500">No field staff with beat plan access yet.</p> : (
        <>
          <p className="text-xs text-slate-600"><strong className="text-slate-900">{officer.fullName}</strong> has <span className="tabular-nums">{total}</span> standing store{total === 1 ? '' : 's'} across the week.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
            {WEEKDAYS.map((day) => {
              const entries = mine.filter((entry) => entry.daysOfWeek.includes(day)).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.storeName.localeCompare(b.storeName));
              return (
                <div key={day} className={`flex flex-col rounded-2xl border bg-white ${day === today ? 'border-blue-300 ring-1 ring-blue-200' : 'border-black/[0.08]'}`}>
                  <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-2">
                    <span className="text-[13px] font-semibold text-slate-900">{WEEKDAY_LABEL[day]}{day === today && <span className="ml-1.5 text-[11px] font-medium text-blue-700">today</span>}</span>
                    <span className="font-mono text-xs tabular-nums text-slate-500">{entries.length}</span>
                  </div>
                  <ul className="flex-1 divide-y divide-black/[0.04]">
                    {entries.length === 0 && <li className="px-3 py-4 text-center text-[11px] text-slate-400">No stores</li>}
                    {entries.map((entry) => { const store = storeById.get(entry.storeId); return (
                      <li key={entry.id} className="group flex items-start gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-900" title={entry.storeName}>{entry.storeName}</p>
                          <p className="flex items-center gap-1 truncate text-[11px] text-slate-500">{store?.area || store?.kind || 'Store removed'}{store && !store.pinned && <span className="inline-flex items-center gap-0.5 text-amber-700" title="No pinned location: check-in skips the distance check"><MapPinOff className="h-3 w-3" />no pin</span>}</p>
                        </div>
                        <button type="button" onClick={() => cyclePriority(entry, day)} title="Change priority" className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${priorityColor(entry.priority)}`}>{PRIORITY_LABEL[entry.priority]}</button>
                        <button type="button" onClick={() => remove(entry, day)} aria-label={`Take ${entry.storeName} off ${WEEKDAY_LABEL[day]}`} className="shrink-0 rounded-md p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                      </li>
                    ); })}
                  </ul>
                  <button type="button" onClick={() => setPickerDay(day)} className="flex items-center justify-center gap-1 border-t border-black/[0.06] px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50/60"><Plus className="h-3.5 w-3.5" />Add stores</button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {pickerDay && officer && (
        <StorePicker day={pickerDay} officerName={officer.fullName} stores={stores} taken={new Set(mine.filter((entry) => entry.daysOfWeek.includes(pickerDay)).map((entry) => entry.storeId))} officerId={officerId}
          onClose={() => setPickerDay(null)}
          onSave={(storeIds, days, priority, note) => {
            try {
              for (const storeId of storeIds) for (const day of days) change(storeId, day, true, priority, note);
              setSchedules([...db.getRecurringSchedules()]); setPickerDay(null);
              toast.success(`${storeIds.length} store${storeIds.length === 1 ? '' : 's'} added for ${days.map((day) => WEEKDAY_SHORT[day]).join(', ')}`, 'They repeat every week until changed.');
            } catch (problem) { toast.error(problem instanceof Error ? problem.message : 'Not saved.'); }
          }} />
      )}
    </section>
  );
}

function StorePicker({ day, officerName, officerId, stores, taken, onClose, onSave }: {
  day: Weekday; officerName: string; officerId: string; stores: StoreRow[]; taken: Set<string>; onClose: () => void;
  onSave: (storeIds: string[], days: Weekday[], priority: StopPriority, note: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [onlyTheirs, setOnlyTheirs] = useState(stores.some((store) => store.officerId === officerId));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [days, setDays] = useState<Set<Weekday>>(new Set([day]));
  const [priority, setPriority] = useState<StopPriority>('ROUTINE');
  const [note, setNote] = useState('');
  const q = query.trim().toLowerCase();
  const list = stores.filter((store) => !taken.has(store.id) && (!onlyTheirs || store.officerId === officerId) && (!q || `${store.name} ${store.area}`.toLowerCase().includes(q)));
  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const footer = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">{picked.size} selected</span>
      <div className="flex gap-2"><button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button type="button" disabled={!picked.size || !days.size} onClick={() => onSave([...picked], WEEKDAYS.filter((entry) => days.has(entry)), priority, note.trim())} className="btn btn-primary disabled:opacity-50">Add to route</button></div>
    </div>
  );
  return (
    <SlideOverPanel isOpen onClose={onClose} width="lg" title={`Add stores for ${officerName}`} subtitle="Standing stops: they come back every week on the days you choose." footer={footer}>
      <div className="space-y-4 p-5 text-xs">
        <div>
          <p className="mb-1.5 font-bold text-slate-700">Days</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((entry) => (
              <button key={entry} type="button" aria-pressed={days.has(entry)} onClick={() => setDays((current) => { const next = new Set(current); if (next.has(entry)) next.delete(entry); else next.add(entry); return next; })}
                className={`rounded-lg border px-2.5 py-1.5 font-bold ${days.has(entry) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'}`}>{WEEKDAY_SHORT[entry]}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block font-bold text-slate-700">Priority
            <select value={priority} onChange={(event) => setPriority(event.target.value as StopPriority)} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal">
              {(['HIGH', 'MEDIUM', 'ROUTINE'] as StopPriority[]).map((entry) => <option key={entry} value={entry}>{PRIORITY_LABEL[entry]}</option>)}
            </select>
          </label>
          <label className="block font-bold text-slate-700">Note for the rider
            <input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="Check facings, collect payment…" className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stores or areas" aria-label="Search stores" className="w-full bg-transparent outline-none" autoFocus /></label>
          <label className="flex items-center gap-1.5 font-semibold text-slate-600"><input type="checkbox" checked={onlyTheirs} onChange={(event) => setOnlyTheirs(event.target.checked)} />Only stores assigned to this rider</label>
        </div>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {list.length === 0 && <li className="p-4 text-center text-slate-500">No stores match. {onlyTheirs ? 'Untick “only stores assigned to this rider” to see all.' : ''}</li>}
          {list.slice(0, 200).map((store) => (
            <li key={store.id}><label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
              <input type="checkbox" checked={picked.has(store.id)} onChange={() => toggle(store.id)} className="h-4 w-4" />
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-900">{store.name}</span><span className="block truncate text-[11px] text-slate-500">{store.kind} · {store.area || 'No area'}</span></span>
              {!store.pinned && <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-700"><MapPinOff className="h-3 w-3" />no pin</span>}
            </label></li>
          ))}
          {list.length > 200 && <li className="p-3 text-center text-[11px] text-slate-500">Showing the first 200. Search to narrow the list.</li>}
        </ul>
      </div>
    </SlideOverPanel>
  );
}
