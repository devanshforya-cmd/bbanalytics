'use client';

import { confirmAction } from '@/components/common/confirm';
import React, { useState, useEffect, useRef } from 'react';
import { syncManager, SyncState, type QueuedSyncItem } from '@/lib/offline-sync';
import { CheckCircle2, AlertCircle, WifiOff, Wifi, RefreshCw, Clock, ChevronDown, Check } from 'lucide-react';

const RECORD_LABELS: Record<string, string> = {
  orders: 'Order', cheques: 'Cheque', dispatches: 'Dispatch', returns: 'Return', feedbackEntries: 'Feedback', deliveryFailures: 'Delivery failure',
  tasks: 'Task', retailers: 'Store', branches: 'Branch', distributors: 'Distributor', products: 'Product', combos: 'Combo', visits: 'Store visit',
  beatItems: 'Beat stop', shelfPhotos: 'Shelf photos', callLogs: 'Call', documents: 'Document', customers: 'Customer', influencers: 'Influencer',
  marketingSends: 'Marketing send', campaigns: 'Sale', holidays: 'Holiday', sharedAccessLinks: 'Shared link', workspaceConfig: 'Settings',
  secondaryOrders: 'Store order', notifications: 'Notification', userPreferences: 'Your preferences',
};

/** "Order FOR-0421", "Cheque 004512", "Duty status" — what a queued change is, in words. */
function describe(item: QueuedSyncItem): string {
  if (item.type === 'DUTY_STATUS') return 'Your duty status';
  if (item.type !== 'WORKSPACE_MUTATION') return 'An older change from this device';
  const payload = item.payload as Record<string, any>;
  const data = payload.data || {};
  const kind = RECORD_LABELS[String(payload.collection)] || String(payload.collection).replace(/([A-Z])/g, ' $1').toLowerCase();
  const name = data.orderNumber || data.sendNumber || data.dispatchNumber || data.chequeNumber || data.name || data.storeName || data.title || data.customerName || '';
  return `${payload.operation === 'delete' ? 'Delete ' : ''}${kind}${name ? ` ${name}` : ''}`;
}

