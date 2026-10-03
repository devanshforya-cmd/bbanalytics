import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'DATA_ENTRY']);
  if (auth.response) return auth.response;

  const customers = db.getCustomers();
  return NextResponse.json({ success: true, count: customers.length, data: customers });
}
