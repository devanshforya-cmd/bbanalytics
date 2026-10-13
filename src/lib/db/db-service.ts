import { SUPER_ADMIN_TEMPLATE } from '../permissions';

const DEFAULT_SUPER_ADMIN: User = {
  id: 'user_devansh',
  fullName: 'Devansh Agarwal',
  email: 'devansh@brandbucket.com',
  phone: '+977-9801234567',
  role: 'SUPER_ADMIN',
  isSuperAdmin: true,
  dutyStatus: 'ONLINE',
  active: true,
  assignedBrands: ['ALL'],
  territory: 'ALL',
  permissions: {
    canViewAnalytics: true,
    canExportSheets: true,
    canManageDispatches: true,
    canManageCheques: true,
    canApproveSkips: true,
    canManageStaff: true,
    canConfigureSettings: true,
  },
  customPermissions: SUPER_ADMIN_TEMPLATE,
};

const DEFAULT_BRANDS: Brand[] = [];

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
import { getTodayBs } from '../nepali-calendar';

export interface OrderRealtimeEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: Order;
  old?: { id: string };
}

export class DatabaseService {
  private users: User[] = [DEFAULT_SUPER_ADMIN];
  private currentUser: User = DEFAULT_SUPER_ADMIN;
  private brands: Brand[] = DEFAULT_BRANDS;
  private products: Product[] = [];
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
  private sharedAccessLinks: SharedAccessLink[] = [];
  private salesMode: DashboardSalesMode = 'ALL';
  private orderSubscribers: Set<(event: OrderRealtimeEvent) => void> = new Set();

  private documentTypes: DocumentTypeConfig[] = [
    { id: 'doc_po', name: 'Purchase Order', isActive: true },
    { id: 'doc_inv', name: 'Signed Invoice', isActive: true },
    { id: 'doc_receipt', name: 'Delivery Receipt', isActive: true },
    { id: 'doc_stock', name: 'Stock Acknowledgment', isActive: true },
    { id: 'doc_credit', name: 'Credit Note', isActive: true },
    { id: 'doc_ret', name: 'Return Authorization', isActive: true },
  ];

  private storeCategories: StoreCategoryConfig[] = [
    { id: 'cat_supermarket', name: 'Supermarket', isActive: true },
    { id: 'cat_pharmacy', name: 'Pharmacy', isActive: true },
    { id: 'cat_kirana', name: 'Kirana', isActive: true },
    { id: 'cat_cosmetics', name: 'Cosmetics Store', isActive: true },
    { id: 'cat_wholesale', name: 'Wholesale', isActive: true },
    { id: 'cat_general', name: 'General Store', isActive: true },
    { id: 'cat_dept', name: 'Department Store', isActive: true },
  ];

  private requireStorePhotoAtCheckIn: boolean = false;
  private recurringSchedules: RecurringScheduleEntry[] = [];

  private activeBrandFilter: BrandCode = 'ALL';
  private calendarMode: 'BS' | 'AD' = 'BS';

  constructor() {
    this.loadState();
  }

