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
): Promise<boolean> {
  // 1. Immediately update local database service
  db.updateStaffPing(officerId, lat, lng, status, currentStoreName, batteryLevel);

  // Send through the authenticated server route so the device cannot spoof another officer.
  try {
    const response = await fetch('/api/gps/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ lat, lng, status, currentStoreName, batteryLevel }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      console.warn('GPS ping was kept on this device but not synced:', result?.error || response.statusText);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('GPS ping was kept on this device but not synced:', err);
    return false;
  }
}

/**
 * Fetch latest GPS pings from Supabase
 */
export async function fetchLatestPingsFromSupabase(): Promise<{ locations: StaffLiveLocation[]; error?: string }> {
  try {
    const response = await fetch('/api/gps/ping', { cache: 'no-store', credentials: 'same-origin' });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success || !Array.isArray(result.data)) {
      return {
        locations: db.getStaffLiveLocations(),
        error: result?.error || `Live GPS service is unavailable (${response.status}).`,
      };
    }

    const data = result.data as GpsPingRecord[];
    if (data.length > 0) {
      // Group by officer_id to pick latest ping per officer
      const latestByOfficer = new Map<string, GpsPingRecord>();
      for (const row of data) {
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
          ping.battery_level ?? undefined,
          ping.created_at
        );
      });
    }
    return { locations: db.getStaffLiveLocations() };
  } catch {
    return {
      locations: db.getStaffLiveLocations(),
      error: 'Live GPS service could not be reached. Showing this device’s cached locations.',
    };
  }
}

/**
 * Query active live staff locations
 */
export function getLiveStaffLocations(): StaffLiveLocation[] {
  return db.getStaffLiveLocations();
}
