/**
 * Every downloadable data set, defined once. Download buttons, the store file, the report builder
 * and the backup all build their sheets here, so a column means the same thing everywhere.
 *
 * Filters: AD date range, brand, sub-brand, store and officer. Brand and sub-brand filter lines
 * (order lines, store order lines, dispatch lines, count lines) line by line; whole-order sheets keep
 * orders that have at least one matching line. Every dated sheet has both an AD and a BS date.
 */
import { adToBs } from '../nepali-calendar';
import { allSubBrands, lineSubBrandId } from '../sub-brands';
import type { Column, Sheet } from './xlsx';
import type {
  Brand, CallLog, Cheque, Combo, Customer, DeliveryFailure, Dispatch, FacingAudit, FeedbackEntry, HandoverDocument, Influencer,
  MarketingSend, Order, Product, ReturnEntry, SecondaryOrder, StockCount, Visit, Retailer, Branch, Distributor, Task,
} from '../types';

export interface ExportSource {
  brands: Brand[]; products: Product[]; combos: Combo[];
  orders: Order[]; returns: ReturnEntry[]; feedback: FeedbackEntry[]; deliveryFailures: DeliveryFailure[]; customers: Customer[];
  secondaryOrders: SecondaryOrder[]; dispatches: Dispatch[]; stockCounts: StockCount[]; visits: Visit[]; cheques: Cheque[];
  callLogs: CallLog[]; documents: HandoverDocument[]; facingAudits: FacingAudit[];
  retailers: Retailer[]; branches: Branch[]; distributors: Distributor[];
  tasks: Task[]; influencers: Influencer[]; marketingSends: MarketingSend[];
}

export interface ExportFilters { fromAd?: string; toAd?: string; brandCode?: string; subBrandId?: string; storeId?: string; officerId?: string }

export type DatasetKey =
  | 'orders' | 'order_lines' | 'returns' | 'feedback' | 'delivery_failures' | 'customers'
  | 'store_orders' | 'store_order_lines' | 'dispatch_lines' | 'stock_counts' | 'visits' | 'cheques' | 'calls' | 'documents' | 'shelf_share'
  | 'stores' | 'products' | 'tasks' | 'influencers' | 'marketing_sends';

export interface DatasetDefinition {
  key: DatasetKey;
  label: string;
  group: 'Online (D2C)' | 'Stores (B2B)' | 'Master lists' | 'Work & marketing';
  /** Whether the date range applies. */
  dated: boolean;
  /** Page whose access is needed to download it. */
  page: string;
  build: (source: ExportSource, filters: ExportFilters) => Sheet;
}

const day = (value?: string | null) => (value || '').slice(0, 10);
const bs = (dateAd?: string | null, given?: string | null) => given || (day(dateAd) ? (() => { try { return adToBs(`${day(dateAd)}T12:00:00`).formatted; } catch { return ''; } })() : '');
const inRange = (dateAd: string | undefined | null, f: ExportFilters) => { const d = day(dateAd); return (!f.fromAd || d >= f.fromAd) && (!f.toAd || d <= f.toAd); };
const brandOf = (source: ExportSource, code?: string) => source.brands.find((b) => b.code === code)?.name || code || '';

function subName(source: ExportSource) {
  const all = allSubBrands(source.brands);
  return (id?: string | null) => (id ? all.find((s) => s.id === id)?.name || '' : '');
}

/** Does a product line pass the brand and sub-brand filter? */
function lineMatches(source: ExportSource, f: ExportFilters, line: { productId: string; brandCode?: string; subBrandId?: string | null }) {
  if (!f.brandCode || f.brandCode === 'ALL') return true;
  const code = line.brandCode || source.products.find((p) => p.id === line.productId)?.brandCode || source.combos.find((c) => c.id === line.productId)?.brandCode;
  if (code !== f.brandCode) return false;
  if (!f.subBrandId) return true;
  const combo = source.combos.find((c) => c.id === line.productId);
  if (combo) return combo.items.some((item) => source.products.find((p) => p.id === item.productId)?.subBrandId === f.subBrandId);
  return lineSubBrandId(line, source.products) === f.subBrandId;
}

