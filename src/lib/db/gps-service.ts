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
  const owner = db.getCurrentUser().id;
  try {
    const response = await fetch('/api/gps/ping', { cache: 'no-store', credentials: 'same-origin' });
    const result = await response.json().catch(() => null);
    if (db.getCurrentUser().id !== owner) return { locations: [] };
    if (!response.ok || !result?.success || !Array.isArray(result.data)) {
      return {
        locations: db.getStaffLiveLocations(),
        error: result?.error || `Live GPS service is unavailable (${response.status}).`,
      };
    }

    const latestByOfficer = new Map<string, GpsPingRecord>();
    for (const row of result.data as GpsPingRecord[]) {
      if (!latestByOfficer.has(row.officer_id)) latestByOfficer.set(row.officer_id, row);
    }
    const locations: StaffLiveLocation[] = [...latestByOfficer.values()].map((ping) => {
      const user = db.getUserById(ping.officer_id);
      return {
        officerId: ping.officer_id,
        officerName: user?.fullName || ping.officer_name || 'Sales Officer',
        currentLat: Number(ping.lat), currentLng: Number(ping.lng),
        status: (ping.status as StaffLiveStatus) || 'IN_TRANSIT',
        currentStoreName: ping.current_store_name || undefined,
        batteryLevel: ping.battery_level ?? 0,
        lastPingTimestamp: ping.created_at || '',
        dutyStatus: user?.dutyStatus || 'OFFLINE',
        isOnline: user?.dutyStatus !== 'OFFLINE',
        todayDistanceKm: 0, todayRoute: [],
      };
    });
    // An empty authorized result must also remove locations that are no longer visible.
    db.replaceStaffLiveLocations(locations);
    return { locations: db.getStaffLiveLocations() };
  } catch {
    if (db.getCurrentUser().id !== owner) return { locations: [] };
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
