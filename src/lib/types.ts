// Brand Bucket Command Center — Type Definitions (v2.2)

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'BRAND_MANAGER'
  | 'SALES_OFFICER'
  | 'DATA_ENTRY'
  | 'VIEWER';

export type BrandCode = string;

export type DutyStatus = 'ONLINE' | 'IN_FIELD' | 'ON_BREAK' | 'OFFLINE' | 'ON_LEAVE';

import type { UserCustomPermissions } from './permissions';

export interface UserPermissions {
  canViewAnalytics: boolean;
  canExportSheets: boolean;
  canManageDispatches: boolean;
  canManageCheques: boolean;
  canApproveSkips: boolean;
  canManageStaff: boolean;
  canConfigureSettings: boolean;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  name?: string;
  role?: string;
  password?: string;
  passwordHash?: string;
  assignedBrands?: BrandCode[];
  assigned_brands?: string[];
  assignedArea?: string;
  territory?: string;
  phone: string;
  avatar?: string;
  active?: boolean;
  is_active?: boolean;
  deactivatedAt?: string;
  dutyStatus?: DutyStatus;
  dutyStartedAt?: string;
  isSuperAdmin?: boolean;
  is_super_admin?: boolean;
  permissions?: any;
  customPermissions?: any;
  calendarPreference?: 'BS' | 'AD' | 'BOTH';
  calendar_preference?: 'BS' | 'AD' | 'BOTH';
  reportsToId?: string;
  reports_to_id?: string | null;
}

export type BrandCategory =
  | 'Cosmetics'
  | 'Personal Care'
  | 'Hygiene'
  | 'Baby Care'
  | 'Wellness'
  | 'Fragrance'
  | 'Other';

export interface Brand {
  id: string;
  code: BrandCode;
  name: string;
  category?: BrandCategory;
  color: string;
  description: string;
  logoUrl?: string;
  principalCompany?: string;
  originCountry?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  status?: 'ACTIVE' | 'PILOT' | 'PAUSED' | 'ARCHIVED';
  isActive?: boolean;
  marginStructure?: {
    distributorMarginPct: number;
    retailerMarginPct: number;
  };
  assignedManagerId?: string;
  assignedManagerName?: string;
}

export interface Product {
  id: string;
  brandId: string;
  brandCode: BrandCode;
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  costPrice?: number;
  dtpPrice?: number; // Distributor Transfer Price (Wholesale)
  wholesalePrice?: number; // Retailer Purchase Price (RPP)
  mrp: number;
  caseSize?: number; // e.g. 24 units per box
  thresholdQty: number;
  keywords: string[];
  extractorKeywords?: string[];
  imageUrl?: string;
  isCombo?: boolean;
  comboItems?: { productId: string; productName: string; quantity: number }[];
  active?: boolean;
  stockQty?: number; // Current warehouse stock units
  orderUnitMode?: 'CASES' | 'PIECES' | 'BOTH';
}

export interface ComboItem {
  productId: string;
  productName: string;
  quantity: number;
  mrp: number;
}

export interface Combo {
  id: string;
  brandCode: BrandCode;
  name: string;
  sku: string;
  description: string;
  componentProductIds?: string[];
  items: ComboItem[];
  totalOriginalMrp: number;
  comboPrice: number;
  comboMrp?: number;
  savingsPct: number;
  extractorKeywords?: string[];
  priceDetectionEnabled?: boolean;
  imageUrl?: string;
  active: boolean;
  isActive?: boolean;
  createdAt: string;
  stockQty?: number; // Available assembled kits
  editHistory?: { timestamp: string; changedBy: string; note: string; previousMrp?: number; newMrp?: number }[];
}

export type ContactRole =
  | 'Owner'
  | 'Store Manager'
  | 'Floor Supervisor'
  | 'Accounts / Cheque'
  | 'Receiving Bay'
  | 'Sales Representative';

export interface VendorContact {
  id: string;
  name: string;
  role: ContactRole;
  phone: string;
  alternatePhone?: string;
  email?: string;
  isPrimary: boolean;
  isFlaggedForRemoval?: boolean;
  flaggedById?: string;
  flaggedByName?: string;
  flaggedReason?: string;
  flaggedAt?: string;
  addedById?: string;
  storeId?: string;
  branchId?: string;
}

