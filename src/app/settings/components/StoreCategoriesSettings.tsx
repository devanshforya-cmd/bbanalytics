'use client';

import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { canPerform } from '@/lib/permissions';
import { toast } from '@/components/common/Toast';
import { STORE_CHANNELS } from '@/lib/store-channels';

/**
 * Store categories (Kirana, Pharmacy, Cosmetics…) that staff pick when adding a store.
 * The store type (MT, SAMT, Distributor, Retail store) is fixed; categories are yours to shape.
 */
export default function StoreCategoriesSettings() {
  const [, setVersion] = useState(0);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { const refresh = () => setVersion((v) => v + 1); window.addEventListener('bb-db-updated', refresh); return () => window.removeEventListener('bb-db-updated', refresh); }, []);
  const canEdit = canPerform(db.getCurrentUser(), 'settings', 'EDIT');
  const categories = db.getStoreCategories();
  const bump = () => setVersion((v) => v + 1);

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) { toast.error(`"${name}" is already a category.`); return; }
    db.addStoreCategory(name); setDraft(''); bump(); toast.success(`Category "${name}" added.`);
  };
  const saveRename = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) { toast.error('Enter a name.'); return; }
    db.renameStoreCategory(editing.id, name); setEditing(null); bump(); toast.success('Category renamed. Stores using it were updated.');
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="store-categories-title">
      <div>
        <h2 id="store-categories-title" className="text-base font-bold text-slate-900">Store categories</h2>
        <p className="mt-1 text-xs text-slate-600">Picked when adding a SAMT or retail store, and used to filter stores and reports. Store types are fixed: {STORE_CHANNELS.map((c) => c.label).join(', ')}.</p>
      </div>
      {canEdit && (
        <form onSubmit={add} className="flex gap-2">
          <label htmlFor="new-store-category" className="sr-only">New store category</label>
          <input id="new-store-category" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Pharmacy, Cosmetics, Kirana" className="flex-1 rounded-xl border border-slate-300 p-2.5 text-sm" />
          <button type="submit" className="btn btn-primary"><Plus className="h-4 w-4" /> Add category</button>
        </form>
      )}
      {categories.length === 0 ? <p className="text-xs text-slate-500">No categories yet. Add the ones your team uses.</p> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {categories.map((cat) => (
            <li key={cat.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm ${cat.isActive ? '' : 'bg-slate-50 text-slate-500'}`}>
              {editing?.id === cat.id ? (
                <span className="flex flex-1 items-center gap-2">
                  <label htmlFor={`rename-${cat.id}`} className="sr-only">Category name</label>
                  <input id={`rename-${cat.id}`} autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(null); }} className="flex-1 rounded-lg border border-slate-300 p-1.5 text-sm" />
                  <button type="button" onClick={saveRename} aria-label="Save name" className="rounded p-1 text-emerald-700 hover:bg-emerald-50"><Check className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                </span>
              ) : (
                <span className="min-w-0">
                  <span className="font-semibold text-slate-900">{cat.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{db.storeCategoryUsage(cat.name)} stores{cat.isActive ? '' : ' · hidden from forms'}</span>
                </span>
              )}
              {canEdit && editing?.id !== cat.id && (
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setEditing({ id: cat.id, name: cat.name })} aria-label={`Rename ${cat.name}`} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => { db.toggleStoreCategory(cat.id); bump(); }} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">{cat.isActive ? 'Hide' : 'Show'}</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
