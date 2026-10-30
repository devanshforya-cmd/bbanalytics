'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/db/db-service';
import { canWriteWorkspaceRecord } from '@/lib/db/workspace-policy';
import { syncManager } from '@/lib/offline-sync';
import type { Branch, Retailer } from '@/lib/types';
import { toast } from '@/components/common/Toast';

export default function StoreAreaEditor({ record, entityType }: { record: Retailer | Branch; entityType: 'RETAILER' | 'BRANCH' }) {
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState(record.city || '');
  const [area, setArea] = useState(record.area || '');
  const [saving, setSaving] = useState(false);
  const collection = entityType === 'BRANCH' ? 'branches' : 'retailers';
  const user = db.getCurrentUser();
  const createdBy = 'createdById' in record && typeof record.createdById === 'string' ? record.createdById : '';
  const canEdit = canWriteWorkspaceRecord(user, { collection, id: record.id, data: { ...record }, created_by: createdBy, version: 0 }, 'EDIT', db.getUsers(), []);
  useEffect(() => { if (!editing) { setCity(record.city || ''); setArea(record.area || ''); } }, [record.city, record.area, editing]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !canEdit) return;
    const values = { city: city.trim(), area: area.trim() };
    if (!values.city || !values.area || values.city.length > 100 || values.area.length > 100 || /[\u0000-\u001f\u007f]/.test(values.city + values.area)) { toast.error('Enter a city and area, each at most 100 characters.'); return; }
    setSaving(true);
    try {
      const updated = entityType === 'BRANCH' ? db.updateBranch(record.id, values) : db.updateRetailer(record.id, values);
      if (!updated) throw new Error('Store no longer available.');
      const result = await db.syncWithSupabase();
      const pending = syncManager.getWorkspaceMutations().some(mutation => mutation.collection === collection && mutation.id === record.id);
      if (result.success && !pending) toast.success('Store city and area saved.');
      else toast.info('Area saved on this device. Server confirmation is pending; check Sync status.');
      setEditing(false);
    } catch { toast.error('Area could not be confirmed. Check Sync status before trying again.'); }
    finally { setSaving(false); }
  };

  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-slate-800">Area for selling comparisons</strong><p className="mt-1 text-slate-600">{record.city && record.area ? `${record.area}, ${record.city}` : 'City and area have not both been recorded.'}</p></div>{canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 font-bold text-blue-700">Edit city &amp; area</button>}</div>
    {canEdit && editing && <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="font-semibold text-slate-700">City<input value={city} onChange={event => setCity(event.target.value)} required maxLength={100} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 font-normal" /></label><label className="font-semibold text-slate-700">Area / Ward<input value={area} onChange={event => setArea(event.target.value)} required maxLength={100} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2.5 font-normal" /></label></div>
      <p className="text-[11px] text-slate-500">Use the same city and area spelling for stores that should be compared. Branches are compared with branches; retail outlets with retail outlets.</p>
      <div className="flex gap-2"><button type="submit" disabled={saving} className="min-h-[40px] rounded-lg bg-blue-600 px-4 font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save area'}</button><button type="button" disabled={saving} onClick={() => setEditing(false)} className="min-h-[40px] rounded-lg px-3 font-semibold text-slate-600">Cancel</button></div>
    </form>}
  </section>;
}
