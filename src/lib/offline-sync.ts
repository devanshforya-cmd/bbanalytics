// Offline-First Synchronization Engine
// Uses LocalStorage & IndexedDB fallbacks to queue operations when offline
// Broadcasts sync state: 🟢 'SYNCED' | 🟡 'PENDING' | 🔴 'OFFLINE'

export type SyncState = 'SYNCED' | 'PENDING' | 'OFFLINE';

export interface QueuedSyncItem {
  id: string;
  type: string;
  endpoint: string;
  payload: Record<string, unknown>;
  timestamp: string;
  attempts: number;
  lastAttemptAt?: string;
}

const STORAGE_KEY = 'bb_command_center_offline_queue';
const LAST_SYNC_KEY = 'bb_last_sync_timestamp';
const SIMULATED_OFFLINE_KEY = 'bb_simulated_offline_mode';

class OfflineSyncManager {
  private listeners: ((state: SyncState, pendingCount: number) => void)[] = [];
  private isOnline: boolean = true;
  private isSimulatedOffline: boolean = false;
  private queue: QueuedSyncItem[] = [];
  private lastSyncTime: string = 'Just now';

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;
      try {
        this.isSimulatedOffline = localStorage.getItem(SIMULATED_OFFLINE_KEY) === 'true';
        this.lastSyncTime = localStorage.getItem(LAST_SYNC_KEY) || 'Today at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        // ignore
      }
      this.loadQueue();

