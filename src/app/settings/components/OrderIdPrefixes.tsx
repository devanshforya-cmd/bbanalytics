'use client';

import React, { useEffect, useState } from 'react';
import { Hash } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { canPerform } from '@/lib/permissions';
import { cleanPrefix, formatDocumentId, RESERVED_PREFIXES } from '@/lib/document-ids';
import { syncManager } from '@/lib/offline-sync';
import { toast } from '@/components/common/Toast';

/** The short code at the front of each brand's order IDs, for example FOR in FOR-0421. */
export default function OrderIdPrefixes() {
  const [, setVersion] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState('');
  useEffect(() => { const refresh = () => setVersion((value) => value + 1); window.addEventListener('bb-db-updated', refresh); return () => window.removeEventListener('bb-db-updated', refresh); }, []);
  const brands = db.getBrands('ALL');
  const canEdit = canPerform(db.getCurrentUser(), 'settings', 'EDIT');

  const save = async (code: string) => {
    if (saving) return;
    setSaving(code);
    try {
      db.setBrandPrefix(code, drafts[code] ?? db.getBrandPrefix(code));
      try { await syncManager.forceSyncNow(); } catch { /* Stays in the sync queue. */ }
      setDrafts((current) => { const next = { ...current }; delete next[code]; return next; });
      toast.success('Order ID prefix saved', `New ${code} orders will start with ${db.getBrandPrefix(code)}-. Existing order IDs never change.`);
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : 'The prefix could not be saved.'); }
    finally { setSaving(''); }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="order-id-prefixes">
      <h2 id="order-id-prefixes" className="flex items-center gap-2 text-base font-bold text-slate-900"><Hash className="h-4 w-4 text-blue-600" /> Order ID prefixes</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Order IDs look like <span className="font-mono font-bold text-slate-700">FOR-0421</span>: a two or three letter brand prefix, then a running number. Each brand starts with the first three letters of its code.
        Reserved for other documents: {Object.entries({ 'marketing sends': RESERVED_PREFIXES.marketingSends, 'field orders': RESERVED_PREFIXES.secondaryOrders, dispatches: RESERVED_PREFIXES.dispatches }).map(([label, prefix]) => `${prefix} (${label})`).join(', ')}.
      </p>
      {!brands.length ? <p className="mt-3 rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">Add a brand first. Its prefix is set automatically and can be changed here.</p> : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {brands.map((brand) => {
            const current = db.getBrandPrefix(brand.code);
            const draft = drafts[brand.code] ?? current;
            const changed = cleanPrefix(draft) !== current;
            return (
              <li key={brand.code} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-xs">
                <span className="min-w-0"><span className="block font-bold text-slate-900">{brand.name}</span><span className="text-[11px] text-slate-500">Brand code {brand.code}</span></span>
                <span className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`prefix-${brand.code}`}>Order ID prefix for {brand.name}</label>
                  <input id={`prefix-${brand.code}`} value={draft} disabled={!canEdit} maxLength={3} onChange={(event) => setDrafts((existing) => ({ ...existing, [brand.code]: cleanPrefix(event.target.value).slice(0, 3) }))}
                    className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-center font-mono text-sm font-black uppercase tracking-wider outline-none focus:border-blue-500 disabled:bg-slate-50" />
                  <span className="hidden font-mono text-slate-500 sm:inline">e.g. {formatDocumentId(cleanPrefix(draft) || '??', 421)}</span>
                  {canEdit && <button type="button" disabled={!changed || !!saving} onClick={() => void save(brand.code)} className="rounded-lg bg-blue-600 px-3 py-1.5 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{saving === brand.code ? 'Saving…' : 'Save'}</button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
