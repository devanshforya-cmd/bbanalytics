import { StaffLiveLocation, StaffLiveStatus } from '../types';
import { db } from './db-service';
import { freshGpsFix, validGpsCoordinates } from '../gps-validation';

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

const pendingKey = (userId: string) => `bb_gps_latest_v1_${userId}`;

export function clearPendingGps(userId: string) {
  if (typeof window !== 'undefined') localStorage.removeItem(pendingKey(userId));
}

export async function retryPendingGps(userId: string): Promise<boolean> {
  if (typeof window === 'undefined' || db.getCurrentUser().id !== userId) return false;
  let pending: any;
  try { pending = JSON.parse(localStorage.getItem(pendingKey(userId)) || 'null'); } catch { clearPendingGps(userId); return false; }
  if (!pending) return true;
  if (pending.officerId !== userId || !freshGpsFix(pending)) { clearPendingGps(userId); return false; }
  try {
    const response = await fetch('/api/gps/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(pending) });
    if (db.getCurrentUser().id !== userId) return false;
    if (!response.ok) return false;
    // A newer fix may have replaced this one while its request was in flight.
    const latest = JSON.parse(localStorage.getItem(pendingKey(userId)) || 'null');
    if (latest?.capturedAt === pending.capturedAt) clearPendingGps(userId);
    return true;
  } catch { return false; }
}

/** Retain only the latest genuine fix on the current user's device until confirmed. */
export async function recordGpsPing(
  officerId: string, officerName: string, lat: number, lng: number,
  status: StaffLiveStatus = 'IN_TRANSIT', currentStoreName?: string, batteryLevel?: number,
  capturedAt = new Date().toISOString(), accuracy?: number
): Promise<boolean> {
  if (db.getCurrentUser().id !== officerId || !validGpsCoordinates(lat, lng) || !freshGpsFix({ lat, lng, capturedAt })) return false;
  const pending = { officerId, lat, lng, status, currentStoreName, batteryLevel, capturedAt, accuracy };
  db.updateStaffPing(officerId, lat, lng, status, currentStoreName, batteryLevel);
  if (typeof window === 'undefined') return false;
  try { localStorage.setItem(pendingKey(officerId), JSON.stringify(pending)); } catch { return false; }
  return retryPendingGps(officerId);
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
