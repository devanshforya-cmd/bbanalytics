import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN', 'ADMIN']);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'orders';

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
