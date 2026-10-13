import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { Dispatch } from '../types';

let inMemoryDispatches: Dispatch[] = [];

export async function fetchDispatchesFromSupabase(): Promise<Dispatch[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client.from('dispatches').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchDispatches error:', error.message);
      return inMemoryDispatches;
    }
    if (data) {
      inMemoryDispatches = data as Dispatch[];
    }
  } catch (err) {
    console.warn('Supabase fetchDispatches error:', err);
  }
  return inMemoryDispatches;
}

export function getDispatches(): Dispatch[] {
  return inMemoryDispatches;
}

export function getDispatchById(id: string): Dispatch | undefined {
  return inMemoryDispatches.find((d) => d.id === id);
}

export async function addDispatch(dispatch: Dispatch): Promise<Dispatch> {
  inMemoryDispatches.unshift(dispatch);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('dispatches').upsert(dispatch);
  } catch (e) {
    console.warn('Supabase addDispatch error:', e);
  }
  return dispatch;
}

export async function updateDispatch(id: string, updates: Partial<Dispatch>): Promise<Dispatch | undefined> {
  const item = inMemoryDispatches.find((d) => d.id === id);
  if (item) {
    Object.assign(item, updates);
    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      await client.from('dispatches').update(updates).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateDispatch error:', e);
    }
  }
  return item;
}
