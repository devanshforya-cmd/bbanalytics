import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { mapStoredUser } from '@/lib/db/server-workspace';
import { hasAccess } from '@/lib/permissions';
import { parseNativeFix } from '@/lib/gps-validation';
import { saveTrustedGps } from '@/lib/gps-server';

export const dynamic = 'force-dynamic';
const response = (status: number, message: string) => new NextResponse(message, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' } });

/** OsmAnd-compatible receiver for an explicitly paired Traccar Client. Never log its identifier. */
async function receive(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 8192 || request.url.length > 8192) return response(413, 'Request too large');
  try {
    const params = new URL(request.url).searchParams;
    if (request.method === 'POST') {
      const reader = request.body?.getReader();
      let body = '';
      let size = 0;
      const decoder = new TextDecoder();
      if (reader) {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 8192) { await reader.cancel(); return response(413, 'Request too large'); }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      }
      for (const [key, value] of new URLSearchParams(body)) params.set(key, value);
    }
    const identifier = params.get('id') || params.get('deviceid') || '';
    const match = /^([A-Za-z0-9_-]{1,100})\.[A-Za-z0-9_-]{43}$/.exec(identifier);
    if (!match) return response(401, 'Unknown device');
    const { data: pairing, error: pairingError } = await supabaseAdmin.from('system_settings').select('value').eq('key', `gps_device_v1_${match[1]}`).maybeSingle();
    if (pairingError) return response(503, 'Storage unavailable');
    const hash = pairing?.value?.hash;
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || Date.parse(pairing?.value?.expiresAt || '') <= Date.now() || !Number.isFinite(Date.parse(pairing?.value?.expiresAt || '')) || !timingSafeEqual(Buffer.from(hash, 'hex'), createHash('sha256').update(identifier).digest())) return response(401, 'Unknown device');
    const { data: row, error: userError } = await supabaseAdmin.from('users').select('*').eq('id', match[1]).maybeSingle();
    if (userError) return response(503, 'Storage unavailable');
    if (!row) return response(401, 'Unknown device');
    const user = mapStoredUser(row);
    if (user.active === false || row.active === false || !hasAccess(user, 'beat_plans')) return response(403, 'Device access revoked');
    if (user.dutyStatus === 'OFFLINE' || user.dutyStatus === 'ON_LEAVE') return response(200, 'Duty ended; position not stored');
    let fix;
    try { fix = parseNativeFix(params); } catch { return response(400, 'Invalid position or timestamp'); }
    await saveTrustedGps(user, fix, user.dutyStatus === 'ON_BREAK' ? 'IDLE' : 'IN_TRANSIT', undefined, fix.batteryLevel);
    return response(200, 'OK');
  } catch { return response(503, 'GPS receiver temporarily unavailable'); }
}

export const GET = receive;
export const POST = receive;
