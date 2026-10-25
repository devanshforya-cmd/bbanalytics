import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';
import { getTodayBs } from '@/lib/nepali-calendar';
import { canAccessBrand, getAssignedBrandCodes, getScope } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'cheque_tracker', 'VIEW');
  if (auth.response) return auth.response;

  const { user } = auth;
  let cheques = db.getCheques();
  const assignedBrands = getAssignedBrandCodes(user);
  if (!assignedBrands.includes('ALL')) {
    const brandCodesByStore = new Map<string, string[]>([
      ...db.getRetailers().map((store) => [store.id, (store as any).brandsStocked || []] as [string, string[]]),
      ...db.getBranches().map((branch) => [branch.id, branch.brandsAvailable || []] as [string, string[]]),
    ]);
    cheques = cheques.filter((cheque) => {
      const linkedBrands = (cheque as any).brandCodes || brandCodesByStore.get(cheque.entityId) || [];
      return linkedBrands.some((code: string) => canAccessBrand(user, code));
    });
  }

  // Sales Officers / Own scope only see their own collected cheques
  if (getScope(user, 'cheque_tracker') === 'OWN') {
    cheques = cheques.filter((c) => c.officerId === user.id);
  }

  return NextResponse.json({ success: true, count: cheques.length, data: cheques });
}

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'cheque_tracker', 'CREATE');
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
      receivedDateBs: body.receivedDateBs || getTodayBs(),
      cashDateAd: body.cashDateAd || new Date().toISOString().split('T')[0],
      cashDateBs: body.cashDateBs || getTodayBs(),
      photoUrl: body.photoUrl || '',
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to record cheque' }, { status: 500 });
  }
}
