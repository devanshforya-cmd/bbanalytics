import { WorkspaceCollection, WorkspaceMutation, WorkspaceSnapshot, WorkspaceVersions } from './db/workspace-types';

export type SyncState = 'SYNCED' | 'PENDING' | 'OFFLINE';
export interface QueuedSyncItem {
  id: string;
  type: string;
  endpoint: string;
  payload: Record<string, unknown>;
  timestamp: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  conflictVersion?: number;
}
const LEGACY_QUEUE_KEY = 'bb_command_center_offline_queue';
const QUEUE_PREFIX = 'bb_workspace_queue_v1:';
const SIMULATED_OFFLINE_KEY = 'bb_simulated_offline_mode';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const recordKey = (mutation: WorkspaceMutation) => `${mutation.collection}:${mutation.id}`;

export class OfflineSyncManager {
  private listeners: ((state: SyncState, pendingCount: number) => void)[] = [];
  private isOnline = true;
  private isSimulatedOffline = false;
  private queue: QueuedSyncItem[] = [];
  private userId: string | null = null;
  private generation = 0;
  private lastSyncTime = 'Never';
  private syncing: Promise<number> | null = null;
  private inFlight = new Set<string>();
  private versions: WorkspaceVersions = {};
  private timer: ReturnType<typeof setTimeout> | undefined;
  private refreshWorkspace: (() => Promise<unknown>) | null = null;
  private beforeSync: (() => Promise<unknown>) | null = null;
  private storageError = '';
  private refreshError = '';

  constructor() {
    if (typeof window === 'undefined') return;
    this.isOnline = navigator.onLine;
    try { this.isSimulatedOffline = localStorage.getItem(SIMULATED_OFFLINE_KEY) === 'true'; } catch {}
    window.addEventListener('online', () => { this.isOnline = true; void this.triggerSync(); this.notify(); });
    window.addEventListener('offline', () => { this.isOnline = false; this.notify(); });
    window.addEventListener('storage', (event) => {
      if (event.key === this.queueKey() && !this.syncing) { this.loadQueue(); this.notify(); }
      if (event.key === 'bb_auth_user_session_v3') {
        try { this.setUser(JSON.parse(event.newValue || 'null')?.user?.id || null); } catch { this.setUser(null); }
      }
    });
  }

