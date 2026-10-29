import { Brand } from '../types';
import { db } from './db-service';

let inMemoryBrands: Brand[] = [];
let hasLoadedRemoteBrands = false;
let brandStorageIsLocalPreview = false;

export function isBrandStorageLocalPreview(): boolean {
  return brandStorageIsLocalPreview;
}

async function requestBrands(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) {
  const response = await fetch('/api/brands', {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    if (payload?.localPreviewOnly === true) {
      brandStorageIsLocalPreview = true;
      return payload;
    }
    throw new Error(payload?.error || `Brand request failed (${response.status}).`);
  }
  brandStorageIsLocalPreview = false;
  return payload;
}

export async function fetchBrandsFromSupabase(options: { requireRemote?: boolean } = {}): Promise<Brand[]> {
  try {
    const response = await fetch('/api/brands', { cache: 'no-store', credentials: 'same-origin' });
    const payload = await response.json().catch(() => null);
    if (payload?.localPreviewOnly === true) {
      brandStorageIsLocalPreview = true;
      hasLoadedRemoteBrands = false;
      return db.getBrands('ALL');
    }
    if (response.ok && payload?.success && Array.isArray(payload.data)) {
      brandStorageIsLocalPreview = false;
      inMemoryBrands = payload.data as Brand[];
      hasLoadedRemoteBrands = true;
      db.replaceBrands(inMemoryBrands);
      return inMemoryBrands;
    }
    if (options.requireRemote) {
      throw new Error(payload?.error || `Brand list request failed (${response.status}).`);
    }
    if ([401, 403, 404].includes(response.status)) {
      inMemoryBrands = [];
      hasLoadedRemoteBrands = true;
      return [];
    }
  } catch (err) {
    if (options.requireRemote) throw err;
    console.warn('Brand API unavailable; using this device\'s saved brand list.', err);
  }
  return db.getBrands('ALL');
}

export function getBrands(status?: 'ACTIVE' | 'ALL'): Brand[] {
  const source = hasLoadedRemoteBrands ? inMemoryBrands : db.getBrands(status);
  if (status === 'ACTIVE') {
    return source.filter((b) => b.isActive !== false && b.status !== 'ARCHIVED');
  }
  return source;
}

export function getBrandByCode(code: string): Brand | undefined {
  return getBrands('ALL').find((b) => b.code.toUpperCase() === code.toUpperCase());
}

export function getBrandById(id: string): Brand | undefined {
  return getBrands('ALL').find((b) => b.id === id);
}

export async function addBrand(brand: Brand): Promise<Brand> {
  const payload = await requestBrands('POST', brand as unknown as Record<string, unknown>);
  if (payload.localPreviewOnly) {
    hasLoadedRemoteBrands = false;
    const savedLocally = db.addBrand({
      ...brand,
      id: brand.id || `local_brand_${brand.code.toLowerCase()}`,
      code: brand.code.trim().toUpperCase() as Brand['code'],
    });
    inMemoryBrands = db.getBrands('ALL');
    return savedLocally;
  }
  const saved = payload.data as Brand;
  hasLoadedRemoteBrands = true;
  inMemoryBrands = [...inMemoryBrands.filter((entry) => entry.id !== saved.id && entry.code !== saved.code), saved];
  db.addBrand(saved);
  return saved;
}

export async function updateBrand(id: string, updates: Partial<Brand>): Promise<Brand | undefined> {
  const payload = await requestBrands('PATCH', { id, ...updates });
  if (payload.localPreviewOnly) {
    const existing = db.getBrands('ALL').find((brand) => brand.id === id);
    if (!existing) return undefined;
    hasLoadedRemoteBrands = false;
    const savedLocally = db.addBrand({ ...existing, ...updates, id });
    inMemoryBrands = db.getBrands('ALL');
    return savedLocally;
  }
  const saved = payload.data as Brand;
  hasLoadedRemoteBrands = true;
  inMemoryBrands = [...inMemoryBrands.filter((entry) => entry.id !== saved.id), saved];
  db.addBrand(saved);
  return saved;
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
  try {
    const response = await fetch(`/api/brands?checkDelete=${encodeURIComponent(code)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.success && payload.counts) {
      const counts = payload.counts;
      return {
        canDelete: Boolean(payload.canDelete),
        reason: payload.canDelete ? undefined : `Cannot delete — this brand has ${counts.orders} orders, ${counts.products} products, ${counts.stockCounts} stock counts, ${counts.feedback} feedback entries, and ${counts.returns} returns. Deactivate instead.`,
        counts,
      };
    }
    throw new Error(payload?.error || 'Could not verify linked brand data.');
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
  try {
    await requestBrands('DELETE', { id, code: brandCode });
    inMemoryBrands = inMemoryBrands.filter((b) => b.id !== id && b.code.toUpperCase() !== brandCode.toUpperCase());
    db.deleteBrand(id);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Brand could not be deleted.' };
  }
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
