/**
 * Excel files for one record: a single dispatch order, store order or shelf count, laid out
 * so it can be sent to a vendor or store as it is (heading rows, then the lines).
 */
import type { Brand, Dispatch, Product, SecondaryOrder, StockCount } from '../types';
import { buildWorkbook, downloadWorkbook, type Column, type Sheet } from './xlsx';
import { destinationName, dispatchStatus, statusLabel } from '../dispatch-flow';
import { productLabel, subBrandName } from '../sub-brands';
import { photoLink } from '../photo-links';

const fileSafe = (text: string) => text.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'record';

/** "Label | value" lines above the table, leaving out empty ones. */
function heading(pairs: [string, string | number | undefined | null][]): [string, string | number][] {
  return pairs.filter(([, value]) => value !== undefined && value !== null && value !== '').map(([label, value]) => [label, value as string | number]);
}

export function dispatchWorkbookSheets(dispatch: Dispatch, products: Product[], brands: Brand[], withMoney: boolean): Sheet[] {
  const columns: Column[] = [{ header: '#' }, { header: 'Product' }, { header: 'Full name' }, { header: 'Brand' }, { header: 'Sub-brand' }, { header: 'Units ordered', type: 'number' }, { header: 'Units sent', type: 'number' }, { header: 'Cartons', type: 'number' }, { header: 'Loose units', type: 'number' },
    ...(withMoney ? [{ header: 'Rate (NPR)', type: 'money' as const }, { header: 'Amount (NPR)', type: 'money' as const }] : [])];
  const rows = dispatch.items.map((item, index) => {
    const product = products.find((p) => p.id === item.productId);
    const size = product?.caseSize || 0;
    return [index + 1, productLabel(product, item.productName), item.productName, brands.find((b) => b.code === item.brandCode)?.name || item.brandCode, subBrandName(brands, item.subBrandId || product?.subBrandId) || '',
      item.orderedQty ?? item.quantity, item.quantity, size ? Math.floor(item.quantity / size) : '', size ? item.quantity % size : item.quantity,
      ...(withMoney ? [item.unitPrice ?? '', item.unitPrice ? item.unitPrice * item.quantity : ''] : [])];
  });
  const units = dispatch.items.reduce((sum, item) => sum + item.quantity, 0);
  const value = dispatch.items.reduce((sum, item) => sum + item.quantity * (item.unitPrice || 0), 0);
  const totals = ['', 'Total', '', '', '', dispatch.items.reduce((sum, item) => sum + (item.orderedQty ?? item.quantity), 0), units, '', '', ...(withMoney ? ['', value || ''] : [])];
  const head = heading([
    ['Order challan', dispatch.dispatchNumber || ''], ['Store order', dispatch.orderNumber], ['Status', statusLabel(dispatchStatus(dispatch))],
    ['Going to', destinationName(dispatch)], ['Chain', dispatch.branchName && dispatch.distributorName !== dispatch.branchName ? dispatch.distributorName : ''],
    ['Delivered by', dispatch.fulfilledBy === 'DISTRIBUTOR' ? dispatch.fulfillerName || 'Distributor' : 'Our warehouse'],
    ['Ordered on', dispatch.orderDateAd || dispatch.createdAt?.slice(0, 10)], ['Sent on', dispatch.dispatchDateAd ? `${dispatch.dispatchDateAd} (${dispatch.dispatchDateBs})` : ''],
    ['Delivered on', dispatch.deliveredDateAd], ['Payment terms', dispatch.paymentTerms], ['Payment due', dispatch.paymentDueDateAd],
    ['Notes', dispatch.notes], ['Signed challan', photoLink(dispatch.documentUrl)],
  ]);
  return [{ name: dispatch.dispatchNumber || 'Dispatch', intro: head, columns, rows: [...rows, totals] }];
}

export function downloadDispatchWorkbook(dispatch: Dispatch, products: Product[], brands: Brand[], withMoney: boolean) {
  const name = `${dispatch.dispatchNumber || 'Dispatch'}_${fileSafe(destinationName(dispatch))}`;
  downloadWorkbook(dispatchWorkbookSheets(dispatch, products, brands, withMoney), name, { title: `Order challan ${dispatch.dispatchNumber || ''}` });
}

