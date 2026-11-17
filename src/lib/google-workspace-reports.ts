import { adToBs } from './nepali-calendar';
import type { DatabaseService } from './db/db-service';

/** Offline (B2B) tabs carry BS next to AD; online and marketing tabs are AD only. */
function bsFromAd(dateAd?: string): string {
  if (!dateAd || !/^\d{4}-\d{2}-\d{2}/.test(dateAd)) return '';
  try { const bs = adToBs(new Date(`${dateAd.slice(0, 10)}T12:00:00`)); return `${bs.monthName} ${bs.day}, ${bs.year}`; } catch { return ''; }
}

export type GoogleReportCell = string | number | boolean;
export interface GoogleReportTab { title: string; values: GoogleReportCell[][] }
export type GoogleReportDatabase = Pick<DatabaseService, 'getFilteredStores' | 'getOrders' | 'getUsers' | 'getCheques' | 'getVisits' | 'getStockCounts'> & Partial<Pick<DatabaseService, 'getMarketingSends'>>;

export function quoteGoogleTab(title: string): string { return `'${title.replace(/'/g, "''")}'`; }

export function nepalReportMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`;
}

export function buildGoogleReportTabs(db: GoogleReportDatabase, month = nepalReportMonth(), now = new Date()): GoogleReportTab[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Use a report month in YYYY-MM format.');
  const stores = db.getFilteredStores();
  const allOrders = db.getOrders();
  const users = db.getUsers();
  const cheques = db.getCheques();
  const visits = db.getVisits();
  const allStockCounts = db.getStockCounts();
  const orders = allOrders.filter((order) => order.orderDateAd?.slice(0, 7) === month);
  const stockCounts = allStockCounts.filter((stock) => stock.dateAd?.slice(0, 7) === month);
  const sends = db.getMarketingSends?.() || [];
  // An order whose date was edited into or out of another month moves tabs: rewrite the month it left as well.
  const movedMonths = [...new Set(allOrders.flatMap((order) => (order.editHistory || []).filter((entry) => entry.field === 'Order date')
    .flatMap((entry) => [entry.oldValue, entry.newValue]).filter((value): value is string => /^\d{4}-\d{2}-\d{2}$/.test(value || '')).map((value) => value.slice(0, 7))))]
    .filter((other) => other !== month).sort();
  const tabs: GoogleReportTab[] = [
    { title: 'Summary', values: [
      ['Metric', 'Value', 'Export Timestamp'],
      ['Total Stores', stores.length, now.toISOString()],
      ['Total Orders', allOrders.length, ''],
      ['Total Staff', users.length, ''],
      ['Cheques Tracked', cheques.length, ''],
      ['Field Visits', visits.length, ''],
      ['Stock Counts', allStockCounts.length, ''],
      ['Monthly Orders', orders.length, ''],
      ['Report Month (AD)', month, ''],
    ] },
    { title: 'Stores Directory', values: [
      ['Store ID', 'Store Name', 'Type', 'City', 'Address', 'Brands Stocked', 'Assigned Officer', 'Health Score'],
      ...stores.map((store) => [store.id, store.name, store.entityType === 'BRANCH' ? 'Distributor Branch' : store.type, store.entityType === 'RETAILER' ? store.city || '' : '', store.address || '', (store.entityType === 'BRANCH' ? store.brandsAvailable || [] : store.brandsStocked || []).join(', '), store.assignedOfficerName || '', store.entityType === 'RETAILER' ? store.healthScore ?? '' : '']),
    ] },
    // One row per order, keyed by its short ID. The whole tab is rewritten on every export,
    // so an edited order updates its row and can never appear twice.
    ...[month, ...movedMonths].map((tabMonth) => ({ title: `Orders-${tabMonth}`, values: [
      ['Order ID', 'Order Date (AD)', 'Brand', 'Customer', 'Products', 'Qty', 'Type', 'Total Amount', 'Status', 'Earlier ID'],
      ...allOrders.filter((order) => order.orderDateAd?.slice(0, 7) === tabMonth).map((order) => [order.orderNumber || order.id, order.orderDateAd || '', order.brandCode || '', order.customerName || '', (order.items || []).map((item) => item.productName).join('; '), (order.items || []).reduce((sum, item) => sum + (item.quantity ?? 0), 0), order.orderType || '', order.totalAmount ?? '', order.status || '', order.legacyOrderNumber || '']),
    ] as GoogleReportCell[][] })),
    // Marketing sends have their own tab and never appear on an Orders tab.
    { title: 'Marketing Sends', values: [
      ['Send ID', 'Sent Date (AD)', 'Influencer', 'Brands', 'Products', 'Units', 'Reach-out Platform', 'Responsible', 'Delivery Channel', 'Content Due (AD)', 'Status'],
      ...sends.map((send) => [send.sendNumber, send.sentDateAd || '', send.influencerName || '', (send.brandCodes || []).join(', '), (send.items || []).map((item) => `${item.quantity}x ${item.productName}${item.isCombo ? " (combo)" : ""}`).join('; '), (send.items || []).reduce((sum, item) => sum + (item.quantity ?? 0), 0), send.reachOutPlatform || '', send.responsibleName || '', send.deliveryChannel || '', send.expectedContentDateAd || '', send.status || '']),
    ] },
    { title: `Stock Counts-${month}`, values: [
      ['Date (BS)', 'Date (AD)', 'Store', 'Entity Type', 'Officer', 'Product', 'Shelf Qty', 'Previous Qty', 'Flagged Drop'],
      ...stockCounts.flatMap((stock) => (stock.items || []).map((item) => [bsFromAd(stock.dateAd), stock.dateAd || '', stock.storeName || '', stock.entityType, stock.officerName || '', item.productName || item.productId, item.shelfQty ?? '', item.previousQty ?? '', item.flaggedDrop])),
    ] },
    { title: 'Cheques', values: [
      ['Cheque #', 'Store', 'Amount (Rs)', 'Bank', 'Collected By', 'Received Date (BS)', 'Received Date (AD)', 'Cash Date (BS)', 'Cash Date (AD)', 'Status'],
      ...cheques.map((cheque) => [cheque.chequeNumber || '', cheque.storeName || '', cheque.amount ?? '', cheque.bankName || '', cheque.officerName || '', bsFromAd(cheque.receivedDateAd), cheque.receivedDateAd || '', bsFromAd(cheque.cashDateAd), cheque.cashDateAd || '', cheque.status || '']),
    ] },
    { title: 'Visits', values: [
      ['Date (BS)', 'Date (AD)', 'Officer', 'Store', 'Check-in', 'Check-out', 'Duration (Min)', 'GPS Override'],
      ...visits.map((visit) => [bsFromAd(visit.dateAd), visit.dateAd || '', visit.officerName || '', visit.storeName || '', visit.checkInTime || '', visit.checkOutTime || '', visit.durationMinutes ?? '', visit.overrideFlag]),
    ] },
    { title: 'Staff Scorecard', values: [
      ['Staff Name', 'Role', 'Active', 'Territory', 'Stores Assigned', 'Cheques Collected', 'Visits Recorded'],
      ...users.map((user) => [user.fullName || '', user.role || '', user.active ?? user.is_active ?? '', user.territory || '', stores.filter((store) => store.assignedOfficerId === user.id).length, cheques.filter((cheque) => cheque.officerId === user.id).length, visits.filter((visit) => visit.officerId === user.id).length]),
    ] },
  ];
  // Missing values are blank; numerical zero and false are real report values.
  return tabs.map((tab) => ({ ...tab, values: tab.values.map((row) => row.map((value) => value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value)) ? '' : value)) }));
}

export function googleReportValueRequest(tabs: GoogleReportTab[]) {
  return { valueInputOption: 'RAW' as const, data: tabs.map((tab) => ({ range: `${quoteGoogleTab(tab.title)}!A1`, values: tab.values })) };
}

export interface GoogleReportSheetsClient {
  spreadsheets: {
    get(input: { spreadsheetId: string; fields: string }): Promise<{ data: { spreadsheetUrl?: string | null; sheets?: Array<{ properties?: { title?: string | null } | null }> | null } }>;
    batchUpdate(input: { spreadsheetId: string; requestBody: { requests: Array<{ addSheet: { properties: { title: string } } }> } }): Promise<unknown>;
    values: {
      batchClear(input: { spreadsheetId: string; requestBody: { ranges: string[] } }): Promise<unknown>;
      batchUpdate(input: { spreadsheetId: string; requestBody: ReturnType<typeof googleReportValueRequest> }): Promise<unknown>;
    };
  };
}

export async function writeGoogleReportTabs(sheets: GoogleReportSheetsClient, spreadsheetId: string, tabs: GoogleReportTab[]) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'spreadsheetUrl,sheets.properties.title' });
  const titles = new Set(spreadsheet.data.sheets?.map((sheet) => sheet.properties?.title));
  const requests = tabs.filter((tab) => !titles.has(tab.title)).map((tab) => ({ addSheet: { properties: { title: tab.title } } }));
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  // Clear the entire owned tabs so deletions and smaller exports cannot leave old customer records behind.
  await sheets.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges: tabs.map((tab) => quoteGoogleTab(tab.title)) } });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: googleReportValueRequest(tabs) });
  if (!spreadsheet.data.spreadsheetUrl) throw new Error('Google did not return the report workbook URL.');
  return spreadsheet.data.spreadsheetUrl;
}
