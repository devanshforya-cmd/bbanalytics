import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { Brand } from '../types';
import { db } from './db-service';

let inMemoryBrands: Brand[] = [];

export async function fetchBrandsFromSupabase(): Promise<Brand[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client
      .from('brands')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('Supabase fetchBrands error:', error.message);
      return inMemoryBrands;
    }
    if (data) {
      inMemoryBrands = data.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        color: b.color || '#3b82f6',
        description: b.description || '',
        logoUrl: b.logo_url,
        isActive: b.is_active !== false,
        status: b.is_active !== false ? 'ACTIVE' : 'ARCHIVED',
      }));
    }
  } catch (err) {
    console.warn('Supabase fetchBrands error:', err);
  }
  return inMemoryBrands;
}

export function getBrands(status?: 'ACTIVE' | 'ALL'): Brand[] {
  if (status === 'ACTIVE') {
    return inMemoryBrands.filter((b) => b.isActive !== false && b.status !== 'ARCHIVED');
  }
  return inMemoryBrands;
}

export function getBrandByCode(code: string): Brand | undefined {
  return inMemoryBrands.find((b) => b.code.toUpperCase() === code.toUpperCase());
}

export function getBrandById(id: string): Brand | undefined {
  return inMemoryBrands.find((b) => b.id === id);
}

export async function addBrand(brand: Brand): Promise<Brand> {
  const existingIdx = inMemoryBrands.findIndex(
    (b) => b.id === brand.id || b.code.toUpperCase() === brand.code.toUpperCase()
  );
  if (existingIdx >= 0) {
    inMemoryBrands[existingIdx] = brand;
  } else {
    inMemoryBrands.push(brand);
  }

  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('brands').upsert({
      id: brand.id,
      code: brand.code.toUpperCase(),
      name: brand.name,
      color: brand.color,
      description: brand.description || '',
      logo_url: brand.logoUrl || null,
      is_active: brand.isActive !== false,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Supabase addBrand error:', e);
  }
  return brand;
}

export async function updateBrand(id: string, updates: Partial<Brand>): Promise<Brand | undefined> {
  const brand = inMemoryBrands.find((b) => b.id === id || b.code === id);
  if (brand) {
    Object.assign(brand, updates);
    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.code !== undefined) dbUpdates.code = updates.code.toUpperCase();
      if (updates.color !== undefined) dbUpdates.color = updates.color;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.logoUrl !== undefined) dbUpdates.logo_url = updates.logoUrl;
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

      await client.from('brands').update(dbUpdates).eq('id', brand.id);
    } catch (e) {
      console.warn('Supabase updateBrand error:', e);
    }
  }
  return brand;
}

export async function deactivateBrand(id: string): Promise<Brand | undefined> {
  return updateBrand(id, { isActive: false, status: 'ARCHIVED' });
}

export async function reactivateBrand(id: string): Promise<Brand | undefined> {
  return updateBrand(id, { isActive: true, status: 'ACTIVE' });
}

export async function canDeleteBrand(brandCode: string): Promise<{
  canDelete: boolean;
  reason?: string;
  counts: {
    orders: number;
    products: number;
    stockCounts: number;
    feedback: number;
    returns: number;
  };
}> {
  const code = brandCode.toUpperCase();
  const client = typeof window === 'undefined' ? supabaseAdmin : supabase;

  try {
    const [ordersRes, productsRes, stockRes, feedbackRes, returnsRes] = await Promise.all([
      client.from('orders').select('id', { count: 'exact', head: true }).eq('brand_code', code),
      client.from('products').select('id', { count: 'exact', head: true }).eq('brand_code', code),
      client.from('stock_counts').select('id', { count: 'exact', head: true }).eq('brand_code', code),
      client.from('feedback').select('id', { count: 'exact', head: true }).eq('brand_code', code),
      client.from('returns').select('id', { count: 'exact', head: true }).eq('brand_code', code),
    ]);

    const counts = {
      orders: ordersRes.count || 0,
      products: productsRes.count || 0,
      stockCounts: stockRes.count || 0,
      feedback: feedbackRes.count || 0,
      returns: returnsRes.count || 0,
    };

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    if (total > 0) {
      return {
        canDelete: false,
        reason: `Cannot delete — this brand has ${counts.orders} orders, ${counts.products} products, ${counts.stockCounts} stock counts, ${counts.feedback} feedback entries, and ${counts.returns} returns. Deactivate instead.`,
        counts,
      };
    }

    return { canDelete: true, counts };
  } catch {
    // Local db fallback check
    const counts = {
      orders: db.getOrders().filter((o) => o.brandCode === code).length,
      products: db.getProducts().filter((p) => p.brandCode === code).length,
      stockCounts: db.getStockCounts().filter((sc) => sc.items.some((it) => it.brandCode === code)).length,
      feedback: db.getFeedback().filter((f) => f.brandCode === code).length,
      returns: db.getReturns().filter((r) => r.brandCode === code).length,
    };

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total > 0) {
      return {
        canDelete: false,
        reason: `Cannot delete — this brand has ${counts.orders} orders, ${counts.products} products, ${counts.stockCounts} stock counts, ${counts.feedback} feedback entries, and ${counts.returns} returns. Deactivate instead.`,
        counts,
      };
    }
    return { canDelete: true, counts };
  }
}

export async function deleteBrand(id: string, brandCode: string): Promise<{ success: boolean; error?: string }> {
  const check = await canDeleteBrand(brandCode);
  if (!check.canDelete) {
    return { success: false, error: check.reason };
  }

  inMemoryBrands = inMemoryBrands.filter((b) => b.id !== id && b.code.toUpperCase() !== brandCode.toUpperCase());
  db.deleteBrand(id);

  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { error } = await client.from('brands').delete().eq('id', id);
    if (error) {
      console.warn('Supabase deleteBrand error:', error.message);
    }
  } catch (e: any) {
    console.warn('Supabase deleteBrand error:', e);
  }

  return { success: true };
}

export function getBrandEntityCounts(brandCode: string): { products: number; orders: number; stores: number } {
  const code = brandCode.toUpperCase();
  const products = db.getProducts().filter((p) => p.brandCode === code).length;
  const orders = db.getOrders().filter((o) => o.brandCode === code).length;
  const stores = db.getFilteredStores().filter((s) => {
    if (s.entityType === 'BRANCH') return (s.brandsAvailable || []).includes(code as any);
    return ((s as any).brandsStocked || []).includes(code as any);
  }).length;
  return { products, orders, stores };
}