export type StoreType = 'DISTRIBUTOR' | 'CHAIN_STORE' | 'STANDALONE_RETAILER';
export type StoreMarginType = 'MARKUP' | 'MARKDOWN';

export interface StoreMargin {
  pct: number;
  type: StoreMarginType;
}

export type DefaultMargins = Record<string, StoreMargin>;

export interface StoreContact {
  id: string;
  storeId?: string;
  branchId?: string;
  name: string;
  role: string;
  phone: string;
  email?: string;
  isPrimary: boolean;
  isFlaggedForRemoval?: boolean;
  flaggedById?: string;
  flaggedByName?: string;
  flaggedReason?: string;
  flaggedAt?: string;
  addedById?: string;
  createdAt?: string;
}

export interface Distributor {
  id: string;
  name: string;
  type: 'Distributor' | 'Retail Chain' | 'Pharmacy Chain' | 'Wholesale';
  storeType?: StoreType;
  city: string;
  address?: string;
  province?: string;
  valley?: 'Inside' | 'Outside';
  lat?: number;
  lng?: number;
  contactName: string;
  contactRole: string;
  contactPhone: string;
  contactEmail: string;
  contacts: VendorContact[];
  brandsCarried: BrandCode[];
  defaultMargins?: DefaultMargins;
  vatRegistered?: boolean;
  healthScore?: number;
  hasBranches?: boolean;
  notes?: string;
  creditTerms?: string;
}

export interface Branch {
  id: string;
  distributorId: string;
  distributorName: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  assignedOfficerId: string;
  assignedOfficerName: string;
  contactName: string;
  contactRole: string;
  contactPhone: string;
  contacts: VendorContact[];
  brandsAvailable: BrandCode[];
  defaultMargins?: DefaultMargins;
  creditLimit?: number;
  outstandingBalance?: number;
  overdueBalance?: number;
  overdueDays?: number;
  bouncedChequesCount?: number;
  isCreditLocked?: boolean;
  lastVisitDate?: string;
  lastVisitDaysAgo?: number;
}

export interface Retailer {
  id: string;
  name: string;
  type: 'GT' | 'Kirana' | 'Pharmacy' | 'Cosmetics' | 'Other';
  storeType?: StoreType;
  category?: string;
  city: string;
  area: string;
  province?: string;
  valley?: 'Inside' | 'Outside';
  address: string;
  lat: number;
  lng: number;
  distributorId?: string;
  distributorName?: string;
  assignedOfficerId: string;
  assignedOfficerName: string;
  contactName: string;
  contactRole: string;
  contactPhone: string;
  contacts: VendorContact[];
  brandsStocked: BrandCode[];
  defaultMargins?: DefaultMargins;
  vatRegistered?: boolean;
  healthScore?: number;
  notes?: string;
  creditTerms?: string;
  creditLimit?: number;
  outstandingBalance?: number;
  overdueBalance?: number;
  overdueDays?: number;
  bouncedChequesCount?: number;
  isCreditLocked?: boolean;
  lastVisitDate?: string;
  lastVisitDaysAgo?: number;
}

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

export interface SecondaryOrderItem {
  productId: string;
  productName: string;
  brandCode: BrandCode;
  cases: number;
  unitsPerCase: number;
  totalUnits: number;
  unitPrice: number;
  totalAmount: number;
  freeUnits?: number;
  appliedScheme?: string;
}

export interface SecondaryOrder {
  id: string;
  orderNumber: string;
  beatId?: string;
  officerId: string;
  officerName: string;
  entityType: 'BRANCH' | 'RETAILER';
  entityId: string;
  storeName: string;
  contactName: string;
  contactPhone: string;
  orderDateAd: string;
  orderDateBs: string;
  items: SecondaryOrderItem[];
  totalAmount: number;
  totalUnits: number;
  status: 'PENDING_DISPATCH' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  distributorId?: string;
  distributorName?: string;
  brandMargins?: Record<string, { pct: number; type: StoreMarginType; perUnitPrices?: Record<string, number> }>;
  paymentTerms?: string;
  notes?: string;
  proFormaUrl?: string;
  orderPhotoUrl?: string;
  createdAt: string;
}

