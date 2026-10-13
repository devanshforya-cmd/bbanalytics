import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { StaffLiveLocation, StaffLiveStatus } from '../types';
import { db } from './db-service';

export interface GpsPingRecord {
  id?: string;
  officer_id: string;
  officer_name?: string;
  lat: number;
  lng: number;
  status?: string;
  current_store_name?: string | null;
  battery_level?: number | null;
  created_at?: string;
}

/**
 * Record a real GPS ping from field officer devices
 */
export async function recordGpsPing(
  officerId: string,
  officerName: string,
  lat: number,
  lng: number,
  status: StaffLiveStatus = 'IN_TRANSIT',
  currentStoreName?: string,
  batteryLevel?: number
): Promise<void> {
  // 1. Immediately update local database service
  db.updateStaffPing(officerId, lat, lng, status, currentStoreName, batteryLevel);

  // 2. Persist to Supabase if available
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('gps_pings').insert([
      {
        officer_id: officerId,
        officer_name: officerName,
        lat,
        lng,
        status,
        current_store_name: currentStoreName || null,
        battery_level: batteryLevel ?? null,
      },
    ]);
  } catch (err) {
    // Non-blocking: background sync or offline queue handles retries
    console.warn('Supabase gps_pings insert error:', err);
  }
}

/**
 * Fetch latest GPS pings from Supabase
 */
export async function fetchLatestPingsFromSupabase(): Promise<StaffLiveLocation[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client
      .from('gps_pings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('Error fetching gps_pings:', error.message);
      return db.getStaffLiveLocations();
    }

    if (data && data.length > 0) {
      // Group by officer_id to pick latest ping per officer
      const latestByOfficer = new Map<string, GpsPingRecord>();
      for (const row of data as GpsPingRecord[]) {
        if (!latestByOfficer.has(row.officer_id)) {
          latestByOfficer.set(row.officer_id, row);
        }
      }

      // Sync into db service
      latestByOfficer.forEach((ping) => {
        db.updateStaffPing(
          ping.officer_id,
          Number(ping.lat),
          Number(ping.lng),
          (ping.status as StaffLiveStatus) || 'IN_TRANSIT',
          ping.current_store_name || undefined,
          ping.battery_level ?? undefined
        );
      });
    }
  } catch (err) {
    console.warn('Supabase fetchLatestPings error:', err);
  }

  return db.getStaffLiveLocations();
}

/**
 * Query active live staff locations
 */
export function getLiveStaffLocations(): StaffLiveLocation[] {
  return db.getStaffLiveLocations();
}
