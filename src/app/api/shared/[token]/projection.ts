import { failureReasonLabel } from '../../../../lib/failure-reason';
import type { DatabaseService } from '@/lib/db/db-service';
import type { SharedAccessLink } from '@/lib/types';
import { validDateAd } from '../../_workspace';

import { buildMonthlySalesReport } from '@/lib/monthly-sales-report';

export type PortalTab = 'dashboard' | 'products' | 'delivery-failures' | 'returns' | 'monthly-sales';
export type SharedMonthlySales = {
  brands: { code: string; name: string }[]; brand: string; month: string; from: string; to: string;
  firstMonth: string; lastMonth: string; showMoney: boolean; report: ReturnType<typeof buildMonthlySalesReport>;
};
export interface PublicSharedLink {
  name: string;
  allowedPages: PortalTab[];
  brandScope: string[] | 'ALL';
  expiresAt?: string;
  dateRangeType: 'LIVE' | 'FIXED';
  dateFrom?: string;
  dateTo?: string;
}
export interface SharedPortalData {
  link: PublicSharedLink;
  summary?: { totalOrders: number; failureCount: number; returnCount: number; productCount: number };
  products?: { id: string; name: string; brandCode: string; category: string; sku: string; orderCount: number; returnCount: number }[];
  deliveryFailures?: { id: string; orderNumber: string; dateAd: string; dateBs: string; brandCode: string; customerName: string; customerPhone: string; valley: string; reason: string; status: string }[];
  returns?: { id: string; orderNumber: string; dateAd: string; dateBs: string; brandCode: string; productName: string; customerName: string; customerPhone: string; reasonCategory: string; orderStatus: string }[];
  monthlySales?: SharedMonthlySales;
}

