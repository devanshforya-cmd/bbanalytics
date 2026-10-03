import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN', 'ADMIN']);
  if (auth.response) return auth.response;

  const brands = db.getBrands();
  const holidays = db.getHolidays();

  return NextResponse.json({
    success: true,
    data: {
      brands,
      holidays,
      systemTime: new Date().toISOString(),
      version: '2.0.0-production',
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN']);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    if (body.type === 'holiday' && body.holiday) {
      const added = db.addHoliday(body.holiday);
      return NextResponse.json({ success: true, data: added });
    }
    return NextResponse.json({ success: true, message: 'Settings updated' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update settings' }, { status: 500 });
  }
}
