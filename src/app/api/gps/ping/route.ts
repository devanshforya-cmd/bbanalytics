import { NextResponse } from 'next/server';
import { requireAuth, requireFeatureAccess } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { hasAccess } from '@/lib/permissions';
import { freshGpsFix } from '@/lib/gps-validation';
import { saveTrustedGps } from '@/lib/gps-server';
import type { DutyStatus, StaffLiveStatus } from '@/lib/types';
import { ApiInputError, apiFailure, readBody, scopeOfficerIds } from '../../_workspace';

export const dynamic = 'force-dynamic';
const fields = 'id, officer_id, officer_name, lat, lng, status, current_store_name, battery_level, created_at';
const isConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (!hasAccess(auth.user, 'beat_plans')) return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
  if (!isConfigured()) return NextResponse.json({ success: false, error: 'GPS storage is not configured.' }, { status: 503 });
  try {
    const body = await readBody(request);
    const { lat, lng } = body;
    if (body.officerId !== undefined && body.officerId !== auth.user.id) throw new ApiInputError('Account changed. Obtain a fresh device location.', 409);
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new ApiInputError('A valid latitude and longitude are required.');
    const allowedStatuses: StaffLiveStatus[] = ['IN_TRANSIT', 'AT_STORE', 'IDLE', 'DAY_ENDED'];
    if (body.status !== undefined && !allowedStatuses.includes(body.status)) throw new ApiInputError('Invalid live status.');
    if (body.batteryLevel != null && (typeof body.batteryLevel !== 'number' || !Number.isFinite(body.batteryLevel) || body.batteryLevel < 0 || body.batteryLevel > 100)) throw new ApiInputError('Battery level must be between 0 and 100.');
    const capturedAt = body.capturedAt === undefined ? new Date().toISOString() : body.capturedAt;
    if (typeof capturedAt !== 'string' || !freshGpsFix({ lat, lng, capturedAt })) throw new ApiInputError('A fresh device GPS fix is required.');
    const result = await saveTrustedGps(auth.user, { lat, lng, capturedAt }, body.status || 'IN_TRANSIT', typeof body.currentStoreName === 'string' ? body.currentStoreName : undefined, body.batteryLevel);
    return NextResponse.json({ success: true, data: result });
  } catch (error) { return apiFailure(error, 'GPS ping could not be saved.'); }
}

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'gps_tracking', 'VIEW');
  if (auth.response) return auth.response;
  if (!isConfigured()) return NextResponse.json({ success: false, error: 'GPS storage is not configured.' }, { status: 503 });
  try {
    const { db } = await openServerWorkspace(auth.user);
    const visibleIds = scopeOfficerIds(db, auth.user, 'gps_tracking');
    const activeIds = db.getUsers().filter(user => user.active !== false && user.is_active !== false && (visibleIds === null || visibleIds.has(user.id))).map(user => user.id);
    const rows: Record<string, unknown>[] = [];
    // Page the actual staff IDs so the database row limit cannot silently truncate a large team.
    for (let offset = 0; offset < activeIds.length; offset += 500) {
      const { data, error } = await supabaseAdmin.from('gps_pings').select(fields).in('officer_id', activeIds.slice(offset, offset + 500)).order('created_at', { ascending: false });
      if (error) return NextResponse.json({ success: false, error: 'GPS data could not be loaded.' }, { status: 503 });
      rows.push(...data || []);
    }
    rows.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
    return NextResponse.json({ success: true, data: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiFailure(error, 'GPS data could not be loaded.'); }
}

export async function PATCH(request: Request) {
  const auth = await requireFeatureAccess(request, 'gps_tracking', 'EDIT');
  if (auth.response) return auth.response;
  if (!isConfigured()) return NextResponse.json({ success: false, error: 'GPS storage is not configured.' }, { status: 503 });
  try {
    const body = await readBody(request);
    const officerId = typeof body.officerId === 'string' ? body.officerId : '';
    const dutyStatus = body.dutyStatus as DutyStatus;
    const allowedStatuses: DutyStatus[] = ['ONLINE', 'IN_FIELD', 'ON_BREAK', 'OFFLINE', 'ON_LEAVE'];
    if (!officerId || !allowedStatuses.includes(dutyStatus)) throw new ApiInputError('A valid officer and duty status are required.');
    const { db } = await openServerWorkspace(auth.user);
    const ids = scopeOfficerIds(db, auth.user, 'gps_tracking');
    const officer = db.getUsers().find(user => user.id === officerId && user.active !== false && user.is_active !== false);
    if (!officer || ids !== null && !ids.has(officerId)) throw new ApiInputError('Not found.', 404);
    const { data, error } = await supabaseAdmin.from('users').update({ duty_status: dutyStatus }).eq('id', officerId).select('id').maybeSingle();
    if (error || !data) return NextResponse.json({ success: false, error: 'Duty status could not be saved.' }, { status: 503 });
    return NextResponse.json({ success: true });
  } catch (error) { return apiFailure(error, 'Duty status could not be saved.'); }
}
