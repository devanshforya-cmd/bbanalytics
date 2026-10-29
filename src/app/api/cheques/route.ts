import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { getTodayBs } from '@/lib/nepali-calendar';
import { canAccessBrand, getAssignedBrandCodes } from '@/lib/permissions';
import { dateAd, ApiInputError, apiFailure, positiveNumber, readBody, requiredText, scopeOfficerIds, visibleCheques } from '../_workspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'cheque_tracker', 'VIEW');
  if (auth.response) return auth.response;
  try {
    const { db } = await openServerWorkspace(auth.user);
    const cheques = visibleCheques(db, auth.user);
    return NextResponse.json({ success: true, count: cheques.length, data: cheques });
  } catch (error) { return apiFailure(error, 'Failed to load cheques.'); }
}

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'cheque_tracker', 'CREATE');
  if (auth.response) return auth.response;
  try {
    const body = await readBody(request);
    const chequeNumber = requiredText(body.chequeNumber, 'chequeNumber');
    const amount = positiveNumber(body.amount, 'amount');
    const bankName = requiredText(body.bankName, 'bankName');
    const entityId = requiredText(body.entityId, 'entityId');
    if (body.entityType !== 'BRANCH' && body.entityType !== 'RETAILER') throw new ApiInputError('A valid entityType is required.');
    const { db, commit } = await openServerWorkspace(auth.user);
    const store = (body.entityType === 'BRANCH' ? db.getBranches() : db.getRetailers()).find(store => store.id === entityId);
    if (!store) throw new ApiInputError('The linked store does not exist.');
    const ids = scopeOfficerIds(db, auth.user, 'cheque_tracker');
    if (ids !== null && !ids.has(store.assignedOfficerId)) throw new ApiInputError('Not found.', 404);
    const storeBrands = 'brandsAvailable' in store ? store.brandsAvailable : store.brandsStocked;
    const brandCodes = storeBrands.filter(code => canAccessBrand(auth.user, code));
    if (!getAssignedBrandCodes(auth.user).includes('ALL') && brandCodes.length === 0) throw new ApiInputError('Not found.', 404);
    const created = db.addCheque({
      chequeNumber, amount, bankName, entityId, entityType: body.entityType,
      storeName: store.name, brandCodes, status: 'COLLECTED_IN_FIELD',
      receivedDateAd: dateAd(body.receivedDateAd, 'receivedDateAd', new Date().toISOString().slice(0, 10)), receivedDateBs: body.receivedDateBs || getTodayBs(),
      cashDateAd: dateAd(body.cashDateAd, 'cashDateAd'), cashDateBs: requiredText(body.cashDateBs, 'cashDateBs'),
      photoUrl: typeof body.photoUrl === 'string' ? body.photoUrl : '', notes: typeof body.notes === 'string' ? body.notes : '',
    });
    await commit();
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) { return apiFailure(error, 'Failed to record cheque.'); }
}