export default function SyncStatusDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(() => syncManager.getCurrentState());
  const [pendingCount, setPendingCount] = useState<number>(() => syncManager.getPendingCount());
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [, refreshSyncView] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Subscribe to live sync manager changes
  useEffect(() => {
    const unsub = syncManager.subscribe((state, count) => {
      setSyncState(state);
      setPendingCount(count);
      refreshSyncView((revision) => revision + 1);
    });
    return () => unsub();
  }, []);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      await syncManager.forceSyncNow();
      setIsSyncing(false);
      setJustSynced(syncManager.getPendingCount() === 0 && syncManager.getErrors().length === 0);
      setTimeout(() => setJustSynced(false), 3000);
    } catch {
      setIsSyncing(false);
    }
  };

  const handleToggleOffline = async () => {
    // Pausing means nothing is saved to the server until it is turned back on.
    if (!syncManager.isSimulated() && !(await confirmAction({ title: 'Pause saving to the server?', consequences: ['Changes stay on this device only until you resume.', 'Other people will not see them meanwhile.'], confirmLabel: 'Pause saving' }))) return;
    syncManager.toggleSimulatedOffline();
  };

  const downloadPending = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(syncManager.getQueue(), null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'bb-pending-changes.json'; anchor.click(); URL.revokeObjectURL(url);
  };
  const discard = async (id: string, conflict: boolean) => {
    const ok = await confirmAction({
      title: conflict ? 'Keep the version on the server?' : 'Discard this change?',
      consequences: [conflict ? 'Your change to this record is dropped and the server’s version comes back.' : 'This change will not be saved. A copy stays on this device in case you need it.'],
      confirmLabel: conflict ? 'Keep their version' : 'Discard change', destructive: !conflict,
    });
    if (!ok) return;
    syncManager.discardItem(id);
    void handleForceSync(); // brings back the server's copy of the record
  };
  const errors = syncManager.getErrors();
  const queue = syncManager.getQueue();
  const stuck = queue.filter((item) => item.lastError || item.conflictVersion !== undefined);
  const itemErrors = new Set(queue.map((item) => item.lastError).filter(Boolean));
  const otherErrors = Array.from(new Set(errors)).filter((error) => !itemErrors.has(error));
  const lastSyncTime = syncManager.getLastSyncTime();
  const isOffline = syncState === 'OFFLINE';

  return (
    <div ref={dropdownRef} className="relative">
      {/* 15a. Dynamic State Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex h-10 w-10 items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition cursor-pointer hover:bg-black/[0.05] sm:h-auto sm:w-auto sm:px-2.5 sm:py-1 sm:shadow-2xs sm:hover:bg-transparent sm:hover:opacity-95 ${
          syncState === 'SYNCED'
            ? 'sm:bg-emerald-50 text-emerald-700 sm:border sm:border-emerald-200'
            : syncState === 'PENDING'
            ? 'sm:bg-amber-50 text-amber-800 sm:border sm:border-amber-300 sm:ring-2 sm:ring-amber-400/30'
            : 'sm:bg-rose-50 text-rose-700 sm:border sm:border-rose-200'
        }`}
        aria-label={syncState === 'SYNCED' ? 'All changes synced' : syncState === 'PENDING' ? `${pendingCount} changes waiting to sync` : 'Offline'}
        aria-expanded={isOpen}
      >
        {syncState === 'SYNCED' && <CheckCircle2 className="h-[18px] w-[18px] sm:h-3.5 sm:w-3.5 text-emerald-600 shrink-0" />}
        {syncState === 'PENDING' && <AlertCircle className="h-[18px] w-[18px] sm:h-3.5 sm:w-3.5 text-amber-600 shrink-0" />}
        {syncState === 'OFFLINE' && <WifiOff className="h-[18px] w-[18px] sm:h-3.5 sm:w-3.5 text-rose-600 shrink-0" />}
        {syncState === 'PENDING' && pendingCount > 0 && <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[9px] font-bold text-white ring-2 ring-white sm:hidden">{pendingCount}</span>}

        {/* Dynamic Label */}
        <span className="hidden font-semibold text-xs whitespace-nowrap sm:inline">
          {syncState === 'SYNCED' && 'Synced'}
          {syncState === 'PENDING' && `${pendingCount} pending`}
          {syncState === 'OFFLINE' && 'Offline'}
        </span>

        <ChevronDown
          className={`hidden sm:block h-3 w-3 opacity-60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="fixed inset-x-3 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Saving &amp; sync</h2>
              <p className="mt-0.5 text-xs text-slate-600">Changes are saved on this device first, then sent to the server. If the internet drops, nothing is lost: it sends when you are back online.</p>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isOffline ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {isOffline ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}{isOffline ? 'Offline' : 'Online'}
            </span>
          </div>

          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            {pendingCount === 0 ? (
              <p className="flex items-center gap-2 text-xs text-slate-700"><Check className="h-4 w-4 shrink-0 text-emerald-600" />Everything is saved on the server.</p>
            ) : (
              <p className="text-xs text-slate-700"><strong className="text-slate-900">{pendingCount} {pendingCount === 1 ? 'change is' : 'changes are'} waiting.</strong>{stuck.length ? ` ${stuck.length} could not be saved; see why below.` : ' They send by themselves within a few seconds.'}</p>
            )}
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600"><Clock className="h-3 w-3" />Last saved to the server: {lastSyncTime}</p>
          </div>

          {queue.length > 0 && (
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {queue.slice(0, 20).map((item) => {
                const conflict = item.conflictVersion !== undefined;
                return (
                  <li key={item.id} className={`rounded-xl border p-2.5 ${item.lastError ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200'}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-slate-900">{describe(item)}</span>
                      <span className="shrink-0 text-[11px] text-slate-600">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className={`mt-0.5 text-[11px] ${item.lastError ? 'text-rose-800' : 'text-slate-600'}`}>
                      {conflict ? 'Someone else changed this record after you. Keep their version, or save yours over it.' : item.lastError || 'Waiting to send.'}
                    </p>
                    {(item.lastError || conflict) && (
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                        {conflict ? (
                          <>
                            <button type="button" onClick={() => void discard(item.id, true)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-800 hover:bg-slate-50">Keep their version</button>
                            {item.conflictVersion! >= 0 && <button type="button" onClick={() => { syncManager.retryConflict(item.id); void handleForceSync(); }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-800 hover:bg-slate-50">Save mine over it</button>}
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => { syncManager.retryItem(item.id); void handleForceSync(); }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-800 hover:bg-slate-50">Try again</button>
                            <button type="button" onClick={() => void discard(item.id, false)} className="rounded-lg px-2.5 py-1 text-rose-700 hover:bg-rose-100">Discard change</button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {otherErrors.length > 0 && (
            <div role="alert" className="mt-3 space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-800">
              {otherErrors.map((error) => <p key={error}>{error}</p>)}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={handleForceSync} disabled={isSyncing}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing…' : justSynced ? 'All saved' : 'Sync now'}
            </button>
            {pendingCount > 0 && (
              <button type="button" onClick={downloadPending} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Download a copy</button>
            )}
          </div>
          {process.env.NODE_ENV === 'development' && (
            <button type="button" onClick={handleToggleOffline} className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] text-slate-600">
              {syncManager.isSimulated() ? 'Testing: go back online' : 'Testing: act as offline'}
            </button>
          )}
          {syncManager.isSimulated() && process.env.NODE_ENV !== 'development' && (
            <button type="button" onClick={handleToggleOffline} className="mt-2 w-full rounded-lg bg-amber-50 py-1.5 text-[11px] font-semibold text-amber-800">Saving to the server is paused on this device. Resume</button>
          )}
        </div>
      )}
    </div>
  );
}
