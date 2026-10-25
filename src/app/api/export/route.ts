import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { hasAccess, type FeatureKey } from '@/lib/permissions';
import { db } from '@/lib/db/db-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'export', 'VIEW');
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'orders';
  const featureByType: Record<string, FeatureKey> = {
    orders: 'orderflow',
    cheques: 'cheque_tracker',
    returns: 'reviews',
    feedback: 'reviews',
    customers: 'customers',
    stock_counts: 'dispatches',
  };
  const requiredFeature = featureByType[type] || 'orderflow';
  if (!hasAccess(auth.user, requiredFeature)) {
    return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
  }

  let data: any[] = [];
  switch (type) {
    case 'orders':
      data = db.getOrders();
      break;
    case 'cheques':
      data = db.getCheques();
      break;
    case 'returns':
      data = db.getReturns();
      break;
    case 'feedback':
      data = db.getFeedback();
      break;
    case 'customers':
      data = db.getCustomers();
      break;
    case 'stock_counts':
      data = db.getStockCounts();
      break;
    default:
      data = db.getOrders();
  }

  return NextResponse.json({
    success: true,
    type,
    timestamp: new Date().toISOString(),
    totalRows: data.length,
    data,
  });
}
