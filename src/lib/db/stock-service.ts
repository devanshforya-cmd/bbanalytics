import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { StockCount, Product, Combo } from '../types';

let inMemoryStockCounts: StockCount[] = [];
let inMemoryProducts: Product[] = [];
let inMemoryCombos: Combo[] = [];

export async function fetchStockFromSupabase(): Promise<{ counts: StockCount[]; products: Product[]; combos: Combo[] }> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const [scRes, pRes, cRes] = await Promise.all([
      client.from('stock_counts').select('*'),
      client.from('products').select('*'),
      client.from('combos').select('*'),
    ]);
    if (scRes.data) inMemoryStockCounts = scRes.data as StockCount[];
    if (pRes.data) inMemoryProducts = pRes.data as Product[];
    if (cRes.data) inMemoryCombos = cRes.data as Combo[];
  } catch (err) {
    console.warn('Supabase fetchStock error:', err);
  }
  return {
    counts: inMemoryStockCounts,
    products: inMemoryProducts,
    combos: inMemoryCombos,
  };
}

export function getStockCounts(storeId?: string): StockCount[] {
  if (storeId) {
    return inMemoryStockCounts.filter((s) => s.entityId === storeId || (s as any).storeId === storeId);
  }
  return inMemoryStockCounts;
}

export async function addStockCount(count: StockCount): Promise<StockCount> {
  inMemoryStockCounts.unshift(count);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('stock_counts').upsert(count);
  } catch (e) {
    console.warn('Supabase addStockCount error:', e);
  }
  return count;
}

export function getProducts(brandCode?: string): Product[] {
  if (brandCode && brandCode !== 'ALL') {
    return inMemoryProducts.filter((p) => p.brandCode === brandCode);
  }
  return inMemoryProducts;
}

export function getProductById(id: string): Product | undefined {
  return inMemoryProducts.find((p) => p.id === id);
}

export async function addProduct(product: Product): Promise<Product> {
  inMemoryProducts.push(product);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('products').upsert(product);
  } catch (e) {
    console.warn('Supabase addProduct error:', e);
  }
  return product;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<Product | undefined> {
  const p = inMemoryProducts.find((prod) => prod.id === id);
  if (p) {
    Object.assign(p, updates);
    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      await client.from('products').update(updates).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateProduct error:', e);
    }
  }
  return p;
}

export function getCombos(): Combo[] {
  return inMemoryCombos;
}

export async function addCombo(combo: Combo): Promise<Combo> {
  inMemoryCombos.push(combo);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('combos').upsert(combo);
  } catch (e) {
    console.warn('Supabase addCombo error:', e);
  }
  return combo;
}
