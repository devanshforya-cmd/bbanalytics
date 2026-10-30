'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, RotateCcw, Save } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { averageDeliveryTime } from '@/lib/dashboard-metrics';
import { canPerform } from '@/lib/permissions';
import { validateOrderOptions, requiredOrderOptionActions, type OrderOptions, type OrderOptionKind } from '@/lib/order-options';
import { syncManager } from '@/lib/offline-sync';
import { toast } from '@/components/common/Toast';

export default function ChannelSettings() {
  const [catalog, setCatalog] = useState<OrderOptions>(() => db.getOrderOptions());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => { refresh(value => value + 1); if (!dirty) setCatalog(db.getOrderOptions()); };
    window.addEventListener('bb-db-updated', update);
    return () => window.removeEventListener('bb-db-updated', update);
  }, [dirty]);
  const user = db.getCurrentUser();
  const orders = db.getOrders();
  const persisted = db.getOrderOptions();
  const update = (kind: OrderOptionKind, id: string, changes: Partial<OrderOptions[OrderOptionKind][number]>) => {
    setCatalog(value => ({ ...value, [kind]: value[kind].map(row => row.id === id ? { ...row, ...changes } : row) })); setDirty(true);
  };
  const add = (kind: OrderOptionKind) => {
    setCatalog(value => ({ ...value, [kind]: [...value[kind], { id: `option_${crypto.randomUUID()}`, name: '', active: true }] })); setDirty(true);
  };
  const remove = (kind: OrderOptionKind, id: string) => {
    const row = catalog[kind].find(entry => entry.id === id);
    if (!row) return;
    const field = kind === 'channels' ? 'platform' : 'deliveryMethod';
    const used = orders.some(order => order[field] === row.name) || kind === 'deliveryMethods' && db.getDeliveryFailures().some(failure => failure.deliveryMethod === row.name);
    setCatalog(value => ({ ...value, [kind]: used ? value[kind].map(entry => entry.id === id ? { ...entry, active: false } : entry) : value[kind].filter(entry => entry.id !== id) })); setDirty(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      const next = validateOrderOptions(catalog);
      if (requiredOrderOptionActions(db.getOrderOptions(), next).some(action => !canPerform(user, 'settings', action))) throw new Error('Your settings permissions do not allow these changes.');
      db.setOrderOptions(next);
      await syncManager.forceSyncNow();
      if (syncManager.getWorkspaceMutations().some(row => row.collection === 'workspaceConfig' && row.id === 'workspace')) throw new Error('Changes remain pending on this device. Open Sync status and retry when connected.');
      setCatalog(db.getOrderOptions()); setDirty(false); toast.success('Channels and delivery methods saved.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Settings were not saved.'); }
    finally { setSaving(false); }
  };
  return <div className="space-y-6">
    <p className="text-xs text-slate-600">Add or rename choices for future orders. Deleting a used choice archives it from new orders; historical order labels and totals remain intact. Courier and messaging accounts are managed separately.</p>
    {(['channels', 'deliveryMethods'] as const).map(kind => {
      const label = kind === 'channels' ? 'Sales channels' : 'Delivery methods';
      const field = kind === 'channels' ? 'platform' : 'deliveryMethod';
      const historical = [...new Set(orders.map(order => order[field]))].filter(name => name && !catalog[kind].some(row => row.name === name));
      return <section key={kind} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h3 className="text-base font-bold text-slate-900">{label}</h3>
          {canPerform(user, 'settings', 'CREATE') && <button type="button" disabled={saving || catalog[kind].length >= 100} onClick={() => add(kind)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50"><Plus className="w-4 h-4" /> Add {kind === 'channels' ? 'channel' : 'delivery method'}</button>}
        </div>
        <div className="space-y-2">{catalog[kind].map(row => {
          const matching = orders.filter(order => order[field] === row.name);
          return <div key={row.id} className={`rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-3 ${row.active ? '' : 'bg-slate-50'}`}>
            <div className="flex-1 min-w-40">
              <label className="sr-only" htmlFor={row.id}>{label} name</label>
              <input id={row.id} maxLength={60} value={row.name} disabled={saving || !(canPerform(user, 'settings', 'EDIT') || !persisted[kind].some(entry => entry.id === row.id) && canPerform(user, 'settings', 'CREATE'))} onChange={event => update(kind, row.id, { name: event.target.value })} placeholder={kind === 'channels' ? 'Channel name' : 'Delivery method name'} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:border-transparent disabled:bg-transparent" />
              <p className="text-xs text-slate-500 mt-1">{matching.length} orders{kind === 'channels' ? ` · ${orders.length ? (matching.length / orders.length * 100).toFixed(1) : '0.0'}% of recorded orders` : ` · ${averageDeliveryTime(matching)}`}{!row.active && ' · Archived'}</p>
            </div>
            {row.active && canPerform(user, 'settings', 'DELETE') && <button type="button" disabled={saving} onClick={() => remove(kind, row.id)} aria-label={`Delete ${row.name || 'unnamed entry'}`} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /> Delete</button>}
            {!row.active && canPerform(user, 'settings', 'EDIT') && <button type="button" disabled={saving} onClick={() => update(kind, row.id, { active: true })} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"><RotateCcw className="w-4 h-4" /> Restore</button>}
          </div>;
        })}</div>
        {historical.length > 0 && <p className="text-xs text-slate-500">Historical attribution: {historical.join(', ')}. These labels remain on existing orders.</p>}
      </section>;
    })}
    {dirty && <div className="flex flex-wrap items-center justify-end gap-3"><button type="button" disabled={saving} onClick={() => { setCatalog(db.getOrderOptions()); setDirty(false); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Reset form</button><button type="button" disabled={saving} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save channels & logistics'}</button></div>}
  </div>;
}
