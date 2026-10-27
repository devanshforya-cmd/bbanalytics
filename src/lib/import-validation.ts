import { adToBs, BS_MONTH_DAYS } from './nepali-calendar';
import { normalizePhoneNumber } from './auth-utils';
import type { Brand, Product, Order, ReturnEntry, Dispatch, Distributor, Branch, Customer } from './types';

export type CsvImportType = 'ORDERS' | 'RETURNS' | 'OFFLINE_SALES';
export const IMPORT_COLUMNS: Record<CsvImportType, string[]> = {
  ORDERS: ['Order Number', 'Date', 'Customer Name', 'Phone', 'Province', 'District', 'Address', 'Platform', 'Delivery Method', 'Payment Terms', 'Order Type', 'Status', 'Product ID', 'Quantity', 'Unit Price', 'Notes'],
  RETURNS: ['Order ID', 'Date', 'Product ID', 'Quantity', 'Reason', 'Resolution', 'Valley', 'Remarks'],
  OFFLINE_SALES: ['Dispatch ID', 'Distributor ID', 'Branch ID', 'Date', 'Product ID', 'Quantity', 'Amount Due', 'Payment Terms', 'Notes'],
};
export class ImportValidationError extends Error { readonly status = 400; }
export interface ImportCatalog {
  brands: Brand[]; products: Product[]; orders: Order[]; returns: ReturnEntry[];
  dispatches: Dispatch[]; distributors: Distributor[]; branches: Branch[];
  customers: Customer[];
}
export interface CsvImportInput { sourceType: CsvImportType; brandCode: string; fileName: string; batchId: string; csv: string }
export interface ValidatedImport {
  sourceType: CsvImportType; brandCode: string; fileName: string; batchId: string; totalRows: number;
  orders?: Order[]; returns?: ReturnEntry[]; dispatches?: Dispatch[];
  preview: { reference: string; product: string; quantity: number; amount?: number }[];
}