export interface FacingItem {
  brandName: string;
  isOwnBrand: boolean;
  facingCount: number;
}

export interface FacingAudit {
  id: string;
  storeId: string;
  storeName: string;
  officerId: string;
  dateAd: string;
  dateBs: string;
  facings: FacingItem[];
  ownSharePct: number;
  notes?: string;
  createdAt: string;
}

export type StoreEntity =
  | ({ entityType: 'BRANCH' } & Branch)
  | ({ entityType: 'RETAILER' } & Retailer);

export type BeatStatus = 'PENDING' | 'VISITED' | 'SKIPPED';
export type SkipReason =
  | 'Other task assigned'
  | 'Store closed'
  | 'Travel issue'
  | 'No time'
  | 'Already visited yesterday';

export interface BeatItem {
  id: string;
  officerId: string;
  dateAd: string;
  dateBs: string;
  sequence: number;
  entityType: 'BRANCH' | 'RETAILER';
  entityId: string;
  storeName: string;
  branchName?: string;
  storeType: string;
  address: string;
  lat: number;
  lng: number;
  contactName: string;
  contactPhone: string;
  contacts: VendorContact[];
  lastVisitDaysAgo: number;
  pendingTasks: string[];
  status: BeatStatus;
  skipReason?: SkipReason;
  skipNotes?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  checkOutLat?: number;
  checkOutLng?: number;
  checkInDistanceM?: number;
  checkOutDistanceM?: number;
  idleTimeMinutes?: number;
  suspiciousFlags?: string[];
  checkInPhotoUrl?: string;
  oneTimeOverride?: boolean;
  priority?: 'HIGH' | 'MEDIUM' | 'ROUTINE';
  managerNotes?: string;
  urgencySignals?: {
    type: 'LOW_STOCK' | 'DORMANT' | 'TASK' | 'DISPATCH' | 'OFFER';
    label: string;
    color: 'red' | 'amber' | 'blue' | 'green';
  }[];
  estimatedVisitMinutes?: number;
  distanceFromPreviousKm?: number;
}

export interface Visit {
  id: string;
  officerId: string;
  officerName: string;
  entityType: 'BRANCH' | 'RETAILER';
  entityId: string;
  storeName: string;
  checkInTime: string;
  checkOutTime?: string;
  durationMinutes?: number;
  lat: number;
  lng: number;
  distanceMeters: number;
  overrideFlag: boolean;
  overrideReason?: string;
  dateAd: string;
  dateBs: string;
  notes?: string;
}

export interface DispatchItem {
  productId: string;
  productName: string;
  brandCode: BrandCode;
  quantity: number;
  quantityPcs?: number;
}

export interface Dispatch {
  id: string;
  distributorId: string;
  distributorName: string;
  branchId?: string;
  branchName?: string;
  dispatchDateAd: string;
  dispatchDateBs: string;
  documentUrl?: string;
  notes?: string;
  items: DispatchItem[];
  createdBy: string;
  createdAt: string;
  edits?: DispatchEdit[];
  paymentTerms?: string;
  paymentDueDateAd?: string;
  paymentDueDateBs?: string;
  paymentStatus?: 'PENDING' | 'PARTIAL' | 'COLLECTED' | 'OVERDUE';
  amountDue?: number;
  collectionDateAd?: string;
  collectionDateBs?: string;
  collectionMethod?: 'Bank Transfer' | 'Cash' | 'Cheque' | 'Other';
  collectedBy?: string;
  paymentDelayDays?: number;
}

export interface DispatchEdit {
  id: string;
  dispatchId: string;
  productId: string;
  productName: string;
  oldQty: number;
  newQty: number;
  changedBy: string;
  reason: string;
  createdAt: string;
}

export interface StockCountItem {
  productId: string;
  productName: string;
  brandCode: BrandCode;
  shelfQty: number;
  previousQty: number;
  flaggedDrop: boolean; // >50% drop
  openingQty?: number;
  restockedQty?: number;
  damagedQty?: number;
}

