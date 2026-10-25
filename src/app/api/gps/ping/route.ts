import { NextResponse } from 'next/server';
import { requireAuth, requireFeatureAccess } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { getScope, hasAccess } from '@/lib/permissions';
import type { DutyStatus, StaffLiveStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const isConfigured = () => Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  // Sales officers can report their own position through their permitted beat-plan workflow,
  // even when the management map itself is hidden from them.
  if (!hasAccess(auth.user, 'beat_plans')) {
    return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ success: false, error: 'GPS storage is not configured.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ success: false, error: 'A valid latitude and longitude are required.' }, { status: 400 });
    }

    const allowedStatuses: StaffLiveStatus[] = ['IN_TRANSIT', 'AT_STORE', 'IDLE', 'DAY_ENDED'];
    const status = allowedStatuses.includes(body.status) ? body.status : 'IN_TRANSIT';
    const { data, error } = await supabaseAdmin.from('gps_pings').insert({
      officer_id: auth.user.id,
      officer_name: auth.user.fullName,
      lat,
      lng,
      status,
      current_store_name: typeof body.currentStoreName === 'string'
        ? body.currentStoreName.slice(0, 160)
        : null,
      battery_level: Number.isFinite(Number(body.batteryLevel))
        ? Math.max(0, Math.min(100, Number(body.batteryLevel)))
        : null,
    }).select('id, created_at').single();

    if (error) {
      console.error('GPS ping insert failed:', error.message);
      return NextResponse.json({ success: false, error: 'GPS ping could not be saved.' }, { status: 503 });
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid GPS ping payload.' }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'gps_tracking', 'VIEW');
  if (auth.response) return auth.response;
  if (!isConfigured()) {
    return NextResponse.json({ success: false, error: 'GPS storage is not configured.' }, { status: 503 });
  }

  const scope = getScope(auth.user, 'gps_tracking');
  let visibleOfficerIds: string[] | null = null;
  if (scope === 'OWN') {
    visibleOfficerIds = [auth.user.id];
  } else if (scope === 'TEAM') {
    const { data: reports, error: reportsError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('reports_to_id', auth.user.id);
    if (reportsError) {
      return NextResponse.json({ success: false, error: 'GPS team scope could not be loaded.' }, { status: 503 });
    }
    visibleOfficerIds = [auth.user.id, ...(reports || []).map((row) => row.id)];
  }

  let query = supabaseAdmin
    .from('gps_pings')
    .select('id, officer_id, officer_name, lat, lng, status, current_store_name, battery_level, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (visibleOfficerIds) query = query.in('officer_id', visibleOfficerIds);

  const { data, error } = await query;
  if (error) {
    console.error('GPS ping fetch failed:', error.message);
    return NextResponse.json({ success: false, error: 'GPS data could not be loaded.' }, { status: 503 });
  }

  return NextResponse.json({ success: true, data: data || [] });
}

export async function PATCH(request: Request) {
  const auth = await requireFeatureAccess(request, 'gps_tracking', 'EDIT');
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const officerId = typeof body.officerId === 'string' ? body.officerId : '';
    const dutyStatus = body.dutyStatus as DutyStatus;
    const allowedStatuses: DutyStatus[] = ['ONLINE', 'IN_FIELD', 'ON_BREAK', 'OFFLINE', 'ON_LEAVE'];
    if (!officerId || !allowedStatuses.includes(dutyStatus)) {
      return NextResponse.json({ success: false, error: 'A valid officer and duty status are required.' }, { status: 400 });
    }

    const scope = getScope(auth.user, 'gps_tracking');
    if (scope === 'OWN' && officerId !== auth.user.id) {
      return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
    }
    if (scope === 'TEAM') {
      const { data: report } = await supabaseAdmin.from('users').select('id').eq('id', officerId).eq('reports_to_id', auth.user.id).maybeSingle();
      if (!report && officerId !== auth.user.id) {
        return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ duty_status: dutyStatus })
      .eq('id', officerId)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ success: false, error: 'Duty status could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid duty status request.' }, { status: 400 });
  }
}
