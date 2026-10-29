import type { DatabaseService } from '@/lib/db/db-service';
import type { SharedAccessLink } from '@/lib/types';
import { validDateAd } from '../../_workspace';

export type PortalTab = 'dashboard' | 'products' | 'delivery-failures' | 'returns';
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
  deliveryFailures?: { id: string; dateAd: string; dateBs: string; brandCode: string; customerName: string; customerPhone: string; valley: string; reason: string; status: string }[];
  returns?: { id: string; dateAd: string; dateBs: string; brandCode: string; productName: string; customerName: string; customerPhone: string; reasonCategory: string; orderStatus: string }[];
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

export function projectSharedPortal(db: DatabaseService, link: SharedAccessLink): SharedPortalData {
  validateSharedLink(link);
  const includes = (...pages: string[]) => pages.some(page => (link.allowedPages as string[]).includes(page));
  const allowedPages: PortalTab[] = [];
  if (includes('dashboard', 'DASHBOARD_OVERVIEW')) allowedPages.push('dashboard');
  if (includes('products', 'PRODUCT_PERFORMANCE')) allowedPages.push('products');
  if (includes('delivery-failures', 'RETURNS_FAILURES')) allowedPages.push('delivery-failures');
  if (includes('returns', 'RETURNS_FAILURES')) allowedPages.push('returns');
  if (allowedPages.length === 0) throw new SharedAccessError('No supported shared modules are enabled.');
  const scope = link.brandScope === 'ALL' ? 'ALL' : Array.isArray(link.brandScope) ? link.brandScope : link.brandFilter;
  if (scope !== 'ALL' && (!Array.isArray(scope) || scope.length === 0)) throw new SharedAccessError('No shared brands are enabled.');
  const inBrand = (brand: string) => scope === 'ALL' || scope.some(code => code.toUpperCase() === String(brand).toUpperCase());
  const inDate = (value: string) => link.dateRangeType !== 'FIXED' || !!value && value.slice(0, 10) >= link.dateFrom! && value.slice(0, 10) <= link.dateTo!;
  const orders = db.getOrders().filter(order => inBrand(order.brandCode) && !order.isMarketing && inDate(order.orderDateAd));
  const products = db.getProducts().filter(product => inBrand(product.brandCode));
  const failures = db.getDeliveryFailures().filter(failure => inBrand(failure.brandCode) && inDate(failure.dateAd));
  const returns = db.getReturns().filter(entry => inBrand(entry.brandCode) && inDate(entry.dateAd));
  const customerName = (name: string) => link.showCustomerDetails === true ? String(name || '').trim().split(/\s+/).filter(Boolean).map(part => `${part.charAt(0)}***`).join(' ') : 'Hidden';
  const customerPhone = (phone: string) => link.showCustomerDetails === true && String(phone || '').length >= 6 ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : 'Hidden';
  const result: SharedPortalData = { link: { name: link.name, allowedPages, brandScope: scope, expiresAt: link.expiresAt, dateRangeType: link.dateRangeType, dateFrom: link.dateFrom, dateTo: link.dateTo } };
  if (allowedPages.includes('dashboard')) result.summary = { totalOrders: orders.length, failureCount: failures.length, returnCount: returns.length, productCount: products.length };
  if (allowedPages.includes('products')) result.products = products.map(product => ({ id: product.id, name: link.showProductNames === true ? product.name : 'Hidden product', brandCode: product.brandCode, category: product.category, sku: link.showProductNames === true ? product.sku : 'Hidden', orderCount: orders.filter(order => order.items.some(item => item.productId === product.id)).length, returnCount: returns.filter(entry => entry.productId === product.id).length }));
  if (allowedPages.includes('delivery-failures')) result.deliveryFailures = link.showOrderRows === true ? failures.map(failure => ({ id: failure.id, dateAd: failure.dateAd, dateBs: failure.dateBs, brandCode: failure.brandCode, customerName: customerName(failure.customerName), customerPhone: customerPhone(failure.customerPhone), valley: failure.valley, reason: failure.reason, status: failure.status || 'FAILED' })) : [];
  if (allowedPages.includes('returns')) result.returns = link.showOrderRows === true ? returns.map(entry => ({ id: entry.id, dateAd: entry.dateAd, dateBs: entry.dateBs, brandCode: entry.brandCode, productName: link.showProductNames === true ? entry.productName : 'Hidden product', customerName: customerName(entry.customerName), customerPhone: customerPhone(entry.customerPhone), reasonCategory: entry.reasonCategory, orderStatus: entry.orderStatus })) : [];
  return result;
}