export interface StockCount {
  id: string;
  visitId?: string;
  officerId: string;
  officerName: string;
  entityType: 'BRANCH' | 'RETAILER';
  entityId: string;
  storeName: string;
  dateAd: string;
  dateBs: string;
  items: StockCountItem[];
  createdAt: string;
}

export interface ShelfPhoto {
  id: string;
  visitId?: string;
  officerId: string;
  officerName: string;
  entityType: 'BRANCH' | 'RETAILER';
  entityId: string;
  storeName: string;
  beforePhotoUrls: string[];
  afterPhotoUrls: string[];
  rackSection?: string; // e.g. "Main Eye-Level Rack", "Floor Display Stand"
  dateAd: string;
  dateBs: string;
  createdAt: string;
}

export type CallLabel =
  | 'Order Taking'
  | 'Payment Follow-up'
  | 'Stock Inquiry'
  | 'Complaint Resolution'
  | 'General Check-in'
  | 'No Answer'
  | 'Meeting Scheduled';

export type CallOutcome =
  | 'Order Received'
  | 'Payment Promised'
  | 'Issue Resolved'
  | 'Follow-up Needed'
  | 'Callback Requested'
  | 'No Outcome';

export interface CallLog {
  id: string;
  officerId: string;
  officerName: string;
  entityType?: 'BRANCH' | 'RETAILER';
  entityId?: string;
  storeName: string;
  contactName: string;
  contactPhone: string;
  durationSeconds: number;
  label: CallLabel;
  outcome: CallOutcome;
  isManual: boolean;
  screenshotUrl?: string;
  notes?: string;
  dateAd: string;
  dateBs: string;
  createdAt: string;
  createdOrderId?: string;
}

export type ChequeStatus =
  | 'COLLECTED_IN_FIELD'
  | 'HANDED_OVER_AT_OFFICE'
  | 'PENDING'
  | 'CASHED'
  | 'DELAYED'
  | 'BOUNCED'
  | 'LOST';

export interface ChequeHistory {
  id: string;
  previousStatus?: ChequeStatus;
  newStatus: ChequeStatus;
  changedBy: string;
  notes?: string;
  timestamp: string;
}

export interface Cheque {
  id: string;
  entityType: 'BRANCH' | 'RETAILER';
  entityId: string;
  storeName: string;
  officerId: string;
  officerName: string;
  chequeNumber: string;
  amount: number;
  bankName: string;
  receivedDateAd: string;
  receivedDateBs: string;
  cashDateAd: string;
  cashDateBs: string;
  photoUrl: string;
  status: ChequeStatus;
  handedOverTo?: string; // Name of office person
  handedOverToId?: string;
  handoverTimestamp?: string;
  delayedReason?: string;
  newExpectedDate?: string;
  notes?: string;
  history: ChequeHistory[];
  createdAt: string;
}

export interface CustodyEvent {
  id: string;
  action: 'COLLECTED' | 'HANDED_OVER' | 'FILED' | 'MISSING';
  actorName: string;
  recipientName?: string;
  locationOrFolder?: string;
  notes?: string;
  timestamp: string;
  formattedTime?: string;
  dateBs?: string;
}

export interface HandoverDocument {
  id: string;
  entityType: 'BRANCH' | 'RETAILER';
  entityId: string;
  storeName: string;
  officerId: string;
  officerName: string;
  documentType: string;
  documentTypeId?: string;
  docDateAd: string;
  docDateBs: string;
  referenceNumber?: string;
  photoUrls: string[];
  pages?: string[];
  handedToUserName?: string;
  handoverDate?: string;
  filedLocation?: string;
  currentHolder?: string;
  timeline?: CustodyEvent[];
  status: 'COLLECTED' | 'HANDED_OVER' | 'FILED' | 'MISSING';
  notes?: string;
  createdAt: string;
}

export interface DocumentTypeConfig {
  id: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
}

export interface StoreCategoryConfig {
  id: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
}