const storeMatch = (f: ExportFilters, id?: string) => !f.storeId || id === f.storeId;
const officerMatch = (f: ExportFilters, id?: string) => !f.officerId || id === f.officerId;
const col = (header: string, type?: Column['type']): Column => ({ header, type });

function storeInfo(source: ExportSource) {
  const map = new Map<string, { name: string; kind: string; area: string; city: string; officer: string }>();
  for (const r of source.retailers) map.set(r.id, { name: r.name, kind: 'Retailer (GT)', area: r.area || '', city: r.city || '', officer: r.assignedOfficerName || '' });
  for (const b of source.branches) map.set(b.id, { name: b.name, kind: 'Chain branch (MT)', area: b.area || '', city: b.city || '', officer: b.assignedOfficerName || '' });
  for (const d of source.distributors) map.set(d.id, { name: d.name, kind: d.type || 'Distributor', area: '', city: d.city || '', officer: '' });
  return (id?: string) => (id && map.get(id)) || { name: '', kind: '', area: '', city: '', officer: '' };
}

export const DATASETS: DatasetDefinition[] = [
  {
    key: 'orders', label: 'Online orders', group: 'Online (D2C)', dated: true, page: 'p.orders_all',
    build: (s, f) => ({ name: 'Online orders', columns: [col('Order'), col('Date (AD)'), col('Date (BS)'), col('Brand'), col('Channel'), col('Status'), col('Customer'), col('Phone'), col('District'), col('Province'), col('Delivery'), col('Payment'), col('New or repeat'), col('Units', 'number'), col('Total (NPR)', 'money'), col('Offers'), col('Notes')],
      rows: s.orders.filter((o) => inRange(o.orderDateAd, f) && o.items.some((line) => lineMatches(s, f, line)))
        .map((o) => [o.orderNumber, day(o.orderDateAd), bs(o.orderDateAd, o.orderDateBs), brandOf(s, o.brandCode), o.platform, o.status, o.customerName, o.customerPhone, o.district, o.province, o.deliveryMethod, o.paymentTerms, o.orderType,
          o.items.reduce((sum, line) => sum + (line.isGift ? 0 : line.quantity), 0), o.totalAmount, (o.appliedOffers || []).map((offer: any) => offer.name || offer.offerName).filter(Boolean).join(', '), o.notes || '']) }),
  },
  {
    key: 'order_lines', label: 'Online order lines (one row per product)', group: 'Online (D2C)', dated: true, page: 'p.orders_all',
    build: (s, f) => {
      const sub = subName(s);
      const rows: Sheet['rows'] = [];
      for (const o of s.orders) {
        if (!inRange(o.orderDateAd, f)) continue;
        for (const line of o.items) {
          if (!lineMatches(s, f, line)) continue;
          const combo = s.combos.find((c) => c.id === line.productId);
          const product = s.products.find((p) => p.id === line.productId);
          rows.push([o.orderNumber, day(o.orderDateAd), bs(o.orderDateAd, o.orderDateBs), o.status, o.platform, brandOf(s, line.brandCode || o.brandCode), sub(lineSubBrandId(line, s.products)),
            combo ? 'Combo' : 'Product', product?.sku || combo?.sku || '', line.productName, line.quantity, line.isGift ? 'Yes' : '', line.unitPrice, line.totalPrice, o.customerName, o.district]);
        }
      }
      return { name: 'Online order lines', columns: [col('Order'), col('Date (AD)'), col('Date (BS)'), col('Status'), col('Channel'), col('Brand'), col('Sub-brand'), col('Type'), col('SKU'), col('Product'), col('Quantity', 'number'), col('Free gift'), col('Unit price', 'money'), col('Line total', 'money'), col('Customer'), col('District')], rows };
    },
  },
  {
    key: 'returns', label: 'Returns and exchanges', group: 'Online (D2C)', dated: true, page: 'p.returns',
    build: (s, f) => {
      const sub = subName(s);
      return { name: 'Returns', columns: [col('Date (AD)'), col('Date (BS)'), col('Order'), col('Brand'), col('Sub-brand'), col('Product'), col('Combo'), col('Quantity', 'number'), col('Outcome'), col('Reason'), col('Issues'), col('Customer'), col('Phone'), col('Channel'), col('Valley'), col('Replacement order'), col('Remarks')],
        rows: s.returns.filter((r) => inRange(r.dateAd, f) && lineMatches(s, f, { productId: r.productId, brandCode: r.brandCode }))
          .map((r) => [day(r.dateAd), bs(r.dateAd, r.dateBs), r.orderNumber || '', brandOf(s, r.brandCode), sub(s.products.find((p) => p.id === r.productId)?.subBrandId), r.productName, r.comboName || '', r.quantity, r.orderStatus, r.reasonCategory, (r.issueCategories || []).join(', '), r.customerName, r.customerPhone, r.platform, r.valley, r.exchangeOrderNumber || '', r.remarks || '']) };
    },
  },
  {
    key: 'feedback', label: 'Reviews and complaints', group: 'Online (D2C)', dated: true, page: 'p.feedback',
    build: (s, f) => {
      const sub = subName(s);
      return { name: 'Reviews & complaints', columns: [col('Date (AD)'), col('Date (BS)'), col('Type'), col('Sentiment'), col('Brand'), col('Sub-brand'), col('Product'), col('Customer'), col('Channel'), col('Issues'), col('Status'), col('Text')],
        rows: s.feedback.filter((e) => inRange(e.dateReceivedAd, f) && lineMatches(s, f, { productId: e.productId, brandCode: e.brandCode }))
          .map((e) => [day(e.dateReceivedAd), bs(e.dateReceivedAd, e.dateReceivedBs), e.type, e.sentiment, brandOf(s, e.brandCode), sub(s.products.find((p) => p.id === e.productId)?.subBrandId), e.productName, e.customerName || e.customerHandle || '', e.channel, (e.issueCategories || []).join(', '), e.complaintStatus || '', e.fullText]) };
    },
  },
  {
    key: 'delivery_failures', label: 'Delivery failures', group: 'Online (D2C)', dated: true, page: 'p.delivery_failures',
    build: (s, f) => ({ name: 'Delivery failures', columns: [col('Date (AD)'), col('Date (BS)'), col('Order'), col('Brand'), col('Reason'), col('Status'), col('Attempts', 'number'), col('Delivery partner'), col('District'), col('Valley'), col('Customer'), col('Phone')],
      rows: s.deliveryFailures.filter((d) => inRange(d.dateAd, f) && (!f.brandCode || f.brandCode === 'ALL' || (() => { const order = s.orders.find((o) => o.id === d.orderId); return order ? order.items.some((line) => lineMatches(s, f, line)) : d.brandCode === f.brandCode && !f.subBrandId; })()))
        .map((d: any) => [day(d.dateAd), bs(d.dateAd, d.dateBs), d.orderNumber || '', brandOf(s, d.brandCode), d.reason, d.status, d.attempts ?? '', d.deliveryMethod || '', d.district || '', d.valley || '', d.customerName || '', d.customerPhone || '']) }),
  },
  {
    key: 'customers', label: 'Customers', group: 'Online (D2C)', dated: false, page: 'p.customers',
    build: (s, f) => ({ name: 'Customers', columns: [col('Name'), col('Phone'), col('City'), col('Province'), col('First order'), col('Last order'), col('Orders', 'number'), col('Delivered', 'number'), col('Returns', 'number'), col('Cancelled', 'number'), col('Complaints', 'number'), col('Karma', 'number'), col('Segment'), col('Brands bought')],
      rows: s.customers.filter((c) => !f.brandCode || f.brandCode === 'ALL' || (c.brandsPurchased || []).includes(f.brandCode))
        .map((c) => [c.name, c.phone, c.city, c.province, day(c.firstOrderDate), day(c.lastOrderDate), c.totalOrders, c.totalDelivered, c.totalReturns, c.totalCancellations, c.totalComplaints, c.karmaScore, c.segment, (c.brandsPurchased || []).join(', ')]) }),
  },
  {
    key: 'store_orders', label: 'Store orders', group: 'Stores (B2B)', dated: true, page: 'p.beat_plan',
    build: (s, f) => {
      const store = storeInfo(s);
      return { name: 'Store orders', columns: [col('Order'), col('Date (AD)'), col('Date (BS)'), col('Store'), col('Store type'), col('Area'), col('City'), col('Officer'), col('Distributor'), col('Status'), col('Units', 'number'), col('Value (NPR)', 'money'), col('Payment terms'), col('Notes')],
        rows: s.secondaryOrders.filter((o) => inRange(o.orderDateAd, f) && storeMatch(f, o.entityId) && officerMatch(f, o.officerId) && o.items.some((line) => lineMatches(s, f, line)))
          .map((o) => { const info = store(o.entityId); return [o.orderNumber, day(o.orderDateAd), bs(o.orderDateAd, o.orderDateBs), o.storeName, info.kind, info.area, info.city, o.officerName, o.distributorName || '', o.status, o.totalUnits, o.totalAmount, o.paymentTerms || '', o.notes || '']; }) };
    },
  },
  {
    key: 'store_order_lines', label: 'Store order lines (one row per product)', group: 'Stores (B2B)', dated: true, page: 'p.beat_plan',
    build: (s, f) => {
      const store = storeInfo(s); const sub = subName(s);
      const rows: Sheet['rows'] = [];
      for (const o of s.secondaryOrders) {
        if (!inRange(o.orderDateAd, f) || !storeMatch(f, o.entityId) || !officerMatch(f, o.officerId)) continue;
        const info = store(o.entityId);
        for (const line of o.items) if (lineMatches(s, f, line)) rows.push([o.orderNumber, day(o.orderDateAd), bs(o.orderDateAd, o.orderDateBs), o.storeName, info.kind, info.city, o.officerName, o.status,
          brandOf(s, line.brandCode), sub(lineSubBrandId(line, s.products)), s.products.find((p) => p.id === line.productId)?.sku || '', line.productName, line.cases, line.totalUnits, line.freeUnits || 0, line.unitPrice, line.totalAmount, line.appliedScheme || '']);
      }
      return { name: 'Store order lines', columns: [col('Order'), col('Date (AD)'), col('Date (BS)'), col('Store'), col('Store type'), col('City'), col('Officer'), col('Status'), col('Brand'), col('Sub-brand'), col('SKU'), col('Product'), col('Cartons', 'number'), col('Units', 'number'), col('Free units', 'number'), col('Unit price', 'money'), col('Line value', 'money'), col('Scheme')], rows };
    },
  },
  {
    key: 'dispatch_lines', label: 'Dispatches (one row per product)', group: 'Stores (B2B)', dated: true, page: 'p.dispatch',
    build: (s, f) => {
      const sub = subName(s);
      const rows: Sheet['rows'] = [];
      for (const d of s.dispatches) {
        if (!inRange(d.dispatchDateAd, f) || !(storeMatch(f, d.distributorId) || storeMatch(f, d.branchId))) continue;
        for (const line of d.items) if (lineMatches(s, f, line)) rows.push([d.dispatchNumber || '', day(d.dispatchDateAd), bs(d.dispatchDateAd, d.dispatchDateBs), d.distributorName, d.branchName || '', brandOf(s, line.brandCode), sub(lineSubBrandId(line, s.products)), line.productName, line.quantity, d.paymentTerms || '', day(d.paymentDueDateAd), d.paymentStatus || '', d.amountDue ?? '', d.createdBy, (d.edits || []).length || '', d.notes || '']);
      }
      return { name: 'Dispatches', columns: [col('Dispatch'), col('Date (AD)'), col('Date (BS)'), col('Going to'), col('Branch'), col('Brand'), col('Sub-brand'), col('Product'), col('Units', 'number'), col('Payment terms'), col('Payment due (AD)'), col('Payment status'), col('Amount due', 'money'), col('Logged by'), col('Corrections', 'number'), col('Notes')], rows };
    },
  },
  {
    key: 'stock_counts', label: 'Shelf stock counts (one row per product)', group: 'Stores (B2B)', dated: true, page: 'p.stock_counts',
    build: (s, f) => {
      const store = storeInfo(s); const sub = subName(s);
      const rows: Sheet['rows'] = [];
      for (const c of s.stockCounts) {
        if (!inRange(c.dateAd || c.createdAt, f) || !storeMatch(f, c.entityId) || !officerMatch(f, c.officerId)) continue;
        const info = store(c.entityId);
        for (const item of c.items) if (lineMatches(s, f, item)) rows.push([day(c.dateAd || c.createdAt), bs(c.dateAd, c.dateBs), c.storeName, info.kind, info.city, c.officerName, brandOf(s, item.brandCode), sub(lineSubBrandId(item, s.products)), item.productName, item.shelfQty, item.previousQty, item.shelfQty - item.previousQty, item.flaggedDrop ? 'Yes' : '']);
      }
      return { name: 'Stock counts', columns: [col('Date (AD)'), col('Date (BS)'), col('Store'), col('Store type'), col('City'), col('Counted by'), col('Brand'), col('Sub-brand'), col('Product'), col('On shelf', 'number'), col('Previous count', 'number'), col('Change', 'number'), col('Dropped over half')], rows };
    },
  },
  {
    key: 'visits', label: 'Store visits', group: 'Stores (B2B)', dated: true, page: 'p.beat_plan',
    build: (s, f) => {
      const store = storeInfo(s);
      return { name: 'Visits', columns: [col('Date (AD)'), col('Date (BS)'), col('Store'), col('Store type'), col('City'), col('Officer'), col('Check-in'), col('Check-out'), col('Minutes', 'number'), col('Distance from store (m)', 'number'), col('Location override'), col('Notes')],
        rows: s.visits.filter((v) => inRange(v.dateAd, f) && storeMatch(f, v.entityId) && officerMatch(f, v.officerId))
          .map((v) => { const info = store(v.entityId); return [day(v.dateAd), bs(v.dateAd, v.dateBs), v.storeName, info.kind, info.city, v.officerName, v.checkInTime ? new Date(v.checkInTime).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' }) : '', v.checkOutTime ? new Date(v.checkOutTime).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' }) : '', v.durationMinutes ?? '', v.distanceMeters, v.overrideFlag ? v.overrideReason || 'Yes' : '', v.notes || '']; }) };
    },
  },
  {
    key: 'cheques', label: 'Cheques', group: 'Stores (B2B)', dated: true, page: 'p.cheques',
    build: (s, f) => ({ name: 'Cheques', columns: [col('Received (AD)'), col('Received (BS)'), col('Store'), col('Officer'), col('Cheque number'), col('Bank'), col('Amount (NPR)', 'money'), col('Cash date (AD)'), col('Status'), col('Handed to'), col('Notes')],
      rows: s.cheques.filter((c) => inRange(c.receivedDateAd, f) && storeMatch(f, c.entityId) && officerMatch(f, c.officerId) && (!f.brandCode || f.brandCode === 'ALL' || !c.brandCodes?.length || c.brandCodes.includes(f.brandCode)))
        .map((c) => [day(c.receivedDateAd), bs(c.receivedDateAd, c.receivedDateBs), c.storeName, c.officerName, c.chequeNumber, c.bankName, c.amount, day(c.cashDateAd), c.status, c.handedOverTo || '', c.notes || '']) }),
  },
  {
    key: 'calls', label: 'Store calls', group: 'Stores (B2B)', dated: true, page: 'p.calls',
    build: (s, f) => ({ name: 'Calls', columns: [col('Date (AD)'), col('Date (BS)'), col('Store'), col('Contact'), col('Phone'), col('Officer'), col('Purpose'), col('Outcome'), col('Seconds', 'number'), col('Notes')],
      rows: s.callLogs.filter((c) => inRange(c.dateAd, f) && storeMatch(f, c.entityId) && officerMatch(f, c.officerId))
        .map((c) => [day(c.dateAd), bs(c.dateAd, c.dateBs), c.storeName, c.contactName, c.contactPhone, c.officerName, c.label, c.outcome, c.durationSeconds, c.notes || '']) }),
  },
  {
    key: 'documents', label: 'Store documents', group: 'Stores (B2B)', dated: true, page: 'p.documents',
    build: (s, f) => ({ name: 'Documents', columns: [col('Date (AD)'), col('Date (BS)'), col('Store'), col('Type'), col('Reference'), col('Collected by'), col('Status'), col('With'), col('Filed at'), col('Notes')],
      rows: s.documents.filter((d) => inRange(d.docDateAd, f) && storeMatch(f, d.entityId) && officerMatch(f, d.officerId))
        .map((d) => [day(d.docDateAd), bs(d.docDateAd, d.docDateBs), d.storeName, d.documentType, d.referenceNumber || '', d.officerName, d.status, d.currentHolder || '', d.filedLocation || '', d.notes || '']) }),
  },
  {
    key: 'shelf_share', label: 'Shelf share checks', group: 'Stores (B2B)', dated: true, page: 'p.shelf_photos',
    build: (s, f) => {
      const rows: Sheet['rows'] = [];
      for (const a of s.facingAudits) {
        if (!inRange(a.dateAd, f) || !storeMatch(f, a.storeId) || !officerMatch(f, a.officerId)) continue;
        for (const facing of a.facings) rows.push([day(a.dateAd), bs(a.dateAd, a.dateBs), a.storeName, facing.brandName, facing.isOwnBrand ? 'Ours' : 'Competitor', facing.facingCount, facing.isOwnBrand ? a.ownSharePct / 100 : '']);
      }
      return { name: 'Shelf share', columns: [col('Date (AD)'), col('Date (BS)'), col('Store'), col('Brand on shelf'), col('Ours or competitor'), col('Facings', 'number'), col('Our share', 'percent')], rows };
    },
  },
  {
    key: 'stores', label: 'Stores and accounts', group: 'Master lists', dated: false, page: 'p.stores',
    build: (s, f) => ({ name: 'Stores', columns: [col('Name'), col('Type'), col('Category'), col('Area'), col('City'), col('Province'), col('Address'), col('Officer'), col('Distributor or chain'), col('Contact'), col('Phone'), col('Payment terms'), col('Credit limit', 'money'), col('Outstanding', 'money'), col('Overdue', 'money'), col('Overdue days', 'number'), col('Bounced cheques', 'number'), col('Credit locked'), col('Last visit (AD)'), col('Latitude', 'number'), col('Longitude', 'number')],
      rows: [
        ...s.distributors.filter((d) => storeMatch(f, d.id)).map((d) => [d.name, d.type, '', '', d.city, d.province || '', d.address || '', '', '', d.contactName, d.contactPhone, d.creditTerms || '', '', '', '', '', '', '', '', d.lat ?? '', d.lng ?? '']),
        ...s.branches.filter((b) => storeMatch(f, b.id) && officerMatch(f, b.assignedOfficerId)).map((b) => [b.name, 'Chain branch (MT)', '', b.area || '', b.city || '', '', b.address, b.assignedOfficerName, b.distributorName, b.contactName, b.contactPhone, '', b.creditLimit ?? '', b.outstandingBalance ?? '', b.overdueBalance ?? '', b.overdueDays ?? '', b.bouncedChequesCount ?? '', b.isCreditLocked ? 'Yes' : '', day(b.lastVisitDate), b.lat, b.lng]),
        ...s.retailers.filter((r) => storeMatch(f, r.id) && officerMatch(f, r.assignedOfficerId)).map((r) => [r.name, `Retailer (${r.type})`, r.category || '', r.area, r.city, r.province || '', r.address, r.assignedOfficerName, r.distributorName || '', r.contactName, r.contactPhone, r.creditTerms || '', r.creditLimit ?? '', r.outstandingBalance ?? '', r.overdueBalance ?? '', r.overdueDays ?? '', r.bouncedChequesCount ?? '', r.isCreditLocked ? 'Yes' : '', day(r.lastVisitDate), r.lat, r.lng]),
      ] }),
  },
  {
    key: 'products', label: 'Products and combos', group: 'Master lists', dated: false, page: 'p.products',
    build: (s, f) => {
      const sub = subName(s);
      const products = s.products.filter((p) => lineMatches(s, f, { productId: p.id, brandCode: p.brandCode, subBrandId: p.subBrandId }));
      const combos = s.combos.filter((c) => lineMatches(s, f, { productId: c.id, brandCode: c.brandCode }));
      return { name: 'Products', columns: [col('Type'), col('SKU'), col('Name'), col('Short name'), col('Brand'), col('Sub-brand'), col('Category'), col('Barcode'), col('MRP (NPR)', 'money'), col('Units per carton', 'number'), col('Low-stock level', 'number'), col('Contents'), col('Active')],
        rows: [
          ...products.map((p) => ['Product', p.sku, p.name, p.alias || '', brandOf(s, p.brandCode), sub(p.subBrandId), p.category, p.barcode || '', p.mrp, p.caseSize ?? '', p.thresholdQty, '', p.active === false ? 'No' : 'Yes']),
          ...combos.map((c) => ['Combo', c.sku, c.name, '', brandOf(s, c.brandCode), '', '', '', c.comboPrice, '', '', c.items.map((i) => `${i.quantity} × ${i.productName}`).join(', '), c.active === false ? 'No' : 'Yes']),
        ] };
    },
  },
  {
    key: 'tasks', label: 'Tasks', group: 'Work & marketing', dated: true, page: 'p.tasks',
    build: (s, f) => ({ name: 'Tasks', columns: [col('Due (AD)'), col('Due (BS)'), col('Task'), col('Assigned to'), col('Priority'), col('Status'), col('About'), col('Details')],
      rows: s.tasks.filter((t) => inRange(t.dueDateAd, f) && officerMatch(f, t.assignedTo) && storeMatch(f, t.relatedId))
        .map((t) => [day(t.dueDateAd), bs(t.dueDateAd, t.dueDateBs), t.title, t.assignedToName, t.priority, t.status, t.relatedTo || '', t.description || '']) }),
  },
  {
    key: 'influencers', label: 'Influencers', group: 'Work & marketing', dated: false, page: 'p.influencers',
    build: (s) => ({ name: 'Influencers', columns: [col('Name'), col('City'), col('Phone'), col('Platforms'), col('Followers', 'number'), col('Rating'), col('Sends', 'number'), col('Content pieces', 'number'), col('Last send (AD)'), col('Active')],
      rows: s.influencers.map((i) => [i.name, i.city || '', i.phone || '', i.platforms.map((p) => `${p.platform} ${p.handle}`).join(', '), Math.max(0, ...i.platforms.map((p) => p.followers || 0)), i.qualityRating, i.totalSends, i.totalContent, day(i.lastSendDate), i.isActive ? 'Yes' : 'No']) }),
  },
  {
    key: 'marketing_sends', label: 'Marketing sends', group: 'Work & marketing', dated: true, page: 'p.marketing_sends',
    build: (s, f) => ({ name: 'Marketing sends', columns: [col('Send'), col('Date (AD)'), col('Date (BS)'), col('Influencer'), col('Brands'), col('Products'), col('Units', 'number'), col('Status'), col('Content due (AD)'), col('Responsible')],
      rows: s.marketingSends.filter((m) => inRange(m.sentDateAd, f) && (!f.brandCode || f.brandCode === 'ALL' || m.brandCodes.includes(f.brandCode)))
        .map((m) => [m.sendNumber, day(m.sentDateAd), bs(m.sentDateAd, m.sentDateBs), m.influencerName, m.brandCodes.map((code) => brandOf(s, code)).join(', '), m.items.map((i) => `${i.quantity} × ${i.productName}`).join(', '), m.items.reduce((sum, i) => sum + i.quantity, 0), m.status, day(m.expectedContentDateAd), m.responsibleName]) }),
  },
];

export const datasetByKey = (key: DatasetKey) => DATASETS.find((dataset) => dataset.key === key)!;

/** Build the chosen sheets, skipping empty ones only when asked. */
export function buildSheets(source: ExportSource, keys: DatasetKey[], filters: ExportFilters, options: { skipEmpty?: boolean } = {}): Sheet[] {
  const sheets = keys.map((key) => datasetByKey(key).build(source, filters));
  return options.skipEmpty ? sheets.filter((sheet) => sheet.rows.length) : sheets;
}

/** A readable file name: Brand-Bucket_Store-orders_FORYA_2026-10-01_to_2026-10-31. */
export function exportFileName(label: string, filters: ExportFilters, source?: ExportSource): string {
  const parts = ['Brand-Bucket', label];
  if (filters.brandCode && filters.brandCode !== 'ALL') parts.push(filters.brandCode);
  if (filters.subBrandId && source) parts.push(allSubBrands(source.brands).find((s) => s.id === filters.subBrandId)?.name || '');
  if (filters.fromAd || filters.toAd) parts.push(`${filters.fromAd || 'start'}_to_${filters.toAd || 'today'}`);
  return parts.filter(Boolean).join('_').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-');
}
