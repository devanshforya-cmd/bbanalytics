import { MANUAL_ORDER_STATUSES, type ManualOrderStatus } from '../order-status';
import { validateCampaign } from '../offers';
import { isOtherReason, failureReasonLabel } from '../failure-reason';
import { normalizePhoneNumber } from '../auth-utils';
import { installWorkspaceFetch } from '../workspace-reset-client';
import { validGpsCoordinates } from '../gps-validation';
import {
  getScope,
  canPerform,
  canWorkOrders,
  canManageSales,
} from '../permissions';
import { WORKSPACE_COLLECTIONS, WorkspaceCollection, WorkspaceMutation, WorkspaceSnapshot, WorkspaceVersions } from './workspace-types';
import { canReadWorkspaceRecord, canWriteWorkspaceRecord, StoredWorkspaceRecord } from './workspace-policy';
import { DEFAULT_ALERT_RULES, validateAlertRules, type AlertRules } from '../alert-rules';
import { defaultOrderOptions, validateOrderOptions, assertActiveOrderOption, type OrderOptions } from '../order-options';
import { brandPrefix, pendingDocumentId, validateBrandPrefix, RESERVED_PREFIXES } from '../document-ids';
import { historyEntries } from '../order-history';
import { phoneDigits } from '../customer-lookup';
import { DEFAULT_CONTENT_PLATFORMS, DEFAULT_FAILURE_REASONS, DEFAULT_REACH_OUT_PLATFORMS, lookupId, sameName } from '../marketing';

const ANONYMOUS_USER: User = { id: '', fullName: '', email: '', phone: '', role: 'OFFICE_STAFF', active: false, isSuperAdmin: false, dutyStatus: 'OFFLINE', assignedBrands: [], permissions: {}, customPermissions: {} };

import {
  User,
  Brand,
  Product,
  Distributor,
  Branch,
  Retailer,
  BeatItem,
  Visit,
  StockCount,
  ShelfPhoto,
  CallLog,
  Cheque,
  ChequeStatus,
  HandoverDocument,
  Order,
  DeliveryFailure,
  ReturnEntry,
  ReviewCategory,
  FeedbackEntry,
  Customer,
  Task,
  Notification,
  ActivityLog,
  OfficerScorecard,
  Dispatch,
  BrandCode,
  ComplaintStatus,
  StaffLiveLocation,
  VendorContact,
  UserPermissions,
  FilterCriteria,
  Combo,
  SecondaryOrder,
  FacingAudit,
  DutyStatus,
  Priority,
  Holiday,
  SeasonalPattern,
  TaskTemplate,
  StoreHealthScore,
  Promotion,
  ComparisonMode,
  FieldOfficerDailySummary,
  DataImportRecord,
  StoreEntity,
  Influencer,
  InfluencerContent,
  InfluencerNiche,
  MarketingOption,
  MarketingOptionList,
  MarketingSend,
  FailureReason,
  SaleCampaign,
  UserPreferenceRecord,
  DeliveryAttempt,
  SharedAccessLink,
  DashboardSalesMode,
  DocumentTypeConfig,
  StoreCategoryConfig,
  StoreType,
  DefaultMargins,
  StoreMargin,
} from '../types';

export interface RecurringScheduleEntry {
  id: string;
  officerId: string;
  storeId: string;
  storeName: string;
  entityType: 'BRANCH' | 'RETAILER';
  daysOfWeek: ('MON' | 'TUE' | 'WED' | 'THU' | 'FRI')[];
  priority: 'HIGH' | 'MEDIUM' | 'ROUTINE';
  managerNote?: string;
}

import { syncManager } from '../offline-sync';
import { applyKarmaEvent, KARMA_RULES } from '../karma-calculator';
import { getTodayAd, getTodayBs } from '../nepali-calendar';

export interface OrderRealtimeEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: Order;
  old?: { id: string };
}

/** Older or imported customer records may miss their lists; screens read them directly. */
const withCustomerLists = (customer: Customer): Customer => Array.isArray(customer.activeFlags) && Array.isArray(customer.brandsPurchased) ? customer
  : { ...customer, activeFlags: Array.isArray(customer.activeFlags) ? customer.activeFlags : [], brandsPurchased: Array.isArray(customer.brandsPurchased) ? customer.brandsPurchased : [] };

export class DatabaseService {
  private users: User[] = [];
  private currentUser: User = ANONYMOUS_USER;
  private brands: Brand[] = [];
  private products: Product[] = [];
  private deletedProductIds = new Set<string>();
  private deletedStoreIds = new Set<string>();
  private combos: Combo[] = [];
  private secondaryOrders: SecondaryOrder[] = [];
  private facingAudits: FacingAudit[] = [];
  private distributors: Distributor[] = [];
  private branches: Branch[] = [];
  private retailers: Retailer[] = [];
  private beatItems: BeatItem[] = [];
  private visits: Visit[] = [];
  private dispatches: Dispatch[] = [];
  private stockCounts: StockCount[] = [];
  private shelfPhotos: ShelfPhoto[] = [];
  private callLogs: CallLog[] = [];
  private cheques: Cheque[] = [];
  private documents: HandoverDocument[] = [];
  private orders: Order[] = [];
  private deliveryFailures: DeliveryFailure[] = [];
  private returns: ReturnEntry[] = [];
  private reviewCategories: ReviewCategory[] = [];
  private feedbackEntries: FeedbackEntry[] = [];
  private customers: Customer[] = [];
  private tasks: Task[] = [];
  private notifications: Notification[] = [];
  private scorecards: OfficerScorecard[] = [];
  private activityLogs: ActivityLog[] = [];
  private staffLiveLocations: StaffLiveLocation[] = [];
  private holidays: Holiday[] = [];
  private seasonalPatterns: SeasonalPattern[] = [];
  private taskTemplates: TaskTemplate[] = [];
  private promotions: Promotion[] = [];
  private dailySummaries: FieldOfficerDailySummary[] = [];
  private importHistory: DataImportRecord[] = [];
  private comparisonMode: ComparisonMode = 'OFF';
  private influencers: Influencer[] = [];
  private influencerContent: InfluencerContent[] = [];
  private marketingSends: MarketingSend[] = [];
  private influencerNiches: InfluencerNiche[] = [];
  private marketingOptions: MarketingOption[] = [];
  private failureReasons: FailureReason[] = [];
  private campaigns: SaleCampaign[] = [];
  private userPreferences: UserPreferenceRecord[] = [];
  private brandPrefixes: Record<string, string> = {};
  private workspaceLoaded = false;
  private sharedAccessLinks: SharedAccessLink[] = [];
  private salesMode: DashboardSalesMode = 'ALL';
  private orderSubscribers: Set<(event: OrderRealtimeEvent) => void> = new Set();

  private documentTypes: DocumentTypeConfig[] = [];
  private storeCategories: StoreCategoryConfig[] = [];

  private requireStorePhotoAtCheckIn: boolean = false;
  private alertRules: AlertRules = { ...DEFAULT_ALERT_RULES };
  private orderOptions: OrderOptions | null = null;
  private recurringSchedules: RecurringScheduleEntry[] = [];

  private activeBrandFilter: BrandCode = 'ALL';
  /** Sub-brand inside the active brand ('' = whole brand). */
  private activeSubBrandFilter = '';
  private calendarMode: 'BS' | 'AD' = 'BS';

  private readonly server: boolean;
  private activeUserId: string | null = null;
  private baseline: WorkspaceSnapshot = {};
  private versions: WorkspaceVersions = {};
  private pending = new Map<string, WorkspaceMutation>();
  private initialSnapshot: WorkspaceSnapshot = {};
  private legacySnapshot: WorkspaceSnapshot | null = null;
  private syncPromise: Promise<{ success: boolean; syncedCount: number; message: string }> | null = null;

  constructor(options: { server?: boolean } = {}) {
    this.server = options.server === true || typeof window === 'undefined';
    this.initialSnapshot = this.exportSnapshot();
    this.baseline = this.exportSnapshot();
    if (this.server) return;
    installWorkspaceFetch();
    window.addEventListener('bb-workspace-reset', () => this.setSessionUser(null));
    const sessionUser = this.readSessionUser();
    this.activeUserId = sessionUser?.id || null;
    if (sessionUser) { this.currentUser = sessionUser; this.users = [sessionUser]; }
    syncManager.setUser(this.activeUserId);
    syncManager.setRefreshHandler(() => this.syncWithSupabase());
    syncManager.setBeforeSyncHandler(async () => {
      if (this.activeUserId && this.legacySnapshot) {
        const result = await this.pullWorkspace(this.activeUserId);
        if (!result.success) throw new Error(result.message);
      }
    });
    this.loadState();
    this.baseline = this.exportSnapshot();
    setTimeout(() => { if (this.activeUserId) void syncManager.forceSyncNow(); }, 1000);
    window.addEventListener('online', () => { if (this.activeUserId) void syncManager.forceSyncNow(); });
    window.addEventListener('storage', (event) => {
      if (event.key === this.cacheKey()) {
        this.loadState(); this.baseline = this.exportSnapshot();
        window.dispatchEvent(new CustomEvent('bb-db-updated'));
      }
      if (event.key === 'bb_auth_user_session_v3') this.setSessionUser(this.readSessionUser());
    });
    window.addEventListener('bb-workspace-mutation-synced', (event) => {
      const { collection, id, version, assigned } = (event as CustomEvent).detail;
      this.versions[collection as WorkspaceCollection] = { ...this.versions[collection as WorkspaceCollection], [id]: version };
      // The server chose this record's short ID. Show it straight away without queuing another save.
      if (assigned && typeof assigned === 'object') {
        const patch = Object.fromEntries(Object.entries(assigned).filter(([, value]) => typeof value === 'string' && value));
        const live = ((this as any)[collection] as any[] | undefined)?.find((row) => row.id === id);
        const base = this.baseline[collection as WorkspaceCollection]?.find((row) => row.id === id);
        if (live && Object.keys(patch).length) { Object.assign(live, patch); if (base) Object.assign(base, patch); window.dispatchEvent(new CustomEvent('bb-db-updated')); }
      }
      this.writeCache();
    });
  }

  private readSessionUser(): User | null {
    try {
      const session = JSON.parse(localStorage.getItem('bb_auth_user_session_v3') || 'null');
      return session?.user?.id && session.expiresAt > Date.now() ? session.user as User : null;
    } catch { return null; }
  }
  private cacheKey() { return this.activeUserId ? `bb_workspace_cache_v1:${this.activeUserId}` : null; }

