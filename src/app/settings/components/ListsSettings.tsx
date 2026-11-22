'use client';

import React, { useEffect, useState } from 'react';
import { Archive, Check, GitMerge, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { canPerform } from '@/lib/permissions';
import { syncManager } from '@/lib/offline-sync';
import ConfirmModal from '@/components/common/ConfirmModal';
import { toast } from '@/components/common/Toast';

type Collection = 'influencerNiches' | 'marketingOptions' | 'failureReasons';
interface Row { id: string; name: string; isArchived: boolean; usage?: number }
interface Section { key: string; title: string; description: string; collection: Collection; noun: string; rows: () => Row[]; add: (name: string) => void; niche?: boolean }

/**
 * Admin management of the pick-lists staff can extend while filling a form:
 * rename, archive, restore, and (for niches) merge or delete when unused.
 */
export default function ListsSettings() {
  const [, setVersion] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ key: string; id: string; name: string } | null>(null);
  const [merging, setMerging] = useState<{ id: string; name: string; target: string } | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const refresh = () => setVersion((value) => value + 1); window.addEventListener('bb-db-updated', refresh); return () => window.removeEventListener('bb-db-updated', refresh); }, []);

  const user = db.getCurrentUser();
  const canEdit = canPerform(user, 'settings', 'EDIT');
  const sections: Section[] = [
    { key: 'niche', title: 'Influencer niches', description: 'Categories an influencer can belong to. One influencer can have several.', collection: 'influencerNiches', noun: 'niche', niche: true,
      rows: () => db.getInfluencerNiches(true).map((row) => ({ id: row.id, name: row.name, isArchived: row.isArchived, usage: db.nicheUsage(row.id) })), add: (name) => { db.addInfluencerNiche(name); } },
    { key: 'reach', title: 'Reach-out platforms', description: 'Where the team contacts an influencer to arrange a send.', collection: 'marketingOptions', noun: 'reach-out platform',
      rows: () => db.getMarketingOptions('REACH_OUT', true), add: (name) => { db.addMarketingOption('REACH_OUT', name); } },
    { key: 'content', title: 'Content platforms', description: 'Where content is posted. A separate list from reach-out platforms.', collection: 'marketingOptions', noun: 'content platform',
      rows: () => db.getMarketingOptions('CONTENT_PLATFORM', true), add: (name) => { db.addMarketingOption('CONTENT_PLATFORM', name); } },
    { key: 'reason', title: 'Delivery failure reasons', description: 'Reasons offered on the delivery failure form. Saved failures keep the reason they were logged with.', collection: 'failureReasons', noun: 'reason',
      rows: () => db.getFailureReasons(true), add: (name) => { db.addFailureReason(name); } },
  ];

  /** One action at a time, with the result confirmed against the server. */
  const run = async (action: () => void, done: string) => {
    if (busy) return;
    setBusy(true);
    try { action(); try { await syncManager.forceSyncNow(); } catch { /* Stays in the sync queue. */ } toast.success(done); }
    catch (problem) { toast.error(problem instanceof Error ? problem.message : 'That change could not be saved.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-900">Lists &amp; categories</h2>
        <p className="text-xs text-slate-500">Staff can add to these lists while filling a form. Renaming, merging and archiving are done here.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sections.map((section) => {
          const rows = section.rows();
          const draft = drafts[section.key] || '';
          return (
            <section key={section.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs" aria-labelledby={`list-${section.key}`}>
              <h3 id={`list-${section.key}`} className="text-sm font-bold text-slate-900">{section.title} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{rows.filter((row) => !row.isArchived).length} active</span></h3>
              <p className="mt-0.5 text-[11px] text-slate-500">{section.description}</p>
              {canEdit && (
                <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!draft.trim()) return; void run(() => section.add(draft), `Added "${draft.trim()}"`).then(() => setDrafts((current) => ({ ...current, [section.key]: '' }))); }}>
                  <input aria-label={`New ${section.noun}`} value={draft} maxLength={60} onChange={(event) => setDrafts((current) => ({ ...current, [section.key]: event.target.value }))} placeholder={`Add a ${section.noun}`}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500" />
                  <button type="submit" disabled={busy || !draft.trim()} className="btn btn-primary shrink-0 disabled:cursor-not-allowed disabled:bg-blue-300"><Plus className="h-3.5 w-3.5" /> Add</button>
                </form>
              )}
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {rows.map((row) => (
                  <li key={row.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs ${row.isArchived ? 'bg-slate-50' : ''}`}>
                    {editing?.key === section.key && editing.id === row.id ? (
                      <form className="flex flex-1 gap-1.5" onSubmit={(event) => { event.preventDefault(); const name = editing.name; void run(() => db.renameLookup(section.collection, row.id, name), 'Renamed').then(() => setEditing(null)); }}>
                        <input autoFocus aria-label={`Rename ${row.name}`} value={editing.name} maxLength={60} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="w-full rounded-lg border border-blue-400 px-2 py-1 text-xs outline-none" />
                        <button type="submit" disabled={busy} aria-label="Save name" className="rounded-lg bg-blue-600 p-1.5 text-white disabled:bg-blue-300"><Check className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Cancel rename" onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500"><X className="h-3.5 w-3.5" /></button>
                      </form>
                    ) : (
                      <>
                        <span className={`min-w-0 font-semibold ${row.isArchived ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{row.name}
                          {row.isArchived && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-600 no-underline">Archived</span>}
                          {section.niche && <span className="ml-2 text-[11px] font-medium text-slate-500 no-underline">{row.usage} influencer{row.usage === 1 ? '' : 's'}</span>}
                        </span>
                        {canEdit && (
                          <span className="flex shrink-0 items-center gap-0.5">
                            {!row.isArchived && <button type="button" title="Rename" aria-label={`Rename ${row.name}`} onClick={() => setEditing({ key: section.key, id: row.id, name: row.name })} className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>}
                            {section.niche && !row.isArchived && rows.filter((entry) => !entry.isArchived).length > 1 && <button type="button" title="Merge into another niche" aria-label={`Merge ${row.name}`} onClick={() => setMerging({ id: row.id, name: row.name, target: '' })} className="rounded-lg p-1.5 text-slate-500 hover:bg-purple-50 hover:text-purple-600"><GitMerge className="h-3.5 w-3.5" /></button>}
                            <button type="button" disabled={busy} title={row.isArchived ? 'Restore' : 'Archive'} aria-label={`${row.isArchived ? 'Restore' : 'Archive'} ${row.name}`}
                              onClick={() => void run(() => db.setLookupArchived(section.collection, row.id, !row.isArchived), row.isArchived ? `Restored "${row.name}"` : `Archived "${row.name}"`)} className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700">
                              {row.isArchived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                            </button>
                            {section.niche && row.usage === 0 && <button type="button" title="Delete (not used by any influencer)" aria-label={`Delete ${row.name}`} onClick={() => setDeleting(row)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                          </span>
                        )}
                      </>
                    )}
                  </li>
                ))}
                {!rows.length && <li className="px-3 py-4 text-center text-xs text-slate-500">Nothing here yet. {canEdit ? 'Add the first one above, or let staff add them from a form.' : ''}</li>}
              </ul>
            </section>
          );
        })}
      </div>

      <ConfirmModal isOpen={!!merging} variant="info" title={`Merge "${merging?.name}" into another niche`} confirmLabel="Merge niches"
        message="Every influencer in this niche moves to the one you choose. This niche is then archived."
        onCancel={() => setMerging(null)}
        onConfirm={() => { if (!merging?.target) { toast.error('Choose the niche to merge into.'); return; } const { id, target } = merging; void run(() => { db.mergeInfluencerNiches(id, target); }, 'Niches merged').then(() => setMerging(null)); }}>
        <label className="block text-xs font-bold text-slate-700">Merge into
          <select value={merging?.target || ''} onChange={(event) => merging && setMerging({ ...merging, target: event.target.value })} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium">
            <option value="">Choose a niche</option>
            {db.getInfluencerNiches().filter((niche) => niche.id !== merging?.id).map((niche) => <option key={niche.id} value={niche.id}>{niche.name}</option>)}
          </select>
        </label>
      </ConfirmModal>
      <ConfirmModal isOpen={!!deleting} isDestructive title={`Delete "${deleting?.name}"?`} confirmLabel="Delete niche" message="No influencer uses this niche. Deleting it removes it from the list permanently."
        onCancel={() => setDeleting(null)} onConfirm={() => { if (!deleting) return; const id = deleting.id; void run(() => db.deleteInfluencerNiche(id), 'Niche deleted').then(() => setDeleting(null)); }} />
    </div>
  );
}
