import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { canAccessBrand, hasAccess, type FeatureKey } from '@/lib/permissions';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { apiFailure, ownsRecord, scopeOfficerIds, visibleCheques, visibleCustomers, visibleFeedback, visibleOrders } from '../_workspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'export', 'VIEW');
  if (auth.response) return auth.response;
  const type = new URL(request.url).searchParams.get('type') || 'orders';
  const featureByType: Record<string, FeatureKey> = { orders: 'orderflow', cheques: 'cheque_tracker', returns: 'reviews', feedback: 'reviews', customers: 'customers', stock_counts: 'dispatches' };
  const feature = featureByType[type];
  if (!feature) return NextResponse.json({ success: false, error: 'Unsupported export type.' }, { status: 400 });
  if (!hasAccess(auth.user, feature)) return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
  try {
    const { db } = await openServerWorkspace(auth.user);
    const ids = scopeOfficerIds(db, auth.user, feature);
    const scopedOrderIds = new Set(db.getOrders().filter(order => ownsRecord(order, ids)).map(order => order.id));
    let data: unknown[];
    switch (type) {
      case 'orders': data = visibleOrders(db, auth.user); break;
      case 'cheques': data = visibleCheques(db, auth.user); break;
      case 'feedback': data = visibleFeedback(db, auth.user); break;
      case 'customers': data = visibleCustomers(db, auth.user); break;
      case 'returns': data = db.getReturns().filter(entry => canAccessBrand(auth.user, entry.brandCode) && (ids === null || ownsRecord(entry, ids) || !!entry.orderId && scopedOrderIds.has(entry.orderId))); break;
      default: data = db.getStockCounts().filter(count => ownsRecord(count, ids)).map(count => ({ ...count, items: count.items.filter(item => canAccessBrand(auth.user, item.brandCode)) })).filter(count => count.items.length > 0);
    }
    return NextResponse.json({ success: true, type, timestamp: new Date().toISOString(), totalRows: data.length, data });
  } catch (error) { return apiFailure(error, 'Failed to export data.'); }
}
