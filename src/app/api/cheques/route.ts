import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN', 'ADMIN', 'SALES_OFFICER']);
  if (auth.response) return auth.response;

  const { user } = auth;
  let cheques = db.getCheques();

  // Sales Officers / Own scope only see their own collected cheques
  if (user.role === 'SALES_OFFICER' || user.permissions?.cheque_tracker?.scope === 'OWN') {
    cheques = cheques.filter((c) => c.officerId === user.id || c.officerName === user.fullName);
  }

  return NextResponse.json({ success: true, count: cheques.length, data: cheques });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN', 'ADMIN', 'SALES_OFFICER']);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    if (!body.chequeNumber || !body.amount || !body.storeName) {
      return NextResponse.json(
        { success: false, error: 'Missing required cheque fields: chequeNumber, amount, storeName.' },
        { status: 400 }
      );
    }

    const created = db.addCheque({
      ...body,
      entityType: body.entityType || 'BRANCH',
      entityId: body.entityId || 'ent_default',
      amount: Number(body.amount),
      status: body.status || 'COLLECTED_IN_FIELD',
      receivedDateAd: body.receivedDateAd || new Date().toISOString().split('T')[0],
      receivedDateBs: body.receivedDateBs || '2083-05-27',
      cashDateAd: body.cashDateAd || new Date().toISOString().split('T')[0],
      cashDateBs: body.cashDateBs || '2083-05-27',
      photoUrl: body.photoUrl || '',
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to record cheque' }, { status: 500 });
  }
}
