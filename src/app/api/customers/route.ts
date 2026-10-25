import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'customers', 'VIEW');
  if (auth.response) return auth.response;

  const customers = db.getCustomers();
  return NextResponse.json({ success: true, count: customers.length, data: customers });
}
