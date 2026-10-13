import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { BeatItem, Visit, ShelfPhoto, CallLog } from '../types';

let inMemoryBeatItems: BeatItem[] = [];
let inMemoryVisits: Visit[] = [];
let inMemoryShelfPhotos: ShelfPhoto[] = [];
let inMemoryCallLogs: CallLog[] = [];

export async function fetchBeatFromSupabase(officerId?: string): Promise<BeatItem[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    let query = client.from('beat_plans').select('*').order('sequence', { ascending: true });
    if (officerId) query = query.eq('officer_id', officerId);
    const { data, error } = await query;
    if (error) {
      console.warn('Supabase fetchBeat error:', error.message);
      return inMemoryBeatItems;
    }
    if (data) {
      inMemoryBeatItems = data as BeatItem[];
    }
  } catch (err) {
    console.warn('Supabase fetchBeat error:', err);
  }
  return inMemoryBeatItems;
}

export function getTodayBeat(officerId?: string): BeatItem[] {
  if (officerId) {
    return inMemoryBeatItems.filter((b) => b.officerId === officerId);
  }
  return inMemoryBeatItems;
}

export function getBeatItems(): BeatItem[] {
  return inMemoryBeatItems;
}

export async function updateBeatItemStatus(id: string, status: 'PENDING' | 'VISITED' | 'SKIPPED', skipReason?: string): Promise<void> {
  const item = inMemoryBeatItems.find((b) => b.id === id);
  if (item) {
    item.status = status;
    if (skipReason) item.skipReason = skipReason as any;
    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      await client.from('beat_plans').update({ status, skip_reason: skipReason }).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateBeatItemStatus error:', e);
    }
  }
}

export function getVisits(officerId?: string): Visit[] {
  if (officerId) {
    return inMemoryVisits.filter((v) => v.officerId === officerId);
  }
  return inMemoryVisits;
}

export async function addVisit(visit: Visit): Promise<Visit> {
  inMemoryVisits.unshift(visit);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('visits').upsert(visit);
  } catch (e) {
    console.warn('Supabase addVisit error:', e);
  }
  return visit;
}

export function getShelfPhotos(officerId?: string): ShelfPhoto[] {
  if (officerId) {
    return inMemoryShelfPhotos.filter((s) => s.officerId === officerId);
  }
  return inMemoryShelfPhotos;
}

export async function addShelfPhoto(photo: ShelfPhoto): Promise<ShelfPhoto> {
  inMemoryShelfPhotos.unshift(photo);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('shelf_photos').upsert(photo);
  } catch (e) {
    console.warn('Supabase addShelfPhoto error:', e);
  }
  return photo;
}

export function getCallLogs(officerId?: string): CallLog[] {
  if (officerId) {
    return inMemoryCallLogs.filter((c) => c.officerId === officerId);
  }
  return inMemoryCallLogs;
}

export async function addCallLog(log: CallLog): Promise<CallLog> {
  inMemoryCallLogs.unshift(log);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('call_logs').upsert(log);
  } catch (e) {
    console.warn('Supabase addCallLog error:', e);
  }
  return log;
}