      window.addEventListener('online', () => {
        this.isOnline = true;
        if (!this.isSimulatedOffline) {
          this.triggerSync();
        } else {
          this.notify();
        }
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notify();
      });
    }
  }

  private loadQueue() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const raw = JSON.parse(stored);
        if (Array.isArray(raw)) {
          // GPS pings are transient; business records stay queued until sync succeeds.
          this.queue = raw.filter((item) => {
            if (!item || typeof item !== 'object') return false;
            if (item.type === 'GPS_PING') return false;
            return true;
          });
          // If invalid or transient records were pruned, persist the remaining queue.
          if (this.queue.length !== raw.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
          }
        }
      }
    } catch {
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.error('Failed to save offline sync queue', e);
    }
    this.notify();
  }

  public subscribe(callback: (state: SyncState, pendingCount: number) => void) {
    this.listeners.push(callback);
    callback(this.getCurrentState(), this.queue.length);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notify() {
    const state = this.getCurrentState();
    const count = this.queue.length;
    for (const listener of this.listeners) {
      listener(state, count);
    }
  }

  public getCurrentState(): SyncState {
    if (!this.isOnline || this.isSimulatedOffline) return 'OFFLINE';
    if (this.queue.length > 0) return 'PENDING';
    return 'SYNCED';
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public getQueue(): QueuedSyncItem[] {
    return [...this.queue];
  }

  public getQueueBreakdown(): { type: string; label: string; count: number }[] {
    const counts: Record<string, number> = {};
    for (const item of this.queue) {
      counts[item.type] = (counts[item.type] || 0) + 1;
    }

    const typeLabels: Record<string, string> = {
      STOCK_COUNT: 'Stock Counts',
      STORE_CHECK_IN: 'Store Check-ins',
      CHEQUE_COLLECTED: 'Cheques',
      SHELF_PHOTOS_SAVED: 'Shelf Photos',
      ORDER_CREATED: 'Orders',
      CALL_LOGGED: 'Call Logs',
      DOCUMENT_UPLOADED: 'Documents',
      DISPATCH_LOGGED: 'Dispatches',
      FEEDBACK_SUBMITTED: 'Feedback',
      STORE_SKIPPED: 'Skip Reasons',
    };

    return Object.entries(counts).map(([type, count]) => ({
      type,
      label: typeLabels[type] || type.replace(/_/g, ' ').toLowerCase(),
      count,
    }));
  }

  public getLastSyncTime(): string {
    return this.lastSyncTime;
  }

  public isSimulated(): boolean {
    return this.isSimulatedOffline;
  }

  public toggleSimulatedOffline(): boolean {
    this.isSimulatedOffline = !this.isSimulatedOffline;
    try {
      localStorage.setItem(SIMULATED_OFFLINE_KEY, String(this.isSimulatedOffline));
    } catch {
      // ignore
    }
    this.notify();
    return this.isSimulatedOffline;
  }

  public getStorageUsage(): { usedKb: number; formatted: string; percent: number } {
    if (typeof window === 'undefined') {
      return { usedKb: 0, formatted: '0 KB / 5 MB used', percent: 0 };
    }
    try {
      let totalBytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          totalBytes += (key.length + (localStorage.getItem(key)?.length || 0)) * 2;
        }
      }
      const usedKb = Math.max(12, Math.round(totalBytes / 1024));
      const percent = Math.min(100, Math.max(1, Math.round((usedKb / 5120) * 100)));
      return {
        usedKb,
        formatted: `${usedKb.toLocaleString()} KB / 5,120 KB used (${percent}%)`,
        percent,
      };
    } catch {
      return { usedKb: 148, formatted: '148 KB / 5,120 KB used (3%)', percent: 3 };
    }
  }

  public enqueue(type: string, payload: Record<string, unknown>, endpoint: string = '/api/sync'): QueuedSyncItem {
    const item: QueuedSyncItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      endpoint,
      payload,
      timestamp: new Date().toISOString(),
      attempts: 0,
    };

    // Do not persist ephemeral GPS pings into persistent offline queue
    if (type !== 'GPS_PING') {
      this.queue.push(item);
      this.saveQueue();
    }

    // Auto-sync only if online and NOT simulated offline
    if (this.isOnline && !this.isSimulatedOffline) {
      setTimeout(() => this.triggerSync(), 1200);
    }

    return item;
  }

  private isSyncing: boolean = false;

  public async triggerSync(): Promise<number> {
    if (!this.isOnline || this.isSimulatedOffline || this.queue.length === 0) {
      this.notify();
      return 0;
    }

    // Prevent concurrent sync runs
    if (this.isSyncing) return 0;
    this.isSyncing = true;
    this.notify();

    let syncedCount = 0;
    const failedItems: QueuedSyncItem[] = [];

    for (const item of [...this.queue]) {
      // Stop syncing if we went offline mid-sync
      if (!this.isOnline || this.isSimulatedOffline) {
        failedItems.push(item);
        continue;
      }

      const retryDelayMs = Math.min(5 * 60 * 1000, 1000 * 2 ** Math.min(item.attempts, 8));
      if (item.lastAttemptAt && Date.now() - new Date(item.lastAttemptAt).getTime() < retryDelayMs) {
        failedItems.push(item);
        continue;
      }

      try {
        await this.processItem(item);
        syncedCount++;
      } catch (err) {
        console.warn(`[OfflineSync] Failed to sync item ${item.id} (attempt ${item.attempts + 1}):`, err);
        item.attempts = Math.min(item.attempts + 1, 30);
        item.lastAttemptAt = new Date().toISOString();
        failedItems.push(item);
      }
    }

    // Replace queue with only failed items
    this.queue = failedItems;
    this.saveQueue();

    if (syncedCount > 0) {
      this.updateLastSync();
    }

    this.isSyncing = false;
    this.notify();
    return syncedCount;
  }

  private async processItem(item: QueuedSyncItem): Promise<void> {
    const { supabase } = await import('./db/supabase-client');
    const payload = item.payload || {};
    let result: any;

    switch (item.type) {
      case 'ORDER_CREATED':
        result = await supabase.from('orders').upsert([payload]);
        break;
      case 'GPS_PING':
        result = await supabase.from('gps_pings').insert([payload]);
        break;
      case 'CHEQUE_COLLECTED':
        result = await supabase.from('cheques').upsert([payload]);
        break;
      case 'STOCK_COUNT':
        result = await supabase.from('stock_counts').upsert([payload]);
        break;
      case 'DISPATCH_LOGGED':
        result = await supabase.from('dispatches').upsert([payload]);
        break;
      case 'STORE_CREATED':
      case 'RETAILER_CREATED':
        result = await supabase.from('retailers').upsert([payload]);
        break;
      case 'DISTRIBUTOR_CREATED':
        result = await supabase.from('distributors').upsert([payload]);
        break;
      case 'BRANCH_CREATED':
        result = await supabase.from('branches').upsert([payload]);
        break;
      case 'DELIVERY_FAILURE':
        result = await supabase.from('delivery_failures').upsert([payload]);
        break;
      case 'RETURN_SUBMITTED':
        result = await supabase.from('returns').upsert([payload]);
        break;
      case 'DUTY_STATUS':
        if (!payload.officerId) throw new Error('Missing officerId for duty status sync.');
        result = await supabase
          .from('users')
          .update({ duty_status: payload.status })
          .eq('id', payload.officerId);
        break;
      default:
        throw new Error(`Unsupported offline sync type: ${item.type}`);
    }

    assertSyncSuccess(result, item.type);
  }

  public async forceSyncNow(): Promise<number> {
    // If simulated offline was active, resume online to allow user's explicit force sync
    if (this.isSimulatedOffline) {
      this.isSimulatedOffline = false;
      try {
        localStorage.setItem(SIMULATED_OFFLINE_KEY, 'false');
      } catch {
        // ignore
      }
    }

    // Trigger full db sync with Supabase in parallel
    try {
      const { db } = await import('./db/db-service');
      await db.syncWithSupabase();
    } catch (e) {
      console.warn('[OfflineSync] db sync error during forceSyncNow:', e);
    }

    // If currently syncing, notify and return
    if (this.isSyncing) {
      this.notify();
      return 0;
    }

    // Delegate to the real triggerSync which processes queued items
    return this.triggerSync();
  }


  private updateLastSync() {
    const now = new Date();
    const timeStr = 'Today at ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.lastSyncTime = timeStr;
    try {
      localStorage.setItem(LAST_SYNC_KEY, timeStr);
    } catch {
      // ignore
    }
    this.notify();
  }

  public clearQueue() {
    this.queue = [];
    this.saveQueue();
  }
}