/** Reject malformed quotes, duplicate headers and shifted cells before interpreting any row. */
export function parseImportCsv(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  if (typeof csv !== 'string' || !csv.trim() || csv.length > 300000) throw new ImportValidationError('Choose a non-empty CSV file smaller than 300 KB.');
  const lines: string[][] = []; let row: string[] = []; let cell = ''; let state: 'plain' | 'quoted' | 'closed' = 'plain';
  const input = csv.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const finishRow = () => { row.push(cell.trim()); if (row.some(Boolean)) lines.push(row); row = []; cell = ''; state = 'plain'; };
  for (const char of input) {
    if (state === 'quoted') { if (char === '"') state = 'closed'; else cell += char; continue; }
    if (state === 'closed' && char === '"') { cell += '"'; state = 'quoted'; continue; }
    if (char === ',') { row.push(cell.trim()); cell = ''; state = 'plain'; continue; }
    if (char === '\n') { finishRow(); continue; }
    if (state === 'closed') { if (!/\s/.test(char)) throw new ImportValidationError('Unexpected text after a closing quote.'); continue; }
    if (char === '"') { if (cell.trim()) throw new ImportValidationError('Quotes must surround an entire CSV cell.'); cell = ''; state = 'quoted'; }
    else cell += char;
  }
  if (state === 'quoted') throw new ImportValidationError('The CSV contains an unclosed quoted cell.');
  if (cell || row.length) finishRow();
  const headers = lines.shift() || [];
  if (!headers.length || headers.some((header) => !header) || new Set(headers).size !== headers.length) throw new ImportValidationError('CSV headers must be non-empty and unique.');
  if (!lines.length || lines.length > 50) throw new ImportValidationError('Import between 1 and 50 data rows at a time.');
  const rows = lines.map((values, index) => {
    if (values.length !== headers.length) throw new ImportValidationError(`Row ${index + 2}: expected ${headers.length} cells, received ${values.length}.`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
  return { headers, rows };
}
const required = (row: Record<string, string>, field: string) => { const value = row[field]?.trim(); if (!value || value.length > 500) throw new ImportValidationError(`${field} is required (maximum 500 characters).`); return value; };
const number = (row: Record<string, string>, field: string, integer = false) => {
  const raw = required(row, field);
  if (!(integer ? /^[1-9]\d*$/ : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).test(raw)) throw new ImportValidationError(`${field} must be ${integer ? 'a positive whole number' : 'a non-negative amount with at most two decimal places'}.`);
  const value = Number(raw); if (!Number.isSafeInteger(integer ? value : Math.round(value * 100)) || value > 1000000000) throw new ImportValidationError(`${field} is too large.`); return value;
};
const choice = <T extends string>(row: Record<string, string>, field: string, allowed: readonly T[]): T => { const value = required(row, field); if (!allowed.includes(value as T)) throw new ImportValidationError(`${field} must be one of: ${allowed.join(', ')}.`); return value as T; };
const date = (row: Record<string, string>) => {
  const value = required(row, 'Date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new ImportValidationError('Date must be a real date in YYYY-MM-DD format.');
  const bs = adToBs(value); if (!Object.hasOwn(BS_MONTH_DAYS, bs.year)) throw new ImportValidationError('Date must fall within the supported BS calendar years 2078–2085.');
  return { ad: value, bs: bs.formatted };
};
const exact = <T extends { id: string }>(rows: T[], id: string, label: string): T => { const matches = rows.filter((row) => row.id === id); if (matches.length !== 1) throw new ImportValidationError(`${label} "${id}" must match exactly one existing record ID.`); return matches[0]; };
const platforms = ['Instagram', 'Messenger', 'WhatsApp', 'Website', 'TikTok', 'Walk-in', 'Pathao Bazaar', 'Phone Call', 'Field Order', 'YouTube', 'Facebook', 'Other'] as const;
const terms = ['COD', 'Prepaid', 'Credit 15 days', 'Credit 30 days', 'Advance'] as const;

export function validateCsvImport(input: CsvImportInput, catalog: ImportCatalog, actorName: string): ValidatedImport {
  if (!input || !Object.hasOwn(IMPORT_COLUMNS, input.sourceType)) throw new ImportValidationError('Only orders, returns and dispatches can be imported.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.batchId || '')) throw new ImportValidationError('Invalid import batch ID. Choose the file again.');
  if (typeof input.fileName !== 'string' || !input.fileName.trim() || input.fileName.length > 200) throw new ImportValidationError('A file name is required.');
  const brands = catalog.brands.filter((brand) => brand.code === input.brandCode && brand.isActive !== false && brand.status !== 'ARCHIVED');
  if (brands.length !== 1) throw new ImportValidationError('Select exactly one active, existing brand.');
  const { headers, rows } = parseImportCsv(input.csv);
  const expected = IMPORT_COLUMNS[input.sourceType];
  if (headers.length !== expected.length || headers.some((header) => !expected.includes(header))) throw new ImportValidationError(`Use the current ${input.sourceType.toLowerCase()} template. Required headers: ${expected.join(', ')}.`);
  const result: ValidatedImport = { sourceType: input.sourceType, brandCode: input.brandCode, fileName: input.fileName.trim(), batchId: input.batchId, totalRows: rows.length, preview: [] };
  const seen = new Set<string>(); const returned = new Map<string, number>(); const now = new Date().toISOString();
  rows.forEach((row, index) => {
    try {
      const day = date(row); const product = exact(catalog.products, required(row, 'Product ID'), 'Product');
      if (product.brandCode !== input.brandCode) throw new ImportValidationError('The product belongs to a different brand.');
      if (input.sourceType !== 'RETURNS' && product.active === false) throw new ImportValidationError('The product is archived.');
      const quantity = number(row, 'Quantity', true);
      if (input.sourceType === 'ORDERS') {
        const reference = required(row, 'Order Number').toUpperCase(); const normalized = reference;
        if (seen.has(normalized) || catalog.orders.some((order) => order.orderNumber.trim().toUpperCase() === normalized)) throw new ImportValidationError(`Order Number "${reference}" already exists or is repeated in this file.`);
        seen.add(normalized);
        const phone = required(row, 'Phone'); if (!/^\+?[0-9 ()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) throw new ImportValidationError('Phone must contain a real 7–15 digit customer phone number.');
        const matchingCustomers = catalog.customers.filter((customer) => normalizePhoneNumber(customer.phone) === normalizePhoneNumber(phone));
        if (matchingCustomers.length > 1) throw new ImportValidationError('Phone matches multiple customer records. Resolve that duplicate before importing.');
        const customerPhone = matchingCustomers[0]?.phone || normalizePhoneNumber(phone);
        const unitPrice = number(row, 'Unit Price'); const totalAmount = Math.round(quantity * unitPrice * 100) / 100;
        if (!Number.isSafeInteger(Math.round(totalAmount * 100))) throw new ImportValidationError('Order total is too large.');
        const order: Order = { id: `ord_import_${input.batchId}_${index + 1}`, orderNumber: reference, brandCode: input.brandCode,
          orderDateAd: day.ad, orderDateBs: day.bs, customerName: required(row, 'Customer Name'), customerPhone,
          province: required(row, 'Province'), district: required(row, 'District'), address: required(row, 'Address'),
          platform: choice(row, 'Platform', platforms), deliveryMethod: choice(row, 'Delivery Method', ['Standard', 'Pathao', 'InDrive', 'Yango', 'Pick-up'] as const),
          paymentTerms: choice(row, 'Payment Terms', terms), orderType: choice(row, 'Order Type', ['NEW', 'REPEAT'] as const),
          status: choice(row, 'Status', ['PENDING', 'DISPATCHED', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED', 'EXCHANGED'] as const), source: 'MANUAL',
          items: [{ productId: product.id, productName: product.name, brandCode: product.brandCode, quantity, unitPrice, totalPrice: totalAmount }], totalAmount, notes: row.Notes, createdAt: now };
        (result.orders ||= []).push(order); result.preview.push({ reference, product: product.name, quantity, amount: totalAmount });
      } else if (input.sourceType === 'RETURNS') {
        const order = exact(catalog.orders, required(row, 'Order ID'), 'Order');
        if (order.brandCode !== input.brandCode) throw new ImportValidationError('The order belongs to a different brand.');
        const purchased = order.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
        const key = `${order.id}:${product.id}`; if (seen.has(key)) throw new ImportValidationError('A return for this order and product is repeated in the file.'); seen.add(key);
        const earlier = catalog.returns.filter((entry) => entry.orderId === order.id && entry.productId === product.id && entry.orderStatus !== 'Rejected').reduce((sum, entry) => sum + entry.quantity, 0);
        if (!purchased || quantity + earlier + (returned.get(key) || 0) > purchased) throw new ImportValidationError('Return quantity exceeds the remaining quantity on the exact order/product.');
        returned.set(key, quantity);
        const entry: ReturnEntry = { id: `ret_import_${input.batchId}_${index + 1}`, orderId: order.id, orderNumber: order.orderNumber, brandCode: input.brandCode, productId: product.id, productName: product.name,
          customerName: order.customerName, customerPhone: order.customerPhone, platform: order.platform, dateAd: day.ad, dateBs: day.bs, quantity,
          reasonCategory: choice(row, 'Reason', ['Damage', 'Wrong product sent', 'Product not as described', 'Allergic reaction', 'Quality defect', 'Size issue', 'Color mismatch', 'Changed mind'] as const),
          orderStatus: choice(row, 'Resolution', ['Exchanged', 'Returned', 'Refunded', 'Pending', 'Rejected'] as const), valley: choice(row, 'Valley', ['Inside', 'Outside'] as const), issueCategories: [], remarks: row.Remarks, createdAt: now };
        (result.returns ||= []).push(entry); result.preview.push({ reference: order.orderNumber, product: product.name, quantity });
      } else {
        const id = required(row, 'Dispatch ID');
        if (!/^[A-Za-z0-9_:-]{1,180}$/.test(id) || seen.has(id) || catalog.dispatches.some((entry) => entry.id === id)) throw new ImportValidationError('Dispatch ID must be a new, unique ID using letters, numbers, underscores, colons or hyphens.'); seen.add(id);
        const distributor = exact(catalog.distributors, required(row, 'Distributor ID'), 'Distributor');
        const branch = row['Branch ID'] ? exact(catalog.branches, row['Branch ID'], 'Branch') : undefined;
        if (branch && branch.distributorId !== distributor.id) throw new ImportValidationError('The branch does not belong to the selected distributor.');
        const stock = branch?.brandsAvailable || distributor.brandsCarried;
        if (stock?.length && !stock.includes(input.brandCode)) throw new ImportValidationError('The receiving entity does not carry this brand.');
        const amount = number(row, 'Amount Due');
        const entry: Dispatch = { id, distributorId: distributor.id, distributorName: distributor.name, branchId: branch?.id, branchName: branch?.name,
          dispatchDateAd: day.ad, dispatchDateBs: day.bs, items: [{ productId: product.id, productName: product.name, brandCode: product.brandCode, quantity }],
          paymentTerms: choice(row, 'Payment Terms', terms), amountDue: amount, paymentStatus: 'PENDING', notes: row.Notes, createdBy: actorName, createdAt: now, edits: [] };
        (result.dispatches ||= []).push(entry); result.preview.push({ reference: id, product: product.name, quantity, amount });
      }
    } catch (error) { throw new ImportValidationError(`Row ${index + 2}: ${error instanceof Error ? error.message : 'Invalid row.'}`); }
  });
  return result;
}
