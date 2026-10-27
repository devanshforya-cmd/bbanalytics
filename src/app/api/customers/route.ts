import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { apiFailure, visibleCustomers } from '../_workspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'customers', 'VIEW');
  if (auth.response) return auth.response;
  try {
    const { db } = await openServerWorkspace(auth.user);
    const customers = visibleCustomers(db, auth.user);
    return NextResponse.json({ success: true, count: customers.length, data: customers });
  } catch (error) { return apiFailure(error, 'Failed to load customers.'); }
}