export interface OrderItem {
  productId: string;
  productName: string;
  brandCode: BrandCode;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export type OrderPlatform =
  | 'Instagram'
  | 'Messenger'
  | 'WhatsApp'
  | 'Website'
  | 'TikTok'
  | 'Walk-in'
  | 'Pathao Bazaar'
  | 'Phone Call'
  | 'Field Order'
  | 'YouTube'
  | 'Facebook'
  | 'Other';

export type DeliveryMethod =
  | 'Standard'
  | 'Pathao'
  | 'InDrive'
  | 'Yango'
  | 'Pick-up';

export type OrderStatus =
  | 'PENDING'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETURNED'
  | 'EXCHANGED';

export interface Order {
  id: string;
  orderNumber: string;
  brandCode: BrandCode;
  orderDateAd: string;
  orderDateBs: string;
  platform: OrderPlatform;
  customerName: string;
  customerPhone: string;
  province: string;
  district: string;
  address: string;
  deliveryMethod: DeliveryMethod;
  paymentTerms: 'COD' | 'Prepaid' | 'Credit 15 days' | 'Credit 30 days' | 'Advance';
  orderType: 'NEW' | 'REPEAT';
  items: OrderItem[];
  totalAmount: number;
  statedPrice?: number;
  status: OrderStatus;
  source: 'WHATSAPP_EXTRACTOR' | 'MANUAL' | 'FIELD_CALL' | 'Extractor' | 'Manual' | 'Field';
  linkedCallId?: string;
  orderDocUrl?: string;
  notes?: string;
  isMarketing?: boolean;
  influencerId?: string;
  influencerHandle?: string;
  contentReceived?: boolean;
  editHistory?: { timestamp: string; changedBy: string; note: string }[];
  createdAt: string;
  deliveryProof?: {
    photoUrl: string;
    deliveredBy: string;
    recipientName?: string;
    deliveryDateAd: string;
    deliveryDateBs: string;
    deliveryTime?: string;
    notes?: string;
    uploadedAt?: string;
  };
}

export type DeliveryFailureStatus =
  | 'FAILED'
  | 'REATTEMPT_SCHEDULED'
  | 'DELIVERED'
  | 'RETURNED_TO_WAREHOUSE'
  | 'CANCELLED';

export interface DeliveryFailure {
  id: string;
  orderId: string;
  orderNumber: string;
  brandCode: BrandCode;
  customerName: string;
  customerPhone: string;
  productName?: string;
  deliveryMethod?: 'Standard' | 'Pathao' | 'In-house Rider' | 'Nepal Post';
  dateAd: string;
  dateBs: string;
  reason: 'Call not received' | 'Address not found' | 'Customer refused delivery' | 'Customer unavailable';
  valley: 'Inside' | 'Outside';
  attempts?: number;
  status?: DeliveryFailureStatus;
  reattemptDateAd?: string;
  reattemptDateBs?: string;
  assignedTo?: string;
  remarks?: string;
  createdAt: string;
}

export type ReturnReason =
  | 'Damage'
  | 'Wrong product sent'
  | 'Product not as described'
  | 'Allergic reaction'
  | 'Quality defect'
  | 'Size issue'
  | 'Color mismatch'
  | 'Changed mind';

export interface ReturnEntry {
  id: string;
  orderId?: string;
  orderNumber?: string;
  brandCode: BrandCode;
  productId: string;
  productName: string;
  customerName: string;
  customerPhone: string;
  dateAd: string;
  dateBs: string;
  orderProcessedDateAd?: string;
  orderProcessedDateBs?: string;
  platform: OrderPlatform;
  quantity: number;
  reasonCategory: ReturnReason;
  orderStatus: 'Exchanged' | 'Returned' | 'Refunded' | 'Pending' | 'Rejected';
  valley: 'Inside' | 'Outside';
  issueCategories: string[];
  evidenceUrl?: string;
  remarks?: string;
  createdAt: string;
}

export interface ReviewCategory {
  id: string;
  name: string;
  tickCount: number;
  isArchived: boolean;
  mergedIntoId?: string;
  createdBy?: string;
  createdAt?: string;
  lastUsedDate?: string;
}

export type FeedbackType = 'REVIEW' | 'FEEDBACK' | 'COMPLAINT';
export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface FeedbackStatusHistory {
  id: string;
  previousStatus?: ComplaintStatus;
  newStatus: ComplaintStatus;
  changedBy: string;
  notes?: string;
  timestamp: string;
}

export interface FeedbackEntry {
  id: string;
  customerName: string;
  customerPhone: string;
  brandCode: BrandCode;
  productId: string;
  productName: string;
  type: FeedbackType;
  channel: string;
  orderId?: string;
  dateReceivedAd: string;
  dateReceivedBs: string;
  fullText: string;
  screenshotUrls: string[];
  issueCategories: string[];
  sentiment: Sentiment;
  hasScreenshot: boolean;
  usedInDesign: boolean;
  postedOnWebsite: boolean;
  priority?: Priority;
  assignedTo?: string;
  assignedToName?: string;
  complaintStatus?: ComplaintStatus;
  resolutionNotes?: string;
  history?: FeedbackStatusHistory[];
  createdAt: string;
}

export interface KarmaEvent {
  id: string;
  customerPhone: string;
  eventType: string;
  points: number;
  balanceAfter: number;
  notes?: string;
  createdAt: string;
}

export type CustomerSegment =
  | 'VIP'
  | 'LOYAL'
  | 'REGULAR'
  | 'NEW'
  | 'AT_RISK'
  | 'BLACKLISTED';

export interface Customer {
  id: string;
  phone: string;
  name: string;
  city: string;
  province: string;
  firstOrderDate?: string;
  lastOrderDate?: string;
  totalOrders: number;
  totalDelivered: number;
  totalReturns: number;
  totalDeliveryFailures: number;
  totalCancellations: number;
  totalComplaints: number;
  totalReviews: number;
  karmaScore: number;
  segment: CustomerSegment;
  activeFlags: string[];
  brandsPurchased: BrandCode[];
}

export type TaskStatus = 'OPEN' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignedTo: string;
  assignedToName: string;
  createdBy: string;
  priority: Priority;
  dueDateAd: string;
  dueDateBs: string;
  relatedTo?: string;
  relatedId?: string;
  relatedEntityType?: 'STORE' | 'CHEQUE' | 'COMPLAINT' | 'CALL';
  status: TaskStatus;
  autoCreated: boolean;
  autoTriggerType?: 'CHEQUE_OVERDUE' | 'STORE_DORMANT' | 'CALL_FOLLOWUP' | 'COMPLAINT_ASSIGNED' | 'MANUAL';
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  priority: Priority;
  read: boolean;
  entityType?: string;
  entityId?: string;
  createdAt: string;
}

