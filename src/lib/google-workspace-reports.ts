import type { DatabaseService } from './db/db-service';

export type GoogleReportCell = string | number | boolean;
export interface GoogleReportTab { title: string; values: GoogleReportCell[][] }
export type GoogleReportDatabase = Pick<DatabaseService, 'getFilteredStores' | 'getOrders' | 'getUsers' | 'getCheques' | 'getVisits' | 'getStockCounts'>;

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
    { title: `Orders-${month}`, values: [
      ['Order ID', 'Order Date (BS)', 'Order Date (AD)', 'Brand', 'Customer', 'Products', 'Qty', 'Type', 'Total Amount', 'Status'],
      ...orders.map((order) => [order.id, order.orderDateBs || '', order.orderDateAd || '', order.brandCode || '', order.customerName || '', (order.items || []).map((item) => item.productName).join('; '), (order.items || []).reduce((sum, item) => sum + (item.quantity ?? 0), 0), order.orderType || '', order.totalAmount ?? '', order.status || '']),
    ] },
    { title: `Stock Counts-${month}`, values: [
      ['Date (AD)', 'Store', 'Entity Type', 'Officer', 'Product', 'Shelf Qty', 'Previous Qty', 'Flagged Drop'],
      ...stockCounts.flatMap((stock) => (stock.items || []).map((item) => [stock.dateAd || '', stock.storeName || '', stock.entityType, stock.officerName || '', item.productName || item.productId, item.shelfQty ?? '', item.previousQty ?? '', item.flaggedDrop])),
    ] },
    { title: 'Cheques', values: [
      ['Cheque #', 'Store', 'Amount (Rs)', 'Bank', 'Collected By', 'Received Date (AD)', 'Cash Date (AD)', 'Status'],
      ...cheques.map((cheque) => [cheque.chequeNumber || '', cheque.storeName || '', cheque.amount ?? '', cheque.bankName || '', cheque.officerName || '', cheque.receivedDateAd || '', cheque.cashDateAd || '', cheque.status || '']),
    ] },
    { title: 'Visits', values: [
      ['Date (AD)', 'Officer', 'Store', 'Check-in', 'Check-out', 'Duration (Min)', 'GPS Override'],
      ...visits.map((visit) => [visit.dateAd || '', visit.officerName || '', visit.storeName || '', visit.checkInTime || '', visit.checkOutTime || '', visit.durationMinutes ?? '', visit.overrideFlag]),
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
