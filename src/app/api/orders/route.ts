import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'DATA_ENTRY', 'VIEWER']);
  if (auth.response) return auth.response;

  const { user } = auth;
  let orders = db.getOrders();

  if (user.assignedBrands && user.assignedBrands.length > 0 && !user.assignedBrands.includes('ALL')) {
    orders = orders.filter((o) => user.assignedBrands!.includes(o.brandCode as any));
  }

  return NextResponse.json({ success: true, count: orders.length, data: orders });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'DATA_ENTRY']);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    if (!body.customerName || !body.customerPhone) {
      return NextResponse.json(
        { success: false, error: 'Missing required order fields: customerName, customerPhone.' },
        { status: 400 }
      );
    }

    const items = body.items || [
      {
        productId: body.productId || 'prod_default',
        productName: body.productName || 'Default Item',
        quantity: Number(body.quantity) || 1,
        unitPrice: Number(body.unitPrice) || 500,
        subtotal: (Number(body.quantity) || 1) * (Number(body.unitPrice) || 500),
      },
    ];
    const totalAmount = items.reduce((acc: number, item: any) => acc + (item.subtotal || 0), 0);

    const created = db.addOrder({
      orderNumber: body.orderNumber || `ORD-${Date.now().toString().slice(-6)}`,
      brandCode: body.brandCode || 'FORYA',
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      platform: body.platform || 'WhatsApp',
      orderDateAd: body.orderDateAd || new Date().toISOString().split('T')[0],
      orderDateBs: body.orderDateBs || '2083-05-27',
      province: body.province || 'Bagmati',
      district: body.district || 'Kathmandu',
      address: body.address || 'Kathmandu Valley',
      deliveryMethod: body.deliveryMethod || 'Standard Delivery',
      paymentTerms: body.paymentTerms || 'COD',
      orderType: body.orderType || 'NEW',
      items,
      totalAmount,
      status: body.status || 'PENDING',
      source: body.source || 'MANUAL',
      notes: body.remarks || body.notes || '',
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to create order' }, { status: 500 });
  }
}
