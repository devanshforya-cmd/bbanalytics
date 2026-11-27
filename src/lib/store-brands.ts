/**
 * Which brands a store has been given. A store with no brands set (older records) is treated as
 * carrying every brand, so nothing disappears for it; once brands are chosen, order forms, counts
 * and dispatches only offer those brands' products.
 */
import type { Branch, Distributor, Product, Retailer } from './types';

type AnyStore = Partial<Pick<Retailer, 'brandsStocked'>> & Partial<Pick<Branch, 'brandsAvailable'>> & Partial<Pick<Distributor, 'brandsCarried'>>;

/** The store's brand codes, or null when none are set (= all brands). */
export function storeBrandCodes(store: AnyStore | null | undefined): string[] | null {
  if (!store) return null;
  const list = store.brandsStocked ?? store.brandsAvailable ?? store.brandsCarried;
  return Array.isArray(list) && list.length ? list.map((code) => String(code).toUpperCase()) : null;
}

/** Products the store can be offered. */
export function productsForStore<T extends Pick<Product, 'brandCode'>>(products: T[], store: AnyStore | null | undefined): T[] {
  const codes = storeBrandCodes(store);
  return codes ? products.filter((product) => codes.includes(String(product.brandCode).toUpperCase())) : products;
}

/** The brand list to save: known brand codes only, no repeats, at least one. */
export function cleanBrandList(codes: string[], known: string[]): string[] {
  const allowed = new Set(known.map((code) => code.toUpperCase()));
  const list = [...new Set(codes.map((code) => String(code).trim().toUpperCase()))].filter((code) => allowed.has(code));
  if (!list.length) throw new Error('Choose at least one brand for this store.');
  return list;
}
