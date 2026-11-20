import type { Combo, Product } from './types';

export class CatalogInputError extends Error { readonly status = 400; }
const text = (value: unknown, label: string, max = 120) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new CatalogInputError(`${label} is required and must be at most ${max} characters.`);
  return value.trim();
};
const price = (value: unknown, label: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1_000_000_000 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) throw new CatalogInputError(`${label} must be a positive amount with at most two decimal places.`);
  return value;
};
const quantity = (value: unknown, label: string, minimum: number) => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > 10000) throw new CatalogInputError(`${label} must be a whole number between ${minimum} and 10000.`);
  return value as number;
};
const keywords = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 100) throw new CatalogInputError('Use at most 100 matching keywords.');
  return [...new Set(value.map(item => text(item, 'Keyword', 100)))];
};
const uniqueSku = (sku: string, id: string, catalogue: { id: string; sku?: string }[]) => {
  if (catalogue.some(item => item.id !== id && item.sku?.trim().toLowerCase() === sku.toLowerCase())) throw new CatalogInputError('Another product or combo already uses this SKU.');
};

export function editProduct(current: Product, updates: Record<string, unknown>, catalogue: { id: string; sku?: string }[]): Product {
  const name = text(updates.name, 'Product name'), sku = text(updates.sku, 'SKU', 80).toUpperCase(), category = text(updates.category, 'Category');
  if (sku.toLowerCase() !== current.sku.toLowerCase()) uniqueSku(sku, current.id, catalogue);
  const mrp = price(updates.mrp, 'MRP');
  const caseSize = updates.caseSize === '' || updates.caseSize == null ? current.caseSize : quantity(updates.caseSize, 'Case size', 1);
  const thresholdQty = quantity(updates.thresholdQty, 'Threshold quantity', 0);
  if (!['CASES','PIECES','BOTH'].includes(String(updates.orderUnitMode))) throw new CatalogInputError('Choose a valid order unit.');
  const optional = (value: unknown, label: string, max: number) => {
    if (value === undefined) return undefined;
    const clean = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (clean.length > max || /[\u0000-\u001f\u007f]/.test(clean)) throw new CatalogInputError(`${label} must be at most ${max} characters.`);
    return clean || undefined;
  };
  const alias = updates.alias === undefined ? current.alias : optional(updates.alias, 'Short name', 60);
  const barcode = updates.barcode === undefined ? current.barcode : optional(String(updates.barcode ?? '').replace(/\s+/g, ''), 'Barcode', 32);
  if (barcode && !/^[0-9A-Za-z-]+$/.test(barcode)) throw new CatalogInputError('A barcode may only contain letters, digits and dashes.');
  const subBrandId = updates.subBrandId === undefined ? current.subBrandId : (typeof updates.subBrandId === 'string' && updates.subBrandId ? updates.subBrandId : undefined);
  const next: Product = { ...current, name, sku, category, mrp, ...(current.unitPrice === current.mrp ? { unitPrice: mrp } : {}),
    caseSize, thresholdQty, orderUnitMode: updates.orderUnitMode as Product['orderUnitMode'], keywords: keywords(updates.keywords), extractorKeywords: keywords(updates.extractorKeywords) };
  // Empty optional fields are removed rather than stored blank; the sub-brand is checked against the brand on save.
  for (const [key, value] of [['alias', alias], ['barcode', barcode], ['subBrandId', subBrandId]] as const) { if (value) (next as any)[key] = value; else delete (next as any)[key]; }
  return next;
}

export function editCombo(current: Combo, updates: Record<string, unknown>, products: Product[], catalogue: { id: string; sku?: string }[], editor: string): Combo {
  const name = text(updates.name, 'Combo name'), sku = text(updates.sku, 'SKU', 80).toUpperCase();
  if (sku.toLowerCase() !== current.sku.toLowerCase()) uniqueSku(sku, current.id, catalogue);
  const description = typeof updates.description === 'string' ? updates.description.trim() : '';
  if (description.length > 500 || /[\u0000-\u001f\u007f]/.test(description)) throw new CatalogInputError('Description must be at most 500 characters.');
  if (!Array.isArray(updates.items) || updates.items.length < 1 || updates.items.length > 50) throw new CatalogInputError('Choose between 1 and 50 combo products.');
  const seen = new Set<string>();
  const items = updates.items.map((item: any) => {
    if (!item || typeof item.productId !== 'string' || seen.has(item.productId)) throw new CatalogInputError('Choose each combo product only once.');
    seen.add(item.productId);
    const product = products.find(entry => entry.id === item.productId && entry.brandCode === current.brandCode && entry.active !== false);
    if (!product) throw new CatalogInputError('Choose active products from the combo’s brand.');
    return { productId: product.id, productName: product.name, quantity: quantity(item.quantity, 'Product quantity', 1), mrp: price(product.mrp, 'Product MRP') };
  });
  const totalOriginalMrp = Math.round(items.reduce((sum, item) => sum + item.mrp * item.quantity, 0) * 100) / 100;
  const comboPrice = price(updates.comboPrice, 'Combo price');
  if (comboPrice > totalOriginalMrp + 0.005) throw new CatalogInputError('Combo price cannot exceed the current total MRP of its products.');
  if (typeof updates.priceDetectionEnabled !== 'boolean') throw new CatalogInputError('Choose whether price-based combo detection is enabled.');
  return { ...current, name, sku, description, items, componentProductIds: items.map(item => item.productId), totalOriginalMrp,
    comboPrice, comboMrp: comboPrice, savingsPct: Math.round((1 - comboPrice / totalOriginalMrp) * 1000) / 10,
    extractorKeywords: keywords(updates.extractorKeywords), priceDetectionEnabled: updates.priceDetectionEnabled,
    editHistory: [{ timestamp: new Date().toISOString(), changedBy: editor, note: 'Combo details updated', previousMrp: current.comboPrice, newMrp: comboPrice }, ...(current.editHistory || [])].slice(0, 100) };
}
