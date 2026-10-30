import { supabaseAdmin } from './db/supabase-server';
import type { User, StaffLiveStatus } from './types';
import type { GpsFix } from './gps-validation';

/** Old queued positions cannot make an officer appear live or replace a newer fix. */
export async function saveTrustedGps(user: User, fix: GpsFix, status: StaffLiveStatus, currentStoreName?: string, batteryLevel?: number) {
  const unavailable = () => Object.assign(new Error('GPS position could not be saved. Please retry.'), { status: 503 });
  const payload = { officer_id: user.id, officer_name: user.fullName, lat: fix.lat, lng: fix.lng, status,
    current_store_name: currentStoreName?.slice(0, 160) || null, battery_level: batteryLevel ?? null, created_at: fix.capturedAt };
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: previous, error: readError } = await supabaseAdmin.from('gps_pings').select('created_at').eq('officer_id', user.id).maybeSingle();
    if (readError) throw unavailable();
    if (previous && Date.parse(previous.created_at) >= Date.parse(fix.capturedAt)) return { saved: false, capturedAt: previous.created_at };
    const result = previous
      ? await supabaseAdmin.from('gps_pings').update(payload).eq('officer_id', user.id).eq('created_at', previous.created_at).select('id,created_at')
      : await supabaseAdmin.from('gps_pings').insert(payload).select('id,created_at');
    if (result.error?.code === '23505') continue;
    if (result.error) throw unavailable();
    if (result.data?.length) return { saved: true, capturedAt: result.data[0].created_at };
  }
  throw unavailable();
}
