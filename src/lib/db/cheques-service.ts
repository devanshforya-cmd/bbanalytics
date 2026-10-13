import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { Cheque } from '../types';

let inMemoryCheques: Cheque[] = [];

export async function fetchChequesFromSupabase(): Promise<Cheque[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client.from('cheques').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchCheques error:', error.message);
      return inMemoryCheques;
    }
    if (data) {
      inMemoryCheques = data as Cheque[];
    }
  } catch (err) {
    console.warn('Supabase fetchCheques error:', err);
  }
  return inMemoryCheques;
}

export function getCheques(officerId?: string): Cheque[] {
  if (officerId) {
    return inMemoryCheques.filter((c) => c.officerId === officerId || (c as any).collectedBy === officerId);
  }
  return inMemoryCheques;
}

export function getChequeById(id: string): Cheque | undefined {
  return inMemoryCheques.find((c) => c.id === id);
}

export async function addCheque(cheque: Cheque): Promise<Cheque> {
  inMemoryCheques.unshift(cheque);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('cheques').upsert(cheque);
  } catch (e) {
    console.warn('Supabase addCheque error:', e);
  }
  return cheque;
}

export async function updateCheque(id: string, updates: Partial<Cheque>): Promise<Cheque | undefined> {
  const cheque = inMemoryCheques.find((c) => c.id === id);
  if (cheque) {
    Object.assign(cheque, updates);
    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      await client.from('cheques').update(updates).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateCheque error:', e);
    }
  }
  return cheque;
}
