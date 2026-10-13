import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { Brand } from '../types';

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
