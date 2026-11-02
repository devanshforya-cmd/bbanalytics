import type { Brand, Combo, Customer, Product } from './types';
import type { WorkspaceSnapshot } from './db/workspace-types';

/** Check references by identifier, including nested order lines and combo components. */
export function referencesProduct(value: unknown, id: string): boolean {
  if (Array.isArray(value)) return value.some(item => referencesProduct(item, id));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => key === 'productId' ? item === id
    : ['productIds', 'componentProductIds'].includes(key) && Array.isArray(item) ? item.includes(id)
    : referencesProduct(item, id));
}

export function productUsage(product: Product, snapshot: WorkspaceSnapshot) {
  const references = Object.entries(snapshot).flatMap(([collection, rows]) => {
    if (['activityLogs', 'notifications', 'importHistory'].includes(collection)) return [];
    const count = (rows || []).filter(row => !(collection === 'products' && row.id === product.id) && referencesProduct(row, product.id)).length;
    return count ? [{ collection, count }] : [];
  });
  return { references, stockQty: product.stockQty ?? 0, canDelete: !references.length && !product.stockQty };
}

export function isSellableCombo(combo: Combo, products: Product[]) {
  return combo.active !== false && combo.isActive !== false && !!combo.items?.length
    && combo.items.every(item => products.some(product => product.id === item.productId && product.active !== false));
}

/** Only offer a saved bundle for the exact basket, at its saved price. */
export function matchingCatalogCombo(combos: Combo[], products: Product[], items: { productId: string; quantity: number; overridePrice?: number }[], brandCode: string) {
  if (!items.length || items.some(item => item.overridePrice !== undefined || !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) return null;
  const quantities = new Map<string, number>();
  items.forEach(item => quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity));
  for (const combo of combos) {
    if (!isSellableCombo(combo, products) || combo.brandCode !== brandCode) continue;
    const required = new Map<string, number>();
    combo.items.forEach(item => required.set(item.productId, (required.get(item.productId) || 0) + item.quantity));
    if (required.size !== quantities.size || [...required].some(([id, qty]) => qty !== quantities.get(id))) continue;
    const components = [...required].map(([id, qty]) => ({ product: products.find(p => p.id === id && p.active !== false && p.brandCode === brandCode), qty }));
    if (components.some(item => !item.product)) continue;
    const originalPrice = components.reduce((sum, item) => sum + item.product!.mrp * item.qty, 0);
    if (!Number.isFinite(combo.comboPrice) || combo.comboPrice <= 0 || combo.comboPrice >= originalPrice) continue;
    return { id: combo.id, name: combo.name, originalPrice, comboPrice: combo.comboPrice, savings: originalPrice - combo.comboPrice };
  }
  return null;
}

export function customerBrandMap(customers: Customer[], brands: Brand[], products: Product[]) {
  const segments = new Map<string, number>();
  const name = (code: string) => brands.find(brand => brand.code === code)?.name || code;
  let multiBrand = 0;
  for (const customer of customers) {
    const codes = [...new Set(customer.brandsPurchased || [])].sort();
    if (codes.length > 1) multiBrand++;
    const label = codes.map(name).join(' + ') || 'No brand recorded';
    segments.set(label, (segments.get(label) || 0) + 1);
  }
  const eligibleBrands = brands.filter(brand => brand.isActive !== false && brand.status !== 'ARCHIVED'
    && products.some(product => product.brandCode === brand.code && product.active !== false));
  const crossSellOpportunities = customers.filter(customer => customer.karmaScore >= 65).flatMap(customer => {
    const target = eligibleBrands.find(brand => !customer.brandsPurchased?.includes(brand.code));
    return target ? [{ customer, currentBrands: (customer.brandsPurchased || []).map(name).join(', ') || 'No brand recorded', targetBrand: target.name,
      suggestedPitch: `Review active ${target.name} products with this customer.` }] : [];
  }).sort((a, b) => b.customer.karmaScore - a.customer.karmaScore).slice(0, 5);
  return { total: customers.length, multiBrand, segments: [...segments].map(([label, count]) => ({ label, count })), crossSellOpportunities };
}
