'use client';

import { useState } from 'react';
import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { isSuperAdmin } from '@/lib/permissions';
import type { Product } from '@/lib/types';
import MobileBottomSheet from '@/components/common/MobileBottomSheet';
import { toast } from '@/components/common/Toast';

interface Usage { version: number; canDelete: boolean; stockQty: number; references: { collection: string; count: number }[] }

export default function ProductActions({ product, onChanged }: { product: Product; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState('');
  const user = db.getCurrentUser();
  if (!isSuperAdmin(user)) return null;

  const inspect = async () => {
    setOpen(true); setBusy(true); setError(''); setUsage(null);
    try {
      const sync = await db.syncWithSupabase();
      if (!sync.success) throw new Error(sync.message);
      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`, { cache: 'no-store', headers: { 'X-Workspace-User': user.id } });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not check product usage.');
      setUsage(result);
    } catch (err) { setError(err instanceof Error ? err.message : 'Connect to the internet and try again.'); }
    finally { setBusy(false); }
  };
  const change = async (method: 'DELETE' | 'PATCH') => {
    if (!usage) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`, { method,
        headers: { 'Content-Type': 'application/json', 'X-Workspace-User': user.id },
        body: JSON.stringify({ expectedVersion: usage.version, ...(method === 'PATCH' ? { active: product.active === false } : {}) }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'The product was not changed.');
      const sync = await db.syncWithSupabase();
      toast.success(method === 'DELETE' ? 'Product deleted.' : product.active === false ? 'Product restored.' : 'Product archived. Its history is preserved.');
      if (!sync.success) toast.error(`Saved on the server. ${sync.message}`);
      onChanged?.(); setOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'The product was not changed.'); }
    finally { setBusy(false); }
  };

  return <>
    <button type="button" onClick={inspect} aria-label={`Manage ${product.name}`} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">
      {product.active === false ? <RotateCcw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
      {product.active === false ? 'Manage archived' : 'Delete / archive'}
    </button>
    <MobileBottomSheet isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title="Manage product" subtitle={product.name}>
      <div className="space-y-4 p-5 text-sm text-slate-700" aria-busy={busy}>
        {busy && <p role="status">Checking or saving this product…</p>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-800">{error} Close and reopen to refresh its latest status.</p>}
        {usage && <>
          <p>{usage.canDelete ? 'This product has no linked records or warehouse stock. Permanent deletion cannot be undone.' : 'This product has linked records or warehouse stock. Archive it to remove it from new sales while keeping its history.'}</p>
          {!!usage.stockQty && <p>Warehouse stock: {usage.stockQty} units</p>}
          {usage.references.length > 0 && <ul className="list-inside list-disc">{usage.references.map(ref => <li key={ref.collection}>{ref.collection}: {ref.count}</li>)}</ul>}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy || !!error} onClick={() => change('PATCH')} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 font-semibold text-white disabled:opacity-50">
              <Archive className="h-4 w-4" />{product.active === false ? 'Restore product' : 'Archive product'}
            </button>
            {usage.canDelete && <button type="button" disabled={busy || !!error} onClick={() => change('DELETE')} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-rose-700 px-4 font-semibold text-white disabled:opacity-50"><Trash2 className="h-4 w-4" />Permanently delete</button>}
          </div>
        </>}
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-[44px] rounded-xl border border-slate-300 px-4 font-semibold">Cancel</button>
      </div>
    </MobileBottomSheet>
  </>;
}
