import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN', 'ADMIN']);
  if (auth.response) return auth.response;

  const dispatches = db.getDispatches();
  return NextResponse.json({ success: true, count: dispatches.length, data: dispatches });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN', 'ADMIN']);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    if (!body.distributorId || !body.items || body.items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required dispatch fields: distributorId, items list.' },
        { status: 400 }
      );
    }

    const created = db.addDispatch({
      distributorId: body.distributorId,
      distributorName: body.distributorName || 'Distributor',
      branchId: body.branchId,
      branchName: body.branchName,
      dispatchDateAd: body.dispatchDateAd || new Date().toISOString().split('T')[0],
      dispatchDateBs: body.dispatchDateBs || '2083-05-27',
      items: body.items,
      notes: body.notes,
      documentUrl: body.documentUrl,
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to create dispatch' }, { status: 500 });
  }
}
