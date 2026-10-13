import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { ActivityLog } from '../types';

let inMemoryActivityLogs: ActivityLog[] = [];

export async function fetchActivityLogsFromSupabase(): Promise<ActivityLog[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) {
      console.warn('Supabase fetchActivityLogs error:', error.message);
      return inMemoryActivityLogs;
    }
    if (data) {
      inMemoryActivityLogs = data as ActivityLog[];
    }
  } catch (err) {
    console.warn('Supabase fetchActivityLogs error:', err);
  }
  return inMemoryActivityLogs;
}

export function getActivityLogs(): ActivityLog[] {
  return inMemoryActivityLogs;
}

export async function logActivity(
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, any>
): Promise<ActivityLog> {
  const log: ActivityLog = {
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    action,
    entityType: entityType as any,
    entityId,
    details,
    createdAt: new Date().toISOString(),
    userName: 'Devansh Agarwal',
    userRole: 'SUPER_ADMIN',
  };
  inMemoryActivityLogs.unshift(log);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('activity_logs').upsert(log);
  } catch (e) {
    console.warn('Supabase logActivity error:', e);
  }
  return log;
}
