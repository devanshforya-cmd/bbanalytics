import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { ReturnEntry } from '../types';

let inMemoryReturns: ReturnEntry[] = [];

export async function fetchReturnsFromSupabase(): Promise<ReturnEntry[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client.from('returns').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchReturns error:', error.message);
      return inMemoryReturns;
    }
    if (data) {
      inMemoryReturns = data as ReturnEntry[];
    }
  } catch (err) {
    console.warn('Supabase fetchReturns error:', err);
  }
  return inMemoryReturns;
}

export function getReturns(brandCode?: string): ReturnEntry[] {
  if (brandCode && brandCode !== 'ALL') {
    return inMemoryReturns.filter((r) => r.brandCode === brandCode);
  }
  return inMemoryReturns;
}

export function getReturnById(id: string): ReturnEntry | undefined {
  return inMemoryReturns.find((r) => r.id === id);
}

export async function addReturnEntry(ret: ReturnEntry): Promise<ReturnEntry> {
  inMemoryReturns.unshift(ret);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('returns').upsert(ret);
  } catch (e) {
    console.warn('Supabase addReturnEntry error:', e);
  }
  return ret;
}

export async function updateReturnEntry(id: string, updates: Partial<ReturnEntry>): Promise<ReturnEntry | undefined> {
  const item = inMemoryReturns.find((r) => r.id === id);
  if (item) {
    Object.assign(item, updates);
    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      await client.from('returns').update(updates).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateReturnEntry error:', e);
    }
  }
  return item;
}
