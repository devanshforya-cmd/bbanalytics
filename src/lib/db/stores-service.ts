import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { Distributor, Branch, Retailer, StoreEntity } from '../types';

let inMemoryDistributors: Distributor[] = [];
let inMemoryBranches: Branch[] = [];
let inMemoryRetailers: Retailer[] = [];

export async function fetchStoresFromSupabase(): Promise<{ distributors: Distributor[]; branches: Branch[]; retailers: Retailer[] }> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const [dRes, bRes, rRes] = await Promise.all([
      client.from('distributors').select('*'),
      client.from('branches').select('*'),
      client.from('retailers').select('*'),
    ]);
    if (dRes.data) inMemoryDistributors = dRes.data as Distributor[];
    if (bRes.data) inMemoryBranches = bRes.data as Branch[];
    if (rRes.data) inMemoryRetailers = rRes.data as Retailer[];
  } catch (err) {
    console.warn('Supabase fetchStores error:', err);
  }
  return {
    distributors: inMemoryDistributors,
    branches: inMemoryBranches,
    retailers: inMemoryRetailers,
  };
}

export function getDistributors(): Distributor[] {
  return inMemoryDistributors;
}

export function getBranches(): Branch[] {
  return inMemoryBranches;
}

export function getRetailers(): Retailer[] {
  return inMemoryRetailers;
}

export function getAllStoreEntities(): StoreEntity[] {
  const stores: StoreEntity[] = [];
  inMemoryBranches.forEach((b) => {
    stores.push({
      ...b,
      entityType: 'BRANCH',
    });
  });
  inMemoryRetailers.forEach((r) => {
    stores.push({
      ...r,
      entityType: 'RETAILER',
    });
  });
  return stores;
}

export function getStoreEntityById(id: string): StoreEntity | undefined {
  return getAllStoreEntities().find((s) => s.id === id);
}

export async function addRetailer(retailer: Retailer): Promise<Retailer> {
  inMemoryRetailers.unshift(retailer);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('retailers').upsert(retailer);
  } catch (e) {
    console.warn('Supabase addRetailer error:', e);
  }
  return retailer;
}

export async function addDistributor(distributor: Distributor): Promise<Distributor> {
  inMemoryDistributors.unshift(distributor);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('distributors').upsert(distributor);
  } catch (e) {
    console.warn('Supabase addDistributor error:', e);
  }
  return distributor;
}

export async function addBranch(branch: Branch): Promise<Branch> {
  inMemoryBranches.unshift(branch);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('branches').upsert(branch);
  } catch (e) {
    console.warn('Supabase addBranch error:', e);
  }
  return branch;
}