export function storeOrderWorkbookSheets(order: SecondaryOrder, products: Product[], brands: Brand[], withMoney: boolean): Sheet[] {
  const columns: Column[] = [{ header: '#' }, { header: 'Product' }, { header: 'Full name' }, { header: 'Brand' }, { header: 'Sub-brand' }, { header: 'Cartons', type: 'number' }, { header: 'Units per carton', type: 'number' }, { header: 'Units', type: 'number' }, { header: 'Free units', type: 'number' }, { header: 'Scheme' },
    ...(withMoney ? [{ header: 'Rate (NPR)', type: 'money' as const }, { header: 'Amount (NPR)', type: 'money' as const }] : [])];
  const rows = order.items.map((item, index) => {
    const product = products.find((p) => p.id === item.productId);
    return [index + 1, productLabel(product, item.productName), item.productName, brands.find((b) => b.code === item.brandCode)?.name || item.brandCode, subBrandName(brands, item.subBrandId || product?.subBrandId) || '',
      item.cases, item.unitsPerCase, item.totalUnits, item.freeUnits || '', item.appliedScheme || '', ...(withMoney ? [item.unitPrice, item.totalAmount] : [])];
  });
  const totals = ['', 'Total', '', '', '', order.items.reduce((s, i) => s + (i.cases || 0), 0), '', order.totalUnits, order.items.reduce((s, i) => s + (i.freeUnits || 0), 0) || '', '', ...(withMoney ? ['', order.totalAmount] : [])];
  const head = heading([['Store order', order.orderNumber], ['Store', order.storeName], ['Contact', [order.contactName, order.contactPhone].filter(Boolean).join(', ')], ['Taken by', order.officerName],
    ['Date', `${order.orderDateAd} (${order.orderDateBs})`], ['Status', order.status.replace('_', ' ').toLowerCase()], ['Dispatch order', order.dispatchNumber], ['Payment terms', order.paymentTerms], ['Notes', order.notes], ['Order photo', photoLink(order.orderPhotoUrl)]]);
  return [{ name: order.orderNumber || 'Store order', intro: head, columns, rows: [...rows, totals] }];
}

export function downloadStoreOrderWorkbook(order: SecondaryOrder, products: Product[], brands: Brand[], withMoney: boolean) {
  downloadWorkbook(storeOrderWorkbookSheets(order, products, brands, withMoney), `${order.orderNumber || 'Store-order'}_${fileSafe(order.storeName)}`, { title: `Store order ${order.orderNumber}` });
}

export function stockCountWorkbookSheets(count: StockCount, products: Product[], brands: Brand[]): Sheet[] {
  const columns: Column[] = [{ header: '#' }, { header: 'Product' }, { header: 'Full name' }, { header: 'Brand' }, { header: 'Sub-brand' }, { header: 'On shelf', type: 'number' }, { header: 'Restocked', type: 'number' }, { header: 'Damaged', type: 'number' }];
  const rows = count.items.map((item, index) => {
    const product = products.find((p) => p.id === item.productId);
    return [index + 1, productLabel(product, item.productName), item.productName, brands.find((b) => b.code === item.brandCode)?.name || item.brandCode, subBrandName(brands, item.subBrandId || product?.subBrandId) || '', item.shelfQty, item.restockedQty || '', item.damagedQty || ''];
  });
  const totals = ['', 'Total', '', '', '', count.items.reduce((s, i) => s + (i.shelfQty || 0), 0), count.items.reduce((s, i) => s + (i.restockedQty || 0), 0) || '', count.items.reduce((s, i) => s + (i.damagedQty || 0), 0) || ''];
  const head = heading([['Shelf count', count.storeName], ['Date', `${count.dateAd}${count.dateBs ? ` (${count.dateBs})` : ''}`], ['Counted by', count.officerName], ['Notes', (count as StockCount & { notes?: string }).notes]]);
  return [{ name: 'Shelf count', intro: head, columns, rows: [...rows, totals] }];
}

export function downloadStockCountWorkbook(count: StockCount, products: Product[], brands: Brand[]) {
  downloadWorkbook(stockCountWorkbookSheets(count, products, brands), `Shelf-count_${fileSafe(count.storeName)}_${count.dateAd}`, { title: `Shelf count ${count.storeName}` });
}

/** Build without downloading (tests, Drive). */
export const recordWorkbook = (sheets: Sheet[], title: string) => buildWorkbook(sheets, { title });