export const syncManager = new OfflineSyncManager();

export function assertSyncSuccess(result: { error?: { message?: string } | null }, operation: string): void {
  if (result?.error) {
    throw new Error(`${operation} failed: ${result.error.message || 'remote write rejected'}`);
  }
}

import {
  Product,
  BeatItem,
  StoreEntity,
  VendorContact,
  Task,
  ReviewCategory,
  Cheque,
} from './types';

const CACHE_SYNC_TIME_KEY = 'bb_offline_cache_last_sync_time';
const CACHE_PREFIX = 'bb_offline_cache_';

export class DataCache {
  private dbPromise: Promise<any> | null = null;

  private async getDB() {
    if (typeof window === 'undefined') return null;
    if (!this.dbPromise) {
      try {
        const { openDB } = await import('idb');
        this.dbPromise = openDB('bb_command_center_offline_cache', 1, {
          upgrade(db) {
            if (!db.objectStoreNames.contains('cache')) {
              db.createObjectStore('cache');
            }
          },
        });
      } catch (err) {
        console.warn('[DataCache] IndexedDB initialization failed, falling back to localStorage', err);
        return null;
      }
    }
    return this.dbPromise;
  }

  private async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const db = await this.getDB();
      if (db) {
        await db.put('cache', value, key);
        return;
      }
    } catch {
      // Fallback
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
      } catch (e) {
        console.warn('[DataCache] localStorage save failed', e);
      }
    }
  }

  private async getItem<T>(key: string): Promise<T | null> {
    try {
      const db = await this.getDB();
      if (db) {
        const val = await db.get('cache', key);
        if (val !== undefined && val !== null) return val as T;
      }
    } catch {
      // Fallback
    }
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (raw) return JSON.parse(raw) as T;
      } catch {
        // ignore
      }
    }
    return null;
  }

  async cacheProducts(products: Product[]): Promise<void> {
    await this.setItem('products', products);
  }

  async getCachedProducts(): Promise<Product[]> {
    return (await this.getItem<Product[]>('products')) || [];
  }

  async cacheBeats(beats: BeatItem[]): Promise<void> {
    await this.setItem('beats', beats);
  }

  async getCachedBeats(): Promise<BeatItem[]> {
    return (await this.getItem<BeatItem[]>('beats')) || [];
  }

  async cacheStores(stores: StoreEntity[]): Promise<void> {
    await this.setItem('stores', stores);
  }

  async getCachedStores(): Promise<StoreEntity[]> {
    return (await this.getItem<StoreEntity[]>('stores')) || [];
  }

  async cacheContacts(contacts: VendorContact[]): Promise<void> {
    await this.setItem('contacts', contacts);
  }

  async getCachedContacts(): Promise<VendorContact[]> {
    return (await this.getItem<VendorContact[]>('contacts')) || [];
  }

  async cacheTasks(tasks: Task[]): Promise<void> {
    await this.setItem('tasks', tasks);
  }

  async getCachedTasks(): Promise<Task[]> {
    return (await this.getItem<Task[]>('tasks')) || [];
  }

  async cacheCategories(categories: ReviewCategory[]): Promise<void> {
    await this.setItem('categories', categories);
  }

  async getCachedCategories(): Promise<ReviewCategory[]> {
    return (await this.getItem<ReviewCategory[]>('categories')) || [];
  }

  async cacheCheques(cheques: Cheque[]): Promise<void> {
    await this.setItem('cheques', cheques);
  }

  async getCachedCheques(): Promise<Cheque[]> {
    return (await this.getItem<Cheque[]>('cheques')) || [];
  }

  async getLastSyncTime(): Promise<Date | null> {
    if (typeof window === 'undefined') return null;
    const val = localStorage.getItem(CACHE_SYNC_TIME_KEY);
    return val ? new Date(val) : null;
  }

  async setLastSyncTime(date?: Date): Promise<void> {
    if (typeof window === 'undefined') return;
    const d = date || new Date();
    localStorage.setItem(CACHE_SYNC_TIME_KEY, d.toISOString());
  }

  async isCacheStale(maxAgeHours: number = 1): Promise<boolean> {
    const last = await this.getLastSyncTime();
    if (!last) return true;
    const diffMs = Date.now() - last.getTime();
    return diffMs > maxAgeHours * 60 * 60 * 1000;
  }
}

export const dataCache = new DataCache();