  private loadState() {
    if (typeof window === 'undefined') return;
    try {
      // Clear legacy storage keys if present
      localStorage.removeItem('bb_command_center_db_state_v8');
      localStorage.removeItem('bb_command_center_db_state_v7');
      localStorage.removeItem('bb_command_center_db_state_v6');
      localStorage.removeItem('bb_command_center_db_state_v5');
      localStorage.removeItem('bb_command_center_db_state_v4');
      localStorage.removeItem('bb_command_center_db_state_v3');
      localStorage.removeItem('bb_command_center_db_state_v2');
      localStorage.removeItem('bb_command_center_db_state');
      localStorage.removeItem('bb_auth_user_session_v2');

      const stored = localStorage.getItem('bb_command_center_db_state_v9');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.users) this.users = parsed.users;
        if (parsed.products) this.products = parsed.products;
        if (parsed.combos) this.combos = parsed.combos;
        if (parsed.secondaryOrders) this.secondaryOrders = parsed.secondaryOrders;
        if (parsed.facingAudits) this.facingAudits = parsed.facingAudits;
        if (parsed.cheques) this.cheques = parsed.cheques;
        if (parsed.beatItems) this.beatItems = parsed.beatItems;
        if (parsed.orders) this.orders = parsed.orders;
        if (parsed.customers) this.customers = parsed.customers;
        if (parsed.deliveryFailures) this.deliveryFailures = parsed.deliveryFailures;
        if (parsed.returns) this.returns = parsed.returns;
        if (parsed.feedbackEntries) this.feedbackEntries = parsed.feedbackEntries;
        if (parsed.reviewCategories) this.reviewCategories = parsed.reviewCategories;
        if (parsed.tasks) this.tasks = parsed.tasks;
        if (parsed.retailers) this.retailers = parsed.retailers;
        if (parsed.distributors) this.distributors = parsed.distributors;
        if (parsed.branches) this.branches = parsed.branches;
        if (parsed.dispatches) this.dispatches = parsed.dispatches;
        if (parsed.stockCounts) this.stockCounts = parsed.stockCounts;
        if (parsed.shelfPhotos) this.shelfPhotos = parsed.shelfPhotos;
        if (parsed.callLogs) this.callLogs = parsed.callLogs;
        if (parsed.documents) this.documents = parsed.documents;
        if (parsed.visits) this.visits = parsed.visits;
        if (parsed.notifications) this.notifications = parsed.notifications;
        if (parsed.activityLogs) this.activityLogs = parsed.activityLogs;
        if (parsed.currentUser) this.currentUser = parsed.currentUser;
        if (parsed.activeBrandFilter) this.activeBrandFilter = parsed.activeBrandFilter;
        if (parsed.calendarMode) this.calendarMode = parsed.calendarMode;
        if (parsed.brands) this.brands = parsed.brands;
        if (parsed.staffLiveLocations) this.staffLiveLocations = parsed.staffLiveLocations;
        if (parsed.holidays) this.holidays = parsed.holidays;
        if (parsed.seasonalPatterns) this.seasonalPatterns = parsed.seasonalPatterns;
        if (parsed.taskTemplates) this.taskTemplates = parsed.taskTemplates;
        if (parsed.promotions) this.promotions = parsed.promotions;
        if (parsed.dailySummaries) this.dailySummaries = parsed.dailySummaries;
        if (parsed.importHistory) this.importHistory = parsed.importHistory;
        if (parsed.comparisonMode) this.comparisonMode = parsed.comparisonMode;
        if (parsed.influencers) this.influencers = parsed.influencers;
        if (parsed.influencerContent) this.influencerContent = parsed.influencerContent;
        if (parsed.sharedAccessLinks) this.sharedAccessLinks = parsed.sharedAccessLinks;
        if (parsed.salesMode) this.salesMode = parsed.salesMode;
        if (parsed.documentTypes) this.documentTypes = parsed.documentTypes;
        if (parsed.storeCategories) this.storeCategories = parsed.storeCategories;
        if (parsed.requireStorePhotoAtCheckIn !== undefined) this.requireStorePhotoAtCheckIn = parsed.requireStorePhotoAtCheckIn;
        if (parsed.recurringSchedules) this.recurringSchedules = parsed.recurringSchedules;
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage', e);
    }
  }

  private generateId(prefix: string): string {
    const rand = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${Date.now()}_${rand}`;
  }

  private persistState() {
    if (typeof window === 'undefined') return;
    try {
      const state = {
        users: this.users,
        brands: this.brands,
        products: this.products,
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
        currentUser: this.currentUser,
        activeBrandFilter: this.activeBrandFilter,
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
        sharedAccessLinks: this.sharedAccessLinks,
        salesMode: this.salesMode,
        documentTypes: this.documentTypes,
        storeCategories: this.storeCategories,
        requireStorePhotoAtCheckIn: this.requireStorePhotoAtCheckIn,
        recurringSchedules: this.recurringSchedules,
      };
      localStorage.setItem('bb_command_center_db_state_v9', JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to persist state', e);
    }
  }

  public resetDatabase() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('bb_command_center_db_state_v9');
    localStorage.removeItem('bb_command_center_db_state_v8');
    localStorage.removeItem('bb_command_center_db_state_v7');
    localStorage.removeItem('bb_command_center_db_state_v6');
    localStorage.removeItem('bb_command_center_db_state_v5');
    localStorage.removeItem('bb_command_center_db_state_v4');
    localStorage.removeItem('bb_command_center_db_state_v3');
    localStorage.removeItem('bb_command_center_db_state_v2');
    localStorage.removeItem('bb_command_center_db_state');
    window.location.reload();
  }

  // Brands Portfolio Management (Multi-Brand Distributor Engine)
  public getBrands(status?: 'ACTIVE' | 'ALL'): Brand[] {
    if (status === 'ACTIVE') {
      return this.brands.filter(
        (b) => b.status === 'ACTIVE' && b.isActive !== false && (b as any).is_active !== false
      );
    }
    return this.brands;
  }

  public addBrand(brand: Brand): Brand {
    this.brands.push(brand);
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

  public setActiveBrandFilter(brand: BrandCode) {
    this.activeBrandFilter = brand;
    this.persistState();
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

  public getUserById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  public createUser(user: Omit<User, 'id'>): User {
    return this.addNewUser(user);
  }

  public addNewUser(user: Omit<User, 'id'> & { id?: string }): User {
    const newUser: User = {
      ...user,
      id: user.id || `user_${Date.now()}`,
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
      if (typeof window !== 'undefined') {
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

  public getCurrentUser(): User {
    if (typeof window !== 'undefined') {
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
    const found = this.users.find((u) => u.id === userId);
    if (found) {
      this.currentUser = found;
      if (typeof window !== 'undefined') {
        const now = Date.now();
        const { password: _p, ...safeUser } = found;
        const sessionData = {
          user: safeUser,
          createdAt: now,
          expiresAt: now + 24 * 60 * 60 * 1000,
          sessionId: `sess_${now}_${Math.random().toString(36).slice(2, 9)}`,
        };
        localStorage.setItem('bb_auth_user_session_v3', JSON.stringify(sessionData));
      }
      this.persistState();
    }
  }

  // Products & Combos Master

  public getProducts(brandCode?: BrandCode): Product[] {
    const user = this.getCurrentUser();
    let list = this.products;
    if (user.role === 'BRAND_MANAGER' && user.assignedBrands?.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((p) => user.assignedBrands.includes(p.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      return list.filter((p) => p.brandCode === brand);
    }
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
      id: `prod_${product.brandCode.toLowerCase()}_${Date.now()}`,
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
    if (user.role === 'BRAND_MANAGER' && user.assignedBrands?.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((c) => user.assignedBrands.includes(c.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      return list.filter((c) => c.brandCode === brand);
    }
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
  public getSecondaryOrders(filter?: { officerId?: string; storeId?: string }): SecondaryOrder[] {
    const user = this.getCurrentUser();
    let result = this.secondaryOrders;
    if (user.role === 'BRAND_MANAGER' && user.assignedBrands?.length > 0 && !user.assignedBrands.includes('ALL')) {
      result = result.filter((o) => {
        return o.items.some((item) => {
          const prod = this.products.find((p) => p.id === item.productId || p.name === item.productName);
          return prod ? user.assignedBrands.includes(prod.brandCode) : true;
        });
      });
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
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `SO-${dateStr}-${rand}`;
    const newOrder: SecondaryOrder = {
      ...order,
      id: `sec_ord_${Date.now()}`,
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
      id: `fa_${Date.now()}`,
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
      id: `dist_${Date.now()}`,
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
      id: `br_${Date.now()}`,
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
      id: `ret_${Date.now()}`,
      contacts: ret.contacts || [],
    };
    this.retailers.unshift(newRetailer);

    // Also add to today's beat if assigned to current officer
    if (this.currentUser.id === newRetailer.assignedOfficerId) {
      this.beatItems.push({
        id: `beat_${Date.now()}`,
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
        paymentTerms: dist?.creditTerms || '30 Days Net Cheque',
        outstandingBalance: branch.outstandingBalance || 85000,
        coordinates: branch.lat && branch.lng ? { lat: branch.lat, lng: branch.lng } : undefined,
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
        paymentTerms: retailer.creditTerms || 'COD',
        outstandingBalance: retailer.outstandingBalance || 0,
        coordinates: retailer.lat && retailer.lng ? { lat: retailer.lat, lng: retailer.lng } : undefined,
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
        paymentTerms: distributor.creditTerms || '15 Days Credit',
        outstandingBalance: 0,
        coordinates: undefined,
        assignedOfficerId: '',
        assignedOfficerName: 'Operations Lead',
        defaultMargins: distributor.defaultMargins,
      };
    }

    // Fallback store if referenced by a recognized name
    return {
      id: `store_${clean.replace(/[^a-z0-9]/g, '_')}`,
      name: decodeURIComponent(idOrName),
      type: 'RETAILER' as const,
      subType: 'Retail Partner',
      address: 'Kathmandu, Nepal',
      area: 'Kathmandu',
      contacts: [],
      primaryContactName: 'Store In-Charge',
      primaryContactPhone: '+977-9800000000',
      creditLimit: 0,
      creditPeriodDays: 0,
      paymentTerms: 'COD',
      outstandingBalance: 0,
      assignedOfficerId: '',
      assignedOfficerName: 'Field Officer',
      defaultMargins: undefined,
    };
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
        paymentTerms: d.creditTerms || '30 Days Net Cheque',
        healthScore: d.healthScore ?? 80,
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
        paymentTerms: r.creditTerms || '15 Days Cheque on Delivery',
        healthScore: r.healthScore ?? 75,
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
      id: `cnt_${Date.now()}`,
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

  public addDocumentType(name: string): DocumentTypeConfig {
    const newDocType: DocumentTypeConfig = {
      id: `doc_${Date.now()}`,
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
      id: `cat_${Date.now()}`,
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
    const storeName = store ? store.name : storeId;
    const isDist = store && store.type === 'DISTRIBUTOR';
    const newBeat: BeatItem = {
      id: `beat_override_${Date.now()}`,
      officerId,
      dateAd,
      dateBs: getTodayBs(),
      sequence: this.beatItems.length + 1,
      entityType: isDist ? 'BRANCH' : 'RETAILER',
      entityId: store ? store.id : storeId,
      storeName,
      storeType: store?.subType || 'Store',
      address: store?.address || 'Kathmandu',
      lat: store?.coordinates?.lat || 27.7172,
      lng: store?.coordinates?.lng || 85.324,
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

  public setOfficerLeave(
    officerId: string,
    startDateAd: string,
    endDateAd: string,
    coveringOfficerId?: string,
    storeIdsToReassign: string[] = []
  ): void {
    // 1. Mark officer on leave
    const officer = this.users.find((u) => u.id === officerId);
    if (officer) {
      officer.dutyStatus = 'ON_LEAVE';
    }

    // 2. Reassign requested beats
    if (coveringOfficerId && storeIdsToReassign.length > 0) {
      const coveringOfficer = this.users.find((u) => u.id === coveringOfficerId);
      this.beatItems.forEach((b) => {
        if (b.officerId === officerId && storeIdsToReassign.includes(b.entityId)) {
          b.officerId = coveringOfficerId;
          b.managerNotes = `${b.managerNotes ? b.managerNotes + ' • ' : ''}Covering for ${officer?.fullName || 'Officer'}`;
        }
      });
    }

    this.persistState();
  }

  // Beat Plan & GPS
  public getBeatItems(): BeatItem[] {
    return this.beatItems;
  }

  public getTodayBeat(officerId?: string): BeatItem[] {
    const targetOfficer = officerId || this.currentUser.id;
    if (this.currentUser.role === 'ADMIN' || this.currentUser.role === 'SUPER_ADMIN' || this.currentUser.isSuperAdmin) {
      return this.beatItems.filter((b) => !officerId || b.officerId === officerId);
    }
    return this.beatItems.filter((b) => b.officerId === targetOfficer);
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
      id: `vis_${Date.now()}`,
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
    syncManager.enqueue('STORE_CHECK_IN', visit as unknown as Record<string, unknown>);

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
      syncManager.enqueue('STORE_SKIPPED', { beatId, storeId: beat.entityId, storeName: beat.storeName, reason, notes } as unknown as Record<string, unknown>);
      this.persistState();
    }
  }

  // Real-Time Staff Tracking (PRD v2.2)
  public getStaffLiveLocations(): StaffLiveLocation[] {
    return this.staffLiveLocations;
  }

  public updateStaffPing(
    officerId: string,
    lat: number,
    lng: number,
    status: StaffLiveLocation['status'],
    storeName?: string
  ) {
    const staff = this.staffLiveLocations.find((s) => s.officerId === officerId);
    if (staff) {
      staff.currentLat = lat;
      staff.currentLng = lng;
      staff.lastPingTimestamp = new Date().toISOString();
      staff.status = status;
      if (storeName) {
        staff.currentStoreName = storeName;
        staff.timeAtCurrentStoreMinutes = 1;
        staff.todayRoute.push({
          storeName,
          arrivedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'IN_PROGRESS',
        });
      }
      this.persistState();
    }
  }

  // Multi-Photo Shelf Evidence (PRD v2.2)
  public getShelfPhotos(): ShelfPhoto[] {
    return this.shelfPhotos;
  }

  public recordShelfPhotos(photos: Omit<ShelfPhoto, 'id' | 'createdAt' | 'officerId' | 'officerName'>): ShelfPhoto {
    const item: ShelfPhoto = {
      ...photos,
      id: `sp_${Date.now()}`,
      officerId: this.currentUser.id,
      officerName: this.currentUser.fullName,
      createdAt: new Date().toISOString(),
    };
    this.shelfPhotos.unshift(item);
    syncManager.enqueue('SHELF_PHOTOS_SAVED', item as unknown as Record<string, unknown>);
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
      id: `call_${Date.now()}`,
      officerId: this.currentUser.id,
      officerName: this.currentUser.fullName,
      createdAt: new Date().toISOString(),
    };
    this.callLogs.unshift(item);
    syncManager.enqueue('CALL_LOGGED', item as unknown as Record<string, unknown>);
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
      id: `chq_${Date.now()}`,
      officerId: this.currentUser.id,
      officerName: this.currentUser.fullName,
      status: 'COLLECTED_IN_FIELD',
      history: [
        {
          id: `chqh_${Date.now()}`,
          newStatus: 'COLLECTED_IN_FIELD',
          changedBy: this.currentUser.fullName,
          notes: 'Cheque collected in field',
          timestamp: now,
        },
      ],
      createdAt: now,
    };

    this.cheques.unshift(newCheque);
    syncManager.enqueue('CHEQUE_COLLECTED', newCheque as unknown as Record<string, unknown>);
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
      id: `chqh_${Date.now()}`,
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
      id: `doc_${Date.now()}`,
      officerId,
      officerName,
      currentHolder: doc.currentHolder || `${officerName} (Field)`,
      timeline: doc.timeline && doc.timeline.length > 0 ? doc.timeline : [
        {
          id: `ce_${Date.now()}`,
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
    syncManager.enqueue('DOCUMENT_UPLOADED', newDoc as unknown as Record<string, unknown>);
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
      const recipient = details?.handedToUserName || 'Sita Gurung (Ops Desk)';
      doc.handedToUserName = recipient;
      doc.handoverDate = now.toISOString().split('T')[0];
      doc.currentHolder = recipient;
      doc.timeline.push({
        id: `ce_${Date.now()}`,
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
        id: `ce_${Date.now()}`,
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
        id: `ce_${Date.now()}`,
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
        userId: 'user_devansh',
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
      id: `disp_${Date.now()}`,
      createdBy: this.currentUser.fullName,
      createdAt: new Date().toISOString(),
      edits: [],
    };
    this.dispatches.unshift(newDispatch);
    syncManager.enqueue('DISPATCH_LOGGED', newDispatch as unknown as Record<string, unknown>);
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
      id: `de_${Date.now()}`,
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
      id: `sc_${Date.now()}`,
      officerId: this.currentUser.id,
      officerName: this.currentUser.fullName,
      createdAt: new Date().toISOString(),
    };
    this.stockCounts.unshift(newCount);
    syncManager.enqueue('STOCK_COUNT', newCount as unknown as Record<string, unknown>);
    this.persistState();
    return newCount;
  }

  // Orders
  public getOrders(brandCode?: BrandCode): Order[] {
    const user = this.getCurrentUser();
    let list = this.orders;
    if (user.role === 'BRAND_MANAGER' && user.assignedBrands?.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((o) => user.assignedBrands.includes(o.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      return list.filter((o) => o.brandCode === brand);
    }
    return list;
  }

  public addOrder(order: Omit<Order, 'id' | 'createdAt'>): Order {
    const newOrder: Order = {
      ...order,
      id: `ord_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    this.orders.unshift(newOrder);
    syncManager.enqueue('ORDER_CREATED', newOrder as unknown as Record<string, unknown>);

    // Update Customer 360 record
    let customer = this.customers.find((c) => c.phone === newOrder.customerPhone);
    if (customer) {
      customer.totalOrders += 1;
      customer.lastOrderDate = newOrder.orderDateAd;
      if (!customer.brandsPurchased.includes(newOrder.brandCode)) {
        customer.brandsPurchased.push(newOrder.brandCode);
      }
      const { updatedCustomer } = applyKarmaEvent(
        customer,
        'ORDER_PLACED',
        KARMA_RULES.ORDER_PLACED,
        `Order #${newOrder.orderNumber}`
      );
      customer = updatedCustomer;
    } else {
      const newCust: Customer = {
        id: `cust_${Date.now()}`,
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

    // Update influencer metrics if marketing send
    if (newOrder.isMarketing && newOrder.influencerId) {
      const inf = this.influencers.find((i) => i.id === newOrder.influencerId);
      if (inf) {
        inf.totalSends = (inf.totalSends || 0) + 1;
        inf.lastSendDate = newOrder.orderDateAd;
        inf.lastSendDateBs = newOrder.orderDateBs;
      }
    }

    this.logActivity('CREATED_ORDER', 'ORDER', newOrder.id, {
      orderNumber: newOrder.orderNumber,
      amount: newOrder.totalAmount,
      isMarketing: newOrder.isMarketing,
    });
    this.persistState();

    this.emitOrderRealtimeEvent({
      eventType: 'INSERT',
      new: newOrder,
    });

    return newOrder;
  }

  public updateOrder(
    id: string,
    updates: Partial<Order>,
    editorName?: string,
    editNote?: string
  ): Order | null {
    const idx = this.orders.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    const existing = this.orders[idx];
    const editHistory = existing.editHistory ? [...existing.editHistory] : [];
    if (editNote || editorName) {
      editHistory.unshift({
        timestamp: new Date().toISOString(),
        changedBy: editorName || 'Admin',
        note: editNote || 'Updated order details',
      });
    }

    this.orders[idx] = {
      ...existing,
      ...updates,
      editHistory,
    };
    this.persistState();

    this.emitOrderRealtimeEvent({
      eventType: 'UPDATE',
      new: this.orders[idx],
    });

    return this.orders[idx];
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('BB_ORDER_REALTIME', { detail: event }));
    }
  }

  public getLastCatalogUpdate() {
    const activeProds = this.products.filter((p) => p.active !== false);
    const activeCombos = this.combos.filter((c) => c.active !== false && c.isActive !== false);
    const activeBrands = this.brands.filter((b) => b.status !== 'ARCHIVED');
    return {
      activeProductsCount: activeProds.length,
      activeCombosCount: activeCombos.length,
      activeBrandsCount: activeBrands.length,
      lastUpdatedText: '2 hours ago',
      newProductsCount: 1,
      newCombosCount: 1,
    };
  }

  public incrementInfluencerSends(influencerId: string) {
    const inf = this.influencers.find((i) => i.id === influencerId);
    if (inf) {
      inf.totalSends = (inf.totalSends || 0) + 1;
      inf.lastSendDate = new Date().toISOString().split('T')[0];
      this.persistState();
    }
  }

  // Delivery Failures
  public getDeliveryFailures(brandCode?: BrandCode): DeliveryFailure[] {
    const user = this.getCurrentUser();
    let list = this.deliveryFailures;
    if (user.role === 'BRAND_MANAGER' && user.assignedBrands?.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((df) => user.assignedBrands.includes(df.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      return list.filter((df) => df.brandCode === brand);
    }
    return list;
  }

  public addDeliveryFailure(failure: Omit<DeliveryFailure, 'id' | 'createdAt'>): DeliveryFailure {
    const newDf: DeliveryFailure = {
      ...failure,
      id: `df_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.deliveryFailures.unshift(newDf);

    const customer = this.customers.find((c) => c.phone === newDf.customerPhone);
    if (customer) {
      customer.totalDeliveryFailures += 1;
      const { updatedCustomer } = applyKarmaEvent(
        customer,
        'DELIVERY_FAILURE',
        KARMA_RULES.DELIVERY_FAILURE,
        `Delivery failure: ${newDf.reason} (Order #${newDf.orderNumber})`
      );
      Object.assign(customer, updatedCustomer);
    }

    this.persistState();
    return newDf;
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
      const customer = this.customers.find((c) => c.phone === failure.customerPhone);
      if (customer) {
        applyKarmaEvent(
          customer,
          'ORDER_DELIVERED',
          KARMA_RULES.ORDER_DELIVERED,
          `Delivery reattempt delivered successfully: Order #${failure.orderNumber}`
        );
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
      this.logActivity('CHEQUE_BOUNCED', 'ORDER', failure.orderId, {
        action: 'DELIVERY_CANCELLED_BY_CUSTOMER',
        orderNumber: failure.orderNumber,
      });
    }

    this.persistState();
    return failure;
  }

  // Returns
  public getReturns(brandCode?: BrandCode): ReturnEntry[] {
    const user = this.getCurrentUser();
    let list = this.returns;
    if (user.role === 'BRAND_MANAGER' && user.assignedBrands?.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((r) => user.assignedBrands.includes(r.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      return list.filter((r) => r.brandCode === brand);
    }
    return list;
  }

  public addReturn(ret: Omit<ReturnEntry, 'id' | 'createdAt'>): ReturnEntry {
    const newRet: ReturnEntry = {
      ...ret,
      id: `ret_item_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.returns.unshift(newRet);

    for (const catName of newRet.issueCategories) {
      const found = this.reviewCategories.find((c) => c.name === catName);
      if (found) found.tickCount += 1;
    }

    const customer = this.customers.find((c) => c.phone === newRet.customerPhone);
    if (customer) {
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

    ret.orderStatus = resolution;
    syncManager.enqueue(
      'RETURN_RESOLUTION_UPDATED',
      { returnId, resolution, updatedBy: this.currentUser.fullName },
      '/api/returns/resolution'
    );
    this.persistState();
    return ret;
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
      id: `cat_${Date.now()}`,
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
    if (user.role === 'BRAND_MANAGER' && user.assignedBrands?.length > 0 && !user.assignedBrands.includes('ALL')) {
      list = list.filter((f) => user.assignedBrands.includes(f.brandCode));
    }
    const brand = brandCode || this.activeBrandFilter;
    if (brand && brand !== 'ALL') {
      return list.filter((f) => f.brandCode === brand);
    }
    return list;
  }

  public getFeedbackEntries(brandCode?: BrandCode): FeedbackEntry[] {
    return this.getFeedback(brandCode);
  }

  public addFeedback(fb: Omit<FeedbackEntry, 'id' | 'createdAt' | 'history'>): FeedbackEntry {
    const now = new Date().toISOString();
    const newFb: FeedbackEntry = {
      ...fb,
      id: `fb_${Date.now()}`,
      history: fb.type === 'COMPLAINT' ? [
        {
          id: `fsh_${Date.now()}`,
          newStatus: 'OPEN',
          changedBy: this.currentUser.fullName,
          notes: 'Complaint registered',
          timestamp: now,
        },
      ] : [],
      createdAt: now,
    };

    this.feedbackEntries.unshift(newFb);
    syncManager.enqueue('FEEDBACK_SUBMITTED', newFb as unknown as Record<string, unknown>);

    for (const catName of newFb.issueCategories) {
      const found = this.reviewCategories.find((c) => c.name === catName);
      if (found) found.tickCount += 1;
    }

    const customer = this.customers.find((c) => c.phone === newFb.customerPhone);
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

  public updateComplaintStatus(feedbackId: string, newStatus: ComplaintStatus, notes?: string) {
    const entry = this.feedbackEntries.find((f) => f.id === feedbackId);
    if (!entry) return;

    const oldStatus = entry.complaintStatus;
    const now = new Date().toISOString();
    entry.complaintStatus = newStatus;
    if (notes) entry.resolutionNotes = notes;

    if (!entry.history) entry.history = [];
    entry.history.unshift({
      id: `fsh_${Date.now()}`,
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
      id: `fsh_${Date.now()}`,
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

    syncManager.enqueue(
      'FEEDBACK_ASSIGNED',
      { feedbackId, officerId, officerName: assignedName, assignedBy: this.currentUser.fullName },
      '/api/feedback/assign'
    );
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
    return this.customers.find((c) => c.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''));
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
  public getTasks(assignedTo?: string): Task[] {
    if (assignedTo) {
      return this.tasks.filter((t) => t.assignedTo === assignedTo);
    }
    if (this.currentUser.role === 'SALES_OFFICER') {
      return this.tasks.filter((t) => t.assignedTo === this.currentUser.id);
    }
    return this.tasks;
  }

  public addTask(task: Omit<Task, 'id' | 'createdAt'>): Task {
    const newTask: Task = {
      ...task,
      id: `task_${Date.now()}`,
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

    syncManager.enqueue(
      'TASK_REASSIGNED',
      { taskId, officerId, officerName: assignedName, reassignedBy: this.currentUser.fullName },
      '/api/tasks/reassign'
    );
    this.persistState();
    return task;
  }

  public updateTaskPriority(taskId: string, priority: Priority): Task | null {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    task.priority = priority;

    syncManager.enqueue(
      'TASK_PRIORITY_UPDATED',
      { taskId, priority, updatedBy: this.currentUser.fullName },
      '/api/tasks/priority'
    );
    this.persistState();
    return task;
  }

  // Notifications
  public getNotifications(userId?: string): Notification[] {
    const uid = userId || this.currentUser.id;
    return this.notifications.filter((n) => n.userId === uid || n.userId === 'user_devansh');
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
      if (n.userId === uid || n.userId === 'user_devansh' || !userId) {
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
    return this.scorecards;
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

    const compliance = officerBeats.length > 0 ? Math.round((visited.length / officerBeats.length) * 1000) / 10 : 100;

    const summary: FieldOfficerDailySummary = {
      id: `sum_${officerId}_${Date.now()}`,
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
    const admins = this.users.filter((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');
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
    // 1. Order Regularity (30 pts)
    const storeOrders = this.secondaryOrders.filter((o) => o.entityId === storeId);
    let regularity = 15;
    if (storeOrders.length >= 3) regularity = 30;
    else if (storeOrders.length === 2) regularity = 22;
    else if (storeOrders.length === 1) regularity = 15;
    else regularity = 8;

    // 2. Payment Discipline (25 pts)
    const storeCheques = this.cheques.filter((c) => c.entityId === storeId);
    const bounced = storeCheques.filter((c) => c.status === 'BOUNCED');
    let paymentDiscipline = 25;
    if (bounced.length > 0) {
      paymentDiscipline = 0;
    } else {
      const overdue = storeCheques.filter((c) => c.status === 'DELAYED');
      if (overdue.length > 0) paymentDiscipline = 12;
      else paymentDiscipline = 25;
    }

    // 3. Stock Maintenance (25 pts)
    const storeStocks = this.stockCounts.filter((s) => s.entityId === storeId);
    const lowStocks = storeStocks.flatMap((s) => s.items).filter((i) => i.shelfQty < 5);
    let stockMaintenance = 22;
    if (lowStocks.length === 0) stockMaintenance = 25;
    else if (lowStocks.length <= 2) stockMaintenance = 16;
    else stockMaintenance = 8;

    // 4. Visit Cooperation (20 pts)
    const storeBeats = this.beatItems.filter((b) => b.entityId === storeId);
    const visited = storeBeats.filter((b) => b.status === 'VISITED');
    let visitCooperation = 18;
    if (storeBeats.length > 0) {
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
      issueRate: 5,
      trend: overall >= 65 ? 'UP' : overall < 45 ? 'DOWN' : 'STABLE',
      previousScore: Math.max(20, overall - 4),
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
      while (remaining.length > 0) {
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

    // Provide default fallback bestsellers if local order history is sparse
    if (Object.keys(countsByProduct).length === 0) {
      return this.products.slice(0, 5).map((p, idx) => ({
        productId: p.id,
        name: p.name,
        unitsMoved: (5 - idx) * 20,
        storeCount: Math.max(1, 5 - idx),
      }));
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
      return this.products.slice(0, 2).map((p, idx) => ({
        productId: p.id,
        productName: p.name,
        currentStock: idx === 0 ? 8 : 2,
        depletionRate: idx === 0 ? 1.5 : 0.8,
        daysUntilEmpty: idx === 0 ? 5 : 2,
        suggestedReorder: idx === 0 ? 30 : 15,
        urgent: idx === 1,
      }));
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
    order.status = 'DELIVERED';
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
      dueDateBs: d.paymentDueDateBs || '2083-06-01',
      paymentStatus: d.paymentStatus || 'PENDING',
      amountDue: d.amountDue || 25000,
      collectedDateBs: d.collectionDateBs || null,
      delayDays: d.paymentDelayDays || 0,
      paymentTerms: d.paymentTerms || '15-day credit',
    }));
  }

  // Morning Brief Data (Fix 31)
  public getMorningBriefData(user?: User) {
    const activeUser = user || this.currentUser;
    const isOfficer = activeUser.role === 'SALES_OFFICER';
    const isBrandMgr = activeUser.role === 'BRAND_MANAGER';

    // Filtered collections
    let filteredOrders = this.orders;
    let filteredFailures = this.deliveryFailures;
    let filteredReturns = this.returns;
    let filteredFeedback = this.feedbackEntries;

    if (isBrandMgr) {
      filteredOrders = filteredOrders.filter((o) => activeUser.assignedBrands.includes(o.brandCode));
      filteredFailures = filteredFailures.filter((f) => activeUser.assignedBrands.includes(f.brandCode));
      filteredReturns = filteredReturns.filter((r) => activeUser.assignedBrands.includes(r.brandCode));
      filteredFeedback = filteredFeedback.filter((fb) => activeUser.assignedBrands.includes(fb.brandCode));
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
        foryaOrders: filteredOrders.filter((o) => o.brandCode === 'FORYA').length,
        peeSafeOrders: filteredOrders.filter((o) => o.brandCode === 'PEE_SAFE').length,
        reneeOrders: filteredOrders.filter((o) => o.brandCode === 'RENEE').length,
        deliveryFailures: filteredFailures.length,
        deliveryFailuresReason: 'Call not received',
        returnsCount: filteredReturns.length,
        complaintsCount: filteredFeedback.filter((f) => f.type === 'COMPLAINT').length,
        resolvedComplaints: filteredFeedback.filter((f) => f.type === 'COMPLAINT' && f.complaintStatus === 'RESOLVED').length,
        storeVisits: `${visitedBeats.length}/${beatItems.length || 6}`,
        compliancePct: beatItems.length > 0 ? Math.round((visitedBeats.length / beatItems.length) * 100) : 80,
        callsMade: this.callLogs.length || 22,
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
    record: Omit<DataImportRecord, 'id' | 'importedAt'>,
    entities: {
      orders?: Order[];
      returns?: ReturnEntry[];
      retailers?: Retailer[];
      distributors?: Distributor[];
      branches?: Branch[];
      products?: Product[];
    }
  ): { success: boolean; record: DataImportRecord } {
    const importRecord: DataImportRecord = {
      ...record,
      id: this.generateId('imp'),
      importedAt: new Date().toISOString(),
    };

    if (entities.orders && entities.orders.length > 0) {
      // Deduplicate orders
      const existingIds = new Set(this.orders.map((o) => o.orderNumber));
      const freshOrders = entities.orders.filter((o) => !existingIds.has(o.orderNumber));
      this.orders.push(...freshOrders);
      importRecord.importedCount = freshOrders.length;
      importRecord.skippedCount = entities.orders.length - freshOrders.length;
    }

    if (entities.returns && entities.returns.length > 0) {
      this.returns.push(...entities.returns);
      importRecord.importedCount = entities.returns.length;
    }

    if (entities.products && entities.products.length > 0) {
      this.products.push(...entities.products);
      importRecord.importedCount = entities.products.length;
    }

    if (entities.retailers && entities.retailers.length > 0) {
      this.retailers.push(...entities.retailers);
      importRecord.importedCount = entities.retailers.length;
    }

    if (entities.distributors && entities.distributors.length > 0) {
      this.distributors.push(...entities.distributors);
      importRecord.importedCount = entities.distributors.length;
    }

    this.importHistory.unshift(importRecord);
    this.persistState();

    this.logActivity('Imported Batch Data', 'DATA_IMPORT', importRecord.id, {
      sourceType: importRecord.sourceType,
      fileName: importRecord.fileName,
      count: importRecord.importedCount,
    });

    return { success: true, record: importRecord };
  }

  public getImportHistory(): DataImportRecord[] {
    return this.importHistory;
  }

  public rollbackImport(importId: string): boolean {
    const rec = this.importHistory.find((i) => i.id === importId);
    if (!rec || rec.rolledBack) return false;

    rec.rolledBack = true;
    this.persistState();
    this.logActivity('Rolled Back Data Import', 'DATA_IMPORT', importId, { fileName: rec.fileName });
    return true;
  }

  // Role-Based Data Filtering (Fix 26b)
  public getFilteredOrders(user?: User): Order[] {
    const activeUser = user || this.currentUser;
    let list = this.orders;
    if (activeUser.role === 'BRAND_MANAGER') {
      list = list.filter((o) => activeUser.assignedBrands.includes(o.brandCode));
    }
    if (this.activeBrandFilter && this.activeBrandFilter !== 'ALL') {
      list = list.filter((o) => o.brandCode === this.activeBrandFilter);
    }
    return list;
  }

  public getFilteredBeatItems(user?: User): BeatItem[] {
    const activeUser = user || this.currentUser;
    if (activeUser.role === 'SALES_OFFICER') {
      return this.beatItems.filter((b) => b.officerId === activeUser.id);
    }
    return this.beatItems;
  }

  public getFilteredCheques(user?: User): Cheque[] {
    const activeUser = user || this.currentUser;
    if (activeUser.role === 'SALES_OFFICER') {
      return this.cheques.filter((c) => c.officerId === activeUser.id);
    }
    return this.cheques;
  }

  public getFilteredStores(user?: User): StoreEntity[] {
    const activeUser = user || this.currentUser;
    const branches: StoreEntity[] = this.branches.map((b) => ({ entityType: 'BRANCH', ...b }));
    const retailers: StoreEntity[] = this.retailers.map((r) => ({ entityType: 'RETAILER', ...r }));
    let combined = [...branches, ...retailers];

    if (activeUser.role === 'SALES_OFFICER') {
      combined = combined.filter((s) => s.assignedOfficerId === activeUser.id);
    }
    return combined;
  }

  public getStores(user?: User): StoreEntity[] {
    return this.getFilteredStores(user);
  }

  public getFilteredTasks(user?: User): Task[] {
    const activeUser = user || this.currentUser;
    if (activeUser.role === 'SALES_OFFICER') {
      return this.tasks.filter((t) => t.assignedTo === activeUser.id);
    }
    return this.tasks;
  }

  public getFilteredShelfPhotos(user?: User): ShelfPhoto[] {
    const activeUser = user || this.currentUser;
    if (activeUser.role === 'SALES_OFFICER') {
      return this.shelfPhotos.filter((p) => p.officerId === activeUser.id);
    }
    return this.shelfPhotos;
  }

  public getFilteredCallLogs(user?: User): CallLog[] {
    const activeUser = user || this.currentUser;
    if (activeUser.role === 'SALES_OFFICER') {
      return this.callLogs.filter((c) => c.officerId === activeUser.id);
    }
    return this.callLogs;
  }

  public getFilteredDocuments(user?: User): HandoverDocument[] {
    const activeUser = user || this.currentUser;
    if (activeUser.role === 'SALES_OFFICER') {
      return this.documents.filter((d) => d.officerId === activeUser.id);
    }
    return this.documents;
  }

  public getFilteredScorecards(user?: User): OfficerScorecard[] {
    const activeUser = user || this.currentUser;
    if (activeUser.role === 'SALES_OFFICER') {
      return this.scorecards.filter((s) => s.officerId === activeUser.id);
    }
    return this.scorecards;
  }

  public getFilteredDeliveryFailures(user?: User): DeliveryFailure[] {
    const activeUser = user || this.currentUser;
    let list = this.deliveryFailures;
    if (activeUser.role === 'BRAND_MANAGER') {
      list = list.filter((f) => activeUser.assignedBrands.includes(f.brandCode));
    }
    return list;
  }

  public getFilteredReturns(user?: User): ReturnEntry[] {
    const activeUser = user || this.currentUser;
    let list = this.returns;
    if (activeUser.role === 'BRAND_MANAGER') {
      list = list.filter((r) => activeUser.assignedBrands.includes(r.brandCode));
    }
    return list;
  }

  public getFilteredFeedback(user?: User): FeedbackEntry[] {
    const activeUser = user || this.currentUser;
    let list = this.feedbackEntries;
    if (activeUser.role === 'BRAND_MANAGER') {
      list = list.filter((f) => activeUser.assignedBrands.includes(f.brandCode));
    }
    return list;
  }

  // =========================================================================
  // FIX 60 & 61: INFLUENCER DIRECTORY, TRACKING & MARKETING SENDS
  // =========================================================================
  public getInfluencers(filter?: {
    platform?: string;
    qualityRating?: string;
    brandCode?: string;
    search?: string;
  }): Influencer[] {
    let result = [...this.influencers];
    if (filter) {
      if (filter.platform && filter.platform !== 'ALL') {
        result = result.filter((inf) =>
          inf.platforms.some((p) => p.platform.toLowerCase() === filter.platform!.toLowerCase())
        );
      }
      if (filter.qualityRating && filter.qualityRating !== 'ALL') {
        result = result.filter((inf) => inf.qualityRating === filter.qualityRating);
      }
      if (filter.search && filter.search.trim()) {
        const q = filter.search.toLowerCase().trim();
        result = result.filter(
          (inf) =>
            inf.name.toLowerCase().includes(q) ||
            inf.platforms.some((p) => p.handle.toLowerCase().includes(q)) ||
            (inf.city && inf.city.toLowerCase().includes(q))
        );
      }
    }
    return result;
  }

  public getInfluencerById(id: string): Influencer | undefined {
    return this.influencers.find((inf) => inf.id === id);
  }

  public createInfluencer(
    data: Omit<Influencer, 'id' | 'createdAt' | 'totalSends' | 'totalContent'>
  ): Influencer {
    const newInfluencer: Influencer = {
      ...data,
      id: this.generateId('inf'),
      totalSends: 0,
      totalContent: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.influencers.unshift(newInfluencer);
    this.persistState();
    this.logActivity('Influencer Created', 'INFLUENCER', newInfluencer.id, { name: newInfluencer.name });
    return newInfluencer;
  }

  public updateInfluencer(id: string, updates: Partial<Influencer>): Influencer | undefined {
    const index = this.influencers.findIndex((inf) => inf.id === id);
    if (index === -1) return undefined;
    this.influencers[index] = { ...this.influencers[index], ...updates };
    this.persistState();
    this.logActivity('Influencer Updated', 'INFLUENCER', id, updates);
    return this.influencers[index];
  }

  public deleteInfluencer(id: string): boolean {
    const prevLen = this.influencers.length;
    this.influencers = this.influencers.filter((inf) => inf.id !== id);
    this.influencerContent = this.influencerContent.filter((c) => c.influencerId !== id);
    this.persistState();
    return this.influencers.length < prevLen;
  }

  public getInfluencerContent(influencerId?: string): InfluencerContent[] {
    if (influencerId) {
      return this.influencerContent.filter((c) => c.influencerId === influencerId);
    }
    return this.influencerContent;
  }

  public addInfluencerContent(
    data: Omit<InfluencerContent, 'id' | 'createdAt'>
  ): InfluencerContent {
    const newContent: InfluencerContent = {
      ...data,
      id: this.generateId('cnt'),
      createdAt: new Date().toISOString(),
    };
    this.influencerContent.unshift(newContent);

    // Update parent influencer metrics
    const inf = this.influencers.find((i) => i.id === data.influencerId);
    if (inf) {
      inf.totalContent = (inf.totalContent || 0) + 1;
      inf.lastContentDate = data.datePostedAd;
      inf.lastContentDateBs = data.datePostedBs;
      if (inf.qualityRating === 'NOT_RATED') {
        inf.qualityRating = 'AVERAGE'; // Upgrade to average once content is delivered
      }
    }

    this.persistState();
    this.logActivity('Influencer Content Logged', 'INFLUENCER_CONTENT', newContent.id, {
      influencerId: data.influencerId,
      url: data.url,
      brandCode: data.brandCode,
    });
    return newContent;
  }

  public deleteInfluencerContent(id: string): boolean {
    const target = this.influencerContent.find((c) => c.id === id);
    if (!target) return false;
    this.influencerContent = this.influencerContent.filter((c) => c.id !== id);

    const inf = this.influencers.find((i) => i.id === target.influencerId);
    if (inf && inf.totalContent > 0) {
      inf.totalContent -= 1;
    }

    this.persistState();
    return true;
  }

  public getMarketingOrders(brandCode?: BrandCode): Order[] {
    return this.orders.filter((o) => {
      if (!o.isMarketing) return false;
      if (brandCode && brandCode !== 'ALL' && o.brandCode !== brandCode) return false;
      return true;
    });
  }

  public toggleOrderContentReceived(orderId: string, received?: boolean): Order | undefined {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return undefined;
    const nextVal = received !== undefined ? received : !order.contentReceived;
    order.contentReceived = nextVal;

    // Also update influencer stats
    if (order.influencerId) {
      const inf = this.influencers.find((i) => i.id === order.influencerId);
      if (inf) {
        if (nextVal && (!inf.qualityRating || inf.qualityRating === 'NOT_RATED' || inf.qualityRating === 'POOR')) {
          inf.qualityRating = 'AVERAGE';
        }
      }
    }

    this.persistState();
    this.logActivity('Marketing Content Receipt Toggled', 'ORDER', orderId, { contentReceived: received });
    return order;
  }

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
    const token = 'bb_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
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
    const log: ActivityLog = {
      id: `act_${Date.now()}`,
      userName: this.currentUser.fullName,
      userRole: this.currentUser.role,
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
  }
}

export const db = new DatabaseService();
