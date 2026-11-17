import { createHash } from 'node:crypto';
import type { DatabaseService } from './db-service';
import type { Order, OrderItem } from '../types';
import { canAccessBrand } from '../permissions';
import { normalizePhoneNumber } from '../auth-utils';
import { isSellableCombo } from '../product-catalog';
import { activeOrderOptionNames } from '../order-options';
import { adToBs } from '../nepali-calendar';
import { allocateOrderTotal } from '../extractor-export';

export class ExtractorInputError extends Error { constructor(message: string, public status = 400) { super(message); } }
const required = (value: unknown, label: string, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new ExtractorInputError(`${label} is required (maximum ${max} characters).`);
  return value.trim();
};
const optional = (value: unknown, label: string, max = 200) => value == null || typeof value === 'string' && !value.trim() ? '' : required(value, label, max);
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export async function saveExtractedOrders(input: any, workspace: { db: DatabaseService; commit(): Promise<void | Record<string, string>> }) {
  if (!Array.isArray(input?.orders) || input.orders.length < 1 || input.orders.length > 50) throw new ExtractorInputError('Save between 1 and 50 orders at a time.');
  const { db } = workspace; const actor = db.getCurrentUser(); const seen = new Set<string>();
  const pending: { existing: Order | null; order: (Omit<Order, 'id' | 'createdAt'> & { id: string }) | null; orderNumber: string }[] = (input.orders as any[]).map((row: any, index: number) => {
    const label = `Order ${index + 1}`;
    const clientId = required(row?.clientId, `${label} identifier`, 100);
    if (!/^ext_[a-z0-9_-]{8,90}$/i.test(clientId) || seen.has(clientId)) throw new ExtractorInputError(`${label} has an invalid or duplicate identifier.`);
    seen.add(clientId);
    const orderNumber = `BB-WA-${clientId.slice(4).toUpperCase()}`;
    const requestHash = createHash('sha256').update(JSON.stringify(row)).digest('hex');
    // The extractor's own reference is kept as the legacy ID; the server gives the order its short ID.
    const existing = db.getOrders().find(order => order.legacyOrderNumber === orderNumber || order.orderNumber === orderNumber);
    if (existing) {
      if (existing.extractorRequestHash !== requestHash) throw new ExtractorInputError(`${label} was already saved with different details.`, 409);
      return { existing, order: null, orderNumber };
    }
    const customerName = required(row.customerName, `${label} customer name`);
    const customerPhone = normalizePhoneNumber(required(row.customerPhone, `${label} phone`));
    if (!/^9[678]\d{8}$/.test(customerPhone)) throw new ExtractorInputError(`${label} needs a valid Nepal mobile number.`);
    if (db.getCustomers().filter(customer => normalizePhoneNumber(customer.phone) === customerPhone).length > 1) throw new ExtractorInputError(`${label} matches duplicate customer profiles. Resolve them before saving.`, 409);
    if (row.isMarketing) throw new ExtractorInputError('Marketing sends are created from the influencer profile. The extractor saves customer orders only.');
    const alternatePhone = row.alternatePhone ? normalizePhoneNumber(required(row.alternatePhone, `${label} alternate phone`)) : '';
    if (alternatePhone && !/^9[678]\d{8}$/.test(alternatePhone)) throw new ExtractorInputError(`${label} alternate phone is invalid.`);
    const province = optional(row.province, `${label} province`), district = optional(row.city, `${label} city`), address = required(row.address, `${label} address`, 500);
    const orderDateAd = required(row.orderDateAd, `${label} date`, 10);
    const date = new Date(`${orderDateAd}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDateAd) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== orderDateAd) throw new ExtractorInputError(`${label} date is invalid.`);
    const platform = required(row.platform, `${label} sales channel`, 100), deliveryMethod = required(row.deliveryMethod, `${label} logistics`, 100);
    if (!activeOrderOptionNames(db.getOrderOptions(),'channels').includes(platform) || !activeOrderOptionNames(db.getOrderOptions(),'deliveryMethods').includes(deliveryMethod)) throw new ExtractorInputError(`${label} needs an active sales channel and logistics option.`);
    if (!['COD','Prepaid'].includes(row.paymentTerms)) throw new ExtractorInputError(`${label} payment must be COD or Prepaid.`);
    if (!Array.isArray(row.items) || row.items.length === 0 || row.items.length > 50) throw new ExtractorInputError(`${label} needs catalogue items.`);
    const products = db.getProducts(), combos = db.getCombos();
    const items: { productId: string; productName: string; brandCode: string; quantity: number; unitPrice: number; totalPrice: number; catalogUnitPrice: number }[] = (row.items as any[]).map((item: any) => {
      if (!item || typeof item.productId !== 'string' || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) throw new ExtractorInputError(`${label} has an invalid item quantity.`);
      const product = products.find(candidate => candidate.id === item.productId && candidate.active !== false);
      const combo = combos.find(candidate => candidate.id === item.productId && isSellableCombo(candidate, products));
      const selected = product || combo; if (!selected || !canAccessBrand(actor, selected.brandCode)) throw new ExtractorInputError(`${label} contains an unavailable item. Refresh and extract again.`, 409);
      const price = product ? product.mrp : combo!.comboPrice || combo!.comboMrp || 0;
      if (!Number.isFinite(price) || price <= 0 || typeof item.expectedUnitPrice !== 'number' || !Number.isFinite(item.expectedUnitPrice) || Math.abs(item.expectedUnitPrice - price) > 0.005) throw new ExtractorInputError(`${label} has a changed or invalid catalogue price. Refresh and extract again.`, 409);
      const salePrice = item.saleUnitPrice == null ? price : item.saleUnitPrice;
      if (typeof salePrice !== 'number' || !Number.isFinite(salePrice) || salePrice < 0 || salePrice > price || Math.abs(salePrice * 100 - Math.round(salePrice * 100)) > 1e-6) throw new ExtractorInputError(`${label} item selling price must be between zero and the catalogue price.`);
      return { productId: selected.id, productName: selected.name, brandCode: selected.brandCode, quantity: item.quantity, catalogUnitPrice: price, unitPrice: salePrice, totalPrice: money(salePrice * item.quantity) };
    });
    if (new Set(items.map(item => item.brandCode)).size !== 1) throw new ExtractorInputError(`${label} contains multiple brands; split it into separate orders.`);
    const brandCode = items[0].brandCode;
    if (!db.getBrands('ACTIVE').some(brand => brand.code === brandCode)) throw new ExtractorInputError(`${label} brand is no longer active.`, 409);
    const catalogCents = items.reduce((sum,item) => sum + Math.round(item.totalPrice * 100), 0);
    if (!Number.isSafeInteger(catalogCents) || catalogCents < 0) throw new ExtractorInputError(`${label} item total is too large.`);
    const stated = row.statedPrice == null ? null : Number(row.statedPrice);
    const discount = row.discountPercent == null ? null : Number(row.discountPercent);
    if (stated !== null && (!Number.isFinite(stated) || stated < 0 || Math.abs(stated * 100 - Math.round(stated * 100)) > 1e-6 || !Number.isSafeInteger(Math.round(stated * 100)) || stated * 100 > catalogCents + 0.5)) throw new ExtractorInputError(`${label} stated amount cannot exceed the item selling prices.`);
    if (discount !== null && (!Number.isFinite(discount) || discount < 0 || discount > 100 || Math.abs(discount * 100 - Math.round(discount * 100)) > 1e-6)) throw new ExtractorInputError(`${label} discount must be between 0 and 100%.`);
    const discountedCents = discount === null ? catalogCents : Math.round(catalogCents * (1 - discount / 100));
    // A written price wins over a percentage; the percentage is kept as a record of the offer.
    const targetCents = stated === null ? discountedCents : Math.round(stated * 100);
    const totals = allocateOrderTotal(items, targetCents / 100);
    const adjusted: OrderItem[] = items.map((item,i) => ({ ...item, totalPrice: totals[i], unitPrice: totals[i] / item.quantity, discountAmount: money(item.catalogUnitPrice * item.quantity - totals[i]) }));
    const bs = adToBs(date);
    // A fixed record ID per extracted message means a double submit can never save the order twice.
    const order: Omit<Order,'id'|'createdAt'> & { id: string } = { id: `ord_${clientId}`, orderNumber, extractorRequestHash: requestHash, brandCode, orderDateAd, orderDateBs: `${bs.monthName} ${bs.day}, ${bs.year}`,
      platform, customerName, customerPhone, ...(alternatePhone ? { alternatePhone } : {}), province, district, address, deliveryMethod, ...(row.assignedToId ? { assignedToId: required(row.assignedToId, `${label} responsible person`) } : {}),
      paymentTerms: row.paymentTerms, orderType: 'NEW', items: adjusted, totalAmount: targetCents / 100,
      ...(stated !== null ? { statedPrice: stated } : {}), ...(discount !== null ? { discountPercent: discount } : {}), status: 'PENDING', source: 'WHATSAPP_EXTRACTOR', notes: 'Extracted and reviewed from WhatsApp.' };
    return { existing: null, order, orderNumber };
  });
  for (const entry of pending) if (entry.order) db.addOrder(entry.order);
  const assigned = pending.some(entry => entry.order) ? await workspace.commit() || {} : {};
  return { orderNumbers: pending.map(entry => entry.existing?.orderNumber || (entry.order && assigned[entry.order.id]) || entry.orderNumber), alreadySaved: pending.filter(entry => entry.existing).length };
}