  private queueKey() { return this.userId ? QUEUE_PREFIX + this.userId : null; }
  private readStoredQueue(): QueuedSyncItem[] {
    const key = this.queueKey();
    if (!key || typeof localStorage === 'undefined') return [];
    try { const rows = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(rows) ? rows : []; }
    catch { this.storageError = 'The saved queue could not be read. Preserve this browser’s storage before recovery.'; return []; }
  }
  private loadQueue() { this.queue = this.readStoredQueue(); }
  private saveQueue() {
    const key = this.queueKey();
    if (key && typeof localStorage !== 'undefined') {
      try { localStorage.setItem(key, JSON.stringify(this.queue)); this.storageError = ''; }
      catch { this.storageError = 'Device storage is full. Keep this tab open and sync or download the pending changes.'; }
    }
    this.notify();
  }
  public setUser(userId: string | null) {
    if (this.userId === userId) return;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.userId = userId;
    this.queue = [];
    this.versions = {};
    this.inFlight = new Set();
    this.syncing = null;
    this.lastSyncTime = 'Never';
    this.storageError = '';
    this.refreshError = '';
    if (userId) {
      this.loadQueue();
      try { this.lastSyncTime = localStorage.getItem(`bb_last_sync_timestamp:${userId}`) || 'Never'; } catch {}
    }
    this.notify();
  }
  public setRefreshHandler(handler: () => Promise<unknown>) { this.refreshWorkspace = handler; }
  public setBeforeSyncHandler(handler: () => Promise<unknown>) { this.beforeSync = handler; }
  public setVersions(versions: WorkspaceVersions) { this.versions = clone(versions); }
  public getRecordVersion(collection: WorkspaceCollection, id: string) { return this.versions[collection]?.[id] || 0; }
  public getWorkspaceMutations(): WorkspaceMutation[] {
    return this.queue.filter((item) => item.type === 'WORKSPACE_MUTATION').map((item) => clone(item.payload as unknown as WorkspaceMutation));
  }
  public subscribe(callback: (state: SyncState, pendingCount: number) => void) {
    this.listeners.push(callback); callback(this.getCurrentState(), this.queue.length);
    return () => { this.listeners = this.listeners.filter((listener) => listener !== callback); };
  }
  private notify() { for (const listener of this.listeners) listener(this.getCurrentState(), this.queue.length); }
  public getCurrentState(): SyncState {
    if (!this.userId || !this.isOnline || this.isSimulatedOffline) return 'OFFLINE';
    return this.queue.length || this.storageError || this.refreshError ? 'PENDING' : 'SYNCED';
  }
  public getPendingCount() { return this.queue.length; }
  public getQueue() { return clone(this.queue); }
  public getErrors() { return [...(this.storageError ? [this.storageError] : []), ...(this.refreshError ? [this.refreshError] : []), ...this.queue.filter((item) => item.lastError).map((item) => item.lastError!)]; }
  public getQueueBreakdown() {
    const counts: Record<string, number> = {};
    for (const item of this.queue) {
      const key = item.type === 'WORKSPACE_MUTATION' ? String(item.payload.collection) : item.type;
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).map(([type, count]) => ({ type, label: type.replace(/([A-Z])/g, ' $1').replace(/_/g, ' '), count }));
  }
  public getLastSyncTime() { return this.lastSyncTime; }
  public isSimulated() { return this.isSimulatedOffline; }
  public toggleSimulatedOffline() {
    this.isSimulatedOffline = !this.isSimulatedOffline;
    try { localStorage.setItem(SIMULATED_OFFLINE_KEY, String(this.isSimulatedOffline)); } catch {}
    this.notify();
    if (!this.isSimulatedOffline) void this.triggerSync();
    return this.isSimulatedOffline;
  }
  public getStorageUsage() {
    let bytes = 0;
    try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i)!; bytes += (key.length + (localStorage.getItem(key)?.length || 0)) * 2; } } catch {}
    const usedKb = Math.round(bytes / 1024);
    return { usedKb, formatted: `${usedKb.toLocaleString()} KB / 5,120 KB used`, percent: Math.min(100, Math.round(usedKb / 5120 * 100)) };
  }
  public enqueue(type: string, payload: Record<string, unknown>, endpoint = '/api/sync'): QueuedSyncItem {
    const item: QueuedSyncItem = { id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`, type, payload: clone(payload), endpoint, timestamp: new Date().toISOString(), attempts: 0 };
    if (!this.userId) { item.lastError = 'Sign in before saving workspace changes.'; return item; }
    // Merge other tabs’ pending work before writing this tab’s new change.
    const localIds = new Set(this.queue.map((entry) => entry.id));
    this.queue.push(...this.readStoredQueue().filter((entry) => !localIds.has(entry.id)));
    if (type === 'WORKSPACE_MUTATION') {
      const incoming = item.payload as unknown as WorkspaceMutation;
      const prior = this.queue.find((entry) => entry.type === type && recordKey(entry.payload as unknown as WorkspaceMutation) === recordKey(incoming) && !this.inFlight.has(entry.id));
      if (prior) {
        incoming.expectedVersion = (prior.payload as unknown as WorkspaceMutation).expectedVersion;
        this.queue = this.queue.filter((entry) => entry.id !== prior.id);
      }
    }
    this.queue.push(item); this.saveQueue();
    if (this.isOnline && !this.isSimulatedOffline && typeof window !== 'undefined') {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => { void this.triggerSync(); }, 1200);
    }
    return item;
  }
  public recoverLegacyQueue(snapshot: WorkspaceSnapshot) {
    if (!this.userId || typeof localStorage === 'undefined') return;
    const marker = `bb_legacy_queue_recovered:${this.userId}`;
    if (localStorage.getItem(marker)) return;
    const mapping: Record<string, WorkspaceCollection> = {
      ORDER_CREATED: 'orders', CHEQUE_COLLECTED: 'cheques', STOCK_COUNT: 'stockCounts', DISPATCH_LOGGED: 'dispatches',
      STORE_CREATED: 'retailers', RETAILER_CREATED: 'retailers', DISTRIBUTOR_CREATED: 'distributors', BRANCH_CREATED: 'branches',
      STORE_CHECK_IN: 'visits', STORE_SKIPPED: 'beatItems', SHELF_PHOTOS_SAVED: 'shelfPhotos', CALL_LOGGED: 'callLogs',
      DOCUMENT_UPLOADED: 'documents', FEEDBACK_SUBMITTED: 'feedbackEntries', DELIVERY_FAILURE: 'deliveryFailures', RETURN_SUBMITTED: 'returns',
      RETURN_RESOLUTION_UPDATED: 'returns', FEEDBACK_ASSIGNED: 'feedbackEntries', TASK_REASSIGNED: 'tasks', TASK_PRIORITY_UPDATED: 'tasks',
    };
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_QUEUE_KEY) || '[]');
      if (!Array.isArray(legacy)) return;
      for (const item of legacy) {
        const payload = item?.payload || {};
        const collection = mapping[item?.type];
        const id = payload.id || payload.beatId || payload.feedbackId || payload.taskId || payload.returnId;
        const row = collection && snapshot[collection]?.find((record) => record.id === id);
        if (row) {
          if (!this.getWorkspaceMutations().some((mutation) => mutation.collection === collection && mutation.id === row.id)) this.enqueue('WORKSPACE_MUTATION', { collection, id: row.id, operation: 'upsert', data: row, expectedVersion: this.getRecordVersion(collection, row.id), mutationId: `legacy_${item.id}` });
        }
        else {
          // Unattributed payloads may belong to another account; keep their original backup private.
          this.queue.push({ id: item.id || `legacy_${Date.now()}_${Math.random()}`, type: 'LEGACY_RECOVERY_REQUIRED', endpoint: '/api/sync', timestamp: item.timestamp || new Date().toISOString(), payload: { legacyId: item.id }, attempts: item.attempts || 0, lastError: `Legacy ${item.type || 'change'} could not be matched to this user’s cached records. Its original device backup is preserved for administrator recovery.` });
        }
      }
      this.saveQueue(); localStorage.setItem(marker, 'true');
    } catch { this.storageError = 'The legacy queue could not be read. Its original storage key has been preserved.'; this.notify(); }
  }
  public async triggerSync(ignoreBackoff = false): Promise<number> {
    if (this.syncing) return this.syncing;
    if (!this.userId || !this.isOnline || this.isSimulatedOffline) { this.notify(); return 0; }
    const generation = this.generation;
    const run = this.runSync(generation, ignoreBackoff);
    this.syncing = run;
    try { return await run; }
    finally {
      if (generation === this.generation) {
        this.syncing = null; this.notify();
        if (typeof window !== 'undefined' && this.queue.some((item) => !item.attempts && item.conflictVersion === undefined)) {
          this.timer = setTimeout(() => { void this.triggerSync(); }, 1200);
        }
      }
    }
  }
  private async runSync(generation: number, ignoreBackoff: boolean) {
    let count = 0;
    try { await this.beforeSync?.(); this.refreshError = ''; }
    catch (error) { this.refreshError = error instanceof Error ? error.message : 'Workspace recovery could not be checked.'; this.notify(); return 0; }
    if (generation !== this.generation) return 0;
    const snapshot = clone(this.queue);
    const failedRecords = new Set<string>();
    for (const item of snapshot) {
      if (generation !== this.generation || !this.isOnline || this.isSimulatedOffline) break;
      const mutation = item.type === 'WORKSPACE_MUTATION' ? item.payload as unknown as WorkspaceMutation : null;
      const key = mutation ? recordKey(mutation) : item.id;
      if (failedRecords.has(key) || item.conflictVersion !== undefined) continue;
      if (!ignoreBackoff && item.lastAttemptAt && Date.now() - Date.parse(item.lastAttemptAt) < Math.min(300000, 1000 * 2 ** Math.min(item.attempts, 8))) continue;
      // An earlier reply may have rebased a later mutation in this snapshot.
      const current = this.queue.find((entry) => entry.id === item.id);
      if (!current) continue;
      if (typeof window !== 'undefined') {
        let owner: string | null = null;
        try { owner = JSON.parse(localStorage.getItem('bb_auth_user_session_v3') || 'null')?.user?.id || null; } catch {}
        if (owner !== this.userId) { this.setUser(owner); break; }
      }
      this.inFlight.add(item.id);
      try {
        if (item.type !== 'WORKSPACE_MUTATION' && item.type !== 'DUTY_STATUS') throw new Error(item.lastError || `Legacy ${item.type} needs manual recovery; download the pending backup.`);
        const body = item.type === 'DUTY_STATUS' ? { type: item.type, ...current.payload } : current.payload;
        const response = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-User': this.userId! }, credentials: 'same-origin', body: JSON.stringify(body) });
        const result = await response.json().catch(() => null);
        if (generation !== this.generation) break;
        if (!response.ok || !result?.success) {
          if (response.status === 409) {
            current.conflictVersion = Number.isFinite(result?.currentVersion) ? result.currentVersion : -1;
            throw new Error(`${mutation?.collection || 'Record'} ${mutation?.id || ''} changed on the server. Download your pending changes and review the conflict before retrying.`);
          }
          throw new Error(result?.error || `Save failed (${response.status}). Check your connection and access, then retry.`);
        }
        // Remove only the acknowledged item; changes enqueued while awaiting stay queued.
        const latest = this.readStoredQueue();
        const ids = new Set(this.queue.map((entry) => entry.id));
        this.queue.push(...latest.filter((entry) => !ids.has(entry.id)));
        this.queue = this.queue.filter((entry) => entry.id !== item.id);
        if (mutation) {
          const version = Number(result.version);
          this.versions[mutation.collection] = { ...this.versions[mutation.collection], [mutation.id]: version };
          for (const later of this.queue) {
            if (later.type === 'WORKSPACE_MUTATION' && recordKey(later.payload as unknown as WorkspaceMutation) === key) (later.payload as unknown as WorkspaceMutation).expectedVersion = version;
          }
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bb-workspace-mutation-synced', { detail: { collection: mutation.collection, id: mutation.id, version } }));
        }
        count++; this.saveQueue();
      } catch (error) {
        if (generation !== this.generation) break;
        current.attempts = Math.min(current.attempts + 1, 30);
        current.lastAttemptAt = new Date().toISOString();
        current.lastError = error instanceof Error ? error.message : 'The change could not be saved. Retry or download the pending backup.';
        failedRecords.add(key); this.saveQueue();
      } finally { this.inFlight.delete(item.id); }
    }
    if (count && generation === this.generation) {
      this.lastSyncTime = new Date().toLocaleString();
      try { localStorage.setItem(`bb_last_sync_timestamp:${this.userId}`, this.lastSyncTime); } catch {}
      this.notify();
    }
    return count;
  }
  public async forceSyncNow(): Promise<number> {
    this.isSimulatedOffline = false;
    try { localStorage.setItem(SIMULATED_OFFLINE_KEY, 'false'); } catch {}
    const generation = this.generation;
    const count = await this.triggerSync(true);
    if (generation === this.generation && this.userId && this.isOnline) {
      const result = await this.refreshWorkspace?.() as { success?: boolean; message?: string } | undefined;
      this.refreshError = result?.success === false ? result.message || 'Workspace refresh failed. Retry when connected.' : '';
    }
    this.notify(); return count;
  }
  public retryConflict(itemId: string) {
    const item = this.queue.find((entry) => entry.id === itemId);
    if (!item || item.conflictVersion === undefined || item.conflictVersion < 0) return;
    (item.payload as unknown as WorkspaceMutation).expectedVersion = item.conflictVersion;
    (item.payload as unknown as WorkspaceMutation).mutationId = `retry_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    delete item.conflictVersion; delete item.lastError; delete item.lastAttemptAt; this.saveQueue();
  }
  public clearQueue() {
    if (this.inFlight.size) return;
    if (this.userId && typeof localStorage !== 'undefined') localStorage.setItem(`bb_queue_backup:${this.userId}:${Date.now()}`, JSON.stringify(this.queue));
    this.queue = []; this.saveQueue();
  }
}
export const syncManager = new OfflineSyncManager();
export function assertSyncSuccess(result: { error?: { message?: string } | null }, operation: string) {
  if (result?.error) throw new Error(`${operation} failed: ${result.error.message || 'remote write rejected'}`);
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

  private scopedKey(key: string): string | null {
    try {
      const session = JSON.parse(localStorage.getItem('bb_auth_user_session_v3') || 'null');
      return session?.user?.id && session.expiresAt > Date.now() ? `${session.user.id}:${key}` : null;
    } catch { return null; }
  }

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
    const scoped = this.scopedKey(key);
    if (!scoped) return;
    key = scoped;
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
    const scoped = this.scopedKey(key);
    if (!scoped) return null;
    key = scoped;
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
    const key = this.scopedKey(CACHE_SYNC_TIME_KEY);
    const val = key ? localStorage.getItem(key) : null;
    return val ? new Date(val) : null;
  }

  async setLastSyncTime(date?: Date): Promise<void> {
    if (typeof window === 'undefined') return;
    const key = this.scopedKey(CACHE_SYNC_TIME_KEY);
    if (!key) return;
    const d = date || new Date();
    localStorage.setItem(key, d.toISOString());
  }

  async isCacheStale(maxAgeHours: number = 1): Promise<boolean> {
    const last = await this.getLastSyncTime();
    if (!last) return true;
    const diffMs = Date.now() - last.getTime();
    return diffMs > maxAgeHours * 60 * 60 * 1000;
  }
}

export const dataCache = new DataCache();
