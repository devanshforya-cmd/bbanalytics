/**
 * Sub-brands and short product names: the shared rules.
 *
 * A sub-brand belongs to one brand and only splits reporting. Order lines carry the sub-brand
 * their product had when the order was placed (stamped by the server), so moving a product to
 * another sub-brand later does not rewrite past figures. Lines saved before sub-brands existed
 * fall back to the product's current sub-brand.
 */
import type { Brand, Product, SubBrand } from './types';

export const NO_SUB_BRAND = '__none__';

export function slug(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

export function subBrandIdFor(brandCode: string, name: string): string {
  return `sb_${slug(brandCode)}_${slug(name)}`;
}

/** Clean a list from a form or the database: trimmed, unique names, stable ids. */
export function normalizeSubBrands(brandCode: string, value: unknown): SubBrand[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: SubBrand[] = [];
  for (const raw of value) {
    const name = String((raw as any)?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const id = typeof (raw as any)?.id === 'string' && /^sb_[a-z0-9_]{1,90}$/.test((raw as any).id) ? (raw as any).id : subBrandIdFor(brandCode, name);
    result.push({ id, name, isActive: (raw as any)?.isActive !== false });
  }
  return result;
}

export function allSubBrands(brands: Brand[]): (SubBrand & { brandCode: string; brandName: string })[] {
  return brands.flatMap((brand) => (brand.subBrands || []).map((sub) => ({ ...sub, brandCode: brand.code, brandName: brand.name })));
}

export function subBrandName(brands: Brand[], id?: string | null): string {
  if (!id) return '';
  return allSubBrands(brands).find((sub) => sub.id === id)?.name || '';
}

/** The sub-brand an order line belongs to: as stamped, else the product's current one. */
export function lineSubBrandId(line: { productId: string; subBrandId?: string | null }, products: Pick<Product, 'id' | 'subBrandId'>[]): string | undefined {
  return line.subBrandId || products.find((product) => product.id === line.productId)?.subBrandId || undefined;
}

/** What field forms show for a product: its short name, else the full name. */
export function productLabel(product: Pick<Product, 'name' | 'alias'> | undefined | null, fallback = ''): string {
  return product?.alias?.trim() || product?.name || fallback;
}

/** Does a line match a brand filter that may name a sub-brand ("PEESAFE" or "PEESAFE/sb_peesafe_furr")? */
export function matchesBrandFilter(filter: string | undefined, line: { brandCode?: string; productId: string; subBrandId?: string | null }, products: Pick<Product, 'id' | 'subBrandId'>[]): boolean {
  if (!filter || filter === 'ALL') return true;
  const [brand, sub] = filter.split('/');
  if ((line.brandCode || '').toUpperCase() !== brand.toUpperCase()) return false;
  if (!sub) return true;
  const actual = lineSubBrandId(line, products);
  return sub === NO_SUB_BRAND ? !actual : actual === sub;
}
