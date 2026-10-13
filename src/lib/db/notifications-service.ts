import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { NotificationItem } from '../types';

let inMemoryNotifications: NotificationItem[] = [];

export async function fetchNotificationsFromSupabase(userId?: string): Promise<NotificationItem[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    let query = client.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) {
      console.warn('Supabase fetchNotifications error:', error.message);
      return inMemoryNotifications;
    }
    if (data) {
      inMemoryNotifications = data as NotificationItem[];
    }
  } catch (err) {
    console.warn('Supabase fetchNotifications error:', err);
  }
  return inMemoryNotifications;
}

export function getNotifications(userId?: string): NotificationItem[] {
  if (userId) {
    return inMemoryNotifications.filter((n) => n.userId === userId);
  }
  return inMemoryNotifications;
}

export async function addNotification(notification: NotificationItem): Promise<NotificationItem> {
  inMemoryNotifications.unshift(notification);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('notifications').upsert(notification);
  } catch (e) {
    console.warn('Supabase addNotification error:', e);
  }
  return notification;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const notif = inMemoryNotifications.find((n) => n.id === id);
  if (notif) {
    notif.read = true;
    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      await client.from('notifications').update({ is_read: true }).eq('id', id);
    } catch (e) {
      console.warn('Supabase markNotificationAsRead error:', e);
    }
  }
}
