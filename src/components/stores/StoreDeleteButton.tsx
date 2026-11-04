'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { isSuperAdmin } from '@/lib/permissions';
import MobileBottomSheet from '@/components/common/MobileBottomSheet';
import { toast } from '@/components/common/Toast';
interface Impact { collection: string; version: number; children: { id: string; name: string }[]; pendingCount: number }
export default function StoreDeleteButton({ id, name, onDeleted }: { id: string; name: string; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const user = db.getCurrentUser();
  if (!isSuperAdmin(user)) return null;
  const inspect = async () => {
    setOpen(true); setImpact(null); setError(''); setConfirmation(''); setBusy(true);
    try {
      const sync = await db.syncWithSupabase(); if (!sync.success) throw new Error(sync.message);
      const response = await fetch(`/api/stores/${encodeURIComponent(id)}`, { cache: 'no-store', headers: { 'X-Workspace-User': user.id } });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not check store.');
      setImpact(body);
    } catch (error) { setError(error instanceof Error ? error.message : 'Connect and try again.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!impact || impact.children.length || confirmation !== 'DELETE') return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Workspace-User': user.id }, body: JSON.stringify({ collection: impact.collection, expectedVersion: impact.version }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Store was not deleted.');
      const sync = await db.syncWithSupabase();
      toast.success('Store deleted.'); if (!sync.success) toast.error(`Deleted on server. ${sync.message}`);
      setOpen(false); onDeleted?.();
    } catch (error) { setError(error instanceof Error ? error.message : 'Store was not deleted.'); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" onClick={inspect} aria-label={`Delete ${name}`} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Delete</button>
    <MobileBottomSheet isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title="Delete store" subtitle={name}>
      <div className="space-y-4 p-5 text-sm text-slate-700" aria-busy={busy}>
        {busy && <p role="status">Checking or deleting store…</p>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-800">{error} Close and reopen to refresh.</p>}
        {impact && <>
          {impact.children.length ? <><p>Delete these linked stores first:</p><ul className="list-inside list-disc">{impact.children.map(child => <li key={child.id}>{child.name}</li>)}</ul></> : <>
            <p>This permanently removes the store from the directory and cancels {impact.pendingCount} pending route assignments. Completed visits, orders and payment history remain available.</p>
            <label className="block space-y-2 font-semibold">Type DELETE to confirm<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" placeholder="DELETE" className="block w-full rounded-xl border border-slate-300 px-3 py-2 font-mono" /></label>
            <button type="button" disabled={busy || !!error || confirmation !== 'DELETE'} onClick={remove} className="min-h-[44px] rounded-xl bg-rose-700 px-4 font-semibold text-white disabled:opacity-50">Delete store permanently</button>
          </>}
        </>}
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-[44px] rounded-xl border border-slate-300 px-4 font-semibold">Cancel</button>
      </div>
    </MobileBottomSheet>
  </>;
}
