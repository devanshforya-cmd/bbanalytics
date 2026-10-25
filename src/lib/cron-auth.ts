import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export function requireCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, error: 'Cron authorization is not configured.' },
      { status: 503 }
    );
  }

  const authorization = request.headers.get('authorization') || '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }
  return null;
}