export type NotificationItem = Notification;
export type CustomerProfile = Customer;
export interface CustomerTimelineEvent {
  id: string;
  customerPhone?: string;
  eventType?: string;
  description?: string;
  dateAd?: string;
  dateBs?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface ActivityLog {
  id: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface OfficerScorecard {
  officerId: string;
  officerName: string;
  area: string;
  storesVisited: number;
  beatCompliancePct: number;
  storesSkipped: number;
  skipReasonsBreakdown: Record<string, number>;
  avgVisitDurationMinutes: number;
  callsMade: number;
  productiveCalls: number;
  callToOrderRatioPct: number;
  ordersCollected: number;
  chequesCollected: number;
  chequesOverdue: number;
  avgChequeHandoverDays: number;
  shelfPhotosTaken: number;
  documentsCollected: number;
  stockCountsDone: number;
  pendingTasks: number;
  responseTimeHours?: number;
}

// Real-Time Staff Tracking Model (PRD v2.2)
export type StaffLiveStatus = 'AT_STORE' | 'IN_TRANSIT' | 'IDLE' | 'DAY_ENDED';

export interface StaffRoutePoint {
  storeName: string;
  arrivedAt: string;
  departedAt?: string;
  durationMinutes?: number;
  status: 'COMPLETED' | 'IN_PROGRESS';
}

export interface StaffLiveLocation {
  officerId: string;
  officerName: string;
  currentLat: number;
  currentLng: number;
  lastPingTimestamp: string;
  status: StaffLiveStatus;
  currentStoreName?: string;
  timeAtCurrentStoreMinutes?: number;
  batteryLevel: number;
  isOnline: boolean;
  dutyStatus?: DutyStatus;
  todayDistanceKm: number;
  todayRoute: StaffRoutePoint[];
}

// Multi-Dimension Filter Criteria
export interface FilterCriteria {
  dateExact?: string; // YYYY-MM-DD
  dayOfWeek?: string; // Sunday, Monday, etc.
  month?: string; // Bhadra, Ashwin or Sep, Oct
  year?: string; // 2083 or 2026
  dateFrom?: string;
  dateTo?: string;
  calendarMode?: 'BS' | 'AD';
  province?: string;
  valley?: 'ALL' | 'Inside' | 'Outside';
  city?: string;
  brand?: BrandCode;
  officerId?: string;
  outletType?: string;
}

// Holiday Model (Fix 33)
export type HolidayType = 'PUBLIC' | 'COMPANY' | 'OPTIONAL';

export interface Holiday {
  id: string;
  name: string;
  dateBs: string; // e.g. 2083-06-08
  dateAd: string; // e.g. 2026-09-24
  type: HolidayType;
  yearBs: number; // e.g. 2083
  notes?: string;
}

// Seasonal Pattern Detection Model (Fix 35)
export interface SeasonalPattern {
  id: string;
  metric: 'orders' | 'delivery_failures' | 'returns' | 'channel_volume' | 'day_of_week';
  product?: string;
  brandCode?: BrandCode;
  direction: 'UP' | 'DOWN';
  pct: number;
  peakMonthsBs: string[];
  troughMonthsBs: string[];
  description: string;
  evidence: string;
  suggestedAction: string;
}

// Task Template Model (Fix 37)
export interface TaskTemplateStep {
  id?: string;
  title: string;
  description: string;
  dueDaysOffset: number;
}

export interface TaskTemplate {
  id: string;
  name: string;
  category: 'ONBOARDING' | 'RECOVERY' | 'COMPLAINT' | 'AUDIT' | 'CUSTOM';
  description: string;
  active: boolean;
  steps: TaskTemplateStep[];
  createdAt: string;
}

// Store Health Score Model (Fix 34 & Fix 45b)
export interface StoreHealthScore {
  overall: number; // 0-100
  tier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  orderRegularity: number; // 0-30 or 0-25
  paymentDiscipline: number; // 0-25
  stockMaintenance: number; // 0-25 or 0-20
  visitCooperation: number; // 0-20 or 0-15
  issueRate: number; // 0-15
  trend: 'UP' | 'DOWN' | 'STABLE';
  previousScore: number;
  lastCalculatedAt: string;
  score?: number;
  breakdown?: {
    orderVelocityScore: number;
    paymentScore: number;
    visitFrequencyScore: number;
    stockFreshnessScore: number;
  };
}

// Promotion / Offer Model (Fix 46d)
export interface Promotion {
  id: string;
  name: string;
  brandCode: BrandCode;
  productIds: string[];
  productNames: string[];
  offerType: 'BUY_X_GET_Y' | 'PERCENTAGE_OFF' | 'COMBO' | 'FREE_SAMPLE' | 'NEW_LAUNCH';
  validFromBs: string;
  validToBs: string;
  validFromAd: string;
  validToAd: string;
  applicableStoreTypes: 'ALL' | 'GT' | 'MT' | 'SPECIFIC';
  applicableStoreIds?: string[];
  description: string;
  active: boolean;
}

// Comparison Mode (Fix 36)
export type ComparisonMode = 'OFF' | 'LAST_MONTH' | 'SAME_MONTH_LAST_YEAR' | 'CUSTOM';

// Field Officer Daily Summary (Fix 38)
export interface FieldOfficerDailySummary {
  id: string;
  officerId: string;
  officerName: string;
  dateAd: string;
  dateBs: string;
  storesVisited: number;
  totalStores: number;
  compliancePct: number;
  skippedStores: { storeName: string; reason: string }[];
  callsMade: number;
  productiveCalls: number;
  ordersCollected: number;
  chequesCollected: number;
  chequeTotalAmount: number;
  shelfPhotoSets: number;
  stockCountsCompleted: number;
  documentsUploaded: number;
  startTime: string;
  endTime: string;
  durationFormatted: string;
  createdAt: string;
}

// Data Import Types (Fix 39)
export type ImportSourceType = 'ORDERS' | 'RETURNS' | 'OFFLINE_SALES' | 'DAILY_COUNTS';

export interface DataImportRecord {
  id: string;
  importedAt: string;
  sourceType: ImportSourceType;
  fileName: string;
  brandCode?: BrandCode;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  skippedRows: { rowNumber: number; data: Record<string, unknown>; reason: string }[];
  rolledBack?: boolean;
}

// Influencer & Marketing Tracking Types (Fix 60 & 61)
export type InfluencerPlatformType = 'Instagram' | 'TikTok' | 'YouTube' | 'Facebook' | 'Other';

export interface InfluencerPlatform {
  platform: InfluencerPlatformType;
  handle: string;
  followers?: number;
}

export type InfluencerQualityRating = 'GREAT' | 'AVERAGE' | 'POOR' | 'NOT_RATED';

export type InfluencerCategory =
  | 'Beauty'
  | 'Lifestyle'
  | 'Health'
  | 'Food'
  | 'Tech'
  | 'General';

export interface Influencer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  platforms: InfluencerPlatform[];
  city?: string;
  category: InfluencerCategory;
  qualityRating: InfluencerQualityRating;
  totalSends: number;
  totalContent: number;
  lastSendDate?: string;
  lastSendDateBs?: string;
  lastContentDate?: string;
  lastContentDateBs?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export type InfluencerContentType =
  | 'REEL'
  | 'STORY'
  | 'POST'
  | 'VIDEO'
  | 'SHORT'
  | 'BLOG'
  | 'OTHER';

export interface InfluencerContent {
  id: string;
  influencerId: string;
  url: string;
  platform: string;
  contentType: InfluencerContentType;
  brandCode?: BrandCode;
  productName?: string;
  datePostedAd: string;
  datePostedBs?: string;
  notes?: string;
  createdAt: string;
}

// Custom Shared Access Link Types (Fix 63)
export type SharedAccessAllowedPage =
  | 'DASHBOARD_OVERVIEW'
  | 'DAILY_ORDER_COUNTS'
  | 'PRODUCT_PERFORMANCE'
  | 'CHANNEL_PERFORMANCE'
  | 'RETURNS_FAILURES'
  | 'COMPLAINTS'
  | 'STORE_VISITS'
  | 'SCORECARDS'
  | 'CUSTOMER_360'
  | 'DISTRIBUTOR_HEALTH'
  | 'dashboard'
  | 'products'
  | 'delivery-failures'
  | 'returns';

export interface SharedAccessLink {
  id: string;
  token: string;
  name: string;
  createdById?: string;
  createdBy?: string;
  brandScope?: 'ALL' | BrandCode[];
  brandFilter: BrandCode[];
  allowedPages: SharedAccessAllowedPage[];
  showCustomerDetails: boolean;
  showStaffDetails: boolean;
  showOrderRows: boolean;
  showProductNames: boolean;
  showComboDetails: boolean;
  dateRangeType: 'LIVE' | 'FIXED';
  dateFrom?: string;
  dateTo?: string;
  expiresAt?: string;
  passcode?: string;
  maskCustomerPii?: boolean;
  hideFinancials?: boolean;
  isActive: boolean;
  lastAccessedAt?: string;
  accessCount: number;
  createdAt: string;
}

// Dashboard Sales Mode (Fix 62)
export type DashboardSalesMode = 'ALL' | 'D2C' | 'B2B';

// Feature Flag & A/B Testing Types
export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  enabledForUsers: string[];
  variant: 'A' | 'B';
  createdAt: string;
}

export interface FlagEvent {
  id: string;
  flagName: string;
  userId: string;
  variant: 'A' | 'B';
  action: 'PAGE_VIEW' | 'FORM_SUBMIT' | 'ERROR' | string;
  metadata?: Record<string, any>;
  createdAt: string;
}

