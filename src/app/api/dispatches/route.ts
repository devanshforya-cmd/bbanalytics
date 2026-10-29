import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { getTodayBs } from '@/lib/nepali-calendar';
import { canAccessBrand } from '@/lib/permissions';
import { dateAd, ApiInputError, apiFailure, positiveNumber, readBody, requiredText, scopeOfficerIds, visibleDispatches } from '../_workspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'dispatches', 'VIEW');
  if (auth.response) return auth.response;
  try {
    const { db } = await openServerWorkspace(auth.user);
    const dispatches = visibleDispatches(db, auth.user);
    return NextResponse.json({ success: true, count: dispatches.length, data: dispatches });
  } catch (error) { return apiFailure(error, 'Failed to load dispatches.'); }
}

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'dispatches', 'CREATE');
  if (auth.response) return auth.response;
  try {
    const body = await readBody(request);
    const distributorId = requiredText(body.distributorId, 'distributorId');
    if (!Array.isArray(body.items) || body.items.length === 0) throw new ApiInputError('A non-empty items list is required.');
    const { db, commit } = await openServerWorkspace(auth.user);
    const distributor = db.getDistributors().find(distributor => distributor.id === distributorId);
    if (!distributor) throw new ApiInputError('The distributor does not exist.');
    const branch = body.branchId ? db.getBranches().find(branch => branch.id === body.branchId && branch.distributorId === distributorId) : undefined;
    if (body.branchId && !branch) throw new ApiInputError('The branch does not belong to the distributor.');
    const ids = scopeOfficerIds(db, auth.user, 'dispatches');
    if (ids !== null && (!branch || !ids.has(branch.assignedOfficerId))) throw new ApiInputError('Not found.', 404);
    const items = body.items.map((item: any) => {
      const product = db.getProducts().find(product => product.id === item?.productId);
      if (!product) throw new ApiInputError('Each item must reference an existing product.');
      if (!canAccessBrand(auth.user, product.brandCode)) throw new ApiInputError('Not found.', 404);
      return { productId: product.id, productName: product.name, brandCode: product.brandCode, quantity: positiveNumber(item.quantity, 'quantity', true) };
    });
    const dispatch = {
      distributorId, distributorName: distributor.name, branchId: branch?.id, branchName: branch?.name,
      dispatchDateAd: dateAd(body.dispatchDateAd, 'dispatchDateAd', new Date().toISOString().slice(0, 10)), dispatchDateBs: body.dispatchDateBs || getTodayBs(),
      items, notes: typeof body.notes === 'string' ? body.notes : '', documentUrl: typeof body.documentUrl === 'string' ? body.documentUrl : undefined,
      createdById: auth.user.id,
    };
    const created = db.addDispatch(dispatch);
    await commit();
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) { return apiFailure(error, 'Failed to create dispatch.'); }
}
