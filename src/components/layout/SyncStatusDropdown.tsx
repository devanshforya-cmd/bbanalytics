'use client';

import React, { useState, useEffect, useRef } from 'react';
import { syncManager, SyncState } from '@/lib/offline-sync';
import {
  CheckCircle2,
  AlertCircle,
  WifiOff,
  Wifi,
  RefreshCw,
  HardDrive,
  Clock,
  ChevronDown,
  Layers,
  Zap,
  Check,
  PlusCircle,
  Radio,
  Trash2,
} from 'lucide-react';

export default function SyncStatusDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(() => syncManager.getCurrentState());
  const [pendingCount, setPendingCount] = useState<number>(() => syncManager.getPendingCount());
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Subscribe to live sync manager changes
  useEffect(() => {
    const unsub = syncManager.subscribe((state, count) => {
      setSyncState(state);
      setPendingCount(count);
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
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 3000);
    } catch {
      setIsSyncing(false);
    }
  };

  const handleToggleOffline = () => {
    syncManager.toggleSimulatedOffline();
  };

  const handleSeedDemoQueue = () => {
    syncManager.seedDemoOfflineQueue();
  };

  const queueBreakdown = syncManager.getQueueBreakdown();
  const storageInfo = syncManager.getStorageUsage();
  const lastSyncTime = syncManager.getLastSyncTime();
  const isOffline = syncState === 'OFFLINE';

  return (
    <div ref={dropdownRef} className="relative">
      {/* 15a. Dynamic State Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-2xs transition cursor-pointer hover:opacity-95 ${
          syncState === 'SYNCED'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : syncState === 'PENDING'
            ? 'bg-amber-50 text-amber-800 border border-amber-300 ring-2 ring-amber-400/30 animate-pulse'
            : 'bg-rose-50 text-rose-700 border border-rose-200'
        }`}
        aria-label="Offline sync status"
        aria-expanded={isOpen}
      >
        {syncState === 'SYNCED' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
        {syncState === 'PENDING' && <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
        {syncState === 'OFFLINE' && <WifiOff className="h-3.5 w-3.5 text-rose-600 shrink-0" />}

        {/* Dynamic Label */}
        <span className="font-semibold text-[11px] sm:text-xs whitespace-nowrap">
          {syncState === 'SYNCED' && 'Synced'}
          {syncState === 'PENDING' && `${pendingCount} pending`}
          {syncState === 'OFFLINE' && 'Offline'}
        </span>

        <ChevronDown
          className={`h-3 w-3 opacity-60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 15b. Click to Expand Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-88 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150 text-xs">
          {/* Popover Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <HardDrive className="h-4 w-4 text-blue-600" />
                Offline Sync & Local Cache
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Zero-data-loss field architecture
              </div>
            </div>

            {/* Connection Status Pill */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                !isOffline
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {!isOffline ? (
                <>
                  <Wifi className="h-3 w-3 text-emerald-600" />
                  Online
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-rose-600" />
                  Offline
                </>
              )}
            </span>
          </div>

          {/* Pending Entries Breakdown Section */}
          <div className="py-3 border-b border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
              <span className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                Pending Queue ({pendingCount})
              </span>
              {pendingCount > 0 && (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                  Waiting for sync
                </span>
              )}
            </div>

            {pendingCount > 0 ? (
              <div className="space-y-1.5 bg-amber-50/40 rounded-xl p-2.5 border border-amber-200/60">
                {queueBreakdown.map((item) => (
                  <div key={item.type} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-700 font-medium">• {item.label}</span>
                    <span className="font-bold font-mono text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded text-[10px]">
                      {item.count} {item.count === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-600 border border-slate-100">
                <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>All local entries pushed to server. No pending items.</span>
              </div>
            )}
          </div>

          {/* Metadata Rows: Last Sync Time & Storage Used */}
          <div className="py-3 border-b border-slate-100 space-y-2 text-[11px]">
            {/* Last Sync */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Last Sync Time:
              </span>
              <span className="font-semibold text-slate-800">{lastSyncTime}</span>
            </div>

            {/* Storage Used */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-slate-400" />
                  Local Device Cache:
                </span>
                <span className="font-mono font-bold text-slate-800">{storageInfo.formatted}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${storageInfo.percent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleForceSync}
                disabled={isSyncing}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 px-3 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Synchronizing...' : justSynced ? 'Queue Synchronized ✓' : 'Force Sync'}
              </button>
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => syncManager.clearQueue()}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 py-2 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                  title="Clear all pending queue items immediately"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>

            {/* Testing Tools Strip */}
            <div className="flex items-center gap-1.5 pt-1">
              {/* Toggle Simulated Offline */}
              <button
                type="button"
                onClick={handleToggleOffline}
                className={`flex-1 flex items-center justify-center gap-1 rounded-lg border py-1.5 px-2 text-[10px] font-semibold transition ${
                  isOffline
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
                title="Toggle offline state to simulate field internet loss"
              >
                <Radio className="h-3 w-3" />
                {isOffline ? 'Go Back Online' : 'Simulate Offline'}
              </button>

              {/* Seed Demo Queue */}
              <button
                type="button"
                onClick={handleSeedDemoQueue}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 transition"
                title="Add 3 offline items to test pending badge"
              >
                <PlusCircle className="h-3 w-3 text-blue-600" />
                Queue 3 Items
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
