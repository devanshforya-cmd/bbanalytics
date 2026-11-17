import { generateCSV } from './csv';
import type { ExtractedOrderResult } from './whatsapp-extractor';
import type { Product } from './types';

/** Allocate discount in whole paisa, preserving the exact order total. */
export function allocateOrderTotal(items: { unitPrice: number; quantity: number }[], total: number): number[] {
  const bases = items.map(item => Math.round(item.unitPrice * item.quantity * 100));
  const catalog = bases.reduce((sum, value) => sum + value, 0);
  const target = Math.round(total * 100);
  if (!Number.isSafeInteger(target) || target < 0 || target > catalog || catalog < 0) throw new Error('Invalid order total.');
  if (catalog === 0) return bases.map(() => 0);
  const allocation = bases.map((base, index) => { const exact = target * base / catalog; return { index, cents: Math.floor(exact), fraction: exact - Math.floor(exact) }; });
  let remainder = target - allocation.reduce((sum, item) => sum + item.cents, 0);
  allocation.sort((a,b) => b.fraction - a.fraction || a.index - b.index);
  for (const item of allocation) if (remainder-- > 0) item.cents++;
  return allocation.sort((a,b) => a.index - b.index).map(item => item.cents / 100);
}
export function followUpDates(value: string): [string, string] {
  const date = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) return ['', ''];
  const after21 = new Date(date); after21.setUTCDate(after21.getUTCDate() + 21);
  const day = date.getUTCDate(); const targetMonth = date.getUTCMonth() + 2;
  const last = new Date(Date.UTC(date.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  const after2Months = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, Math.min(day, last), 12));
  return [after21.toISOString().slice(0,10), after2Months.toISOString().slice(0,10)];
}
export function extractorCSV(orders: ExtractedOrderResult[], products: Product[], defaultChannel: string): string {
  const columns = ['S.N.','Order ID','Order Placed Date','Order Type','Order Platform','Customer Name','Customer Phone Number','Alternate Phone Number','Province','Product Category','Product Name','MRP (Rs.)','Quantity Ordered','Discount (Rs.)','Line Revenue (Rs.)','Delivery Status','Remarks','Follow up-1 (21 days)','Follow up-2 (2 months)'];
  let serial = 0;
  const rows = orders.flatMap(order => {
    const total = order.isMarketing ? 0 : order.totalAmount.value;
    let allocation: number[] = [];
    try { if (order.products.length) allocation = allocateOrderTotal(order.products.map(item => ({ ...item, unitPrice: item.saleUnitPrice ?? item.unitPrice })), total); } catch { /* Incomplete orders remain explicitly marked for review. */ }
    const followUps = followUpDates(order.orderDateAd.value);
    const items = order.products.length ? order.products : [null];
    return items.map((item,index) => {
      const amount = item ? allocation[index] : undefined;
      const original = item ? Math.round(item.unitPrice * item.quantity * 100) / 100 : undefined;
      const values: unknown[] = [++serial,'',order.orderDateAd.value,'New',order.salesChannel ?? defaultChannel,order.customerName.value,order.customerPhone.value,order.alternatePhone.value,order.province.value,
        item?.isCombo ? 'Combo' : products.find(product => product.id === item?.productId)?.category || '', item?.name || 'Review manually',item?.unitPrice ?? '',item?.quantity ?? '',
        original !== undefined && amount !== undefined ? Math.round((original - amount) * 100) / 100 : '', amount ?? '', '',
        [item?.isCombo ? `Combo: ${item.name}` : '', order.extractionErrors.length ? `Review: ${order.extractionErrors.join('; ')}` : ''].filter(Boolean).join('; '), ...followUps];
      return Object.fromEntries(columns.map((column,i) => [column, typeof values[i] === 'string' && /^[\s]*[=+\-@\t\r]/.test(values[i] as string) ? `'${values[i]}` : values[i]]));
    });
  });
  return generateCSV(columns.map(column => ({key:column,label:column})),rows);
}
