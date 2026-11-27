'use client';

import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Store, Trash2, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { toast } from '@/components/common/Toast';
import { isStoreDocument } from '@/lib/document-types';
import type { DocumentTypeConfig } from '@/lib/types';

/**
 * Add, rename, switch off and delete document types. Each type says whether it is a store document
 * (the form asks which store, chain or outlet) or not (no store list).
 */
export default function DocumentTypesManager({ compact = false }: { compact?: boolean }) {
  const [types, setTypes] = useState<DocumentTypeConfig[]>(() => [...db.getDocumentTypes()]);
  const refresh = () => setTypes([...db.getDocumentTypes()]);
  useEffect(() => { window.addEventListener('bb-db-updated', refresh); return () => window.removeEventListener('bb-db-updated', refresh); }, []);
  const [name, setName] = useState('');
  const [storeBased, setStoreBased] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const run = (fn: () => void, done?: string) => { try { fn(); refresh(); if (done) toast.success(done); } catch (error) { toast.error(error instanceof Error ? error.message : 'Not saved.'); } };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => { db.addDocumentType(name, storeBased); setName(''); }, `${name.trim()} added.`);
  };

  const kind = (on: boolean) => `rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${on ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`;
  return (
    <div className="space-y-3 text-xs">
      <form onSubmit={add} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
        <input aria-label="New document type" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tax clearance certificate"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500" />
        <div role="radiogroup" aria-label="Is it a store document?" className="flex shrink-0 gap-0.5 rounded-lg bg-slate-200/70 p-0.5">
          <button type="button" role="radio" aria-checked={storeBased} onClick={() => setStoreBased(true)} className={kind(storeBased)}>Store document</button>
          <button type="button" role="radio" aria-checked={!storeBased} onClick={() => setStoreBased(false)} className={kind(!storeBased)}>Not for a store</button>
        </div>
        <button type="submit" disabled={!name.trim()} className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add type</button>
      </form>

      <ul className={`divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white ${compact ? 'max-h-[50vh] overflow-y-auto' : ''}`}>
        {types.map((type) => {
          const store = isStoreDocument(type);
          const used = db.documentTypeUsage(type);
          return (
            <li key={type.id} className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${type.isActive ? '' : 'bg-slate-50'}`}>
              <div className="min-w-0 flex-1">
                {editing === type.id ? (
                  <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); run(() => { db.updateDocumentType(type.id, { name: draft }); setEditing(null); }, 'Renamed.'); }}>
                    <input autoFocus aria-label={`New name for ${type.name}`} value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1" />
                    <button type="submit" aria-label="Save name" className="rounded-lg bg-blue-600 p-1.5 text-white"><Check className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Cancel" onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500"><X className="h-3.5 w-3.5" /></button>
                  </form>
                ) : (
                  <>
                    <span className={`block font-semibold ${type.isActive ? 'text-slate-900' : 'text-slate-500 line-through'}`}>{type.name}</span>
                    <span className="text-[11px] text-slate-500">{used ? `${used} ${used === 1 ? 'document' : 'documents'}` : 'Not used yet'}{type.isActive ? '' : ' · switched off'}</span>
                  </>
                )}
              </div>
              <button type="button" onClick={() => run(() => db.updateDocumentType(type.id, { storeBased: !store }))} aria-pressed={store}
                title={store ? 'The form asks which store, chain or outlet' : 'The form does not show the store list'}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${store ? 'bg-blue-50 text-blue-800 hover:bg-blue-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                <Store className="h-3 w-3" />{store ? 'Store document' : 'Not for a store'}
              </button>
              <button type="button" onClick={() => run(() => db.updateDocumentType(type.id, { isActive: !type.isActive }))}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${type.isActive ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>{type.isActive ? 'On' : 'Off'}</button>
              <button type="button" aria-label={`Rename ${type.name}`} onClick={() => { setEditing(type.id); setDraft(type.name); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
              {confirmDelete === type.id ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-[11px] text-rose-800">{used ? `Delete? ${used} filed ${used === 1 ? 'document keeps' : 'documents keep'} the name.` : 'Delete?'}</span>
                  <button type="button" onClick={() => run(() => { db.deleteDocumentType(type.id); setConfirmDelete(null); }, `${type.name} deleted.`)} className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white">Delete</button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600">Keep</button>
                </span>
              ) : (
                <button type="button" aria-label={`Delete ${type.name}`} onClick={() => setConfirmDelete(type.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </li>
          );
        })}
        {types.length === 0 && <li className="p-4 text-center text-slate-500">No document types. Add one above.</li>}
      </ul>
    </div>
  );
}
