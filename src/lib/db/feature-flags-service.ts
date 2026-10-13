import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { FeatureFlag, FlagEvent } from '../types';

let inMemoryFlags: FeatureFlag[] = [
  {
    id: 'flag_new_beat_plan_ui',
    name: 'new_beat_plan_ui',
    description: 'Test the redesigned beat plan layout with sequence route navigation',
    isEnabled: false,
    enabledForUsers: [],
    variant: 'B',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'flag_smart_order_margin_ui',
    name: 'smart_order_margin_ui',
    description: 'Auto-fill margin percentages from store default commercial terms',
    isEnabled: true,
    enabledForUsers: [],
    variant: 'A',
    createdAt: new Date().toISOString(),
  },
];

let inMemoryEvents: FlagEvent[] = [
  {
    id: 'event_1',
    flagName: 'new_beat_plan_ui',
    userId: 'user_devansh',
    variant: 'A',
    action: 'PAGE_VIEW',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'event_2',
    flagName: 'new_beat_plan_ui',
    userId: 'user_devansh',
    variant: 'A',
    action: 'FORM_SUBMIT',
    createdAt: new Date().toISOString(),
  },
];

export async function fetchFeatureFlagsFromSupabase(): Promise<FeatureFlag[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client
      .from('feature_flags')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      inMemoryFlags = data.map((d: any) => ({
        id: d.id,
        name: d.name,
        description: d.description || '',
        isEnabled: d.is_enabled !== false,
        enabledForUsers: d.enabled_for_users || [],
        variant: (d.variant || 'A') as 'A' | 'B',
        createdAt: d.created_at,
      }));
    }
  } catch (err) {
    console.warn('Supabase feature_flags fetch error, using local fallback:', err);
  }
  return inMemoryFlags;
}

export function getFeatureFlags(): FeatureFlag[] {
  return inMemoryFlags;
}

export function getFeatureFlagByName(name: string): FeatureFlag | undefined {
  return inMemoryFlags.find((f) => f.name === name);
}

export async function addFeatureFlag(flag: FeatureFlag): Promise<FeatureFlag> {
  const existingIdx = inMemoryFlags.findIndex((f) => f.name === flag.name || f.id === flag.id);
  if (existingIdx >= 0) {
    inMemoryFlags[existingIdx] = flag;
  } else {
    inMemoryFlags.unshift(flag);
  }

  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('feature_flags').upsert({
      id: flag.id,
      name: flag.name,
      description: flag.description,
      is_enabled: flag.isEnabled,
      enabled_for_users: flag.enabledForUsers,
      variant: flag.variant,
      created_at: flag.createdAt,
    });
  } catch (err) {
    console.warn('Supabase feature_flags upsert error:', err);
  }

  return flag;
}

export async function updateFeatureFlag(
  id: string,
  updates: Partial<FeatureFlag>
): Promise<FeatureFlag | undefined> {
  const flag = inMemoryFlags.find((f) => f.id === id || f.name === id);
  if (flag) {
    Object.assign(flag, updates);

    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.isEnabled !== undefined) dbUpdates.is_enabled = updates.isEnabled;
      if (updates.enabledForUsers !== undefined) dbUpdates.enabled_for_users = updates.enabledForUsers;
      if (updates.variant !== undefined) dbUpdates.variant = updates.variant;

      await client.from('feature_flags').update(dbUpdates).eq('id', flag.id);
    } catch (err) {
      console.warn('Supabase feature_flags update error:', err);
    }
  }
  return flag;
}

export async function deleteFeatureFlag(id: string): Promise<boolean> {
  inMemoryFlags = inMemoryFlags.filter((f) => f.id !== id && f.name !== id);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('feature_flags').delete().eq('id', id);
  } catch (err) {
    console.warn('Supabase feature_flags delete error:', err);
  }
  return true;
}

export async function logFlagEvent(event: Omit<FlagEvent, 'id' | 'createdAt'>): Promise<void> {
  const newEvent: FlagEvent = {
    ...event,
    id: `ev_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  inMemoryEvents.push(newEvent);

  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('flag_events').insert({
      id: newEvent.id,
      flag_name: newEvent.flagName,
      user_id: newEvent.userId,
      variant: newEvent.variant,
      action: newEvent.action,
      metadata: newEvent.metadata || {},
      created_at: newEvent.createdAt,
    });
  } catch {
    // Non-blocking log
  }
}

export async function getFlagAnalytics(flagName: string): Promise<{
  variantA: { pageViews: number; submits: number; errors: number; conversionRate: number; errorRate: number };
  variantB: { pageViews: number; submits: number; errors: number; conversionRate: number; errorRate: number };
}> {
  let events = inMemoryEvents.filter((e) => e.flagName === flagName);

  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data } = await client.from('flag_events').select('*').eq('flag_name', flagName);
    if (data && data.length > 0) {
      events = data.map((d: any) => ({
        id: d.id,
        flagName: d.flag_name,
        userId: d.user_id,
        variant: d.variant,
        action: d.action,
        metadata: d.metadata,
        createdAt: d.created_at,
      }));
    }
  } catch {
    // Fall back to inMemoryEvents
  }

  const calc = (variant: 'A' | 'B') => {
    const vEvents = events.filter((e) => e.variant === variant);
    const pageViews = vEvents.filter((e) => e.action === 'PAGE_VIEW').length;
    const submits = vEvents.filter((e) => e.action === 'FORM_SUBMIT' || e.action === 'ORDER_CREATED').length;
    const errors = vEvents.filter((e) => e.action === 'ERROR').length;
    const conversionRate = pageViews > 0 ? Number(((submits / pageViews) * 100).toFixed(1)) : 0;
    const errorRate = pageViews > 0 ? Number(((errors / pageViews) * 100).toFixed(1)) : 0;
    return { pageViews, submits, errors, conversionRate, errorRate };
  };

  return {
    variantA: calc('A'),
    variantB: calc('B'),
  };
}