const nepalToday = () => new Date(Date.now() + (5 * 60 + 45) * 60000).toISOString().slice(0, 10);
const lastDayOf = (month: string) => `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
const addMonths = (month: string, by: number) => { const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1)); return date.toISOString().slice(0, 7); };

/**
 * The monthly sales sheet for one brand and month, inside the link's brands and dates.
 * Rupee amounts leave the server only when the link allows them; product names follow the link's setting.
 */
export function sharedMonthlySales(db: DatabaseService, link: SharedAccessLink, scope: string[] | 'ALL', query: { brand?: string | null; month?: string | null }, today = nepalToday()): SharedMonthlySales {
  const brands = db.getBrands('ALL').filter((brand) => scope === 'ALL' ? brand.status !== 'ARCHIVED' : scope.some((code) => code.toUpperCase() === brand.code.toUpperCase())).map((brand) => ({ code: brand.code, name: brand.name }));
  if (!brands.length) throw new SharedAccessError('No shared brands are available.');
  const brand = brands.find((entry) => entry.code === query.brand)?.code || brands[0].code;
  const fixed = link.dateRangeType === 'FIXED';
  const lastMonth = (fixed && link.dateTo! < today ? link.dateTo! : today).slice(0, 7);
  const firstMonth = fixed ? link.dateFrom!.slice(0, 7) : addMonths(lastMonth, -23);
  const asked = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month || '') ? query.month! : lastMonth;
  const month = asked < firstMonth ? firstMonth : asked > lastMonth ? lastMonth : asked;
  let from = `${month}-01`, to = lastDayOf(month);
  if (fixed) { if (from < link.dateFrom!) from = link.dateFrom!; if (to > link.dateTo!) to = link.dateTo!; }
  const report = buildMonthlySalesReport(db.getOrders('ALL'), db.getProducts('ALL'), db.getCombos('ALL'), brand, from, to, db.getCampaigns());
  const showMoney = link.showSalesAmounts === true;
  if (link.showProductNames !== true) report.items.forEach((item, index) => { item.name = `${item.kind === 'Combo' ? 'Combo' : 'Product'} ${index + 1}`; });
  if (!showMoney) {
    for (const key of ['salesCents', 'mrpCents', 'offerCents', 'customerCents', 'giftCents'] as const) report[key] = 0;
    for (const channel of Object.keys(report.channelSales) as (keyof typeof report.channelSales)[]) report.channelSales[channel] = 0;
    report.days.forEach((day) => { day.netCents = 0; });
    report.items.forEach((item) => { item.currentPrice = null; item.mrpCents = 0; item.offerCents = 0; item.customerCents = 0; item.salesCents = 0; item.giftCents = 0; });
    report.sales.forEach((row) => { row.netCents = 0; row.offerCents = 0; });
    report.discountReasons = [];
  }
  return { brands, brand, month, from, to, firstMonth, lastMonth, showMoney, report };
}

export class SharedAccessError extends Error {
  constructor(message: string, public status = 404) { super(message); }
}

export function validateSharedLink(link: SharedAccessLink | undefined, now = Date.now()): asserts link is SharedAccessLink {
  if (!link || link.isActive !== true) throw new SharedAccessError('Access link not found or revoked.');
  if (link.expiresAt && (!Number.isFinite(Date.parse(link.expiresAt)) || Date.parse(link.expiresAt) <= now)) throw new SharedAccessError('Shared access has expired.', 410);
  if (!Array.isArray(link.allowedPages)) throw new SharedAccessError('No shared modules are enabled.');
  if (link.dateRangeType === 'FIXED' && (!validDateAd(link.dateFrom) || !validDateAd(link.dateTo) || link.dateFrom! > link.dateTo!)) throw new SharedAccessError('The shared date range is invalid.');
}

export function projectSharedPortal(db: DatabaseService, link: SharedAccessLink, query: { brand?: string | null; month?: string | null } = {}): SharedPortalData {
  validateSharedLink(link);
  const includes = (...pages: string[]) => pages.some(page => (link.allowedPages as string[]).includes(page));
  const allowedPages: PortalTab[] = [];
  if (includes('dashboard', 'DASHBOARD_OVERVIEW')) allowedPages.push('dashboard');
  if (includes('products', 'PRODUCT_PERFORMANCE')) allowedPages.push('products');
  if (includes('delivery-failures', 'RETURNS_FAILURES')) allowedPages.push('delivery-failures');
  if (includes('returns', 'RETURNS_FAILURES')) allowedPages.push('returns');
  if (includes('monthly-sales')) allowedPages.push('monthly-sales');
  if (allowedPages.length === 0) throw new SharedAccessError('No supported shared modules are enabled.');
  const scope = link.brandScope === 'ALL' ? 'ALL' : Array.isArray(link.brandScope) ? link.brandScope : link.brandFilter;
  if (scope !== 'ALL' && (!Array.isArray(scope) || scope.length === 0)) throw new SharedAccessError('No shared brands are enabled.');
  const inBrand = (brand: string) => scope === 'ALL' || scope.some(code => code.toUpperCase() === String(brand).toUpperCase());
  const inDate = (value: string) => link.dateRangeType !== 'FIXED' || !!value && value.slice(0, 10) >= link.dateFrom! && value.slice(0, 10) <= link.dateTo!;
  const orders = db.getOrders().filter(order => inBrand(order.brandCode) && !order.isMarketing && inDate(order.orderDateAd));
  const products = db.getProducts().filter(product => inBrand(product.brandCode));
  // Rows show the order's current short ID, so agencies can quote it back. Older rows may still carry a long ID.
  const shortIdOf = new Map(db.getOrders().map(order => [order.id, order.orderNumber]));
  const orderNumberOf = (orderId?: string, saved?: string) => (orderId && shortIdOf.get(orderId)) || saved || '';
  const failures = db.getDeliveryFailures().filter(failure => inBrand(failure.brandCode) && inDate(failure.dateAd));
  const returns = db.getReturns().filter(entry => inBrand(entry.brandCode) && inDate(entry.dateAd));
  const customerName = (name: string) => link.showCustomerDetails === true ? String(name || '').trim().split(/\s+/).filter(Boolean).map(part => `${part.charAt(0)}***`).join(' ') : 'Hidden';
  const customerPhone = (phone: string) => link.showCustomerDetails === true && String(phone || '').length >= 6 ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : 'Hidden';
  const result: SharedPortalData = { link: { name: link.name, allowedPages, brandScope: scope, expiresAt: link.expiresAt, dateRangeType: link.dateRangeType, dateFrom: link.dateFrom, dateTo: link.dateTo } };
  if (allowedPages.includes('dashboard')) result.summary = { totalOrders: orders.length, failureCount: failures.length, returnCount: returns.length, productCount: products.length };
  if (allowedPages.includes('products')) result.products = products.map(product => ({ id: product.id, name: link.showProductNames === true ? product.name : 'Hidden product', brandCode: product.brandCode, category: product.category, sku: link.showProductNames === true ? product.sku : 'Hidden', orderCount: orders.filter(order => order.items.some(item => item.productId === product.id)).length, returnCount: returns.filter(entry => entry.productId === product.id).length }));
  if (allowedPages.includes('delivery-failures')) result.deliveryFailures = link.showOrderRows === true ? failures.map(failure => ({ id: failure.id, orderNumber: orderNumberOf(failure.orderId, failure.orderNumber), dateAd: failure.dateAd, dateBs: failure.dateBs, brandCode: failure.brandCode, customerName: customerName(failure.customerName), customerPhone: customerPhone(failure.customerPhone), valley: failure.valley, reason: failureReasonLabel(failure), status: failure.status || 'FAILED' })) : [];
  if (allowedPages.includes('returns')) result.returns = link.showOrderRows === true ? returns.map(entry => ({ id: entry.id, orderNumber: orderNumberOf(entry.orderId, entry.orderNumber), dateAd: entry.dateAd, dateBs: entry.dateBs, brandCode: entry.brandCode, productName: link.showProductNames === true ? entry.productName : 'Hidden product', customerName: customerName(entry.customerName), customerPhone: customerPhone(entry.customerPhone), reasonCategory: entry.reasonCategory, orderStatus: entry.orderStatus })) : [];
  if (allowedPages.includes('monthly-sales')) result.monthlySales = sharedMonthlySales(db, link, scope, query);
  return result;
}