  private recoverableSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
    const records: StoredWorkspaceRecord[] = WORKSPACE_COLLECTIONS.flatMap((collection) => (snapshot[collection] || []).map((data) => ({ collection, id: data.id, data, created_by: this.currentUser.id, version: 0 })));
    const result: WorkspaceSnapshot = {};
    for (const collection of WORKSPACE_COLLECTIONS) result[collection] = records.filter((row) => row.collection === collection
      && canWriteWorkspaceRecord(this.currentUser, row, 'CREATE', this.users, records)
      && (collection !== 'sharedAccessLinks' || /^bb_[A-Za-z0-9_-]{43,128}$/.test(row.data.token || ''))).map((row) => row.data);
    return result;
  }

  public exportSnapshot(): WorkspaceSnapshot {
    const snapshot: WorkspaceSnapshot = {};
    for (const collection of WORKSPACE_COLLECTIONS) {
      if (collection === 'workspaceConfig') snapshot[collection] = [{ id: 'workspace', requireStorePhotoAtCheckIn: this.requireStorePhotoAtCheckIn, alertRules: this.alertRules, ...(this.orderOptions ? { orderOptions: this.orderOptions } : {}), ...(Object.keys(this.brandPrefixes).length ? { brandPrefixes: this.brandPrefixes } : {}) }];
      else snapshot[collection] = ((this as any)[collection] || []).map((row: any) => JSON.parse(JSON.stringify({ ...row, id: row.id || (collection === 'staffLiveLocations' ? row.officerId : undefined) })));
    }
    return snapshot;
  }

  public hydrateSnapshot(snapshot: WorkspaceSnapshot, user?: User, versions: WorkspaceVersions = {}): void {
    for (const collection of WORKSPACE_COLLECTIONS) {
      if (collection === 'workspaceConfig') {
        const config = snapshot.workspaceConfig?.find((row) => row.id === 'workspace');
        this.requireStorePhotoAtCheckIn = config?.requireStorePhotoAtCheckIn === true;
        this.orderOptions = config?.orderOptions ? validateOrderOptions(config.orderOptions) : null;
        this.alertRules = config?.alertRules ? validateAlertRules(config.alertRules) : { ...DEFAULT_ALERT_RULES };
        this.brandPrefixes = config?.brandPrefixes && typeof config.brandPrefixes === 'object' ? { ...config.brandPrefixes } : {};
      }
      else (this as any)[collection] = JSON.parse(JSON.stringify(snapshot[collection] || []));
    }
    this.customers = this.customers.map(withCustomerLists);
    if (user) this.currentUser = user;
    this.versions = JSON.parse(JSON.stringify(versions)); this.pending.clear();
    this.baseline = this.exportSnapshot();
    if (!this.server) syncManager.setVersions(this.versions);
  }

  private captureMutations() {
    const snapshot = this.exportSnapshot();
    for (const collection of WORKSPACE_COLLECTIONS) {
      // GPS and audit records have dedicated server writers.
      if (collection === 'staffLiveLocations' || collection === 'activityLogs') continue;
      const before = new Map((this.baseline[collection] || []).map((row) => [row.id, row]));
      const after = new Map((snapshot[collection] || []).map((row) => [row.id, row]));
      for (const id of new Set([...before.keys(), ...after.keys()])) {
        if (!id || JSON.stringify(before.get(id)) === JSON.stringify(after.get(id))) continue;
        const notification = after.get(id) || before.get(id);
        const isAdmin = this.currentUser.isSuperAdmin || this.currentUser.is_super_admin;
        if (!this.server && collection === 'notifications' && !isAdmin && (notification?.userId !== this.activeUserId || !before.has(id))) continue;
        const key = `${collection}:${id}`;
        const mutation: WorkspaceMutation = {
          collection, id, operation: after.has(id) ? 'upsert' : 'delete', ...(after.has(id) ? { data: after.get(id)! } : {}),
          mutationId: `mutation_${globalThis.crypto.randomUUID()}`,
          expectedVersion: this.pending.get(key)?.expectedVersion ?? Math.max(this.versions[collection]?.[id] || 0, this.server ? 0 : syncManager.getRecordVersion(collection, id)),
        };
        if (this.server) this.pending.set(key, mutation);
        else if (this.activeUserId) syncManager.enqueue('WORKSPACE_MUTATION', mutation as unknown as Record<string, unknown>);
      }
    }
    this.baseline = snapshot;
  }
  public getRecordVersion(collection: WorkspaceCollection, id: string): number { return this.versions[collection]?.[id] || 0; }
  public getPendingMutations(): WorkspaceMutation[] {
    if (this.server) { this.captureMutations(); return JSON.parse(JSON.stringify([...this.pending.values()])); }
    return syncManager.getWorkspaceMutations();
  }
  public setSessionUser(user: User | null): void {
    if (this.server) { if (user) this.currentUser = user; return; }
    if (this.activeUserId !== (user?.id || null)) {
      this.activeUserId = user?.id || null; this.syncPromise = null; this.legacySnapshot = null; this.workspaceLoaded = false;
      this.deletedProductIds.clear(); this.deletedStoreIds.clear();
      this.hydrateSnapshot(this.initialSnapshot, user || ANONYMOUS_USER);
      this.users = user ? [user] : []; this.brands = [];
      this.activeBrandFilter = 'ALL'; this.activeSubBrandFilter = ''; this.calendarMode = 'BS'; this.comparisonMode = 'OFF'; this.salesMode = 'ALL';
      syncManager.setUser(this.activeUserId);
      if (user) this.loadState();
      this.baseline = this.exportSnapshot();
    }
    if (user) {
      this.currentUser = user;
      const index = this.users.findIndex((entry) => entry.id === user.id);
      if (index < 0) this.users.push(user); else this.users[index] = user;
    }
    window.dispatchEvent(new CustomEvent('bb-db-updated'));
    if (user) void syncManager.forceSyncNow();
  }

  /** Business catalogues start empty and are loaded from the workspace. */
  public ensureBaselineSeeds() {
    // Clean slate: brands and staff are configured by the administrator in Settings
    if (!this.brands) {
      this.brands = [];
    }
  }

  /**
   * Bi-directional synchronization engine with Supabase.
   * Fetches latest remote records and merges them seamlessly with local cache.
   */
  public async syncWithSupabase(): Promise<{ success: boolean; syncedCount: number; message: string }> {
    if (this.server || !this.activeUserId) return { success: false, syncedCount: 0, message: 'Sign in to sync workspace data.' };
    if (this.syncPromise) return this.syncPromise;
    const owner = this.activeUserId;
    const run = (async () => { await syncManager.triggerSync(); return this.pullWorkspace(owner); })(); this.syncPromise = run;
    try { const result = await run; if (result.success) this.lastPulledAt = Date.now(); return result; } finally { if (this.activeUserId === owner) this.syncPromise = null; }
  }
  /** When this device last had a full copy from the server (ms), or 0. */
  public lastPulledAt = 0;
  /** True when the data on this device came from the server within the last `ms`. */
  public isFresh(ms: number): boolean { return this.lastPulledAt > 0 && Date.now() - this.lastPulledAt < ms; }
  private async pullWorkspace(owner: string): Promise<{ success: boolean; syncedCount: number; message: string }> {
    try {
      const response = await fetch('/api/sync', { cache: 'no-store', credentials: 'same-origin', headers: { 'X-Workspace-User': owner } });
      const result = await response.json().catch(() => null);
      if (owner !== this.activeUserId || this.readSessionUser()?.id !== owner) return { success: false, syncedCount: 0, message: 'Account changed during sync.' };
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('bb_auth_user_session_v3'); this.setSessionUser(null);
        window.location?.replace('/login');
        return { success: false, syncedCount: 0, message: 'Sign in again. Pending work has been kept for its owner.' };
      }
      if (!response.ok || !result?.success || !result.data || result.errors?.length) return { success: false, syncedCount: 0, message: result?.error || 'Workspace refresh failed. Your local changes are preserved.' };
      if (Array.isArray(result.deletedProductIds)) this.deletedProductIds = new Set(result.deletedProductIds.filter((id: unknown): id is string => typeof id === 'string'));
      if (Array.isArray(result.deletedStoreIds)) this.deletedStoreIds = new Set(result.deletedStoreIds.filter((id: unknown): id is string => typeof id === 'string'));
      const remote: WorkspaceSnapshot = {};
      for (const collection of WORKSPACE_COLLECTIONS) remote[collection] = Array.isArray(result.data[collection]) ? result.data[collection] : [];
      const configuration = new Set(['workspaceConfig', 'documentTypes', 'storeCategories', 'activityLogs', 'notifications', 'holidays', 'taskTemplates', 'promotions', 'seasonalPatterns']);
      const remoteEmpty = WORKSPACE_COLLECTIONS.filter((collection) => !configuration.has(collection)).every((collection) => !remote[collection]?.length);
      if (this.legacySnapshot && !localStorage.getItem(`bb_workspace_recovered:${owner}`)) {
        for (const collection of ['retailers', 'branches', 'distributors'] as const) this.legacySnapshot[collection] = this.legacySnapshot[collection]?.filter(row => !this.deletedStoreIds.has(row.id));
        this.legacySnapshot.products = this.legacySnapshot.products?.filter(row => !this.deletedProductIds.has(row.id));
        this.legacySnapshot.combos = this.legacySnapshot.combos?.filter(row => !this.deletedProductIds.has(row.id));
        const existing = new Set(syncManager.getWorkspaceMutations().map((mutation) => `${mutation.collection}:${mutation.id}`));
        for (const collection of WORKSPACE_COLLECTIONS) {
          if (collection === 'staffLiveLocations' || collection === 'activityLogs') continue;
          for (const row of this.legacySnapshot[collection] || []) {
            const admin = this.currentUser.isSuperAdmin || this.currentUser.is_super_admin;
            if (collection === 'notifications' && !admin) continue;
            if (!remoteEmpty || existing.has(`${collection}:${row.id}`)) continue;
            syncManager.enqueue('WORKSPACE_MUTATION', { collection, id: row.id, operation: 'upsert', data: row, expectedVersion: 0, mutationId: `recovery_${globalThis.crypto.randomUUID()}` });
          }
        }
        syncManager.recoverLegacyQueue(this.legacySnapshot);
        localStorage.setItem(`bb_workspace_recovered:${owner}`, 'true');
      }
      this.legacySnapshot = null;
      const pending = syncManager.getWorkspaceMutations();
      const merged = JSON.parse(JSON.stringify(remote)) as WorkspaceSnapshot;
      const freshUsers: User[] = Array.isArray(result.data.users) ? result.data.users : this.users;
      const freshUser = freshUsers.find((user) => user.id === owner) || this.currentUser;
      const records = WORKSPACE_COLLECTIONS.flatMap(collection => (remote[collection] || []).map(row => ({ collection, id: row.id, data: row, created_by: row.createdById || owner, version: result.versions?.[collection]?.[row.id] || 0 })));
      merged.staffLiveLocations = this.exportSnapshot().staffLiveLocations;
      for (const mutation of pending) {
        if (['products', 'combos'].includes(mutation.collection) && this.deletedProductIds.has(mutation.id) || ['retailers', 'branches', 'distributors'].includes(mutation.collection) && this.deletedStoreIds.has(mutation.id)) continue;
        const rows = (merged[mutation.collection] || []).filter((row) => row.id !== mutation.id);
        if (mutation.operation === 'upsert' && mutation.data && canReadWorkspaceRecord(freshUser, { collection: mutation.collection, id: mutation.id, data: mutation.data, created_by: mutation.data.createdById || owner, version: mutation.expectedVersion }, freshUsers, records)) rows.push(mutation.data);
        merged[mutation.collection] = rows;
      }
      this.hydrateSnapshot(merged, freshUser, result.versions || {});
      const savedSession = JSON.parse(localStorage.getItem('bb_auth_user_session_v3') || 'null');
      if (savedSession?.user?.id === owner) localStorage.setItem('bb_auth_user_session_v3', JSON.stringify({ ...savedSession, user: freshUser }));
      if (Array.isArray(result.data.users)) this.users = result.data.users;
      if (!this.users.some((user) => user.id === this.currentUser.id)) this.users.push(this.currentUser);
      if (Array.isArray(result.data.brands)) this.brands = result.data.brands;
      this.workspaceLoaded = true;
      this.writeCache(); window.dispatchEvent(new CustomEvent('bb-db-updated'));
      return { success: true, syncedCount: WORKSPACE_COLLECTIONS.reduce((count, collection) => count + (remote[collection]?.length || 0), 0), message: pending.length ? `${pending.length} local changes remain pending.` : 'Workspace data refreshed.' };
    } catch (error) { return { success: false, syncedCount: 0, message: error instanceof Error ? error.message : 'Workspace refresh failed.' }; }
  }

  private loadState() {
    if (this.server || typeof window === 'undefined') return;
    try {
      if (!this.activeUserId) return;
      let stored = localStorage.getItem(this.cacheKey()!);
      let legacy = false;
      if (!stored) {
        for (const oldKey of ['bb_command_center_db_state_v14', 'bb_command_center_db_state_v13', 'bb_command_center_db_state_v12', 'bb_command_center_db_state_v11', 'bb_command_center_db_state_v10', 'bb_command_center_db_state_v9', 'bb_command_center_db_state_v8', 'bb_command_center_db_state']) {
          const old = localStorage.getItem(oldKey);
          if (!old) continue;
          try { if (JSON.parse(old).currentUser?.id === this.activeUserId) { stored = old; legacy = true; break; } } catch {}
        }
      }
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.deletedProductIds)) parsed.deletedProductIds.filter((id: unknown): id is string => typeof id === 'string').forEach((id: string) => this.deletedProductIds.add(id));
        if (parsed.users && parsed.users.length > 0) this.users = parsed.users;
        // The signed-in person's own record comes from the session, never from this older copy.
        const sessionUser = this.readSessionUser();
        if (sessionUser) { this.users = [...this.users.filter((entry: User) => entry.id !== sessionUser.id), sessionUser]; this.currentUser = sessionUser; }
        if (Array.isArray(parsed.deletedStoreIds)) parsed.deletedStoreIds.filter((id: unknown): id is string => typeof id === 'string').forEach((id: string) => this.deletedStoreIds.add(id));
        if (parsed.products) this.products = parsed.products.filter((product: Product) => !this.deletedProductIds.has(product.id));
        if (parsed.combos) this.combos = parsed.combos.filter((combo: Combo) => !this.deletedProductIds.has(combo.id));
        if (parsed.secondaryOrders) this.secondaryOrders = parsed.secondaryOrders;
        if (parsed.facingAudits) this.facingAudits = parsed.facingAudits;
        if (parsed.cheques) this.cheques = parsed.cheques;
        if (parsed.beatItems) this.beatItems = parsed.beatItems;
        if (parsed.orders) this.orders = parsed.orders;
        // Older or imported customer records may miss their lists; screens read them directly.
        if (parsed.customers) this.customers = parsed.customers.map(withCustomerLists);
        if (parsed.deliveryFailures) this.deliveryFailures = parsed.deliveryFailures;
        if (parsed.returns) this.returns = parsed.returns;
        if (parsed.feedbackEntries) this.feedbackEntries = parsed.feedbackEntries;
        if (parsed.reviewCategories) this.reviewCategories = parsed.reviewCategories;
        if (parsed.tasks) this.tasks = parsed.tasks;
        if (parsed.retailers) this.retailers = parsed.retailers.filter((row: { id: string }) => !this.deletedStoreIds.has(row.id));
        if (parsed.distributors) this.distributors = parsed.distributors.filter((row: { id: string }) => !this.deletedStoreIds.has(row.id));
        if (parsed.branches) this.branches = parsed.branches.filter((row: { id: string }) => !this.deletedStoreIds.has(row.id));
        if (parsed.dispatches) this.dispatches = parsed.dispatches;
        if (parsed.stockCounts) this.stockCounts = parsed.stockCounts;
        if (parsed.shelfPhotos) this.shelfPhotos = parsed.shelfPhotos;
        if (parsed.callLogs) this.callLogs = parsed.callLogs;
        if (parsed.documents) this.documents = parsed.documents;
        if (parsed.visits) this.visits = parsed.visits;
        if (parsed.notifications) this.notifications = parsed.notifications;
        if (parsed.activityLogs) this.activityLogs = parsed.activityLogs;
        if (parsed.currentUser?.id === this.activeUserId) this.currentUser = this.readSessionUser() || parsed.currentUser;
        if (parsed.versions) this.versions = parsed.versions;
        if (parsed.activeBrandFilter) this.activeBrandFilter = parsed.activeBrandFilter;
        if (typeof parsed.activeSubBrandFilter === 'string') this.activeSubBrandFilter = parsed.activeSubBrandFilter;
        if (parsed.calendarMode) this.calendarMode = parsed.calendarMode;
        if (parsed.brands && parsed.brands.length > 0) this.brands = parsed.brands;
        if (parsed.staffLiveLocations && parsed.staffLiveLocations.length > 0) this.staffLiveLocations = parsed.staffLiveLocations;
        if (parsed.holidays) this.holidays = parsed.holidays;
        if (parsed.seasonalPatterns) this.seasonalPatterns = parsed.seasonalPatterns;
        if (parsed.taskTemplates) this.taskTemplates = parsed.taskTemplates;
        if (parsed.promotions) this.promotions = parsed.promotions;
        if (parsed.dailySummaries) this.dailySummaries = parsed.dailySummaries;
        if (parsed.importHistory) this.importHistory = parsed.importHistory;
        if (parsed.comparisonMode) this.comparisonMode = parsed.comparisonMode;
        if (parsed.influencers) this.influencers = parsed.influencers;
        if (parsed.influencerContent) this.influencerContent = parsed.influencerContent;
        for (const key of ['marketingSends', 'influencerNiches', 'marketingOptions', 'failureReasons', 'userPreferences', 'campaigns'] as const) if (Array.isArray(parsed[key])) (this as any)[key] = parsed[key];
        if (parsed.brandPrefixes && typeof parsed.brandPrefixes === 'object') this.brandPrefixes = parsed.brandPrefixes;
        if (parsed.sharedAccessLinks) this.sharedAccessLinks = parsed.sharedAccessLinks;
        if (parsed.salesMode) this.salesMode = parsed.salesMode;
        if (parsed.documentTypes) this.documentTypes = parsed.documentTypes;
        if (parsed.storeCategories) this.storeCategories = parsed.storeCategories;
        if (parsed.requireStorePhotoAtCheckIn !== undefined) this.requireStorePhotoAtCheckIn = parsed.requireStorePhotoAtCheckIn;
        if (parsed.recurringSchedules) this.recurringSchedules = parsed.recurringSchedules;
      }

      this.baseline = this.exportSnapshot();
      syncManager.setVersions(this.versions);
      if (legacy) this.legacySnapshot = this.recoverableSnapshot(this.exportSnapshot());
    } catch (e) {
      console.warn('Failed to load state from localStorage', e);
    }
  }

  private repairDuplicateProductIds(): boolean {
    let repaired = false;
    const normalize = (value?: string) => (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const repairs: Array<{ oldId: string; productId: string; name: string; brandCode: string }> = [];
    const seen = new Set<string>();

    for (const product of this.products || []) {
      const oldId = product.id || '';
      if (!oldId || seen.has(oldId)) {
        const identity = normalize(product.sku || `${product.brandCode}_${product.name}`).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'legacy';
        const baseId = `${oldId || 'product'}_${identity}`;
        let productId = baseId;
        let suffix = 2;
        while (seen.has(productId)) productId = `${baseId}_${suffix++}`;
        product.id = productId;
        repairs.push({
          oldId,
          productId,
          name: normalize(product.name),
          brandCode: String(product.brandCode || '').toUpperCase(),
        });
        repaired = true;
      }
      seen.add(product.id);
    }

    const reassignReference = (record: any) => {
      if (!record || typeof record.productId !== 'string' || !record.productId) return;
      const candidates = repairs.filter((candidate) => candidate.oldId === record.productId);
      if (!candidates.length) return;
      const name = normalize(record.productName);
      const named = candidates.filter((candidate) => candidate.name === name && name);
      const brand = String(record.brandCode || '').toUpperCase();
      const branded = brand ? named.filter((candidate) => candidate.brandCode === brand) : [];
      const match = branded.length === 1 ? branded[0] : named.length === 1 ? named[0] : null;
      if (match) {
        record.productId = match.productId;
        repaired = true;
      }
    };
    const repairReferenceTree = (value: any) => {
      if (Array.isArray(value)) {
        value.forEach(repairReferenceTree);
      } else if (value && typeof value === 'object') {
        reassignReference(value);
        Object.values(value).forEach(repairReferenceTree);
      }
    };

    [this.orders, this.secondaryOrders, this.dispatches, this.stockCounts, this.returns, this.feedbackEntries, this.products, this.combos]
      .forEach(repairReferenceTree);
    (this.promotions || []).forEach((promotion) => {
      if (!Array.isArray(promotion.productIds)) return;
      promotion.productIds.forEach((productId, index) => {
        const reference = { productId, productName: promotion.productNames?.[index], brandCode: promotion.brandCode };
        reassignReference(reference);
        promotion.productIds[index] = reference.productId;
      });
    });

    return repaired;
  }

  private repairDuplicateActivityLogIds(): boolean {
    let repaired = false;
    const seen = new Set<string>();
    for (const log of this.activityLogs || []) {
      if (!log.id || seen.has(log.id)) {
        let id = this.generateId('act');
        while (seen.has(id)) id = this.generateId('act');
        log.id = id;
        repaired = true;
      }
      seen.add(log.id);
    }
    return repaired;
  }

  private generateId(prefix: string): string {
    const suffix = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    return `${prefix}_${suffix}`;
  }

  private persistState() {
    this.captureMutations(); this.writeCache();
    if (!this.server) window.dispatchEvent(new CustomEvent('bb-db-updated'));
  }

  private writeCache() {
    if (this.server || !this.activeUserId || typeof window === 'undefined') return;
    try {
      const state = {
        ownerId: this.activeUserId,
        versions: this.versions,
        users: this.users.map((user) => { const safe = { ...user } as any; delete safe.password; delete safe.passwordHash; delete safe.password_hash; return safe; }),
        brands: this.brands,
        products: this.products,
        deletedProductIds: [...this.deletedProductIds],
        deletedStoreIds: [...this.deletedStoreIds],
        combos: this.combos,
        secondaryOrders: this.secondaryOrders,
        facingAudits: this.facingAudits,
        cheques: this.cheques,
        beatItems: this.beatItems,
        visits: this.visits,
        orders: this.orders,
        customers: this.customers,
        deliveryFailures: this.deliveryFailures,
        returns: this.returns,
        feedbackEntries: this.feedbackEntries,
        reviewCategories: this.reviewCategories,
        tasks: this.tasks,
        notifications: this.notifications,
        activityLogs: this.activityLogs,
        retailers: this.retailers,
        distributors: this.distributors,
        branches: this.branches,
        dispatches: this.dispatches,
        stockCounts: this.stockCounts,
        shelfPhotos: this.shelfPhotos,
        callLogs: this.callLogs,
        documents: this.documents,
        currentUser: (() => { const safe = { ...this.currentUser } as any; delete safe.password; delete safe.passwordHash; delete safe.password_hash; return safe; })(),
        activeBrandFilter: this.activeBrandFilter,
        activeSubBrandFilter: this.activeSubBrandFilter,
        calendarMode: this.calendarMode,
        staffLiveLocations: this.staffLiveLocations,
        holidays: this.holidays,
        seasonalPatterns: this.seasonalPatterns,
        taskTemplates: this.taskTemplates,
        promotions: this.promotions,
        dailySummaries: this.dailySummaries,
        importHistory: this.importHistory,
        comparisonMode: this.comparisonMode,
        influencers: this.influencers,
        influencerContent: this.influencerContent,
        marketingSends: this.marketingSends,
        influencerNiches: this.influencerNiches,
        marketingOptions: this.marketingOptions,
        failureReasons: this.failureReasons,
        userPreferences: this.userPreferences,
        campaigns: this.campaigns,
        brandPrefixes: this.brandPrefixes,
        sharedAccessLinks: this.sharedAccessLinks,
        salesMode: this.salesMode,
        documentTypes: this.documentTypes,
        storeCategories: this.storeCategories,
        requireStorePhotoAtCheckIn: this.requireStorePhotoAtCheckIn,
        recurringSchedules: this.recurringSchedules,
      };
      localStorage.setItem(this.cacheKey()!, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to persist state', e);
    }
  }

  public resetDatabase() {
    if (this.server || !this.activeUserId) return;
    const key = this.cacheKey()!;
    const saved = localStorage.getItem(key);
    if (saved) localStorage.setItem(`${key}:backup:${Date.now()}`, saved);
    localStorage.removeItem(key); window.location.reload();
  }

  // Brands Portfolio Management (Multi-Brand Distributor Engine)
  public getBrands(status?: 'ACTIVE' | 'ALL'): Brand[] {
    const seen = new Set<string>();
    const unique = this.brands.filter((b) => {
      const code = (b.code || '').trim().toUpperCase();
      if (!code || seen.has(code)) return false;
      seen.add(code);
      return true;
    });
    if (status === 'ACTIVE') {
      return unique.filter(
        (b) => b.status === 'ACTIVE' && b.isActive !== false && (b as any).is_active !== false
      );
    }
    return unique;
  }

  public replaceBrands(brands: Brand[]): void {
    this.brands = brands.map((brand) => ({ ...brand }));
    this.persistState();
  }

  public addBrand(brand: Brand): Brand {
    const normCode = (brand.code || '').trim().toUpperCase();
    const existingIndex = this.brands.findIndex(
      (b) => b.id === brand.id || (b.code || '').trim().toUpperCase() === normCode
    );
    if (existingIndex >= 0) {
      this.brands[existingIndex] = { ...this.brands[existingIndex], ...brand };
    } else {
      this.brands.push(brand);
    }
    this.persistState();
    return brand;
  }

  public updateBrand(brandId: string, updates: Partial<Brand>): Brand | undefined {
    const brand = this.brands.find((b) => b.id === brandId);
    if (brand) {
      Object.assign(brand, updates);
      this.persistState();
    }
    return brand;
  }

  public deleteBrand(brandId: string) {
    this.brands = this.brands.filter((b) => b.id !== brandId && b.code !== brandId);
    this.persistState();
  }

  // Active Brand & Calendar Modes
  public getActiveBrandFilter(): BrandCode {
    return this.activeBrandFilter;
  }

  public setActiveBrandFilter(brand: BrandCode, subBrandId = '') {
    this.activeBrandFilter = brand;
    this.activeSubBrandFilter = brand && brand !== 'ALL' ? subBrandId : '';
    this.persistState();
  }

  public getActiveSubBrandFilter(): string {
    return this.activeBrandFilter && this.activeBrandFilter !== 'ALL' ? this.activeSubBrandFilter : '';
  }

  /** Does a product (or a combo, through its parts) belong to the active sub-brand? True when no sub-brand is chosen. */
  private inActiveSubBrand(productId: string, stamped?: string): boolean {
    const sub = this.getActiveSubBrandFilter();
    if (!sub) return true;
    if (stamped) return stamped === sub;
    const product = this.products.find((p) => p.id === productId);
    if (product) return product.subBrandId === sub;
    const combo = this.combos.find((c) => c.id === productId);
    return !!combo && combo.items.some((item) => this.products.find((p) => p.id === item.productId)?.subBrandId === sub);
  }

  public getCalendarMode(): 'BS' | 'AD' {
    return this.calendarMode;
  }

  public setCalendarMode(mode: 'BS' | 'AD') {
    this.calendarMode = mode;
    this.persistState();
  }

  // Sales Officer Online/Offline Duty Management
  public setOfficerDutyStatus(officerId: string, status: DutyStatus) {
    const user = this.users.find((u) => u.id === officerId);
    if (user) {
      user.dutyStatus = status;
      if (this.currentUser.id === officerId) {
        this.currentUser.dutyStatus = status;
      }
    }

    const staff = this.staffLiveLocations.find((s) => s.officerId === officerId);
    if (staff) {
      staff.dutyStatus = status;
      staff.isOnline = status === 'ONLINE' || status === 'IN_FIELD' || status === 'ON_BREAK';
      if (status === 'OFFLINE') {
        staff.status = 'DAY_ENDED';
      } else if (status === 'ON_BREAK') {
        staff.status = 'IDLE';
      } else if (status === 'IN_FIELD') {
        staff.status = 'AT_STORE';
      }
    }

    if (!this.server && this.activeUserId) syncManager.enqueue('DUTY_STATUS', { officerId, status });
    this.persistState();
  }

  public getOfficerDutyStatus(officerId: string): DutyStatus {
    const user = this.users.find((u) => u.id === officerId);
    return user?.dutyStatus || 'OFFLINE';
  }

  // Users, Staff Onboarding & Roles
  public getUsers(): User[] {
    return this.users;
  }

  public replaceUsers(users: User[]): void {
    this.users = JSON.parse(JSON.stringify(users));
    this.writeCache();
  }

  public getUserById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  public createUser(user: Omit<User, 'id'>): User {
    return this.addNewUser(user);
  }

  public addNewUser(user: Omit<User, 'id'> & { id?: string }): User {
    const newUser: User = {
      ...user,
      id: user.id || `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      active: user.active !== false,
    };
    this.users.push(newUser);
    this.logActivity('CREATED_STAFF_ACCOUNT', 'USER', newUser.id, {
      name: newUser.fullName,
      role: newUser.role,
      territory: newUser.territory,
    });
    this.persistState();
    return newUser;
  }

  public updateUserPermissions(userId: string, permissions: UserPermissions) {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      user.permissions = permissions;
      this.persistState();
    }
  }

  public updateUser(userId: string, updates: Partial<User>): User | undefined {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return undefined;
    Object.assign(user, updates);
    if (this.currentUser.id === userId) {
      Object.assign(this.currentUser, updates);
      if (!this.server && typeof window !== 'undefined') {
        const now = Date.now();
        const { password: _p, ...safeUser } = this.currentUser;
        const sessionData = {
          user: safeUser,
          createdAt: now,
          expiresAt: now + 24 * 60 * 60 * 1000,
          sessionId: `sess_${now}_${Math.random().toString(36).slice(2, 9)}`,
        };
        localStorage.setItem('bb_auth_user_session_v3', JSON.stringify(sessionData));
      }
    }
    this.persistState();
    return user;
  }

  public deleteUser(userId: string): boolean {
    const idx = this.users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      this.users.splice(idx, 1);
      this.persistState();
      return true;
    }
    return false;
  }

  public getCurrentUser(): User {
    if (!this.server && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('bb_auth_user_session_v3');
        if (stored) {
          const parsed = JSON.parse(stored);
          const userId = parsed?.user?.id || parsed?.id;
          if (userId) {
            const found = this.users.find((u) => u.id === userId);
            if (found) {
              this.currentUser = found;
              return found;
            }
            if (parsed.user && parsed.user.id) {
              this.currentUser = parsed.user as User;
              return parsed.user as User;
            }
            if (parsed.id) {
              this.currentUser = parsed as User;
              return parsed as User;
            }
          }
        }
      } catch {
        // ignore
      }
    }
    return this.currentUser;
  }

  public setCurrentUser(userId: string) {
    const session = this.server ? null : this.readSessionUser();
    const user = session?.id === userId ? session : this.users.find((entry) => entry.id === userId);
    if (user) {
      if (!this.server) this.setSessionUser(user); else this.currentUser = user;
      this.persistState();
    }
  }

  // Products & Combos Master

  public getProducts(brandCode?: BrandCode): Product[] {
    const user = this.getCurrentUser();
    let list = this.products;
    if (!user.is_super_admin && !user.isSuperAdmin && user.assignedBrands && user.assignedBrands.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((p) => user.assignedBrands!.includes(p.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      list = list.filter((p) => p.brandCode === brand);
    }
    if (!brandCode && this.getActiveSubBrandFilter()) list = list.filter((p) => this.inActiveSubBrand(p.id));
    return list;
  }

  public getProductById(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  public getProductByNameOrId(idOrName: string): Product | undefined {
    if (!idOrName) return undefined;
    const clean = decodeURIComponent(idOrName).trim().toLowerCase();
    return this.products.find(
      (p) => p.id.toLowerCase() === clean || p.name.toLowerCase() === clean || p.sku.toLowerCase() === clean
    );
  }

  public addProduct(product: Omit<Product, 'id'>): Product {
    const newProduct: Product = {
      ...product,
      id: this.generateId(`prod_${product.brandCode.toLowerCase()}`),
      active: product.active ?? true,
    };
    this.products.unshift(newProduct);
    this.logActivity('CREATED_PRODUCT', 'PRODUCT', newProduct.id, {
      name: newProduct.name,
      sku: newProduct.sku,
      brand: newProduct.brandCode,
    });
    this.persistState();
    return newProduct;
  }

  public updateProduct(id: string, updates: Partial<Product>): Product | null {
    const idx = this.products.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    this.products[idx] = { ...this.products[idx], ...updates };
    this.persistState();
    return this.products[idx];
  }

  public deleteProduct(id: string): boolean {
    const prevLen = this.products.length;
    this.products = this.products.filter((p) => p.id !== id);
    if (this.products.length !== prevLen) {
      this.persistState();
      return true;
    }
    return false;
  }

  public getCombos(brandCode?: BrandCode): Combo[] {
    const user = this.getCurrentUser();
    let list = this.combos;
    if (!user.is_super_admin && !user.isSuperAdmin && user.assignedBrands && user.assignedBrands.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((c) => user.assignedBrands!.includes(c.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      list = list.filter((c) => c.brandCode === brand);
    }
    if (!brandCode && this.getActiveSubBrandFilter()) list = list.filter((c) => this.inActiveSubBrand(c.id));
    return list;
  }

  public addCombo(combo: Omit<Combo, 'id' | 'createdAt'>): Combo {
    const newCombo: Combo = {
      ...combo,
      id: this.generateId('combo'),
      createdAt: new Date().toISOString(),
      active: combo.active ?? true,
    };
    this.combos.unshift(newCombo);
    this.logActivity('CREATED_COMBO', 'COMBO', newCombo.id, {
      name: newCombo.name,
      sku: newCombo.sku,
      price: newCombo.comboPrice,
    });
    this.persistState();
    return newCombo;
  }

  public updateCombo(id: string, updates: Partial<Combo>): Combo | null {
    const idx = this.combos.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.combos[idx] = { ...this.combos[idx], ...updates };
    this.persistState();
    return this.combos[idx];
  }

  public deleteCombo(id: string): boolean {
    const prevLen = this.combos.length;
    this.combos = this.combos.filter((c) => c.id !== id);
    if (this.combos.length !== prevLen) {
      this.persistState();
      return true;
    }
    return false;
  }

  // Secondary Orders (Bizom / BeatRoute secondary order booking)
  public getSecondaryOrders(filter?: { officerId?: string; storeId?: string; allBrands?: boolean }): SecondaryOrder[] {
    const user = this.getCurrentUser();
    let result = this.secondaryOrders;
    if (!user.is_super_admin && !user.isSuperAdmin && user.assignedBrands && user.assignedBrands.length > 0 && !user.assignedBrands.includes('ALL')) {
      result = result.filter((o) => {
        return o.items.some((item) => {
          const prod = this.products.find((p) => p.id === item.productId || p.name === item.productName);
          return prod ? user.assignedBrands!.includes(prod.brandCode) : true;
        });
      });
    }
    // The header's brand (and sub-brand) choice applies to store orders too: keep orders with a line in it.
    if (!filter?.allBrands && this.activeBrandFilter && this.activeBrandFilter !== 'ALL') {
      const brand = this.activeBrandFilter;
      result = result.filter((o) => o.items.some((item) => (item.brandCode || this.products.find((p) => p.id === item.productId)?.brandCode) === brand
        && this.inActiveSubBrand(item.productId, item.subBrandId)));
    }
    if (filter?.officerId) {
      result = result.filter((o) => o.officerId === filter.officerId);
    }
    if (filter?.storeId) {
      result = result.filter((o) => o.entityId === filter.storeId);
    }
    return result;
  }

  public createSecondaryOrder(
    order: Omit<SecondaryOrder, 'id' | 'orderNumber' | 'createdAt'>
  ): SecondaryOrder {
    // The server replaces this with the next SO number when it saves the order.
    const orderNumber = pendingDocumentId();
    const newOrder: SecondaryOrder = {
      ...order,
      id: this.generateId('sec_ord'),
      orderNumber,
      createdAt: new Date().toISOString(),
    };
    this.secondaryOrders.unshift(newOrder);

    // If order entity is retailer or branch, update outstanding balance
    if (order.entityType === 'RETAILER') {
      const ret = this.retailers.find((r) => r.id === order.entityId);
      if (ret) {
        ret.outstandingBalance = (ret.outstandingBalance || 0) + order.totalAmount;
      }
    } else if (order.entityType === 'BRANCH') {
      const br = this.branches.find((b) => b.id === order.entityId);
      if (br) {
        br.outstandingBalance = (br.outstandingBalance || 0) + order.totalAmount;
      }
    }

    this.logActivity('BOOKED_SECONDARY_ORDER', 'SECONDARY_ORDER', newOrder.id, {
      orderNumber: newOrder.orderNumber,
      store: newOrder.storeName,
      totalAmount: newOrder.totalAmount,
      units: newOrder.totalUnits,
    });
    this.persistState();
    return newOrder;
  }

  public updateSecondaryOrderStatus(id: string, status: SecondaryOrder['status']): SecondaryOrder | null {
    const order = this.secondaryOrders.find((o) => o.id === id);
    if (!order) return null;
    order.status = status;
    this.persistState();
    return order;
  }

  // Facing Audits (Shelf presence vs competitors)
  public getFacingAudits(storeId?: string): FacingAudit[] {
    if (storeId) {
      return this.facingAudits.filter((a) => a.storeId === storeId);
    }
    return this.facingAudits;
  }

  public recordFacingAudit(audit: Omit<FacingAudit, 'id' | 'createdAt'>): FacingAudit {
    const newAudit: FacingAudit = {
      ...audit,
      id: this.generateId('fa'),
      createdAt: new Date().toISOString(),
    };
    this.facingAudits.unshift(newAudit);
    this.logActivity('AUDITED_FACINGS', 'FACING_AUDIT', newAudit.id, {
      store: newAudit.storeName,
      ownSharePct: newAudit.ownSharePct,
    });
    this.persistState();
    return newAudit;
  }

  // Stores & Hierarchy with Multi-Contact Support
  public getDistributors(): Distributor[] {
    return this.distributors;
  }

  public addDistributor(
    dist: Omit<Distributor, 'id' | 'contacts'> & { contacts?: VendorContact[] }
  ): Distributor {
    const newDist: Distributor = {
      ...dist,
      id: this.generateId('dist'),
      contacts: dist.contacts || [],
    };
    this.distributors.unshift(newDist);
    this.logActivity('CREATED_DISTRIBUTOR', 'DISTRIBUTOR', newDist.id, { name: newDist.name });
    this.persistState();
    return newDist;
  }

  public getBranches(distributorId?: string): Branch[] {
    if (distributorId) {
      return this.branches.filter((b) => b.distributorId === distributorId);
    }
    return this.branches;
  }

  public addBranch(
    branch: Omit<Branch, 'id' | 'contacts'> & { contacts?: VendorContact[] }
  ): Branch {
    const newBranch: Branch = {
      ...branch,
      id: this.generateId('br'),
      contacts: branch.contacts || [],
    };
    this.branches.unshift(newBranch);
    this.logActivity('CREATED_BRANCH', 'BRANCH', newBranch.id, { name: newBranch.name });
    this.persistState();
    return newBranch;
  }

  public getRetailers(): Retailer[] {
    return this.retailers;
  }

  public addRetailer(
    ret: Omit<Retailer, 'id' | 'contacts'> & { contacts?: VendorContact[] }
  ): Retailer {
    const newRetailer: Retailer = {
      ...ret,
      id: this.generateId('ret'),
      contacts: ret.contacts || [],
    };
    this.retailers.unshift(newRetailer);

    // Also add to today's beat if assigned to current officer
    if (this.currentUser.id === newRetailer.assignedOfficerId) {
      this.beatItems.push({
        id: this.generateId('beat'),
        officerId: newRetailer.assignedOfficerId,
        dateAd: new Date().toISOString().split('T')[0],
        dateBs: getTodayBs(),
        sequence: this.beatItems.length + 1,
        entityType: 'RETAILER',
        entityId: newRetailer.id,
        storeName: newRetailer.name,
        storeType: newRetailer.type,
        address: newRetailer.address,
        lat: newRetailer.lat,
        lng: newRetailer.lng,
        contactName: newRetailer.contactName,
        contactPhone: newRetailer.contactPhone,
        contacts: newRetailer.contacts,
        lastVisitDaysAgo: 0,
        pendingTasks: ['Initial Store Onboarding'],
        status: 'PENDING',
      });
    }

    this.logActivity('CREATED_RETAILER', 'RETAILER', newRetailer.id, { name: newRetailer.name });
    this.persistState();
    return newRetailer;
  }

  public updateRetailer(id: string, updates: Partial<Retailer>): Retailer | null {
    const idx = this.retailers.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    this.retailers[idx] = { ...this.retailers[idx], ...updates };
    this.persistState();
    return this.retailers[idx];
  }

  public deleteRetailer(id: string): boolean {
    const prev = this.retailers.length;
    this.retailers = this.retailers.filter((r) => r.id !== id);
    if (this.retailers.length !== prev) {
      this.beatItems = this.beatItems.filter((b) => b.entityId !== id);
      this.persistState();
      return true;
    }
    return false;
  }

  public updateDistributor(id: string, updates: Partial<Distributor>): Distributor | null {
    const idx = this.distributors.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    this.distributors[idx] = { ...this.distributors[idx], ...updates };
    this.persistState();
    return this.distributors[idx];
  }

  public deleteDistributor(id: string): boolean {
    const prev = this.distributors.length;
    this.distributors = this.distributors.filter((d) => d.id !== id);
    if (this.distributors.length !== prev) {
      this.branches = this.branches.filter((b) => b.distributorId !== id);
      this.persistState();
      return true;
    }
    return false;
  }

  public updateBranch(id: string, updates: Partial<Branch>): Branch | null {
    const idx = this.branches.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    this.branches[idx] = { ...this.branches[idx], ...updates };
    this.persistState();
    return this.branches[idx];
  }

  public getUnifiedStoreById(idOrName: string) {
    if (!idOrName) return null;
    const clean = decodeURIComponent(idOrName).trim().toLowerCase();

    // 1. Check branch
    const branch = this.branches.find(
      (b) => b.id.toLowerCase() === clean || b.name.toLowerCase() === clean
    );
    if (branch) {
      const dist = this.distributors.find((d) => d.id === branch.distributorId);
      return {
        id: branch.id,
        name: branch.name,
        type: 'BRANCH' as const,
        subType: 'Modern Trade (MT)',
        address: branch.address,
        area: branch.address,
        distributorId: branch.distributorId,
        distributorName: dist?.name || 'Central Distributor',
        contacts: branch.contacts || [],
        primaryContactName: branch.contactName || branch.contacts?.[0]?.name || 'Store Manager',
        primaryContactPhone: branch.contactPhone || branch.contacts?.[0]?.phone || '+977-9851000000',
        creditLimit: branch.creditLimit || 500000,
        creditPeriodDays: 30,
        paymentTerms: dist?.creditTerms,
        outstandingBalance: branch.outstandingBalance || 85000,
        coordinates: validGpsCoordinates(branch.lat, branch.lng) ? { lat: branch.lat, lng: branch.lng } : undefined,
        assignedOfficerId: branch.assignedOfficerId || '',
        assignedOfficerName: branch.assignedOfficerName || 'Field Officer',
        defaultMargins: branch.defaultMargins || dist?.defaultMargins,
      };
    }

    // 2. Check retailer
    const retailer = this.retailers.find(
      (r) => r.id.toLowerCase() === clean || r.name.toLowerCase() === clean
    );
    if (retailer) {
      return {
        id: retailer.id,
        name: retailer.name,
        type: 'RETAILER' as const,
        subType: retailer.type || 'General Trade (GT)',
        address: retailer.address,
        area: retailer.area,
        contacts: retailer.contacts || [],
        primaryContactName: retailer.contactName || retailer.contacts?.[0]?.name || 'Proprietor',
        primaryContactPhone: retailer.contactPhone || retailer.contacts?.[0]?.phone || '+977-9800000000',
        creditLimit: retailer.creditLimit || 0,
        creditPeriodDays: (retailer as any).creditDays || (retailer as any).creditPeriodDays || 0,
        paymentTerms: retailer.creditTerms,
        outstandingBalance: retailer.outstandingBalance || 0,
        coordinates: validGpsCoordinates(retailer.lat, retailer.lng) ? { lat: retailer.lat, lng: retailer.lng } : undefined,
        assignedOfficerId: retailer.assignedOfficerId || '',
        assignedOfficerName: retailer.assignedOfficerName || 'Field Officer',
        defaultMargins: retailer.defaultMargins,
      };
    }

    // 3. Check distributor
    const distributor = this.distributors.find(
      (d) => d.id.toLowerCase() === clean || d.name.toLowerCase() === clean
    );
    if (distributor) {
      return {
        id: distributor.id,
        name: distributor.name,
        type: 'DISTRIBUTOR' as const,
        subType: 'Regional Distributor',
        address: distributor.address || distributor.city,
        area: distributor.city,
        contacts: distributor.contacts || [],
        primaryContactName: distributor.contactName || distributor.contacts?.[0]?.name || 'Manager',
        primaryContactPhone: distributor.contactPhone || distributor.contacts?.[0]?.phone || '+977-9800000000',
        creditLimit: (distributor as any).creditLimit || 0,
        creditPeriodDays: 30,
        paymentTerms: distributor.creditTerms,
        outstandingBalance: 0,
        coordinates: undefined,
        assignedOfficerId: '',
        assignedOfficerName: 'Operations Lead',
        defaultMargins: distributor.defaultMargins,
      };
    }

    // Unknown store: say so rather than inventing one.
    return null;
  }

  // Section 2: Unified Stores Access
  public getStoresUnified() {
    const list: {
      id: string;
      name: string;
      storeType: StoreType;
      category?: string;
      city: string;
      area?: string;
      address: string;
      lat?: number;
      lng?: number;
      brandsStocked: BrandCode[];
      defaultMargins?: DefaultMargins;
      vatRegistered?: boolean;
      assignedOfficerId?: string;
      parentDistributorId?: string;
      parentDistributorName?: string;
      healthScore?: number;
      isActive?: boolean;
      contacts: VendorContact[];
      hasBranches?: boolean;
      branchesCount?: number;
      paymentTerms?: string;
    }[] = [];

    // Distributors & Chains
    this.distributors.forEach((d) => {
      const branches = this.branches.filter((b) => b.distributorId === d.id);
      const isChain = d.type === 'Retail Chain' || d.type === 'Pharmacy Chain';
      list.push({
        id: d.id,
        name: d.name,
        storeType: (d.storeType || (isChain ? 'CHAIN_STORE' : 'DISTRIBUTOR')) as StoreType,
        category: d.type,
        city: d.city,
        area: d.city,
        address: d.address || `${d.city}, Nepal`,
        lat: d.lat,
        lng: d.lng,
        brandsStocked: d.brandsCarried,
        defaultMargins: d.defaultMargins,
        vatRegistered: d.vatRegistered ?? true,
        contacts: d.contacts || [],
        hasBranches: branches.length > 0,
        branchesCount: branches.length,
        paymentTerms: d.creditTerms,
        healthScore: d.healthScore ?? this.getStoreHealthScore(d.id).overall,
        isActive: true,
      });
    });

    // Standalone Retailers
    this.retailers.forEach((r) => {
      list.push({
        id: r.id,
        name: r.name,
        storeType: (r.storeType || 'STANDALONE_RETAILER') as StoreType,
        category: r.category || r.type,
        city: r.city,
        area: r.area,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        brandsStocked: r.brandsStocked,
        defaultMargins: r.defaultMargins,
        vatRegistered: r.vatRegistered ?? false,
        assignedOfficerId: r.assignedOfficerId,
        parentDistributorId: r.distributorId,
        parentDistributorName: r.distributorName,
        contacts: r.contacts || [],
        hasBranches: false,
        branchesCount: 0,
        paymentTerms: r.creditTerms,
        healthScore: r.healthScore ?? this.getStoreHealthScore(r.id).overall,
        isActive: true,
      });
    });

    return list;
  }

  public calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // metres
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  public addVendorContact(
    entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER',
    entityId: string,
    contact: Omit<VendorContact, 'id'>
  ): VendorContact {
    const newContact: VendorContact = {
      ...contact,
      id: this.generateId('cnt'),
      storeId: entityType !== 'BRANCH' ? entityId : undefined,
      branchId: entityType === 'BRANCH' ? entityId : undefined,
      addedById: this.currentUser.id,
    };

    if (entityType === 'DISTRIBUTOR') {
      const dist = this.distributors.find((d) => d.id === entityId);
      if (dist) {
        if (!dist.contacts) dist.contacts = [];
        dist.contacts.push(newContact);
      }
    } else if (entityType === 'BRANCH') {
      const br = this.branches.find((b) => b.id === entityId);
      if (br) {
        if (!br.contacts) br.contacts = [];
        br.contacts.push(newContact);
      }
    } else {
      const ret = this.retailers.find((r) => r.id === entityId);
      if (ret) {
        if (!ret.contacts) ret.contacts = [];
        ret.contacts.push(newContact);
      }
    }

    this.persistState();
    return newContact;
  }

  // Section 3: Contact Management (Primary, Flagging, Approval)
  public setPrimaryContact(
    entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER',
    entityId: string,
    contactId: string
  ): boolean {
    const getContactsList = (): VendorContact[] | undefined => {
      if (entityType === 'DISTRIBUTOR') return this.distributors.find((d) => d.id === entityId)?.contacts;
      if (entityType === 'BRANCH') return this.branches.find((b) => b.id === entityId)?.contacts;
      return this.retailers.find((r) => r.id === entityId)?.contacts;
    };

    const contacts = getContactsList();
    if (!contacts) return false;

    contacts.forEach((c) => {
      c.isPrimary = c.id === contactId;
    });

    this.persistState();
    return true;
  }

  public flagContactForRemoval(
    entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER',
    entityId: string,
    contactId: string,
    reason: string,
    flaggedBy?: User
  ): boolean {
    const getContactsList = (): VendorContact[] | undefined => {
      if (entityType === 'DISTRIBUTOR') return this.distributors.find((d) => d.id === entityId)?.contacts;
      if (entityType === 'BRANCH') return this.branches.find((b) => b.id === entityId)?.contacts;
      return this.retailers.find((r) => r.id === entityId)?.contacts;
    };

    const contacts = getContactsList();
    const contact = contacts?.find((c) => c.id === contactId);
    if (!contact) return false;

    contact.isFlaggedForRemoval = true;
    contact.flaggedReason = reason;
    contact.flaggedAt = new Date().toISOString();
    contact.flaggedById = flaggedBy?.id || this.currentUser.id;
    contact.flaggedByName = flaggedBy?.fullName || this.currentUser.fullName;

    this.persistState();
    return true;
  }

  public getPendingContactRemovals(): {
    entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER';
    entityId: string;
    entityName: string;
    contact: VendorContact;
  }[] {
    const results: {
      entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER';
      entityId: string;
      entityName: string;
      contact: VendorContact;
    }[] = [];

    this.distributors.forEach((d) => {
      d.contacts?.filter((c) => c.isFlaggedForRemoval).forEach((c) => {
        results.push({ entityType: 'DISTRIBUTOR', entityId: d.id, entityName: d.name, contact: c });
      });
    });

    this.branches.forEach((b) => {
      b.contacts?.filter((c) => c.isFlaggedForRemoval).forEach((c) => {
        results.push({ entityType: 'BRANCH', entityId: b.id, entityName: b.name, contact: c });
      });
    });

    this.retailers.forEach((r) => {
      r.contacts?.filter((c) => c.isFlaggedForRemoval).forEach((c) => {
        results.push({ entityType: 'RETAILER', entityId: r.id, entityName: r.name, contact: c });
      });
    });

    return results;
  }

  public approveContactRemoval(
    entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER',
    entityId: string,
    contactId: string
  ): boolean {
    if (entityType === 'DISTRIBUTOR') {
      const d = this.distributors.find((x) => x.id === entityId);
      if (d && d.contacts) d.contacts = d.contacts.filter((c) => c.id !== contactId);
    } else if (entityType === 'BRANCH') {
      const b = this.branches.find((x) => x.id === entityId);
      if (b && b.contacts) b.contacts = b.contacts.filter((c) => c.id !== contactId);
    } else {
      const r = this.retailers.find((x) => x.id === entityId);
      if (r && r.contacts) r.contacts = r.contacts.filter((c) => c.id !== contactId);
    }
    this.persistState();
    return true;
  }

  public rejectContactRemoval(
    entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER',
    entityId: string,
    contactId: string
  ): boolean {
    const getContactsList = (): VendorContact[] | undefined => {
      if (entityType === 'DISTRIBUTOR') return this.distributors.find((d) => d.id === entityId)?.contacts;
      if (entityType === 'BRANCH') return this.branches.find((b) => b.id === entityId)?.contacts;
      return this.retailers.find((r) => r.id === entityId)?.contacts;
    };

    const contacts = getContactsList();
    const contact = contacts?.find((c) => c.id === contactId);
    if (!contact) return false;

    contact.isFlaggedForRemoval = false;
    contact.flaggedReason = undefined;
    contact.flaggedAt = undefined;
    contact.flaggedById = undefined;
    contact.flaggedByName = undefined;

    this.persistState();
    return true;
  }

  public transferContactToBranch(
    sourceEntityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER',
    sourceEntityId: string,
    targetBranchId: string,
    contactId: string
  ): boolean {
    const targetBranch = this.branches.find((b) => b.id === targetBranchId);
    if (!targetBranch) return false;

    let movedContact: VendorContact | null = null;
    if (sourceEntityType === 'DISTRIBUTOR') {
      const d = this.distributors.find((x) => x.id === sourceEntityId);
      if (d && d.contacts) {
        const idx = d.contacts.findIndex((c) => c.id === contactId);
        if (idx !== -1) [movedContact] = d.contacts.splice(idx, 1);
      }
    } else if (sourceEntityType === 'BRANCH') {
      const b = this.branches.find((x) => x.id === sourceEntityId);
      if (b && b.contacts) {
        const idx = b.contacts.findIndex((c) => c.id === contactId);
        if (idx !== -1) [movedContact] = b.contacts.splice(idx, 1);
      }
    } else {
      const r = this.retailers.find((x) => x.id === sourceEntityId);
      if (r && r.contacts) {
        const idx = r.contacts.findIndex((c) => c.id === contactId);
        if (idx !== -1) [movedContact] = r.contacts.splice(idx, 1);
      }
    }

    if (movedContact) {
      movedContact.branchId = targetBranchId;
      movedContact.isFlaggedForRemoval = false;
      movedContact.flaggedReason = undefined;
      if (!targetBranch.contacts) targetBranch.contacts = [];
      targetBranch.contacts.push(movedContact);
      this.persistState();
      return true;
    }
    return false;
  }

  // Section 4: Store Commercial Terms & Margins
  public updateStoreCommercialTerms(
    entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER',
    entityId: string,
    defaultMargins: DefaultMargins,
    paymentTerms?: string
  ): boolean {
    if (entityType === 'DISTRIBUTOR') {
      const d = this.distributors.find((x) => x.id === entityId);
      if (d) {
        d.defaultMargins = defaultMargins;
        if (paymentTerms) d.creditTerms = paymentTerms;
      }
    } else if (entityType === 'BRANCH') {
      const b = this.branches.find((x) => x.id === entityId);
      if (b) {
        b.defaultMargins = defaultMargins;
      }
    } else {
      const r = this.retailers.find((x) => x.id === entityId);
      if (r) {
        r.defaultMargins = defaultMargins;
        if (paymentTerms) r.creditTerms = paymentTerms;
      }
    }
    this.persistState();
    return true;
  }

  // Section 8: Document Types Configuration
  public getDocumentTypes(): DocumentTypeConfig[] {
    return this.documentTypes;
  }

  public getOrderOptions(): OrderOptions { return this.orderOptions ? structuredClone(this.orderOptions) : defaultOrderOptions(); }
  public setOrderOptions(options: OrderOptions): void { this.orderOptions = validateOrderOptions(options); this.persistState(); }

  public getAlertRules(): AlertRules { return { ...this.alertRules }; }
  public setAlertRules(rules: AlertRules): void { this.alertRules = validateAlertRules(rules); this.persistState(); }

  public addDocumentType(name: string): DocumentTypeConfig {
    const newDocType: DocumentTypeConfig = {
      id: this.generateId('doc'),
      name: name.trim(),
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.documentTypes.push(newDocType);
    this.persistState();
    return newDocType;
  }

  public toggleDocumentType(id: string): void {
    const dt = this.documentTypes.find((x) => x.id === id);
    if (dt) {
      dt.isActive = !dt.isActive;
      this.persistState();
    }
  }

  // Section 11: Store Categories Configuration
  public getStoreCategories(): StoreCategoryConfig[] {
    return this.storeCategories;
  }

  public addStoreCategory(name: string): StoreCategoryConfig {
    const newCat: StoreCategoryConfig = {
      id: this.generateId('cat'),
      name: name.trim(),
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.storeCategories.push(newCat);
    this.persistState();
    return newCat;
  }

  public toggleStoreCategory(id: string): void {
    const cat = this.storeCategories.find((x) => x.id === id);
    if (cat) {
      cat.isActive = !cat.isActive;
      this.persistState();
    }
  }

  // Section 10: Store Visit Proof Photo Setting
  public getRequireStorePhotoAtCheckIn(): boolean {
    return this.requireStorePhotoAtCheckIn;
  }

  public setRequireStorePhotoAtCheckIn(enabled: boolean): void {
    this.requireStorePhotoAtCheckIn = enabled;
    this.persistState();
  }

  // Section 7: Recurring Beat Management & Leave Coverage
  public getRecurringSchedules(officerId?: string): RecurringScheduleEntry[] {
    if (officerId) {
      return this.recurringSchedules.filter((s) => s.officerId === officerId);
    }
    return this.recurringSchedules;
  }

  public saveRecurringSchedule(entry: RecurringScheduleEntry): void {
    const idx = this.recurringSchedules.findIndex((s) => s.id === entry.id);
    if (idx !== -1) {
      this.recurringSchedules[idx] = entry;
    } else {
      this.recurringSchedules.push(entry);
    }
    this.persistState();
  }

  public deleteRecurringSchedule(id: string): void {
    this.recurringSchedules = this.recurringSchedules.filter((s) => s.id !== id);
    this.persistState();
  }

  public addOneTimeBeatOverride(
    officerId: string,
    storeId: string,
    dateAd: string,
    priority: 'HIGH' | 'MEDIUM' | 'ROUTINE' = 'HIGH',
    managerNote?: string
  ): BeatItem {
    const store = this.getUnifiedStoreById(storeId);
    if (!store?.coordinates) throw new Error('Pin the store location before assigning a beat stop.');
    const storeName = store ? store.name : storeId;
    const isBranch = store?.type === 'BRANCH';
    const newBeat: BeatItem = {
      id: this.generateId('beat_override'),
      officerId,
      dateAd,
      dateBs: getTodayBs(),
      sequence: this.beatItems.length + 1,
      entityType: isBranch ? 'BRANCH' : 'RETAILER',
      entityId: store ? store.id : storeId,
      storeName,
      storeType: store?.subType || 'Store',
      address: store?.address || 'Kathmandu',
      lat: store.coordinates.lat,
      lng: store.coordinates.lng,
      contactName: store?.primaryContactName || 'Manager',
      contactPhone: store?.primaryContactPhone || '+977-9800000000',
      contacts: store?.contacts || [],
      lastVisitDaysAgo: 0,
      pendingTasks: [],
      status: 'PENDING',
      priority,
      managerNotes: managerNote,
      oneTimeOverride: true,
    };
    this.beatItems.unshift(newBeat);
    this.persistState();
    return newBeat;
  }

  public createAndAssignBeatRoute(params: {
    officerId: string;
    dateAd: string;
    storeIds: string[];
    priority?: 'HIGH' | 'MEDIUM' | 'ROUTINE';
    managerNotes?: string;
  }): BeatItem[] {
    const { officerId, dateAd, storeIds, priority = 'HIGH', managerNotes } = params;
    if (storeIds.some(id => !this.getUnifiedStoreById(id)?.coordinates)) throw new Error('Every beat stop needs a pinned store location before assignment.');
    const newItems: BeatItem[] = [];
    const dateBs = getTodayBs();

    for (let i = 0; i < storeIds.length; i++) {
      const storeId = storeIds[i];
      const store = this.getUnifiedStoreById(storeId);
      const isBranch = store?.type === 'BRANCH';
      const item: BeatItem = {
        id: this.generateId(`beat_${i + 1}`),
        officerId,
        dateAd,
        dateBs,
        sequence: this.beatItems.length + i + 1,
        entityType: isBranch ? 'BRANCH' : 'RETAILER',
        entityId: store ? store.id : storeId,
        storeName: store ? store.name : storeId,
        storeType: store?.subType || 'Store',
        address: store?.address || 'Kathmandu Valley',
        lat: store!.coordinates!.lat,
        lng: store!.coordinates!.lng,
        contactName: store?.primaryContactName || 'Store Manager',
        contactPhone: store?.primaryContactPhone || '+977-9800000000',
        contacts: store?.contacts || [],
        lastVisitDaysAgo: 0,
        pendingTasks: [],
        status: 'PENDING',
        priority,
        managerNotes,
      };
      newItems.push(item);
      this.beatItems.unshift(item);
    }

    this.logActivity('BEAT_ROUTE_ASSIGNED', 'BEAT', officerId, {
      officerId,
      storeCount: storeIds.length,
      dateAd,
    });

    this.persistState();
    return newItems;
  }

  public reassignOfficerBeatsAndTasks(params: {
    fromOfficerId: string;
    toOfficerId: string;
    leaveStartDateAd: string;
    leaveEndDateAd: string;
    reason?: string;
  }): { reassignedBeatsCount: number; reassignedTasksCount: number } {
    const { fromOfficerId, toOfficerId, leaveStartDateAd, leaveEndDateAd, reason } = params;
    const fromOfficer = this.users.find((u) => u.id === fromOfficerId);
    const toOfficer = this.users.find((u) => u.id === toOfficerId);

    // 1. Mark officer on leave
    if (fromOfficer) {
      fromOfficer.dutyStatus = 'ON_LEAVE';
      if (!this.server && this.activeUserId) syncManager.enqueue('DUTY_STATUS', { officerId: fromOfficerId, status: 'ON_LEAVE' });
    }

    let reassignedBeatsCount = 0;
    let reassignedTasksCount = 0;

    // 2. Reassign pending beat items
    this.beatItems.forEach((b) => {
      if (b.officerId === fromOfficerId && b.status === 'PENDING') {
        b.officerId = toOfficerId;
        b.managerNotes = `${b.managerNotes ? b.managerNotes + ' • ' : ''}Covering for ${fromOfficer?.fullName || 'Relieved Staff'} (${reason || 'On Leave'})`;
        reassignedBeatsCount++;
      }
    });

    // 3. Reassign pending tasks
    this.tasks.forEach((t) => {
      if (t.assignedTo === fromOfficerId && t.status !== 'COMPLETED') {
        t.assignedTo = toOfficerId;
        t.assignedToName = toOfficer?.fullName || 'Covering Staff';
        t.description = `${t.description ? t.description + ' ' : ''}[Covering for ${fromOfficer?.fullName || 'Staff'}: ${reason || 'Leave'}]`;
        reassignedTasksCount++;
      }
    });

    this.logActivity('STAFF_LEAVE_REASSIGNED', 'USER', fromOfficerId, {
      fromOfficer: fromOfficer?.fullName,
      toOfficer: toOfficer?.fullName,
      leaveStartDateAd,
      leaveEndDateAd,
      reassignedBeatsCount,
      reassignedTasksCount,
    });

    this.persistState();
    return { reassignedBeatsCount, reassignedTasksCount };
  }

  public setOfficerLeave(
    officerId: string,
    startDateAd: string,
    endDateAd: string,
    coveringOfficerId?: string,
    storeIdsToReassign: string[] = []
  ): void {
    if (coveringOfficerId) {
      this.reassignOfficerBeatsAndTasks({
        fromOfficerId: officerId,
        toOfficerId: coveringOfficerId,
        leaveStartDateAd: startDateAd,
        leaveEndDateAd: endDateAd,
        reason: 'Officer Leave Coverage',
      });
      return;
    }

    const officer = this.users.find((u) => u.id === officerId);
    if (officer) {
      officer.dutyStatus = 'ON_LEAVE';
      if (!this.server && this.activeUserId) syncManager.enqueue('DUTY_STATUS', { officerId, status: 'ON_LEAVE' });
    }
    this.persistState();
  }

  // Beat Plan & GPS
  public getBeatItems(): BeatItem[] {
    return this.beatItems;
  }

  /** Every planned stop (any date) the current user may see, optionally for one officer. */
  public getBeatItemsFor(officerId?: string): BeatItem[] {
    const targetOfficer = officerId || this.currentUser.id;
    if (this.currentUser.is_super_admin || this.currentUser.isSuperAdmin || this.currentUser.permissions?.beat_plans?.scope === 'ALL' || this.currentUser.role === 'ADMIN' || this.currentUser.role === 'SUPER_ADMIN') {
      return this.beatItems.filter((b) => !officerId || b.officerId === officerId);
    }
    return this.beatItems.filter((b) => b.officerId === targetOfficer);
  }

  /** Today's planned stops (Nepal date). Past days stay in the history, not on today's list. */
  public getTodayBeat(officerId?: string): BeatItem[] {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
    return this.getBeatItemsFor(officerId).filter((b) => !b.dateAd || b.dateAd === today);
  }

  // Section 5: Silent GPS Check-In
  public checkInBeat(
    beatId: string,
    lat: number,
    lng: number,
    distanceMeters?: number,
    overrideFlag: boolean = false,
    overrideReason?: string,
    checkInPhotoUrl?: string
  ): Visit {
    const beat = this.beatItems.find((b) => b.id === beatId);
    if (!beat) throw new Error('Beat item not found');

    const now = new Date().toISOString();
    beat.status = 'VISITED';
    beat.checkedInAt = now;
    beat.checkInPhotoUrl = checkInPhotoUrl;

    // Silent distance calculation from store coordinates
    let dist = distanceMeters;
    if (dist === undefined && beat.lat && beat.lng) {
      dist = Math.round(this.calculateDistance(lat, lng, beat.lat, beat.lng));
    }
    beat.checkInDistanceM = dist || 0;

    const visit: Visit = {
      id: this.generateId('vis'),
      officerId: beat.officerId,
      officerName: this.currentUser.fullName,
      entityType: beat.entityType,
      entityId: beat.entityId,
      storeName: beat.storeName,
      checkInTime: now,
      lat,
      lng,
      distanceMeters: dist || 0,
      overrideFlag: overrideFlag || (dist !== undefined && dist > 150),
      overrideReason,
      dateAd: beat.dateAd,
      dateBs: beat.dateBs,
    };

    this.visits.unshift(visit);


    // Update real-time staff status
    this.updateStaffPing(beat.officerId, lat, lng, 'AT_STORE', beat.storeName);

    this.logActivity('CHECKED_IN_STORE', 'STORE', beat.entityId, {
      store: beat.storeName,
      distanceMeters: dist || 0,
      overrideFlag,
    });

    this.persistState();
    return visit;
  }

  // Section 5: Silent GPS Check-Out with Footprint Analysis
  public checkOutBeat(
    beatId: string,
    notes?: string,
    checkOutLat?: number,
    checkOutLng?: number
  ) {
    const beat = this.beatItems.find((b) => b.id === beatId);
    if (beat) {
      beat.checkedOutAt = new Date().toISOString();
      if (checkOutLat !== undefined && checkOutLng !== undefined) {
        beat.checkOutLat = checkOutLat;
        beat.checkOutLng = checkOutLng;
        if (beat.lat && beat.lng) {
          beat.checkOutDistanceM = Math.round(this.calculateDistance(checkOutLat, checkOutLng, beat.lat, beat.lng));
        }
      }

      const visit = this.visits.find(
        (v) => v.entityId === beat.entityId && v.officerId === beat.officerId
      );
      let durationMinutes = 1;
      if (visit) {
        visit.checkOutTime = beat.checkedOutAt;
        if (visit.checkInTime) {
          const diffMs =
            new Date(visit.checkOutTime).getTime() -
            new Date(visit.checkInTime).getTime();
          durationMinutes = Math.max(1, Math.round(diffMs / 60000));
          visit.durationMinutes = durationMinutes;
        }
        if (notes) visit.notes = notes;
      }

      // Footprint analysis: Active vs Idle Time
      const hasStockCount = this.stockCounts.some((s) => s.entityId === beat.entityId && s.officerId === beat.officerId);
      const hasPhotos = this.shelfPhotos.some((s) => s.entityId === beat.entityId && s.officerId === beat.officerId);
      const hasSecondaryOrder = this.secondaryOrders.some((s) => s.entityId === beat.entityId && s.officerId === beat.officerId);

      let activeMinutes = 0;
      if (hasStockCount) activeMinutes += 8;
      if (hasPhotos) activeMinutes += 5;
      if (hasSecondaryOrder) activeMinutes += 7;

      const idleTime = Math.max(0, durationMinutes - activeMinutes);
      beat.idleTimeMinutes = idleTime;

      // Auto-detect Suspicious Visit Flags (Admin only)
      const flags: string[] = [];
      if ((beat.checkInDistanceM || 0) > 500) {
        flags.push('FAR_CHECKIN');
      }
      if (durationMinutes < 5 && activeMinutes === 0) {
        flags.push('SHORT_VISIT');
      }
      if (durationMinutes > 15 && idleTime / durationMinutes > 0.5) {
        flags.push('HIGH_IDLE');
      }
      if (beat.checkOutLat && beat.lat && beat.lng) {
        const delta = this.calculateDistance(beat.lat, beat.lng, beat.checkOutLat, beat.checkOutLng || beat.lng);
        if (delta > 1000) {
          flags.push('REMOTE_CHECKIN');
        }
      }
      beat.suspiciousFlags = flags;

      this.updateStaffPing(beat.officerId, beat.lat, beat.lng, 'IN_TRANSIT');
      this.persistState();
    }
  }

  public getVisits(): Visit[] {
    if (this.visits.length > 0) return [...this.visits];
    return this.beatItems
      .filter((b) => b.status === 'VISITED')
      .map((b) => ({
        id: `VISIT-${b.id}`,
        officerId: b.officerId,
        officerName: this.currentUser?.fullName || 'Sales Officer',
        entityType: b.entityType,
        entityId: b.entityId,
        storeName: b.storeName,
        checkInTime: b.checkedInAt || new Date().toISOString(),
        checkOutTime: b.checkedOutAt,
        durationMinutes: 28,
        lat: b.lat,
        lng: b.lng,
        distanceMeters: 12,
        overrideFlag: false,
        dateAd: b.dateAd,
        dateBs: b.dateBs,
        notes: b.skipNotes || 'Routine check-in',
      }));
  }

  public skipBeatItem(beatId: string, reason: BeatItem['skipReason'], notes?: string) {
    const beat = this.beatItems.find((b) => b.id === beatId);
    if (beat) {
      beat.status = 'SKIPPED';
      beat.skipReason = reason;
      beat.skipNotes = notes;
      this.logActivity('SKIPPED_STORE', 'STORE', beat.entityId, {
        store: beat.storeName,
        reason,
      });

      this.persistState();
    }
  }

  // Real-Time Staff Tracking (PRD v2.2)
  public getStaffLiveLocations(): StaffLiveLocation[] {
    // Only genuine field sales officers should be tracked on the field force GPS radar
    const fieldStaffUsers = this.users.filter(
      (u) => u.active !== false && u.role === 'SALES_OFFICER'
    );
    const validOfficerIds = new Set(fieldStaffUsers.map((u) => u.id));
    // Purge any non-sales-officer entries from memory
    this.staffLiveLocations = (this.staffLiveLocations || []).filter((s) => validOfficerIds.has(s.officerId));

    // Return only active field officers who have recorded live locations
    return this.staffLiveLocations.map((loc) => {
      const u = fieldStaffUsers.find((user) => user.id === loc.officerId);
      return {
        ...loc,
        officerName: u ? u.fullName : loc.officerName,
        dutyStatus: u?.dutyStatus || loc.dutyStatus || 'ONLINE',
        isOnline: u?.dutyStatus !== 'OFFLINE',
      };
    });
  }

  public replaceStaffLiveLocations(locations: StaffLiveLocation[]): void {
    this.staffLiveLocations = JSON.parse(JSON.stringify(locations));
    this.persistState();
  }

  public updateStaffPing(
    officerId: string,
    lat: number,
    lng: number,
    status: StaffLiveLocation['status'],
    storeName?: string,
    batteryLevel?: number,
    pingTimestamp?: string
  ) {
    let staff = this.staffLiveLocations.find((s) => s.officerId === officerId);
    if (!staff) {
      const user = this.users.find((u) => u.id === officerId) || (this.currentUser.id === officerId ? this.currentUser : undefined);
      staff = {
        officerId,
        officerName: user?.fullName || 'Sales Officer',
        currentLat: lat,
        currentLng: lng,
        lastPingTimestamp: pingTimestamp || new Date().toISOString(),
        status,
        batteryLevel: batteryLevel ?? 100,
        isOnline: true,
        dutyStatus: user?.dutyStatus || 'ONLINE',
        todayDistanceKm: 0,
        todayRoute: [],
      };
      this.staffLiveLocations.push(staff);
    } else {
      if (staff.currentLat && staff.currentLng) {
        const deltaM = this.calculateDistance(staff.currentLat, staff.currentLng, lat, lng);
        staff.todayDistanceKm = Math.round((staff.todayDistanceKm + deltaM / 1000) * 10) / 10;
      }
      staff.currentLat = lat;
      staff.currentLng = lng;
      staff.lastPingTimestamp = pingTimestamp || new Date().toISOString();
      staff.status = status;
      if (batteryLevel !== undefined) {
        staff.batteryLevel = batteryLevel;
      }
    }

    if (storeName) {
      staff.currentStoreName = storeName;
      staff.timeAtCurrentStoreMinutes = 1;
      staff.todayRoute.push({
        storeName,
        arrivedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'IN_PROGRESS',
      });
    }

    // Ephemeral GPS pings update live state directly without clogging offline queue

    this.persistState();
  }

  // Multi-Photo Shelf Evidence (PRD v2.2)
  public getShelfPhotos(): ShelfPhoto[] {
    return this.shelfPhotos;
  }

  public recordShelfPhotos(photos: Omit<ShelfPhoto, 'id' | 'createdAt' | 'officerId' | 'officerName'>): ShelfPhoto {
    const item: ShelfPhoto = {
      ...photos,
      id: this.generateId('sp'),
      officerId: this.currentUser.id,
      officerName: this.currentUser.fullName,
      createdAt: new Date().toISOString(),
    };
    this.shelfPhotos.unshift(item);

    this.logActivity('UPLOADED_SHELF_PHOTOS', 'STORE', item.entityId, {
      store: item.storeName,
      beforeCount: item.beforePhotoUrls.length,
      afterCount: item.afterPhotoUrls.length,
    });
    this.persistState();
    return item;
  }

  public addShelfPhoto(payload: {
    storeId: string;
    storeName: string;
    officerId: string;
    officerName: string;
    rackSection?: string;
    beforePhotoUrls: string[];
    afterPhotoUrls: string[];
    dateAd: string;
    dateBs: string;
  }): ShelfPhoto {
    return this.recordShelfPhotos({
      entityType: 'RETAILER',
      entityId: payload.storeId,
      storeName: payload.storeName,
      beforePhotoUrls: payload.beforePhotoUrls,
      afterPhotoUrls: payload.afterPhotoUrls,
      rackSection: payload.rackSection,
      dateAd: payload.dateAd,
      dateBs: payload.dateBs,
    });
  }

  // Calls
  public getCalls(): CallLog[] {
    return this.callLogs;
  }

  public recordCall(call: Omit<CallLog, 'id' | 'createdAt' | 'officerId' | 'officerName'>): CallLog {
    const item: CallLog = {
      ...call,
      id: this.generateId('call'),
      officerId: this.currentUser.id,
      officerName: this.currentUser.fullName,
      createdAt: new Date().toISOString(),
    };
    this.callLogs.unshift(item);

    this.logActivity('LOGGED_CALL', 'STORE', item.entityId || '', {
      contact: item.contactName,
      outcome: item.outcome,
    });
    this.persistState();
    return item;
  }

  // Cheque Tracker (Two-Step Handover)
  public getCheques(): Cheque[] {
    return this.cheques;
  }

  public addCheque(cheque: Omit<Cheque, 'id' | 'createdAt' | 'officerId' | 'officerName' | 'history'>): Cheque {
    const now = new Date().toISOString();
    const newCheque: Cheque = {
      ...cheque,
      id: this.generateId('chq'),
      officerId: this.currentUser.id,
      officerName: this.currentUser.fullName,
      status: 'COLLECTED_IN_FIELD',
      history: [
        {
          id: this.generateId('chqh'),
          newStatus: 'COLLECTED_IN_FIELD',
          changedBy: this.currentUser.fullName,
          notes: 'Cheque collected in field',
          timestamp: now,
        },
      ],
      createdAt: now,
    };

    this.cheques.unshift(newCheque);

    this.logActivity('COLLECTED_CHEQUE', 'CHEQUE', newCheque.id, {
      chequeNumber: newCheque.chequeNumber,
      amount: newCheque.amount,
      store: newCheque.storeName,
    });
    this.persistState();
    return newCheque;
  }

  public updateChequeStatus(
    chequeId: string,
    newStatus: ChequeStatus,
    options?: {
      handedOverTo?: string;
      handedOverToId?: string;
      notes?: string;
      delayedReason?: string;
      newExpectedDate?: string;
    }
  ) {
    const cheque = this.cheques.find((c) => c.id === chequeId);
    if (!cheque) return;

    const oldStatus = cheque.status;
    const now = new Date().toISOString();
    cheque.status = newStatus;

    if (newStatus === 'HANDED_OVER_AT_OFFICE') {
      cheque.handedOverTo = options?.handedOverTo || 'Head Office Staff';
      cheque.handedOverToId = options?.handedOverToId;
      cheque.handoverTimestamp = now;
    }

    if (newStatus === 'DELAYED') {
      cheque.delayedReason = options?.delayedReason || 'Vendor request';
      cheque.newExpectedDate = options?.newExpectedDate;
    }

    cheque.history.unshift({
      id: this.generateId('chqh'),
      previousStatus: oldStatus,
      newStatus,
      changedBy: this.currentUser.fullName,
      notes: options?.notes || `Status transitioned to ${newStatus}`,
      timestamp: now,
    });

    this.logActivity('UPDATED_CHEQUE_STATUS', 'CHEQUE', cheque.id, {
      chequeNumber: cheque.chequeNumber,
      oldStatus,
      newStatus,
    });

    this.persistState();
  }

  // Documents
  public getDocuments(): HandoverDocument[] {
    return this.documents;
  }

  public addDocument(
    doc: Omit<HandoverDocument, 'id' | 'createdAt'> & {
      officerId?: string;
      officerName?: string;
    }
  ): HandoverDocument {
    const officerId = doc.officerId || this.currentUser.id;
    const officerName = doc.officerName || this.currentUser.fullName;
    const now = new Date();
    const formattedTime =
      now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ', ' +
      now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const newDoc: HandoverDocument = {
      ...doc,
      id: this.generateId('doc'),
      officerId,
      officerName,
      currentHolder: doc.currentHolder || `${officerName} (Field)`,
      timeline: doc.timeline && doc.timeline.length > 0 ? doc.timeline : [
        {
          id: this.generateId('ce'),
          action: 'COLLECTED',
          actorName: officerName,
          locationOrFolder: doc.storeName,
          timestamp: now.toISOString(),
          formattedTime,
          notes: doc.notes || 'Document collected in field',
        },
      ],
      createdAt: now.toISOString(),
    };
    this.documents.unshift(newDoc);

    this.logActivity('DOCUMENT_UPLOADED', 'DOCUMENT', newDoc.id, {
      store: newDoc.storeName,
      documentType: newDoc.documentType,
      referenceNumber: newDoc.referenceNumber,
    });
    this.persistState();
    return newDoc;
  }

  public updateDocumentStatus(
    id: string,
    newStatus: 'COLLECTED' | 'HANDED_OVER' | 'FILED' | 'MISSING',
    details?: {
      handedToUserName?: string;
      filedLocation?: string;
      notes?: string;
    }
  ): HandoverDocument | null {
    const doc = this.documents.find((d) => d.id === id);
    if (!doc) return null;

    doc.status = newStatus;
    if (!doc.timeline) doc.timeline = [];

    const now = new Date();
    const formattedTime =
      now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ', ' +
      now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (newStatus === 'HANDED_OVER') {
      const recipient = details?.handedToUserName?.trim() || this.currentUser.fullName;
      doc.handedToUserName = recipient;
      doc.handoverDate = now.toISOString().split('T')[0];
      doc.currentHolder = recipient;
      doc.timeline.push({
        id: this.generateId('ce'),
        action: 'HANDED_OVER',
        actorName: this.currentUser.fullName,
        recipientName: recipient,
        locationOrFolder: 'Brand Bucket Head Office',
        notes: details?.notes || `Handed over to ${recipient}`,
        timestamp: now.toISOString(),
        formattedTime,
      });
      this.logActivity('CHEQUE_STATUS_CHANGED', 'DOCUMENT', doc.id, {
        action: 'HANDED_OVER',
        recipient,
        store: doc.storeName,
      });
    } else if (newStatus === 'FILED') {
      const folder = details?.filedLocation || 'Accounts Cabinet B-12';
      doc.filedLocation = folder;
      doc.currentHolder = `Central Archive (${folder})`;
      doc.timeline.push({
        id: this.generateId('ce'),
        action: 'FILED',
        actorName: this.currentUser.fullName,
        locationOrFolder: folder,
        notes: details?.notes || `Permanently filed in ${folder}`,
        timestamp: now.toISOString(),
        formattedTime,
      });
      this.logActivity('SETTING_CHANGED', 'DOCUMENT', doc.id, {
        action: 'FILED',
        folder,
        store: doc.storeName,
      });
    } else if (newStatus === 'MISSING') {
      doc.currentHolder = 'MISSING / UNACCOUNTED';
      doc.timeline.push({
        id: this.generateId('ce'),
        action: 'MISSING',
        actorName: this.currentUser.fullName,
        locationOrFolder: 'Field Custody Discrepancy',
        notes: details?.notes || 'Flagged as MISSING during physical audit',
        timestamp: now.toISOString(),
        formattedTime,
      });
      this.logActivity('CHEQUE_BOUNCED', 'DOCUMENT', doc.id, {
        action: 'FLAGGED_MISSING',
        store: doc.storeName,
        flaggedBy: this.currentUser.fullName,
      });
      this.addNotification({
        userId: this.users.find(user => user.active !== false && user.isSuperAdmin)?.id || this.currentUser.id,
        title: 'CRITICAL: Document Flagged as MISSING',
        message: `${doc.documentType} (${doc.referenceNumber || doc.id}) from ${doc.storeName} was marked as MISSING by ${this.currentUser.fullName}. Immediate audit investigation required.`,
        priority: 'HIGH',
        read: false,
        entityType: 'DOCUMENT',
        entityId: doc.id,
      });
    }

    this.persistState();
    return doc;
  }

  // Dispatches
  public getDispatches(): Dispatch[] {
    return this.dispatches;
  }

  public addDispatch(dispatch: Omit<Dispatch, 'id' | 'createdAt' | 'createdBy'>): Dispatch {
    const newDispatch: Dispatch = {
      ...dispatch,
      id: this.generateId('disp'),
      createdBy: this.currentUser.fullName,
      createdAt: new Date().toISOString(),
      edits: [],
    };
    this.dispatches.unshift(newDispatch);

    this.persistState();
    return newDispatch;
  }

  public editDispatchItem(dispatchId: string, productId: string, newQty: number, reason: string) {
    const disp = this.dispatches.find((d) => d.id === dispatchId);
    if (!disp) return;
    const item = disp.items.find((i) => i.productId === productId);
    if (!item) return;

    const oldQty = item.quantity;
    item.quantity = newQty;

    if (!disp.edits) disp.edits = [];
    disp.edits.push({
      id: this.generateId('de'),
      dispatchId,
      productId,
      productName: item.productName,
      oldQty,
      newQty,
      changedBy: this.currentUser.fullName,
      reason,
      createdAt: new Date().toISOString(),
    });

    this.persistState();
  }

  // Stock counts
  public getStockCounts(): StockCount[] {
    return this.stockCounts;
  }

  public recordStockCount(count: Omit<StockCount, 'id' | 'createdAt' | 'officerId' | 'officerName'>): StockCount {
    const newCount: StockCount = {
      ...count,
      id: this.generateId('sc'),
      officerId: this.currentUser.id,
      officerName: this.currentUser.fullName,
      createdAt: new Date().toISOString(),
    };
    this.stockCounts.unshift(newCount);

    this.persistState();
    return newCount;
  }

  // Orders
  /**
   * Commercial orders only. Marketing sends live in their own collection; any
   * older order still carrying the marketing flag is excluded here, at the one
   * place every screen, report and export reads orders from.
   */
  public getOrders(brandCode?: BrandCode): Order[] {
    const user = this.getCurrentUser();
    let list = this.orders.some((o) => o.isMarketing) ? this.orders.filter((o) => !o.isMarketing) : this.orders;
    if (!user.is_super_admin && !user.isSuperAdmin && user.assignedBrands && user.assignedBrands.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((o) => user.assignedBrands!.includes(o.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      list = list.filter((o) => o.brandCode === brand);
    }
    if (!brandCode && this.getActiveSubBrandFilter()) list = list.filter((o) => o.items.some((item) => this.inActiveSubBrand(item.productId, item.subBrandId)));
    return list;
  }

  private findCustomer(phone: string): Customer | undefined {
    const digits = phoneDigits(phone);
    return digits ? this.customers.find((c) => phoneDigits(c.phone) === digits) : undefined;
  }

  /** The customer to update alongside another record, or undefined when this account may not change customers (so no save gets stuck). */
  private editableCustomer(phone: string): Customer | undefined {
    if (!this.server && !canPerform(this.currentUser, 'customers', 'EDIT') && !canWorkOrders(this.currentUser)) return undefined;
    return this.findCustomer(phone);
  }

  public getOrderById(id: string): Order | undefined {
    return this.orders.find((o) => o.id === id && !o.isMarketing);
  }

  public addOrder(order: Omit<Order, 'id' | 'createdAt' | 'orderNumber'> & { orderNumber?: string; id?: string }): Order {
    if ((order as Partial<Order>).isMarketing) throw new Error('Marketing sends are created from the influencer profile, not as orders.');
    assertActiveOrderOption(this.getOrderOptions(), 'channels', order.platform);
    assertActiveOrderOption(this.getOrderOptions(), 'deliveryMethods', order.deliveryMethod);
    const newOrder: Order = {
      ...order,
      // The server replaces this with the short ID (for example FOR-0421) when it saves the order.
      orderNumber: order.orderNumber?.trim() || pendingDocumentId(),
      id: order.id && /^ord_[A-Za-z0-9_-]{6,120}$/.test(order.id) && !this.orders.some((o) => o.id === order.id) ? order.id : this.generateId('ord'),
      createdAt: new Date().toISOString(),
    };
    delete newOrder.isMarketing; delete newOrder.influencerId; delete newOrder.influencerHandle; delete newOrder.contentReceived;

    this.orders.unshift(newOrder);

    // Update Customer 360 record
    const customer = this.findCustomer(newOrder.customerPhone);
    if (customer) {
      customer.totalOrders += 1;
      if (!customer.lastOrderDate || newOrder.orderDateAd > customer.lastOrderDate) customer.lastOrderDate = newOrder.orderDateAd;
      if (!customer.brandsPurchased.includes(newOrder.brandCode)) {
        customer.brandsPurchased.push(newOrder.brandCode);
      }
      // A replacement for an exchange is not a new purchase, so it earns no order karma.
      if (!newOrder.exchangeReturnId && !newOrder.exchangeRequested) {
        const { updatedCustomer } = applyKarmaEvent(customer, 'ORDER_PLACED', KARMA_RULES.ORDER_PLACED, 'Order placed');
        Object.assign(customer, updatedCustomer);
      }
    } else {
      const newCust: Customer = {
        id: this.generateId('cust'),
        phone: newOrder.customerPhone,
        name: newOrder.customerName,
        city: newOrder.district,
        province: newOrder.province,
        firstOrderDate: newOrder.orderDateAd,
        lastOrderDate: newOrder.orderDateAd,
        totalOrders: 1,
        totalDelivered: 0,
        totalReturns: 0,
        totalDeliveryFailures: 0,
        totalCancellations: 0,
        totalComplaints: 0,
        totalReviews: 0,
        karmaScore: 72,
        segment: 'NEW',
        activeFlags: [],
        brandsPurchased: [newOrder.brandCode],
      };
      this.customers.unshift(newCust);
    }

    this.logActivity('CREATED_ORDER', 'ORDER', newOrder.id, {
      amount: newOrder.totalAmount,
    });
    this.persistState();

    this.emitOrderRealtimeEvent({
      eventType: 'INSERT',
      new: newOrder,
    });

    return newOrder;
  }

  /**
   * Save a change to an order. The server rebuilds the trusted history (who,
   * when, field, old, new) and moves customer totals when the phone changes;
   * the entries added here only make the change visible before the next refresh.
   */
  public updateOrder(
    id: string,
    updates: Partial<Order>,
    _editorName?: string,
    reason?: string
  ): Order | null {
    const idx = this.orders.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    const existing = this.orders[idx];
    if (updates.platform !== undefined) assertActiveOrderOption(this.getOrderOptions(), 'channels', updates.platform, existing.platform);
    if (updates.deliveryMethod !== undefined) assertActiveOrderOption(this.getOrderOptions(), 'deliveryMethods', updates.deliveryMethod, existing.deliveryMethod);
    const clean = { ...updates };
    delete (clean as any).orderNumber; delete (clean as any).legacyOrderNumber; delete (clean as any).editHistory; delete (clean as any).id; delete (clean as any).createdAt; delete clean.isMarketing;
    const next: Order = { ...existing, ...clean };
    if (JSON.stringify(next) === JSON.stringify(existing)) return existing;
    const entries = historyEntries(existing, next, { id: this.currentUser.id, name: this.currentUser.fullName }, { reason: reason?.trim() || undefined });
    next.editHistory = [...entries, ...(existing.editHistory || [])];
    // Only the fields this person actually changed. If someone else saved first, the server
    // applies just these on top of their version, so nothing they changed elsewhere is lost.
    const fields = Object.keys(clean).filter((key) => JSON.stringify((clean as any)[key]) !== JSON.stringify((existing as any)[key]));
    (next as any)._edit = { token: globalThis.crypto.randomUUID(), fields, ...(reason?.trim() ? { reason: reason.trim() } : {}) };

    this.orders[idx] = next;
    this.persistState();

    this.emitOrderRealtimeEvent({
      eventType: 'UPDATE',
      new: this.orders[idx],
    });

    return this.orders[idx];
  }

  /**
   * Move an order along: Pending -> Dispatched -> Delivered, or Cancelled. Keeps the order's history,
   * the customer's delivered/cancelled counts and karma in step, and closes an open delivery failure
   * when the parcel finally arrives. Undoing a status (a wrong click) reverses its customer effects.
   * Failed, Returned and Exchanged are set by their own forms, not here.
   */
  public setOrderStatus(id: string, status: ManualOrderStatus, options: { dateAd?: string; reason?: string; fromFailureId?: string } = {}): Order | null {
    if (!canWorkOrders(this.currentUser)) throw new Error('You do not have permission to change order status.');
    if (!MANUAL_ORDER_STATUSES.includes(status)) throw new Error('Choose Pending, Dispatched, Delivered or Cancelled.');
    const order = this.getOrderById(id);
    if (!order) return null;
    if (order.status === status) return order;
    if (status === 'CANCELLED' && !options.reason?.trim()) throw new Error('Give a short reason for cancelling.');
    const previous = order.status;
    const dateAd = options.dateAd || getTodayAd();
    const updates: Partial<Order> = { status };
    if (status === 'DISPATCHED') updates.dispatchedDateAd = order.dispatchedDateAd || dateAd;
    if (status === 'DELIVERED') { updates.deliveredDateAd = dateAd; if (!order.dispatchedDateAd) updates.dispatchedDateAd = dateAd; }
    if (status === 'CANCELLED') updates.cancelledDateAd = dateAd;
    const updated = this.updateOrder(id, updates, undefined, options.reason || (previous === 'DELIVERED' || previous === 'CANCELLED' ? `Status corrected from ${previous.toLowerCase()}` : undefined));
    if (!updated) return null;

    const customer = this.editableCustomer(order.customerPhone);
    if (customer) {
      const ref = `Order #${order.orderNumber}`;
      let next = customer;
      if (status === 'DELIVERED') {
        next = { ...next, totalDelivered: (next.totalDelivered || 0) + 1 };
        next = applyKarmaEvent(next, 'ORDER_DELIVERED', KARMA_RULES.ORDER_DELIVERED, `Delivered: ${ref}`).updatedCustomer;
      } else if (previous === 'DELIVERED') {
        next = { ...next, totalDelivered: Math.max(0, (next.totalDelivered || 0) - 1) };
        next = applyKarmaEvent(next, 'CORRECTION', -KARMA_RULES.ORDER_DELIVERED, `Delivery undone: ${ref}`).updatedCustomer;
      }
      if (status === 'CANCELLED') {
        next = { ...next, totalCancellations: (next.totalCancellations || 0) + 1 };
        next = applyKarmaEvent(next, 'ORDER_CANCELLATION', KARMA_RULES.ORDER_CANCELLATION, `Cancelled: ${ref} (${options.reason!.trim()})`).updatedCustomer;
      } else if (previous === 'CANCELLED') {
        next = { ...next, totalCancellations: Math.max(0, (next.totalCancellations || 0) - 1) };
        next = applyKarmaEvent(next, 'CORRECTION', -KARMA_RULES.ORDER_CANCELLATION, `Cancellation undone: ${ref}`).updatedCustomer;
      }
      if (next !== customer) Object.assign(customer, next);
    }

    // The parcel arrived after a failed attempt: the open failure is resolved with it.
    if (status === 'DELIVERED') {
      for (const failure of this.deliveryFailures) {
        if (failure.orderId !== id || failure.id === options.fromFailureId) continue;
        if (['FAILED', 'REATTEMPT_SCHEDULED', undefined].includes(failure.status as any)) failure.status = 'DELIVERED';
      }
    }
    this.logActivity('SETTING_CHANGED', 'ORDER', id, { action: `ORDER_${status}`, orderNumber: order.orderNumber, previous });
    this.persistState();
    return updated;
  }

  public deleteOrder(id: string): boolean {
    const prevLen = this.orders.length;
    this.orders = this.orders.filter((o) => o.id !== id);
    if (this.orders.length !== prevLen) {
      this.persistState();
      this.emitOrderRealtimeEvent({
        eventType: 'DELETE',
        old: { id },
      });
      return true;
    }
    return false;
  }

  public subscribeToOrders(callback: (event: OrderRealtimeEvent) => void): () => void {
    this.orderSubscribers.add(callback);
    return () => {
      this.orderSubscribers.delete(callback);
    };
  }

  private emitOrderRealtimeEvent(event: OrderRealtimeEvent) {
    this.orderSubscribers.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error('Order subscriber error:', err);
      }
    });
    if (!this.server && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('BB_ORDER_REALTIME', { detail: event }));
    }
  }

  public getLastCatalogUpdate() {
    const activeProds = this.products.filter((p) => p.active !== false);
    const activeCombos = this.combos.filter((c) => c.active !== false && c.isActive !== false);
    const activeBrands = this.getBrands('ACTIVE');
    return {
      activeProductsCount: activeProds.length,
      activeCombosCount: activeCombos.length,
      activeBrandsCount: activeBrands.length,
      lastUpdatedText: 'Live & Synced',
      newProductsCount: 0,
      newCombosCount: 0,
    };
  }

  // Delivery Failures
  public getDeliveryFailures(brandCode?: BrandCode): DeliveryFailure[] {
    const user = this.getCurrentUser();
    let list = this.deliveryFailures;
    if (!user.is_super_admin && !user.isSuperAdmin && user.assignedBrands && user.assignedBrands.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((df) => user.assignedBrands!.includes(df.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      list = list.filter((df) => df.brandCode === brand);
    }
    if (!brandCode && this.getActiveSubBrandFilter()) list = list.filter((df) => (() => { const order = this.orders.find((o) => o.id === df.orderId); return !order || order.items.some((item) => this.inActiveSubBrand(item.productId, item.subBrandId)); })());
    return list;
  }

  /** Reasons staff can pick when a delivery fails. The built-in list is used until an admin saves their own. */
  // ------------------------------------------------------------------ Sales and offers (online campaigns)
  public getCampaigns(): SaleCampaign[] {
    return [...this.campaigns].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  }
  public getCampaign(id: string): SaleCampaign | undefined { return this.campaigns.find((entry) => entry.id === id); }

  /** Create or update a sale. Checked with the same rules the server uses. */
  public saveCampaign(input: Partial<SaleCampaign>): SaleCampaign {
    if (!canManageSales(this.currentUser)) throw new Error('Managing sales and offers needs Settings or Marketing edit access.');
    const existing = input.id ? this.campaigns.find((entry) => entry.id === input.id) : undefined;
    const clean = validateCampaign({ ...input, offers: (input.offers || []).map((offer) => ({ ...offer, id: offer.id || this.generateId('offer') })) });
    const now = new Date().toISOString();
    const saved: SaleCampaign = { ...clean, id: existing?.id || this.generateId('campaign'), createdAt: existing?.createdAt || now, createdBy: existing?.createdBy || this.currentUser.fullName, updatedAt: now };
    if (existing) Object.assign(existing, saved); else this.campaigns.push(saved);
    this.persistState();
    return saved;
  }

  /** Schedule, pause, resume or end a sale. Ending keeps it for reports; orders already priced keep their prices. */
  public setCampaignStatus(id: string, status: SaleCampaign['status']): SaleCampaign {
    const campaign = this.campaigns.find((entry) => entry.id === id);
    if (!campaign) throw new Error('This sale no longer exists.');
    return this.saveCampaign({ ...campaign, status, ...(status === 'ENDED' ? { endedAt: new Date().toISOString() } : {}) });
  }

  /** A copy as a new draft (or template): fresh offer IDs, so limits and reports start again. */
  public duplicateCampaign(id: string, options: { asTemplate?: boolean; name?: string; startsAt?: string; endsAt?: string } = {}): SaleCampaign {
    const source = this.campaigns.find((entry) => entry.id === id);
    if (!source) throw new Error('This sale no longer exists.');
    const { id: _id, createdAt: _c, createdBy: _b, updatedAt: _u, endedAt: _e, ...rest } = source;
    return this.saveCampaign({ ...rest, name: options.name || `${source.name} (copy)`, status: 'DRAFT', isTemplate: !!options.asTemplate,
      startsAt: options.startsAt || source.startsAt, endsAt: options.endsAt || source.endsAt, offers: source.offers.map((offer) => ({ ...offer, id: '' })) });
  }

  /** Drafts and templates can be deleted. A sale that priced orders is ended instead, so its reports stay. */
  public deleteCampaign(id: string): void {
    if (!canManageSales(this.currentUser)) throw new Error('Managing sales and offers needs Settings or Marketing edit access.');
    const used = this.orders.some((order) => order.campaignIds?.includes(id) || order.appliedOffers?.some((entry) => entry.campaignId === id));
    if (used) throw new Error('Orders were priced with this sale. End it instead so its results stay in the reports.');
    this.campaigns = this.campaigns.filter((entry) => entry.id !== id);
    this.persistState();
  }

  public getFailureReasons(includeArchived = false): FailureReason[] {
    const saved = this.failureReasons;
    const merged: FailureReason[] = [...saved];
    for (const name of DEFAULT_FAILURE_REASONS) {
      if (!saved.some((row) => sameName(row.name, name) || row.id === lookupId('reason', name))) merged.push({ id: lookupId('reason', name), name, isArchived: false, createdAt: '' });
    }
    return includeArchived ? merged : merged.filter((row) => !row.isArchived);
  }

  public addFailureReason(name: string): FailureReason {
    return this.addLookup('failureReasons', 'reason', name, this.getFailureReasons(true)) as FailureReason;
  }

  public getOpenDeliveryFailure(orderId: string): DeliveryFailure | undefined {
    return this.deliveryFailures.find((df) => df.orderId === orderId && (!df.status || df.status === 'FAILED' || df.status === 'REATTEMPT_SCHEDULED'));
  }

  public addDeliveryFailure(failure: Omit<DeliveryFailure, 'id' | 'createdAt'>): DeliveryFailure {
    if (failure.deliveryMethod) assertActiveOrderOption(this.getOrderOptions(), 'deliveryMethods', failure.deliveryMethod);
    if (isOtherReason(failure.reason) && !failure.reasonDetail?.trim()) throw new Error('Write the reason when Other is chosen.');
    const now = new Date().toISOString();
    const attempt: DeliveryAttempt = { attempt: failure.attempts || 1, dateAd: failure.dateAd, dateBs: failure.dateBs, reason: failure.reason,
      ...(failure.reasonDetail?.trim() ? { reasonDetail: failure.reasonDetail.trim() } : {}),
      ...(failure.remarks ? { remarks: failure.remarks } : {}), loggedBy: this.currentUser.fullName, loggedAt: now };
    const newDf: DeliveryFailure = {
      ...failure,
      attempts: failure.attempts || 1,
      status: failure.status || 'FAILED',
      attemptLog: [attempt],
      id: this.generateId('df'),
      createdAt: now,
    };
    this.deliveryFailures.unshift(newDf);

    // The order itself shows as Failed. This is a delivery failure, not a return.
    const order = this.orders.find((o) => o.id === newDf.orderId);
    if (order && order.status !== 'DELIVERED' && canWorkOrders(this.currentUser)) order.status = 'FAILED';

    const customer = this.editableCustomer(newDf.customerPhone);
    if (customer) {
      customer.totalDeliveryFailures += 1;
      const { updatedCustomer } = applyKarmaEvent(
        customer,
        'DELIVERY_FAILURE',
        KARMA_RULES.DELIVERY_FAILURE,
        `Delivery failure: ${failureReasonLabel(newDf)} (Order #${newDf.orderNumber})`
      );
      Object.assign(customer, updatedCustomer);
    }

    this.persistState();
    return newDf;
  }

  /** A further failed attempt on an order that already has an open failure. Never a duplicate record. */
  public addDeliveryAttempt(failureId: string, attempt: { dateAd: string; dateBs: string; reason: string; reasonDetail?: string; remarks?: string; reattemptDateAd?: string; reattemptDateBs?: string }): DeliveryFailure | null {
    const failure = this.deliveryFailures.find((df) => df.id === failureId);
    if (!failure) return null;
    if (isOtherReason(attempt.reason) && !attempt.reasonDetail?.trim()) throw new Error('Write the reason when Other is chosen.');
    const detail = attempt.reasonDetail?.trim() || '';
    const number = (failure.attempts || failure.attemptLog?.length || 1) + 1;
    const log: DeliveryAttempt[] = failure.attemptLog?.length ? [...failure.attemptLog]
      : [{ attempt: 1, dateAd: failure.dateAd, dateBs: failure.dateBs, reason: failure.reason, ...(failure.reasonDetail ? { reasonDetail: failure.reasonDetail } : {}), ...(failure.remarks ? { remarks: failure.remarks } : {}), loggedBy: '', loggedAt: failure.createdAt }];
    log.push({ attempt: number, dateAd: attempt.dateAd, dateBs: attempt.dateBs, reason: attempt.reason, ...(detail ? { reasonDetail: detail } : {}), ...(attempt.remarks ? { remarks: attempt.remarks } : {}), loggedBy: this.currentUser.fullName, loggedAt: new Date().toISOString() });
    // The failure shows its latest reason; an earlier "Other" explanation does not carry over to a different reason.
    if (detail) failure.reasonDetail = detail; else delete failure.reasonDetail;
    Object.assign(failure, { attempts: number, attemptLog: log, reason: attempt.reason, dateAd: attempt.dateAd, dateBs: attempt.dateBs,
      status: attempt.reattemptDateAd ? 'REATTEMPT_SCHEDULED' : 'FAILED',
      ...(attempt.remarks ? { remarks: attempt.remarks } : {}),
      ...(attempt.reattemptDateAd ? { reattemptDateAd: attempt.reattemptDateAd, reattemptDateBs: attempt.reattemptDateBs } : {}) });
    const order = this.orders.find((o) => o.id === failure.orderId);
    if (order && order.status !== 'DELIVERED' && canWorkOrders(this.currentUser)) order.status = 'FAILED';
    const customer = this.editableCustomer(failure.customerPhone);
    if (customer) {
      customer.totalDeliveryFailures += 1;
      Object.assign(customer, applyKarmaEvent(customer, 'DELIVERY_FAILURE', KARMA_RULES.DELIVERY_FAILURE, `Delivery attempt ${number} failed: ${failureReasonLabel({ reason: attempt.reason, reasonDetail: detail })} (Order #${failure.orderNumber})`).updatedCustomer);
    }
    this.persistState();
    return failure;
  }

  public updateDeliveryFailure(
    id: string,
    updates: Partial<DeliveryFailure>
  ): DeliveryFailure | null {
    const failure = this.deliveryFailures.find((df) => df.id === id);
    if (!failure) return null;

    Object.assign(failure, updates);

    if (updates.status === 'DELIVERED') {
      this.logActivity('TASK_COMPLETED', 'ORDER', failure.orderId, {
        action: 'DELIVERY_REATTEMPT_SUCCEEDED',
        orderNumber: failure.orderNumber,
        customer: failure.customerName,
      });
      // The order becomes Delivered too; that also updates the customer's count and karma once.
      const order = this.getOrderById(failure.orderId);
      if (order && order.status !== 'DELIVERED' && canWorkOrders(this.currentUser)) {
        this.setOrderStatus(order.id, 'DELIVERED', { dateAd: updates.dateAd, fromFailureId: failure.id });
      }
    } else if (updates.status === 'REATTEMPT_SCHEDULED') {
      this.logActivity('TASK_CREATED', 'ORDER', failure.orderId, {
        action: 'REATTEMPT_SCHEDULED',
        orderNumber: failure.orderNumber,
        date: updates.reattemptDateAd,
        assignedTo: updates.assignedTo,
      });
    } else if (updates.status === 'RETURNED_TO_WAREHOUSE') {
      this.logActivity('SETTING_CHANGED', 'ORDER', failure.orderId, {
        action: 'RETURNED_TO_WAREHOUSE_RTO',
        orderNumber: failure.orderNumber,
      });
    } else if (updates.status === 'CANCELLED') {
      this.logActivity('SETTING_CHANGED', 'ORDER', failure.orderId, {
        action: 'DELIVERY_CANCELLED_BY_CUSTOMER',
        orderNumber: failure.orderNumber,
      });
      // The order itself is cancelled too, so it leaves the open-orders list and the customer's record shows it.
      const order = this.getOrderById(failure.orderId);
      if (order && order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && canWorkOrders(this.currentUser)) {
        this.setOrderStatus(order.id, 'CANCELLED', { reason: 'Cancelled after a failed delivery' });
      }
    }

    this.persistState();
    return failure;
  }

  // Returns
  public getReturns(brandCode?: BrandCode): ReturnEntry[] {
    const user = this.getCurrentUser();
    let list = this.returns;
    if (!user.is_super_admin && !user.isSuperAdmin && user.assignedBrands && user.assignedBrands.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((r) => user.assignedBrands!.includes(r.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      list = list.filter((r) => r.brandCode === brand);
    }
    if (!brandCode && this.getActiveSubBrandFilter()) list = list.filter((r) => this.inActiveSubBrand(r.productId));
    return list;
  }

  public addReturn(ret: Omit<ReturnEntry, 'id' | 'createdAt'>): ReturnEntry {
    const newRet: ReturnEntry = {
      ...ret,
      id: this.generateId('ret_item'),
      createdAt: new Date().toISOString(),
    };
    this.returns.unshift(newRet);

    for (const catName of newRet.issueCategories) {
      const found = this.reviewCategories.find((c) => c.name === catName);
      if (found) found.tickCount += 1;
    }

    const customer = this.editableCustomer(newRet.customerPhone);
    if (customer) {
      // Three or more returns inside 30 days flags the profile, from saved returns only.
      const digits = phoneDigits(newRet.customerPhone);
      const recent = this.returns.filter((r) => phoneDigits(r.customerPhone) === digits && Date.parse(r.dateAd) >= Date.now() - 30 * 86400000).length;
      if (recent >= 3 && !(customer.activeFlags || []).includes('Serial Returner')) customer.activeFlags = [...(customer.activeFlags || []), 'Serial Returner'];
      customer.totalReturns += 1;
      const { updatedCustomer } = applyKarmaEvent(
        customer,
        'ACTUAL_RETURN',
        KARMA_RULES.ACTUAL_RETURN,
        `Return: ${newRet.reasonCategory} (${newRet.productName})`
      );
      Object.assign(customer, updatedCustomer);
    }

    this.persistState();
    return newRet;
  }

  public updateReturnResolution(
    returnId: string,
    resolution: ReturnEntry['orderStatus']
  ): ReturnEntry | null {
    const ret = this.returns.find((r) => r.id === returnId);
    if (!ret) return null;
    if (ret.orderStatus === resolution) return ret;

    ret.orderStatus = resolution;
    ret.resolvedDateAd = getTodayAd();
    // No longer an exchange: the replacement order stays (it may already be on its way) but is unlinked.
    if (resolution !== 'Exchanged' && ret.exchangeOrderId) this.unlinkExchange(ret);

    this.persistState();
    return ret;
  }

  private unlinkExchange(ret: ReturnEntry) {
    const order = this.orders.find((entry) => entry.id === ret.exchangeOrderId);
    if (order && order.exchangeReturnId === ret.id) this.updateOrder(order.id, { exchangeReturnId: undefined, exchangeOfOrderId: undefined }, undefined, 'Exchange unlinked from return');
    delete ret.exchangeOrderId; delete ret.exchangeOrderNumber;
  }

  private canWorkReturns(action: 'CREATE' | 'EDIT' = 'EDIT') {
    return canPerform(this.currentUser, 'reviews', action) || canPerform(this.currentUser, 'order_desk', action);
  }

  /** Link a return resolved as Exchanged to the replacement order that was already created. */
  public linkExchangeOrder(returnId: string, orderId: string): ReturnEntry {
    if (!this.canWorkReturns()) throw new Error('You do not have permission to update returns.');
    const ret = this.returns.find((entry) => entry.id === returnId);
    if (!ret) throw new Error('This return no longer exists.');
    const order = this.getOrderById(orderId);
    if (!order) throw new Error('Choose an order that still exists.');
    if (order.id === ret.orderId) throw new Error('Choose the replacement order, not the order that was returned.');
    if (phoneDigits(order.customerPhone) !== phoneDigits(ret.customerPhone)) throw new Error('The replacement order must be for the same customer.');
    const other = this.returns.find((entry) => entry.id !== ret.id && entry.exchangeOrderId === order.id);
    if (other) throw new Error(`This order is already the exchange for another return (${other.productName}).`);
    if (ret.exchangeOrderId && ret.exchangeOrderId !== order.id) this.unlinkExchange(ret);
    Object.assign(ret, { orderStatus: 'Exchanged' as const, exchangeOrderId: order.id, exchangeOrderNumber: order.orderNumber, resolvedDateAd: ret.resolvedDateAd || getTodayAd() });
    if (canWorkOrders(this.currentUser) && order.exchangeReturnId !== ret.id) this.updateOrder(order.id, { exchangeReturnId: ret.id, exchangeOfOrderId: ret.orderId }, undefined, 'Linked as exchange');
    this.persistState();
    return ret;
  }

  /**
   * Create the replacement order for an exchange, pre-filled from the original order: same customer,
   * address, brand and channel. It is priced at the difference to collect (often NPR 0), so it never
   * inflates sales, and it is linked to the return both ways.
   */
  public createExchangeOrder(returnId: string, input: { items: { productId: string; productName: string; brandCode: string; quantity: number }[]; amountToCollect: number; deliveryMethod?: string; notes?: string }): Order {
    if (!this.canWorkReturns() || !canWorkOrders(this.currentUser, 'CREATE')) throw new Error('You do not have permission to create a replacement order.');
    const ret = this.returns.find((entry) => entry.id === returnId);
    if (!ret) throw new Error('This return no longer exists.');
    if (ret.exchangeOrderId && this.getOrderById(ret.exchangeOrderId)) throw new Error('This return already has a replacement order.');
    const original = ret.orderId ? this.getOrderById(ret.orderId) : undefined;
    if (!original) throw new Error('The original order could not be found, so the replacement cannot be pre-filled. Link an existing order instead.');
    if (!input.items.length || input.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) throw new Error('Add at least one product to send.');
    const amount = Math.max(0, Math.round((Number(input.amountToCollect) || 0) * 100) / 100);
    const units = input.items.reduce((sum, item) => sum + item.quantity, 0);
    const today = getTodayAd();
    const order = this.addOrder({
      brandCode: original.brandCode, orderDateAd: today, orderDateBs: getTodayBs(), platform: original.platform,
      customerName: original.customerName, customerPhone: original.customerPhone, ...(original.alternatePhone ? { alternatePhone: original.alternatePhone } : {}),
      province: original.province, district: original.district, address: original.address,
      deliveryMethod: (input.deliveryMethod || original.deliveryMethod) as Order['deliveryMethod'],
      paymentTerms: amount > 0 ? 'COD' : 'Prepaid', orderType: 'REPEAT',
      // The amount to collect is spread over the lines so line totals add up to the order total.
      items: (() => {
        let left = amount;
        return input.items.map((item, index) => {
          const total = index === input.items.length - 1 ? Math.round(left * 100) / 100 : Math.round((amount * item.quantity / units) * 100) / 100;
          left -= total;
          return { productId: item.productId, productName: item.productName, brandCode: item.brandCode, quantity: item.quantity, unitPrice: Math.round((total / item.quantity) * 100) / 100, totalPrice: total };
        });
      })(),
      totalAmount: amount, status: 'PENDING', source: 'MANUAL', assignedToId: this.currentUser.id,
      exchangeReturnId: ret.id, exchangeOfOrderId: original.id,
      notes: [`Exchange for ${original.orderNumber}: ${ret.quantity}× ${ret.productName} returned (${ret.reasonCategory}).`, input.notes?.trim()].filter(Boolean).join(' '),
    });
    Object.assign(ret, { orderStatus: 'Exchanged' as const, exchangeOrderId: order.id, exchangeOrderNumber: order.orderNumber, resolvedDateAd: ret.resolvedDateAd || today });
    this.persistState();
    return order;
  }

  // Dynamic Checkbox Categories
  public getReviewCategories(includeArchived: boolean = false): ReviewCategory[] {
    if (includeArchived) return [...this.reviewCategories];
    return this.reviewCategories.filter((c) => !c.isArchived);
  }

  public addReviewCategory(name: string, createdBy: string = 'Devansh Agarwal (Admin)'): ReviewCategory {
    const trimmed = name.trim();
    const existing = this.reviewCategories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      if (existing.isArchived) {
        existing.isArchived = false;
        this.persistState();
      }
      return existing;
    }

    const newCat: ReviewCategory = {
      id: this.generateId('cat'),
      name: trimmed,
      tickCount: 1,
      isArchived: false,
      createdBy,
      createdAt: 'Bhadra 15, 2083',
      lastUsedDate: 'Bhadra 24, 2083',
    };
    this.reviewCategories.push(newCat);
    this.persistState();
    return newCat;
  }

  public renameReviewCategory(id: string, newName: string) {
    const cat = this.reviewCategories.find((c) => c.id === id);
    if (cat) {
      const oldName = cat.name;
      cat.name = newName.trim();

      // Re-tag historical feedback entries
      this.feedbackEntries.forEach((f) => {
        if (f.issueCategories && f.issueCategories.includes(oldName)) {
          f.issueCategories = f.issueCategories.map((c) => (c === oldName ? cat.name : c));
        }
      });

      // Re-tag historical returns entries
      this.returns.forEach((r) => {
        if (r.issueCategories && r.issueCategories.includes(oldName)) {
          r.issueCategories = r.issueCategories.map((c) => (c === oldName ? cat.name : c));
        }
      });

      this.persistState();
    }
  }

  public mergeReviewCategories(sourceId: string, targetId: string) {
    const source = this.reviewCategories.find((c) => c.id === sourceId);
    const target = this.reviewCategories.find((c) => c.id === targetId);
    if (source && target) {
      target.tickCount += source.tickCount;
      source.isArchived = true;
      source.mergedIntoId = target.id;

      // Re-tag historical feedback entries
      this.feedbackEntries.forEach((f) => {
        if (f.issueCategories && f.issueCategories.includes(source.name)) {
          f.issueCategories = f.issueCategories.map((c) => (c === source.name ? target.name : c));
        }
      });

      // Re-tag historical returns entries
      this.returns.forEach((r) => {
        if (r.issueCategories && r.issueCategories.includes(source.name)) {
          r.issueCategories = r.issueCategories.map((c) => (c === source.name ? target.name : c));
        }
      });

      this.persistState();
    }
  }

  public mergeMultipleReviewCategories(sourceIds: string[], survivingId: string) {
    const target = this.reviewCategories.find((c) => c.id === survivingId);
    if (!target) return;

    for (const sId of sourceIds) {
      if (sId === survivingId) continue;
      const source = this.reviewCategories.find((c) => c.id === sId);
      if (source) {
        target.tickCount += source.tickCount;
        source.isArchived = true;
        source.mergedIntoId = target.id;

        // Re-tag historical feedback
        this.feedbackEntries.forEach((f) => {
          if (f.issueCategories && f.issueCategories.includes(source.name)) {
            f.issueCategories = f.issueCategories.map((c) => (c === source.name ? target.name : c));
          }
        });

        // Re-tag historical returns
        this.returns.forEach((r) => {
          if (r.issueCategories && r.issueCategories.includes(source.name)) {
            r.issueCategories = r.issueCategories.map((c) => (c === source.name ? target.name : c));
          }
        });
      }
    }
    this.persistState();
  }

  public archiveReviewCategory(id: string) {
    const cat = this.reviewCategories.find((c) => c.id === id);
    if (cat) {
      cat.isArchived = true;
      this.persistState();
    }
  }

  public unarchiveReviewCategory(id: string) {
    const cat = this.reviewCategories.find((c) => c.id === id);
    if (cat) {
      cat.isArchived = false;
      this.persistState();
    }
  }

  // Feedback & Complaints
  public getFeedback(brandCode?: BrandCode): FeedbackEntry[] {
    const user = this.getCurrentUser();
    let list = this.feedbackEntries;
    if (!user.is_super_admin && !user.isSuperAdmin && user.assignedBrands && user.assignedBrands.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((f) => user.assignedBrands!.includes(f.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      list = list.filter((f) => f.brandCode === brand);
    }
    if (!brandCode && this.getActiveSubBrandFilter()) list = list.filter((f) => this.inActiveSubBrand(f.productId));
    return list;
  }

  public getFeedbackEntries(brandCode?: BrandCode): FeedbackEntry[] {
    return this.getFeedback(brandCode);
  }

  public addFeedback(fb: Omit<FeedbackEntry, 'id' | 'createdAt' | 'history'>): FeedbackEntry {
    const now = new Date().toISOString();
    const newFb: FeedbackEntry = {
      ...fb,
      id: this.generateId('fb'),
      history: fb.type === 'COMPLAINT' ? [
        {
          id: this.generateId('fsh'),
          newStatus: 'OPEN',
          changedBy: this.currentUser.fullName,
          notes: 'Complaint registered',
          timestamp: now,
        },
      ] : [],
      createdAt: now,
    };

    this.feedbackEntries.unshift(newFb);


    for (const catName of newFb.issueCategories) {
      const found = this.reviewCategories.find((c) => c.name === catName);
      if (found) found.tickCount += 1;
    }

    const customer = newFb.customerPhone ? this.editableCustomer(newFb.customerPhone) : undefined;
    if (customer) {
      if (newFb.type === 'REVIEW') {
        customer.totalReviews += 1;
        const pts = newFb.sentiment === 'POSITIVE'
          ? KARMA_RULES.REVIEW_GIVEN + KARMA_RULES.POSITIVE_REVIEW_BONUS
          : KARMA_RULES.REVIEW_GIVEN;
        const { updatedCustomer } = applyKarmaEvent(customer, 'REVIEW_GIVEN', pts, 'Customer review');
        Object.assign(customer, updatedCustomer);
      } else if (newFb.type === 'COMPLAINT') {
        customer.totalComplaints += 1;
        const { updatedCustomer } = applyKarmaEvent(customer, 'COMPLAINT_FILED', KARMA_RULES.COMPLAINT_FILED, 'Customer complaint');
        Object.assign(customer, updatedCustomer);
      }
    }

    this.persistState();
    return newFb;
  }

  /** Entries saved with only a name or handle, waiting for staff to attach a customer. */
  public getUnlinkedFeedback(): FeedbackEntry[] {
    return this.getFeedback('ALL').filter((entry) => entry.customerLink === 'UNLINKED');
  }

  /** Attach a customer to an entry from the Needs linking queue. */
  public linkFeedbackCustomer(feedbackId: string, customer: { phone: string; name: string; isNew: boolean }): FeedbackEntry | null {
    const entry = this.feedbackEntries.find((f) => f.id === feedbackId);
    if (!entry) return null;
    entry.customerPhone = phoneDigits(customer.phone);
    if (customer.name.trim()) entry.customerName = customer.name.trim();
    entry.customerLink = customer.isNew ? 'NEW' : 'LINKED';
    const profile = this.editableCustomer(entry.customerPhone);
    if (profile) {
      if (entry.type === 'REVIEW') {
        profile.totalReviews += 1;
        Object.assign(profile, applyKarmaEvent(profile, 'REVIEW_GIVEN', entry.sentiment === 'POSITIVE' ? KARMA_RULES.REVIEW_GIVEN + KARMA_RULES.POSITIVE_REVIEW_BONUS : KARMA_RULES.REVIEW_GIVEN, 'Customer review').updatedCustomer);
      } else if (entry.type === 'COMPLAINT') {
        profile.totalComplaints += 1;
        Object.assign(profile, applyKarmaEvent(profile, 'COMPLAINT_FILED', KARMA_RULES.COMPLAINT_FILED, 'Customer complaint').updatedCustomer);
      }
    }
    this.persistState();
    return entry;
  }

  public updateComplaintStatus(feedbackId: string, newStatus: ComplaintStatus, notes?: string) {
    const entry = this.feedbackEntries.find((f) => f.id === feedbackId);
    if (!entry) return;

    const oldStatus = entry.complaintStatus;
    const now = new Date().toISOString();
    entry.complaintStatus = newStatus;
    if (notes) entry.resolutionNotes = notes;

    if (!entry.history) entry.history = [];
    entry.history.unshift({
      id: this.generateId('fsh'),
      previousStatus: oldStatus,
      newStatus,
      changedBy: this.currentUser.fullName,
      notes: notes || `Status changed to ${newStatus}`,
      timestamp: now,
    });

    this.persistState();
  }

  public escalateComplaint(feedbackId: string, assignedToName: string, notes?: string) {
    const entry = this.feedbackEntries.find((f) => f.id === feedbackId);
    if (!entry) return;
    entry.priority = 'URGENT';
    entry.assignedToName = assignedToName;
    if (notes) entry.resolutionNotes = notes;
    if (!entry.history) entry.history = [];
    entry.history.unshift({
      id: this.generateId('fsh'),
      previousStatus: entry.complaintStatus,
      newStatus: entry.complaintStatus || 'OPEN',
      changedBy: this.currentUser.fullName,
      notes: `Escalated to URGENT priority. Assigned to ${assignedToName}. ${notes || ''}`,
      timestamp: new Date().toISOString(),
    });
    this.persistState();
  }

  public assignFeedback(
    feedbackId: string,
    officerId: string,
    officerName?: string
  ): FeedbackEntry | null {
    const entry = this.feedbackEntries.find((f) => f.id === feedbackId);
    if (!entry) return null;

    const user = officerName ? null : this.users.find((u) => u.id === officerId);
    const assignedName = officerName || user?.fullName || 'Assigned Officer';

    entry.assignedTo = officerId;
    entry.assignedToName = assignedName;

    this.persistState();
    return entry;
  }

  public toggleFeedbackFlag(feedbackId: string, flag: 'usedInDesign' | 'postedOnWebsite') {
    const entry = this.feedbackEntries.find((f) => f.id === feedbackId);
    if (entry) {
      entry[flag] = !entry[flag];
      this.persistState();
    }
  }

  public attachPhotoToFeedback(feedbackId: string, photoUrl: string) {
    const entry = this.feedbackEntries.find((f) => f.id === feedbackId);
    if (entry) {
      if (!entry.screenshotUrls) entry.screenshotUrls = [];
      entry.screenshotUrls.push(photoUrl);
      entry.hasScreenshot = true;
      this.persistState();
    }
  }

  // Customers
  public getCustomers(): Customer[] {
    return this.customers;
  }

  public getCustomerByPhone(phone: string): Customer | undefined {
    return this.findCustomer(phone);
  }

  public addCustomer(cust: Omit<Customer, 'id'>): Customer {
    const newCust: Customer = {
      ...cust,
      id: this.generateId('cust'),
    };
    this.customers.unshift(newCust);
    this.logActivity('CREATED_CUSTOMER', 'CUSTOMER', newCust.id, {
      name: newCust.name,
      phone: newCust.phone,
    });
    this.persistState();
    return newCust;
  }

  public updateCustomer(id: string, updates: Partial<Customer>): Customer | null {
    const idx = this.customers.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.customers[idx] = { ...this.customers[idx], ...updates };
    this.persistState();
    return this.customers[idx];
  }

  public deleteCustomer(id: string): boolean {
    const prevLen = this.customers.length;
    this.customers = this.customers.filter((c) => c.id !== id);
    if (this.customers.length !== prevLen) {
      this.persistState();
      return true;
    }
    return false;
  }

  // Tasks
  public async syncTasksFromSupabase(): Promise<Task[]> {
    if (!this.server) await this.syncWithSupabase();
    return this.tasks;
  }

  public getTasks(assignedTo?: string): Task[] {
    if (assignedTo) {
      const q = assignedTo.toLowerCase();
      return this.tasks.filter(
        (t) => t.assignedTo === assignedTo || (t.assignedToName && t.assignedToName.toLowerCase() === q)
      );
    }
    const user = this.getCurrentUser();
    const isOfficer =
      !user.is_super_admin &&
      !user.isSuperAdmin &&
      (user.role === 'SALES_OFFICER' || getScope(user, 'tasks') === 'OWN');

    if (isOfficer) {
      const uName = (user.fullName || '').toLowerCase();
      const uFirst = uName.split(' ')[0] || '';
      return this.tasks.filter(
        (t) =>
          t.assignedTo === user.id ||
          (t.assignedToName &&
            (t.assignedToName.toLowerCase() === uName ||
              (uFirst.length > 2 && t.assignedToName.toLowerCase().includes(uFirst))))
      );
    }
    return this.tasks;
  }

  public addTask(task: Omit<Task, 'id' | 'createdAt'>): Task {
    const newTask: Task = {
      ...task,
      id: this.generateId('task'),
      createdAt: new Date().toISOString(),
    };
    this.tasks.unshift(newTask);
    this.persistState();

    return newTask;
  }

  public createTask(task: Omit<Task, 'id' | 'createdAt'>): Task {
    return this.addTask(task);
  }

  public updateTaskStatus(taskId: string, status: Task['status']) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      this.persistState();

    }
  }

  public deleteTask(taskId: string): boolean {
    const idx = this.tasks.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      this.tasks.splice(idx, 1);
      this.persistState();
      return true;
    }
    return false;
  }

  public updateTask(taskId: string, updates: Partial<Task>): Task | null {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      Object.assign(task, updates);
      this.persistState();

      return task;
    }
    return null;
  }

  public reassignTask(taskId: string, officerId: string, officerName?: string): Task | null {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const user = officerName ? null : this.users.find((u) => u.id === officerId);
    const assignedName = officerName || user?.fullName || 'Assigned Officer';

    task.assignedTo = officerId;
    task.assignedToName = assignedName;


    this.persistState();
    return task;
  }

  public updateTaskPriority(taskId: string, priority: Priority): Task | null {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    task.priority = priority;


    this.persistState();
    return task;
  }

  // Notifications
  public getNotifications(userId?: string): Notification[] {
    const uid = userId || this.currentUser.id;
    return this.notifications.filter((n) => n.userId === uid);
  }

  public markNotificationRead(id: string) {
    const notif = this.notifications.find((n) => n.id === id);
    if (notif) {
      notif.read = true;
      this.persistState();
    }
  }

  public markAllNotificationsRead(userId?: string) {
    const uid = userId || this.currentUser.id;
    this.notifications.forEach((n) => {
      if (n.userId === uid) {
        n.read = true;
      }
    });
    this.persistState();
  }

  public deleteNotification(id: string) {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.persistState();
  }

  public addNotification(notif: Omit<Notification, 'id' | 'createdAt'>): Notification {
    const newNotif: Notification = {
      ...notif,
      id: this.generateId('notif'),
      createdAt: new Date().toISOString(),
      read: notif.read ?? false,
    };
    this.notifications.unshift(newNotif);
    this.persistState();
    return newNotif;
  }

  // Scorecards
  public getScorecards(): OfficerScorecard[] {
    if (this.scorecards && this.scorecards.length > 0) {
      return this.scorecards;
    }

    const officers = this.users.filter(
      (u) => u.active !== false && (u.role === 'SALES_OFFICER' || (u.permissions && (u.permissions as any).beat_plans))
    );
    const targetOfficers = officers;

    return targetOfficers.map((u) => {
      const officerVisits = this.visits.filter((v) => v.officerId === u.id);
      const officerBeatItems = this.beatItems.filter((b) => b.officerId === u.id);
      const officerCalls = this.callLogs.filter((c) => c.officerId === u.id);
      const officerCheques = this.cheques.filter((c) => c.officerId === u.id);
      const officerPhotos = this.shelfPhotos.filter((p) => p.officerId === u.id);
      const officerDocs = this.documents.filter((d) => d.officerId === u.id);
      const officerStockCounts = this.stockCounts.filter((s) => s.officerId === u.id);
      const officerTasks = this.tasks.filter((t) => t.assignedTo === u.id && t.status !== 'COMPLETED');

      const visitedCount =
        officerVisits.length ||
        officerBeatItems.filter((b) => b.status === 'VISITED').length;
      const skippedCount = officerBeatItems.filter((b) => b.status === 'SKIPPED').length;
      const productiveCalls = officerCalls.filter(
        (c) => c.outcome === 'Order Received' || c.outcome === 'Payment Promised'
      ).length;
      const callRatio = officerCalls.length > 0 ? Math.round((productiveCalls / officerCalls.length) * 100) : 0;
      const compliance = officerBeatItems.length > 0
        ? Math.round((officerBeatItems.filter((b) => b.status === 'VISITED').length / officerBeatItems.length) * 100) : 0;

      // Real visit duration from completed visits with timestamps
      let totalDurationMin = 0;
      let durationCount = 0;
      for (const v of officerVisits) {
        if (v.checkInTime && v.checkOutTime) {
          const diffMs = new Date(v.checkOutTime).getTime() - new Date(v.checkInTime).getTime();
          const mins = Math.round(diffMs / 60000);
          if (mins > 0 && mins < 480) {
            totalDurationMin += mins;
            durationCount++;
          }
        }
      }
      const avgDuration = durationCount > 0 ? Math.round(totalDurationMin / durationCount) : 0;

      // Real cheque handover gap from deposited cheques
      let totalHandoverDays = 0;
      let handoverCount = 0;
      for (const c of officerCheques) {
        if (c.receivedDateAd && c.handoverTimestamp) {
          const diffMs = new Date(c.handoverTimestamp).getTime() - new Date(c.receivedDateAd).getTime();
          const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
          if (days >= 0) {
            totalHandoverDays += days;
            handoverCount++;
          }
        }
      }
      const avgHandover = handoverCount > 0 ? Math.round(totalHandoverDays / handoverCount) : 0;

      return {
        officerId: u.id,
        officerName: u.fullName || 'Sales Officer',
        area: u.territory || 'Kathmandu Valley',
        storesVisited: visitedCount,
        beatCompliancePct: compliance,
        storesSkipped: skippedCount,
        skipReasonsBreakdown: {},
        avgVisitDurationMinutes: avgDuration,
        callsMade: officerCalls.length,
        productiveCalls,
        callToOrderRatioPct: callRatio,
        ordersCollected: productiveCalls,
        chequesCollected: officerCheques.length,
        chequesOverdue: officerCheques.filter((c) => c.status === 'DELAYED' || c.status === 'BOUNCED').length,
        avgChequeHandoverDays: avgHandover,
        shelfPhotosTaken: officerPhotos.length,
        documentsCollected: officerDocs.length,
        stockCountsDone: officerStockCounts.length,
        pendingTasks: officerTasks.length,
      };
    });
  }

  // Activity Logs
  public getActivityLogs(): ActivityLog[] {
    return this.activityLogs;
  }

  // Comparison Mode (Fix 36)
  public getComparisonMode(): ComparisonMode {
    return this.comparisonMode;
  }

  public setComparisonMode(mode: ComparisonMode) {
    this.comparisonMode = mode;
    this.persistState();
  }

  // Holiday Calendar Methods (Fix 33a)
  public getHolidays(yearBs?: number): Holiday[] {
    const yr = yearBs || 2083;
    return this.holidays.filter((h) => h.yearBs === yr);
  }

  public addHoliday(holiday: Omit<Holiday, 'id'>): Holiday {
    const newHol: Holiday = {
      ...holiday,
      id: this.generateId('hol'),
    };
    this.holidays.push(newHol);
    this.persistState();
    this.logActivity('Added Holiday', 'HOLIDAY', newHol.id, { name: newHol.name, dateBs: newHol.dateBs });
    return newHol;
  }

  public deleteHoliday(id: string) {
    this.holidays = this.holidays.filter((h) => h.id !== id);
    this.persistState();
    this.logActivity('Deleted Holiday', 'HOLIDAY', id);
  }

  public isHoliday(dateStr: string): boolean {
    return this.holidays.some((h) => h.dateBs === dateStr || h.dateAd === dateStr);
  }

  public getUpcomingHolidayTomorrow(currentDateBs?: string): Holiday | null {
    const today = currentDateBs || getTodayBs();
    // Check if tomorrow's date matches any holiday
    const match = this.holidays.find((h) => {
      const hDate = new Date(h.dateAd);
      const diffDays = Math.round((hDate.getTime() - Date.now()) / (1000 * 3600 * 24));
      return diffDays === 1;
    });
    return match || null;
  }

  // Seasonal Pattern Detection Methods (Fix 35)
  public getSeasonalPatterns(brand?: BrandCode): SeasonalPattern[] {
    if (brand && brand !== 'ALL') {
      return this.seasonalPatterns.filter((sp) => !sp.brandCode || sp.brandCode === brand);
    }
    return this.seasonalPatterns;
  }

  public addSeasonalPattern(pattern: Omit<SeasonalPattern, 'id'>): SeasonalPattern {
    const newPattern: SeasonalPattern = {
      ...pattern,
      id: this.generateId('sp'),
    };
    this.seasonalPatterns.push(newPattern);
    this.persistState();
    return newPattern;
  }

  // Task Template Management (Fix 37)
  public getTaskTemplates(activeOnly: boolean = false): TaskTemplate[] {
    if (activeOnly) {
      return this.taskTemplates.filter((t) => t.active);
    }
    return this.taskTemplates;
  }

  public addTaskTemplate(template: Omit<TaskTemplate, 'id' | 'createdAt'>): TaskTemplate {
    const newTmpl: TaskTemplate = {
      ...template,
      id: this.generateId('tmpl'),
      createdAt: new Date().toISOString(),
    };
    this.taskTemplates.push(newTmpl);
    this.persistState();
    this.logActivity('Created Task Template', 'TASK_TEMPLATE', newTmpl.id, { name: newTmpl.name });
    return newTmpl;
  }

  public updateTaskTemplate(id: string, updates: Partial<TaskTemplate>): TaskTemplate | null {
    const tmpl = this.taskTemplates.find((t) => t.id === id);
    if (!tmpl) return null;
    Object.assign(tmpl, updates);
    this.persistState();
    this.logActivity('Updated Task Template', 'TASK_TEMPLATE', id, updates);
    return tmpl;
  }

  public createTasksFromTemplate(
    templateId: string,
    assignedToId: string,
    options?: {
      relatedId?: string;
      relatedEntityType?: 'STORE' | 'CHEQUE' | 'COMPLAINT' | 'CALL';
      storeName?: string;
    }
  ): Task[] {
    const tmpl = this.taskTemplates.find((t) => t.id === templateId);
    if (!tmpl) return [];

    const targetUser = this.users.find((u) => u.id === assignedToId) || this.currentUser;
    const today = new Date();
    const createdTasks: Task[] = [];

    tmpl.steps.forEach((step, idx) => {
      const due = new Date(today);
      due.setDate(due.getDate() + (step.dueDaysOffset || idx + 1));
      const dueIso = due.toISOString().split('T')[0];

      const newTask = this.addTask({
        title: options?.storeName ? `[${options.storeName}] ${step.title}` : step.title,
        description: step.description,
        assignedTo: targetUser.id,
        assignedToName: targetUser.fullName,
        createdBy: this.currentUser.fullName,
        priority: idx === 0 ? 'HIGH' : 'MEDIUM',
        dueDateAd: dueIso,
        dueDateBs: getTodayBs(),
        status: 'OPEN',
        relatedId: options?.relatedId,
        relatedEntityType: options?.relatedEntityType || 'STORE',
        autoCreated: false,
      });
      createdTasks.push(newTask);
    });

    this.logActivity('Instantiated Task Template', 'TASK_TEMPLATE', templateId, {
      count: createdTasks.length,
      assignedTo: targetUser.fullName,
    });

    return createdTasks;
  }

  // Active Promotions (Fix 46d)
  public getPromotions(storeType?: string): Promotion[] {
    let list = this.promotions.filter((p) => p.active);
    if (storeType && storeType !== 'ALL') {
      list = list.filter((p) => p.applicableStoreTypes === 'ALL' || p.applicableStoreTypes === storeType);
    }
    return list;
  }

  public addPromotion(promo: Omit<Promotion, 'id'>): Promotion {
    const newPromo: Promotion = {
      ...promo,
      id: this.generateId('promo'),
    };
    this.promotions.push(newPromo);
    this.persistState();
    this.logActivity('Created Promotion', 'PROMOTION', newPromo.id, { name: newPromo.name });
    return newPromo;
  }

  public updatePromotion(id: string, updates: Partial<Promotion>): Promotion | null {
    const promo = this.promotions.find((p) => p.id === id);
    if (!promo) return null;
    Object.assign(promo, updates);
    this.persistState();
    return promo;
  }

  // Field Officer Daily Summary (Fix 38)
  public generateEndOfDaySummary(officerId: string, dateBs?: string): FieldOfficerDailySummary {
    const targetDateBs = dateBs || getTodayBs();
    const officer = this.users.find((u) => u.id === officerId) || this.currentUser;

    const officerBeats = this.beatItems.filter((b) => b.officerId === officerId);
    const visited = officerBeats.filter((b) => b.status === 'VISITED');
    const skipped = officerBeats
      .filter((b) => b.status === 'SKIPPED')
      .map((b) => ({ storeName: b.storeName, reason: b.skipReason || 'Skipped' }));

    const calls = this.callLogs.filter((c) => c.officerId === officerId);
    const productiveCalls = calls.filter((c) => c.outcome === 'Order Received' || c.outcome === 'Payment Promised');

    const orders = this.secondaryOrders.filter((o) => o.officerId === officerId);
    const cheques = this.cheques.filter((c) => c.officerId === officerId);
    const chequeAmount = cheques.reduce((acc, c) => acc + (c.amount || 0), 0);

    const photos = this.shelfPhotos.filter((p) => p.officerId === officerId);
    const stocks = this.stockCounts.filter((s) => s.officerId === officerId);
    const docs = this.documents.filter((d) => d.officerId === officerId);

    const compliance = officerBeats.length > 0 ? Math.round((visited.length / officerBeats.length) * 1000) / 10 : 0;

    const summary: FieldOfficerDailySummary = {
      id: this.generateId(`sum_${officerId}`),
      officerId,
      officerName: officer.fullName,
      dateAd: new Date().toISOString().split('T')[0],
      dateBs: targetDateBs,
      storesVisited: visited.length,
      totalStores: officerBeats.length,
      compliancePct: compliance,
      skippedStores: skipped,
      callsMade: calls.length,
      productiveCalls: productiveCalls.length,
      ordersCollected: orders.length,
      chequesCollected: cheques.length,
      chequeTotalAmount: chequeAmount,
      shelfPhotoSets: photos.length,
      stockCountsCompleted: stocks.length,
      documentsUploaded: docs.length,
      startTime: officer.dutyStartedAt || '9:30 AM',
      endTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      durationFormatted: '6h 15m',
      createdAt: new Date().toISOString(),
    };

    // Save summary
    this.dailySummaries = [summary, ...this.dailySummaries.filter((s) => s.officerId !== officerId || s.dateBs !== targetDateBs)];
    this.persistState();

    // Notify Admins
    const admins = this.users.filter((u) => u.is_super_admin || u.isSuperAdmin || u.role === 'ADMIN' || u.role === 'SUPER_ADMIN' || u.permissions?.staff_scorecards?.access === 'FULL');
    admins.forEach((admin) => {
      this.addNotification({
        userId: admin.id,
        title: `${officer.fullName} ended day (${targetDateBs})`,
        message: `Visited ${visited.length}/${officerBeats.length} stores (${compliance}% compliance). Collected ${cheques.length} cheques and ${orders.length} orders.`,
        priority: 'MEDIUM',
        read: false,
        entityType: 'DAILY_REPORT',
        entityId: summary.id,
      });
    });

    this.logActivity('Completed Field Day & Generated Summary', 'STAFF_DUTY', officerId, {
      compliance: `${compliance}%`,
      stores: visited.length,
      orders: orders.length,
    });

    return summary;
  }

  public getFieldOfficerDailySummaries(officerId?: string): FieldOfficerDailySummary[] {
    if (officerId) {
      return this.dailySummaries.filter((s) => s.officerId === officerId);
    }
    return this.dailySummaries;
  }

  // Store Health Score (Fix 34 & Fix 45b)
  public getStoreHealthScore(storeId: string): StoreHealthScore {
    // Cancelled orders are not orders. Regularity looks at the last 90 days.
    const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const storeOrders = this.secondaryOrders.filter((o) => o.entityId === storeId && o.status !== 'CANCELLED' && (o.orderDateAd || '') >= since);
    const storeCheques = this.cheques.filter((c) => c.entityId === storeId);
    // Stock is judged on the latest count only: an old low count must not drag the score forever.
    const storeStocks = this.stockCounts.filter((s) => s.entityId === storeId)
      .sort((a, b) => (b.dateAd || b.createdAt).localeCompare(a.dateAd || a.createdAt)).slice(0, 1);
    const storeBeats = this.beatItems.filter((b) => b.entityId === storeId);

    // If completely empty store with no recorded field data, return pure 0
    if (storeOrders.length === 0 && storeCheques.length === 0 && storeStocks.length === 0 && storeBeats.length === 0) {
      return {
        overall: 0,
        score: 0,
        tier: 'TIER_3',
        orderRegularity: 0,
        paymentDiscipline: 0,
        stockMaintenance: 0,
        visitCooperation: 0,
        issueRate: 0,
        trend: 'STABLE',
        previousScore: 0,
        lastCalculatedAt: new Date().toISOString(),
        breakdown: {
          orderVelocityScore: 0,
          paymentScore: 0,
          visitFrequencyScore: 0,
          stockFreshnessScore: 0,
        },
      };
    }

    // 1. Order Regularity (30 pts)
    let regularity = 0;
    if (storeOrders.length >= 3) regularity = 30;
    else if (storeOrders.length === 2) regularity = 22;
    else if (storeOrders.length === 1) regularity = 15;

    // 2. Payment Discipline (25 pts)
    let paymentDiscipline = 0;
    if (storeCheques.length > 0) {
      const bounced = storeCheques.filter((c) => c.status === 'BOUNCED');
      if (bounced.length > 0) {
        paymentDiscipline = 0;
      } else {
        const overdue = storeCheques.filter((c) => c.status === 'DELAYED');
        paymentDiscipline = overdue.length > 0 ? 12 : 25;
      }
    }

    // 3. Stock Maintenance (25 pts)
    let stockMaintenance = 0;
    if (storeStocks.length > 0) {
      const lowStocks = storeStocks.flatMap((s) => s.items).filter((i) => i.shelfQty < 5);
      if (lowStocks.length === 0) stockMaintenance = 25;
      else if (lowStocks.length <= 2) stockMaintenance = 16;
      else stockMaintenance = 8;
    }

    // 4. Visit Cooperation (20 pts)
    let visitCooperation = 0;
    if (storeBeats.length > 0) {
      const visited = storeBeats.filter((b) => b.status === 'VISITED');
      const pct = visited.length / storeBeats.length;
      if (pct >= 0.9) visitCooperation = 20;
      else if (pct >= 0.7) visitCooperation = 15;
      else visitCooperation = 8;
    }

    const overall = Math.min(100, Math.max(0, regularity + paymentDiscipline + stockMaintenance + visitCooperation));
    let tier: 'TIER_1' | 'TIER_2' | 'TIER_3' = 'TIER_2';
    if (overall >= 70) tier = 'TIER_1';
    else if (overall < 40) tier = 'TIER_3';

    return {
      overall,
      score: overall,
      tier,
      orderRegularity: regularity,
      paymentDiscipline,
      stockMaintenance,
      visitCooperation,
      issueRate: 0,
      // No score history is kept yet, so there is no real trend to report.
      trend: 'STABLE',
      previousScore: overall,
      lastCalculatedAt: new Date().toISOString(),
      breakdown: {
        orderVelocityScore: regularity,
        paymentScore: paymentDiscipline,
        visitFrequencyScore: visitCooperation,
        stockFreshnessScore: stockMaintenance,
      },
    };
  }

  public getAllStoreHealthScores(): Record<string, StoreHealthScore> {
    const result: Record<string, StoreHealthScore> = {};
    this.branches.forEach((b) => {
      result[b.id] = this.getStoreHealthScore(b.id);
    });
    this.retailers.forEach((r) => {
      result[r.id] = this.getStoreHealthScore(r.id);
    });
    return result;
  }

  // Smart Route Optimizer (Fix 44c)
  public optimizeBeatRoute(officerId: string): BeatItem[] {
    const beats = this.beatItems.filter((b) => b.officerId === officerId);
    if (beats.length <= 1) return beats;

    // Office base location (Kathmandu HQ)
    let currentLat = 27.7172;
    let currentLng = 85.324;

    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
    };

    // Group by priority: HIGH, then MEDIUM, then ROUTINE
    const priorityBuckets: Record<'HIGH' | 'MEDIUM' | 'ROUTINE', BeatItem[]> = {
      HIGH: beats.filter((b) => b.priority === 'HIGH'),
      MEDIUM: beats.filter((b) => b.priority === 'MEDIUM' || !b.priority),
      ROUTINE: beats.filter((b) => b.priority === 'ROUTINE'),
    };

    const ordered: BeatItem[] = [];

    const orderTier = (bucket: BeatItem[]) => {
      const remaining = [...bucket];
      let safetyLimit = remaining.length * 2 + 5;
      while (remaining.length > 0 && safetyLimit-- > 0) {
        // Find closest
        let closestIdx = 0;
        let minDist = Infinity;
        remaining.forEach((item, idx) => {
          const dist = haversine(currentLat, currentLng, item.lat, item.lng);
          if (dist < minDist) {
            minDist = dist;
            closestIdx = idx;
          }
        });

        const chosen = remaining.splice(closestIdx, 1)[0];
        chosen.distanceFromPreviousKm = minDist;
        chosen.estimatedVisitMinutes = 25;
        currentLat = chosen.lat;
        currentLng = chosen.lng;
        ordered.push(chosen);
      }
    };

    orderTier(priorityBuckets.HIGH);
    orderTier(priorityBuckets.MEDIUM);
    orderTier(priorityBuckets.ROUTINE);

    // Update sequence
    ordered.forEach((item, idx) => {
      item.sequence = idx + 1;
      // Auto-compute urgency signals
      item.urgencySignals = this.computeBeatUrgencySignals(item);
    });

    this.persistState();
    this.logActivity('Optimized Beat Route', 'BEAT_PLAN', officerId, {
      storeCount: ordered.length,
    });

    return ordered;
  }

  public updateBeatItemPriority(
    beatItemId: string,
    priority: 'HIGH' | 'MEDIUM' | 'ROUTINE',
    managerNotes?: string
  ): BeatItem | null {
    const item = this.beatItems.find((b) => b.id === beatItemId);
    if (!item) return null;

    item.priority = priority;
    if (managerNotes !== undefined) item.managerNotes = managerNotes;
    this.persistState();

    // Notify officer if priority changed
    this.addNotification({
      userId: item.officerId,
      title: `Beat Priority Updated: ${item.storeName}`,
      message: `Priority changed to ${priority} by Admin. Note: ${managerNotes || 'None'}`,
      priority: priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
      read: false,
      entityType: 'BEAT_ITEM',
      entityId: item.id,
    });

    return item;
  }

  private computeBeatUrgencySignals(beatItem: BeatItem): NonNullable<BeatItem['urgencySignals']> {
    const signals: NonNullable<BeatItem['urgencySignals']> = [];

    // Low stock signal (<5 units)
    const storeStocks = this.stockCounts.filter((s) => s.entityId === beatItem.entityId);
    const lowStock = storeStocks.flatMap((s) => s.items).some((i) => i.shelfQty < 5);
    if (lowStock) {
      signals.push({ type: 'LOW_STOCK', label: 'Stock critically low', color: 'red' });
    }

    // Dormant signal (not visited in 7+ days)
    if (beatItem.lastVisitDaysAgo >= 7) {
      signals.push({ type: 'DORMANT', label: `Not visited in ${beatItem.lastVisitDaysAgo}d`, color: 'amber' });
    }

    // Pending tasks
    if (beatItem.pendingTasks && beatItem.pendingTasks.length > 0) {
      signals.push({ type: 'TASK', label: `${beatItem.pendingTasks.length} pending task(s)`, color: 'amber' });
    }

    // Active offer
    if (this.promotions.some((p) => p.active)) {
      signals.push({ type: 'OFFER', label: 'Active offer available', color: 'green' });
    }

    return signals;
  }

  // Smart Selling Assist (Fix 46)
  public getAreaBestsellers(storeLat: number, storeLng: number, radiusKm: number = 3) {
    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // Find nearby stores
    const nearbyBranchIds = this.branches.filter((b) => haversine(storeLat, storeLng, b.lat, b.lng) <= radiusKm).map((b) => b.id);
    const nearbyRetailerIds = this.retailers.filter((r) => haversine(storeLat, storeLng, r.lat, r.lng) <= radiusKm).map((r) => r.id);
    const allNearbyIds = new Set([...nearbyBranchIds, ...nearbyRetailerIds]);

    // Aggregate secondary order items
    const nearbyOrders = this.secondaryOrders.filter((o) => allNearbyIds.has(o.entityId));
    const countsByProduct: Record<string, { name: string; units: number; storeCount: Set<string> }> = {};

    nearbyOrders.forEach((o) => {
      o.items.forEach((item) => {
        if (!countsByProduct[item.productId]) {
          countsByProduct[item.productId] = { name: item.productName, units: 0, storeCount: new Set() };
        }
        countsByProduct[item.productId].units += item.totalUnits;
        countsByProduct[item.productId].storeCount.add(o.entityId);
      });
    });

    // If local order history is empty, return empty array (zero tolerance for fake data)
    if (Object.keys(countsByProduct).length === 0) {
      return [];
    }

    return Object.entries(countsByProduct)
      .map(([id, info]) => ({
        productId: id,
        name: info.name,
        unitsMoved: info.units,
        storeCount: info.storeCount.size,
      }))
      .sort((a, b) => b.unitsMoved - a.unitsMoved)
      .slice(0, 5);
  }

  public getDistributionGaps(storeId: string, storeLat: number, storeLng: number) {
    const bestsellers = this.getAreaBestsellers(storeLat, storeLng);
    const storeOrders = this.secondaryOrders.filter((o) => o.entityId === storeId);
    const carriedProductIds = new Set(storeOrders.flatMap((o) => o.items.map((i) => i.productId)));

    return bestsellers
      .filter((b) => !carriedProductIds.has(b.productId))
      .map((b) => ({
        productId: b.productId,
        productName: b.name,
        areaVolume: b.unitsMoved,
        storeCarryingCount: b.storeCount,
        suggestedQty: Math.max(6, Math.round(b.unitsMoved / 8 / 6) * 6), // 50% rounded to 6 units
      }));
  }

  public getRestockRecommendations(storeId: string) {
    const storeStocks = this.stockCounts.filter((s) => s.entityId === storeId);
    if (storeStocks.length === 0) {
      return [];
    }

    const latest = storeStocks[0];
    return latest.items.map((item) => {
      const dailyRate = Math.max(0.4, Math.round(((item.previousQty - item.shelfQty) / 7) * 10) / 10);
      const daysLeft = Math.max(1, Math.round(item.shelfQty / dailyRate));
      const needed = Math.max(0, Math.round((20 * dailyRate - item.shelfQty) / 6) * 6);
      return {
        productId: item.productId,
        productName: item.productName,
        currentStock: item.shelfQty,
        depletionRate: dailyRate,
        daysUntilEmpty: daysLeft,
        suggestedReorder: Math.max(12, needed),
        urgent: daysLeft <= 3,
      };
    });
  }

  // Delivery Proof (Fix 41)
  public addDeliveryProof(
    orderId: string,
    proof: NonNullable<Order['deliveryProof']>
  ): Order | null {
    const order = this.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) return null;

    order.deliveryProof = {
      ...proof,
      uploadedAt: proof.uploadedAt || new Date().toISOString(),
    };
    // Through the shared status change, so the customer's delivered count and karma follow.
    if (order.status !== 'DELIVERED' && canWorkOrders(this.currentUser)) this.setOrderStatus(order.id, 'DELIVERED', { dateAd: proof.deliveryDateAd });
    else order.status = 'DELIVERED';
    this.persistState();

    this.logActivity('Uploaded Proof of Delivery', 'ORDER', order.id, {
      deliveredBy: proof.deliveredBy,
      dateBs: proof.deliveryDateBs,
    });

    return order;
  }

  // Payment Discipline & Dispatches (Fix 45c)
  public updateDispatchPayment(
    dispatchId: string,
    updates: Partial<Dispatch>
  ): Dispatch | null {
    const dispatch = this.dispatches.find((d) => d.id === dispatchId);
    if (!dispatch) return null;

    Object.assign(dispatch, updates);
    this.persistState();
    this.logActivity('Updated Dispatch Payment', 'DISPATCH', dispatchId, updates);
    return dispatch;
  }

  public getVendorPaymentTimeline(distributorOrBranchId: string) {
    const relatedDispatches = this.dispatches.filter(
      (d) => d.distributorId === distributorOrBranchId || d.branchId === distributorOrBranchId
    );
    return relatedDispatches.map((d) => ({
      id: d.id,
      dispatchDateBs: d.dispatchDateBs,
      dueDateBs: d.paymentDueDateBs || null,
      paymentStatus: d.paymentStatus || 'PENDING',
      amountDue: d.amountDue ?? null,
      collectedDateBs: d.collectionDateBs || null,
      delayDays: d.paymentDelayDays || 0,
      paymentTerms: d.paymentTerms || null,
    }));
  }

  // Morning Brief Data (Fix 31)
  public getMorningBriefData(user?: User) {
    const activeUser = user || this.currentUser;
    const isOfficer = activeUser.permissions?.beat_plans?.scope === 'OWN' || (!activeUser.is_super_admin && !activeUser.isSuperAdmin && activeUser.role === 'SALES_OFFICER');
    const isBrandMgr = Boolean(!activeUser.is_super_admin && !activeUser.isSuperAdmin && activeUser.assignedBrands?.length && !activeUser.assignedBrands.includes('ALL'));

    // Filtered collections
    let filteredOrders = this.orders.filter((o) => !o.isMarketing);
    let filteredFailures = this.deliveryFailures;
    let filteredReturns = this.returns;
    let filteredFeedback = this.feedbackEntries;

    if (isBrandMgr && activeUser.assignedBrands) {
      filteredOrders = filteredOrders.filter((o) => activeUser.assignedBrands!.includes(o.brandCode));
      filteredFailures = filteredFailures.filter((f) => activeUser.assignedBrands!.includes(f.brandCode));
      filteredReturns = filteredReturns.filter((r) => activeUser.assignedBrands!.includes(r.brandCode));
      filteredFeedback = filteredFeedback.filter((fb) => activeUser.assignedBrands!.includes(fb.brandCode));
    }

    const overdueCheques = this.cheques.filter(
      (c) => c.status === 'DELAYED' || c.status === 'PENDING'
    );

    const unresolvedComplaints = filteredFeedback.filter(
      (f) => f.type === 'COMPLAINT' && f.complaintStatus !== 'RESOLVED' && f.complaintStatus !== 'CLOSED'
    );

    const beatItems = isOfficer
      ? this.beatItems.filter((b) => b.officerId === activeUser.id)
      : this.beatItems;

    const visitedBeats = beatItems.filter((b) => b.status === 'VISITED');
    const upcomingHoliday = this.getUpcomingHolidayTomorrow();

    return {
      user: activeUser,
      yesterdaySummary: {
        totalOrders: filteredOrders.length,
        brandBreakdown: this.getBrands('ACTIVE').map((b) => ({
          name: b.name,
          code: b.code,
          count: filteredOrders.filter((o) => o.brandCode === b.code).length,
        })),
        deliveryFailures: filteredFailures.length,
        deliveryFailuresReason: 'Call not received',
        returnsCount: filteredReturns.length,
        complaintsCount: filteredFeedback.filter((f) => f.type === 'COMPLAINT').length,
        resolvedComplaints: filteredFeedback.filter((f) => f.type === 'COMPLAINT' && f.complaintStatus === 'RESOLVED').length,
        storeVisits: `${visitedBeats.length}/${beatItems.length}`,
        compliancePct: beatItems.length > 0 ? Math.round((visitedBeats.length / beatItems.length) * 100) : 0,
        callsMade: this.callLogs.length,
        chequesCollected: this.cheques.filter((c) => c.status === 'COLLECTED_IN_FIELD' || c.status === 'CASHED').length,
      },
      todayAttention: {
        overdueCheques: overdueCheques.slice(0, 3),
        unresolvedComplaints: unresolvedComplaints.slice(0, 2),
        todayBeatCount: beatItems.length,
        upcomingHoliday,
      },
    };
  }

  // Data Import Tool (Fix 39)
  public importData(
    record: Omit<DataImportRecord, 'id' | 'importedAt'> & { id?: string },
    entities: { orders?: Order[]; returns?: ReturnEntry[]; dispatches?: Dispatch[] }
  ): { success: boolean; record: DataImportRecord } {
    if (!this.server) throw new Error('Use the server-validated CSV importer to confirm a durable batch.');
    const orders = entities.orders || [];
    const returns = entities.returns || [];
    const dispatches = entities.dispatches || [];
    const count = orders.length + returns.length + dispatches.length;
    if (!count || count > 50) throw new Error('A batch must contain 1–50 validated records.');
    if ((record.sourceType === 'ORDERS' ? orders.length : record.sourceType === 'RETURNS' ? returns.length : record.sourceType === 'OFFLINE_SALES' ? dispatches.length : 0) !== count) throw new Error('The batch must contain only its selected record type.');
    const orderNumbers = new Set(this.orders.map((order) => order.orderNumber.trim().toUpperCase()));
    const dispatchIds = new Set(this.dispatches.map((dispatch) => dispatch.id));
    const returnIds = new Set(this.returns.map((entry) => entry.id));
    for (const order of orders) {
      const key = order.orderNumber?.trim().toUpperCase();
      if (!key || orderNumbers.has(key)) throw new Error('An order number already exists or is repeated in this batch.');
      orderNumbers.add(key);
    }
    for (const dispatch of dispatches) {
      if (!dispatch.id || dispatchIds.has(dispatch.id)) throw new Error('A dispatch ID already exists or is repeated in this batch.');
      dispatchIds.add(dispatch.id);
    }
    for (const entry of returns) {
      if (!entry.id || returnIds.has(entry.id)) throw new Error('A return ID already exists or is repeated in this batch.');
      returnIds.add(entry.id);
    }
    const ids: NonNullable<DataImportRecord['importedRecordIds']> = [];
    // Reuse ordinary submission side effects, including real Customer 360 aggregates.
    for (const order of orders) ids.push({ collection: 'orders', id: this.addOrder(order).id });
    for (const entry of returns) ids.push({ collection: 'returns', id: this.addReturn(entry).id });
    for (const dispatch of dispatches) { this.dispatches.push(dispatch); ids.push({ collection: 'dispatches', id: dispatch.id }); }
    const importRecord: DataImportRecord = {
      ...record, id: record.id || this.generateId('imp'), importedAt: new Date().toISOString(),
      totalRows: count, importedCount: count, skippedCount: 0, skippedRows: [], importedRecordIds: ids,
    };
    this.importHistory.unshift(importRecord);
    this.persistState();
    return { success: true, record: importRecord };
  }

  public getImportHistory(): DataImportRecord[] {
    return this.importHistory;
  }

  public rollbackImport(_importId: string): boolean {
    // Restoring a batch needs version-aware reversal of customer and record edits.
    return false;
  }

  // Role-Based Data Filtering (Fix 26b)
  public getFilteredOrders(user?: User): Order[] {
    const activeUser = user || this.currentUser;
    let list = this.orders.filter((o) => !o.isMarketing);
    if (!activeUser.is_super_admin && !activeUser.isSuperAdmin && activeUser.assignedBrands && activeUser.assignedBrands.length > 0 && !activeUser.assignedBrands.includes('ALL')) {
      list = list.filter((o) => activeUser.assignedBrands!.includes(o.brandCode));
    }
    if (this.activeBrandFilter && this.activeBrandFilter !== 'ALL') {
      list = list.filter((o) => o.brandCode === this.activeBrandFilter);
    }
    return list;
  }

  public getFilteredBeatItems(user?: User): BeatItem[] {
    const activeUser = user || this.currentUser;
    if (!activeUser.is_super_admin && !activeUser.isSuperAdmin && (activeUser.permissions?.beat_plans?.scope === 'OWN' || activeUser.role === 'SALES_OFFICER')) {
      return this.beatItems.filter((b) => b.officerId === activeUser.id);
    }
    return this.beatItems;
  }

  public getFilteredCheques(user?: User): Cheque[] {
    const activeUser = user || this.currentUser;
    if (!activeUser.is_super_admin && !activeUser.isSuperAdmin && (activeUser.permissions?.cheque_tracker?.scope === 'OWN' || activeUser.role === 'SALES_OFFICER')) {
      return this.cheques.filter((c) => c.officerId === activeUser.id);
    }
    return this.cheques;
  }

  public getFilteredStores(user?: User): StoreEntity[] {
    const activeUser = user || this.currentUser;
    const branches: StoreEntity[] = this.branches.map((b) => ({ entityType: 'BRANCH', ...b }));
    const retailers: StoreEntity[] = this.retailers.map((r) => ({ entityType: 'RETAILER', ...r }));
    let combined = [...branches, ...retailers];

    if (!activeUser.is_super_admin && !activeUser.isSuperAdmin && (activeUser.permissions?.stores?.scope === 'OWN' || activeUser.role === 'SALES_OFFICER')) {
      combined = combined.filter((s) => s.assignedOfficerId === activeUser.id);
    }
    return combined;
  }

  public getStores(user?: User): StoreEntity[] {
    return this.getFilteredStores(user);
  }

  public getFilteredTasks(user?: User): Task[] {
    const activeUser = user || this.currentUser;
    const isOfficer =
      !activeUser.is_super_admin &&
      !activeUser.isSuperAdmin &&
      (activeUser.role === 'SALES_OFFICER' || getScope(activeUser, 'tasks') === 'OWN');

    if (isOfficer) {
      const uName = (activeUser.fullName || '').toLowerCase();
      const uFirst = uName.split(' ')[0] || '';
      return this.tasks.filter(
        (t) =>
          t.assignedTo === activeUser.id ||
          (t.assignedToName &&
            (t.assignedToName.toLowerCase() === uName ||
              (uFirst.length > 2 && t.assignedToName.toLowerCase().includes(uFirst))))
      );
    }
    return this.tasks;
  }

  public getFilteredShelfPhotos(user?: User): ShelfPhoto[] {
    const activeUser = user || this.currentUser;
    if (!activeUser.is_super_admin && !activeUser.isSuperAdmin && (activeUser.permissions?.shelf_photos?.scope === 'OWN' || activeUser.role === 'SALES_OFFICER')) {
      return this.shelfPhotos.filter((p) => p.officerId === activeUser.id);
    }
    return this.shelfPhotos;
  }

  public getFilteredCallLogs(user?: User): CallLog[] {
    const activeUser = user || this.currentUser;
    if (!activeUser.is_super_admin && !activeUser.isSuperAdmin && (activeUser.permissions?.call_tracker?.scope === 'OWN' || activeUser.role === 'SALES_OFFICER')) {
      return this.callLogs.filter((c) => c.officerId === activeUser.id);
    }
    return this.callLogs;
  }

  public getFilteredDocuments(user?: User): HandoverDocument[] {
    const activeUser = user || this.currentUser;
    if (!activeUser.is_super_admin && !activeUser.isSuperAdmin && (activeUser.permissions?.document_handover?.scope === 'OWN' || activeUser.role === 'SALES_OFFICER')) {
      return this.documents.filter((d) => d.officerId === activeUser.id);
    }
    return this.documents;
  }

  public getFilteredScorecards(user?: User): OfficerScorecard[] {
    const activeUser = user || this.currentUser;
    if (!activeUser.is_super_admin && !activeUser.isSuperAdmin && (activeUser.permissions?.staff_scorecards?.scope === 'OWN' || activeUser.role === 'SALES_OFFICER')) {
      return this.scorecards.filter((s) => s.officerId === activeUser.id);
    }
    return this.scorecards;
  }

  public getFilteredDeliveryFailures(user?: User): DeliveryFailure[] {
    const activeUser = user || this.currentUser;
    let list = this.deliveryFailures;
    if (!activeUser.is_super_admin && !activeUser.isSuperAdmin && activeUser.assignedBrands && activeUser.assignedBrands.length > 0 && !activeUser.assignedBrands.includes('ALL')) {
      list = list.filter((f) => activeUser.assignedBrands!.includes(f.brandCode));
    }
    return list;
  }

  public getFilteredReturns(user?: User): ReturnEntry[] {
    const activeUser = user || this.currentUser;
    let list = this.returns;
    if (!activeUser.is_super_admin && !activeUser.isSuperAdmin && activeUser.assignedBrands && activeUser.assignedBrands.length > 0 && !activeUser.assignedBrands.includes('ALL')) {
      list = list.filter((r) => activeUser.assignedBrands!.includes(r.brandCode));
    }
    return list;
  }

  public getFilteredFeedback(user?: User): FeedbackEntry[] {
    const activeUser = user || this.currentUser;
    let list = this.feedbackEntries;
    if (!activeUser.is_super_admin && !activeUser.isSuperAdmin && activeUser.assignedBrands && activeUser.assignedBrands.length > 0 && !activeUser.assignedBrands.includes('ALL')) {
      list = list.filter((f) => activeUser.assignedBrands!.includes(f.brandCode));
    }
    return list;
  }

  // =========================================================================
  // FIX 60 & 61: INFLUENCER DIRECTORY, TRACKING & MARKETING SENDS
  // =========================================================================
  public getInfluencers(filter?: {
    platform?: string;
    qualityRating?: string;
    search?: string;
    nicheIds?: string[];
  }): Influencer[] {
    let result = [...this.influencers];
    if (filter) {
      if (filter.platform && filter.platform !== 'ALL') {
        result = result.filter((inf) =>
          (inf.platforms || []).some((p) => p.platform.toLowerCase() === filter.platform!.toLowerCase())
        );
      }
      if (filter.qualityRating && filter.qualityRating !== 'ALL') {
        result = result.filter((inf) => inf.qualityRating === filter.qualityRating);
      }
      if (filter.nicheIds?.length) {
        result = result.filter((inf) => filter.nicheIds!.some((id) => (inf.nicheIds || []).includes(id)));
      }
      if (filter.search && filter.search.trim()) {
        const q = filter.search.toLowerCase().trim();
        result = result.filter(
          (inf) =>
            inf.name.toLowerCase().includes(q) ||
            (inf.platforms || []).some((p) => p.handle.toLowerCase().includes(q)) ||
            (inf.city && inf.city.toLowerCase().includes(q))
        );
      }
    }
    return result;
  }

  public getInfluencerById(id: string): Influencer | undefined {
    return this.influencers.find((inf) => inf.id === id);
  }

  /** Only a name is required. Everything else can be added later. */
  public createInfluencer(
    data: Omit<Influencer, 'id' | 'createdAt' | 'totalSends' | 'totalContent' | 'isActive'> & { isActive?: boolean }
  ): Influencer {
    if (!data.name?.trim()) throw new Error('An influencer needs a name.');
    const newInfluencer: Influencer = {
      ...data,
      name: data.name.trim(),
      platforms: data.platforms || [],
      nicheIds: data.nicheIds || [],
      id: this.generateId('inf'),
      totalSends: 0,
      totalContent: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.influencers.unshift(newInfluencer);
    this.persistState();
    return newInfluencer;
  }

  public updateInfluencer(id: string, updates: Partial<Influencer>): Influencer | undefined {
    const index = this.influencers.findIndex((inf) => inf.id === id);
    if (index === -1) return undefined;
    this.influencers[index] = { ...this.influencers[index], ...updates };
    this.persistState();
    return this.influencers[index];
  }

  // ----- Shared lists: niches, reach-out platforms, content platforms, failure reasons -----

  private addLookup(collection: 'influencerNiches' | 'marketingOptions' | 'failureReasons', prefix: string, rawName: string, existing: { id: string; name: string; isArchived: boolean; list?: string }[], extra: Record<string, unknown> = {}) {
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (!name) throw new Error('Enter a name.');
    if (name.length > 60) throw new Error('Use a name of at most 60 characters.');
    const clash = existing.find((row) => sameName(row.name, name));
    if (clash && !clash.isArchived) return clash;
    if (clash) throw new Error(`"${clash.name}" exists but is archived. An admin can restore it in Settings.`);
    const row = { id: lookupId(prefix, name), name, isArchived: false, createdBy: this.currentUser.fullName, createdAt: new Date().toISOString(), ...extra };
    const list = (this as any)[collection] as { id: string }[];
    if (list.some((entry) => entry.id === row.id)) row.id = `${row.id}-${Date.now().toString(36)}`;
    list.push(row);
    this.persistState();
    return row;
  }

  private saveLookup(collection: 'influencerNiches' | 'marketingOptions' | 'failureReasons', row: { id: string; name: string; isArchived: boolean }) {
    const list = (this as any)[collection] as { id: string }[];
    const index = list.findIndex((entry) => entry.id === row.id);
    if (index < 0) list.push({ ...row }); else list[index] = { ...list[index], ...row };
    this.persistState();
  }

  public getInfluencerNiches(includeArchived = false): InfluencerNiche[] {
    return [...this.influencerNiches].filter((niche) => includeArchived || !niche.isArchived).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Creates the niche if the name is new; returns the existing one otherwise (case ignored). */
  public addInfluencerNiche(name: string): InfluencerNiche {
    return this.addLookup('influencerNiches', 'niche', name, this.influencerNiches) as InfluencerNiche;
  }

  public nicheUsage(id: string): number {
    return this.influencers.filter((inf) => (inf.nicheIds || []).includes(id)).length;
  }

  public renameLookup(collection: 'influencerNiches' | 'marketingOptions' | 'failureReasons', id: string, rawName: string): void {
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 60) throw new Error('Enter a name of at most 60 characters.');
    const all: { id: string; name: string; isArchived: boolean; list?: string }[] = collection === 'failureReasons' ? this.getFailureReasons(true)
      : collection === 'influencerNiches' ? this.influencerNiches : this.getAllMarketingOptions();
    const row = all.find((entry) => entry.id === id);
    if (!row) throw new Error('This entry no longer exists.');
    if (all.some((entry) => entry.id !== id && sameName(entry.name, name) && entry.list === row.list)) throw new Error(`"${name}" already exists.`);
    this.saveLookup(collection, { ...row, name });
  }

  public setLookupArchived(collection: 'influencerNiches' | 'marketingOptions' | 'failureReasons', id: string, isArchived: boolean): void {
    const all: { id: string; name: string; isArchived: boolean }[] = collection === 'failureReasons' ? this.getFailureReasons(true)
      : collection === 'influencerNiches' ? this.influencerNiches : this.getAllMarketingOptions();
    const row = all.find((entry) => entry.id === id);
    if (!row) throw new Error('This entry no longer exists.');
    this.saveLookup(collection, { ...row, isArchived });
  }

  /** Move every influencer from one niche to another, then archive the first. */
  public mergeInfluencerNiches(sourceId: string, targetId: string): number {
    if (sourceId === targetId) throw new Error('Choose two different niches.');
    const source = this.influencerNiches.find((niche) => niche.id === sourceId);
    const target = this.influencerNiches.find((niche) => niche.id === targetId);
    if (!source || !target) throw new Error('This niche no longer exists.');
    let moved = 0;
    for (const inf of this.influencers) {
      if (!(inf.nicheIds || []).includes(sourceId)) continue;
      inf.nicheIds = [...new Set((inf.nicheIds || []).map((id) => id === sourceId ? targetId : id))];
      moved++;
    }
    source.isArchived = true; source.mergedIntoId = targetId;
    this.persistState();
    return moved;
  }

  public deleteInfluencerNiche(id: string): void {
    if (this.nicheUsage(id) > 0) throw new Error('This niche is used by at least one influencer. Archive or merge it instead.');
    this.influencerNiches = this.influencerNiches.filter((niche) => niche.id !== id);
    this.persistState();
  }

  private getAllMarketingOptions(): MarketingOption[] {
    const merged: MarketingOption[] = [...this.marketingOptions];
    const defaults: [MarketingOptionList, string[]][] = [['REACH_OUT', DEFAULT_REACH_OUT_PLATFORMS], ['CONTENT_PLATFORM', DEFAULT_CONTENT_PLATFORMS]];
    for (const [list, names] of defaults) for (const name of names) {
      const id = lookupId(list === 'REACH_OUT' ? 'reach' : 'platform', name);
      if (!merged.some((row) => row.list === list && (row.id === id || sameName(row.name, name)))) merged.push({ id, list, name, isArchived: false, createdAt: '' });
    }
    return merged;
  }

  /** Reach-out platforms and content platforms are two separate lists. */
  public getMarketingOptions(list: MarketingOptionList, includeArchived = false): MarketingOption[] {
    return this.getAllMarketingOptions().filter((row) => row.list === list && (includeArchived || !row.isArchived));
  }

  public addMarketingOption(list: MarketingOptionList, name: string): MarketingOption {
    return this.addLookup('marketingOptions', list === 'REACH_OUT' ? 'reach' : 'platform', name, this.getAllMarketingOptions().filter((row) => row.list === list), { list }) as MarketingOption;
  }

  // ----- Marketing sends: their own collection, never orders -----

  public getMarketingSends(filter?: { influencerId?: string }): MarketingSend[] {
    const list = filter?.influencerId ? this.marketingSends.filter((send) => send.influencerId === filter.influencerId) : this.marketingSends;
    return [...list].sort((a, b) => b.sentDateAd.localeCompare(a.sentDateAd) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  public getMarketingSendById(id: string): MarketingSend | undefined {
    return this.marketingSends.find((send) => send.id === id);
  }

  /**
   * The only way to create a send. It needs an existing influencer and carries
   * no price, payment, total or order type.
   */
  public createMarketingSend(input: Omit<MarketingSend, 'id' | 'sendNumber' | 'createdAt' | 'status' | 'influencerName' | 'responsibleName'>): MarketingSend {
    const influencer = this.influencers.find((inf) => inf.id === input.influencerId);
    if (!influencer) throw new Error('Create the influencer first, then send from their profile.');
    if (!input.brandCodes.length) throw new Error('Choose at least one brand.');
    if (!input.items.length || input.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) throw new Error('Add at least one product with a whole-number quantity.');
    if (input.items.some((item) => !input.brandCodes.includes(item.brandCode))) throw new Error('Every product must belong to one of the selected brands.');
    if (input.expectedContentDateAd && input.expectedContentDateAd < input.sentDateAd) throw new Error('The expected content date cannot be earlier than the sent date.');
    const responsible = this.users.find((user) => user.id === input.responsibleId);
    const send: MarketingSend = {
      ...input,
      items: input.items.map((item) => ({ productId: item.productId, productName: item.productName, brandCode: item.brandCode, quantity: item.quantity, ...(item.isCombo ? { isCombo: true } : {}) })),
      id: this.generateId('send'),
      // Replaced by the server with the next MS number when the send is saved.
      sendNumber: pendingDocumentId(),
      influencerName: influencer.name,
      responsibleName: responsible?.fullName || this.currentUser.fullName,
      status: 'SENT',
      createdAt: new Date().toISOString(),
    };
    this.marketingSends.unshift(send);
    if (canPerform(this.currentUser, 'marketing', 'EDIT')) {
      influencer.totalSends = this.marketingSends.filter((row) => row.influencerId === influencer.id && row.status !== 'CANCELLED').length;
      if (!influencer.lastSendDate || send.sentDateAd >= influencer.lastSendDate) { influencer.lastSendDate = send.sentDateAd; influencer.lastSendDateBs = send.sentDateBs; }
    }
    this.persistState();
    return send;
  }

  public cancelMarketingSend(id: string): MarketingSend | undefined {
    const send = this.marketingSends.find((row) => row.id === id);
    if (!send) return undefined;
    send.status = 'CANCELLED';
    this.persistState();
    return send;
  }

  // ----- Content pieces -----

  public getInfluencerContent(influencerId?: string): InfluencerContent[] {
    if (influencerId) {
      return this.influencerContent.filter((c) => c.influencerId === influencerId);
    }
    return this.influencerContent;
  }

  private refreshSendStatus(sendId?: string) {
    if (!sendId) return;
    const send = this.marketingSends.find((row) => row.id === sendId);
    if (!send || send.status === 'CANCELLED' || !canPerform(this.currentUser, 'marketing', 'EDIT')) return;
    send.status = this.influencerContent.some((piece) => piece.sendId === sendId) ? 'CONTENT_RECEIVED' : 'SENT';
  }

  private refreshInfluencerContentStats(influencerId: string) {
    const inf = this.influencers.find((i) => i.id === influencerId);
    if (!inf || !canPerform(this.currentUser, 'marketing', 'EDIT')) return;
    const own = this.influencerContent.filter((piece) => piece.influencerId === influencerId);
    const latest = own.reduce<InfluencerContent | null>((best, piece) => !best || piece.datePostedAd > best.datePostedAd ? piece : best, null);
    inf.totalContent = own.length;
    inf.lastContentDate = latest?.datePostedAd;
    inf.lastContentDateBs = latest?.datePostedBs;
  }

  public saveInfluencerContent(data: Omit<InfluencerContent, 'id' | 'createdAt'> & { id?: string }): InfluencerContent {
    if (!data.links?.length) throw new Error('Add at least one platform link.');
    if (!data.datePostedAd) throw new Error('The date posted is required.');
    const existing = data.id ? this.influencerContent.find((piece) => piece.id === data.id) : undefined;
    const previousSend = existing?.sendId;
    let saved: InfluencerContent;
    if (existing) {
      // Replace the legacy single-link fields with the new list on first edit.
      const { url: _url, platform: _platform, brandCode: _brand, productName: _product, ...kept } = existing;
      saved = { ...kept, ...data, id: existing.id, createdAt: existing.createdAt };
      this.influencerContent[this.influencerContent.indexOf(existing)] = saved;
    } else {
      saved = { ...data, id: this.generateId('cnt'), createdAt: new Date().toISOString() };
      this.influencerContent.unshift(saved);
    }
    this.refreshSendStatus(saved.sendId);
    if (previousSend && previousSend !== saved.sendId) this.refreshSendStatus(previousSend);
    this.refreshInfluencerContentStats(saved.influencerId);
    this.persistState();
    return saved;
  }

  public deleteInfluencerContent(id: string): boolean {
    const target = this.influencerContent.find((c) => c.id === id);
    if (!target) return false;
    this.influencerContent = this.influencerContent.filter((c) => c.id !== id);
    this.refreshSendStatus(target.sendId);
    this.refreshInfluencerContentStats(target.influencerId);
    this.persistState();
    return true;
  }

  /** Orders still carrying the old marketing flag. Shown to admins until the data upgrade has moved them. */
  public getLegacyMarketingOrderCount(): number {
    return this.orders.filter((o) => o.isMarketing).length;
  }

  // ----- Preferences saved on the account -----

  public getMyPreferences(): UserPreferenceRecord {
    return this.userPreferences.find((row) => row.id === this.currentUser.id) || { id: this.currentUser.id };
  }

  public setMyPreferences(updates: Partial<Omit<UserPreferenceRecord, 'id'>>): void {
    if (!this.currentUser.id) return;
    const next = { ...this.getMyPreferences(), ...updates, id: this.currentUser.id, updatedAt: new Date().toISOString() };
    for (const key of Object.keys(next) as (keyof UserPreferenceRecord)[]) if (next[key] === undefined) delete next[key];
    const index = this.userPreferences.findIndex((row) => row.id === this.currentUser.id);
    if (index < 0) this.userPreferences.push(next); else this.userPreferences[index] = next;
    this.persistState();
  }

  /** True once the first server refresh has completed in this session, so screens can tell "empty" from "not loaded yet". */
  public isWorkspaceLoaded(): boolean { return this.server || this.workspaceLoaded; }

  // ----- Short order ID prefixes -----

  public getBrandPrefix(brandCode: string): string { return brandPrefix(brandCode, this.brandPrefixes); }
  public getBrandPrefixes(): Record<string, string> { return { ...this.brandPrefixes }; }

  public setBrandPrefix(brandCode: string, value: string): void {
    const code = brandCode.trim().toUpperCase();
    const prefix = validateBrandPrefix(value);
    const others = this.getBrands('ALL').filter((brand) => brand.code.toUpperCase() !== code);
    const clash = others.find((brand) => this.getBrandPrefix(brand.code) === prefix);
    if (clash) throw new Error(`${prefix} is already the prefix for ${clash.name}.`);
    // Save every brand's effective prefix so a later default can never collide with a saved one.
    const next: Record<string, string> = {};
    for (const brand of others) next[brand.code.toUpperCase()] = this.getBrandPrefix(brand.code);
    next[code] = prefix;
    this.brandPrefixes = next;
    this.persistState();
  }

  public reservedPrefixes(): string[] { return Object.values(RESERVED_PREFIXES); }

  // =========================================================================
  // FIX 62: DASHBOARD SALES MODE (ALL / D2C / B2B)
  // =========================================================================
  public getSalesMode(): DashboardSalesMode {
    return this.salesMode;
  }

  public setSalesMode(mode: DashboardSalesMode): void {
    this.salesMode = mode;
    this.persistState();
  }

  // =========================================================================
  // FIX 63: CUSTOM SHARED ACCESS LINKS
  // =========================================================================
  public getSharedAccessLinks(): SharedAccessLink[] {
    return this.sharedAccessLinks;
  }

  public createSharedAccessLink(
    data: Omit<SharedAccessLink, 'id' | 'token' | 'createdAt' | 'accessCount' | 'isActive'>
  ): SharedAccessLink {
    const token = 'bb_' + btoa(String.fromCharCode(...globalThis.crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const newLink: SharedAccessLink = {
      ...data,
      id: this.generateId('sh_link'),
      token,
      isActive: true,
      accessCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.sharedAccessLinks.unshift(newLink);
    this.persistState();
    this.logActivity('Shared Access Link Created', 'SHARED_ACCESS', newLink.id, { name: newLink.name, token });
    return newLink;
  }

  public deactivateSharedAccessLink(id: string): boolean {
    const link = this.sharedAccessLinks.find((l) => l.id === id);
    if (!link) return false;
    link.isActive = false;
    this.persistState();
    this.logActivity('Shared Access Link Deactivated', 'SHARED_ACCESS', id);
    return true;
  }

  /** Set, change or remove (empty) the password on a shared link. The link itself stays the same. */
  public setSharedAccessPasscode(id: string, passcode: string): boolean {
    const link = this.sharedAccessLinks.find((l) => l.id === id);
    if (!link) return false;
    const clean = passcode.trim();
    if (clean) link.passcode = clean; else delete link.passcode;
    this.persistState();
    this.logActivity(clean ? 'Shared Access Password Set' : 'Shared Access Password Removed', 'SHARED_ACCESS', id);
    return true;
  }

  public getSharedAccessByToken(token: string): SharedAccessLink | undefined {
    return this.sharedAccessLinks.find((l) => l.token === token && l.isActive);
  }

  public recordSharedAccessAccess(token: string): SharedAccessLink | undefined {
    const link = this.sharedAccessLinks.find((l) => l.token === token);
    if (!link) return undefined;
    link.accessCount = (link.accessCount || 0) + 1;
    link.lastAccessedAt = new Date().toISOString();
    this.persistState();
    this.logActivity('Shared Access Link Viewed', 'SHARED_ACCESS', link.id, { token, count: link.accessCount });
    return link;
  }

  private logActivity(action: string, entityType: string, entityId: string, details?: Record<string, unknown>) {
    let id = this.generateId('act');
    while (this.activityLogs.some((existing) => existing.id === id)) id = this.generateId('act');
    const log: ActivityLog = {
      id,
      userName: this.currentUser.fullName,
      userRole: (this.currentUser.role as any) || 'STAFF',
      action,
      entityType,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    };
    this.activityLogs.unshift(log);
    if (this.activityLogs.length > 200) {
      this.activityLogs.pop();
    }
    this.persistState();
  }
}

export const db = new DatabaseService();
