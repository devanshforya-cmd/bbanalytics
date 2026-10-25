import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';
import { getTodayBs } from '@/lib/nepali-calendar';
import { getAssignedBrandCodes, getScope } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'orderflow', 'VIEW');
  if (auth.response) return auth.response;

  const { user } = auth;
  let orders = db.getOrders();

  const assignedBrands = getAssignedBrandCodes(user);
  if (!assignedBrands.includes('ALL')) {
    orders = orders.filter((o) => assignedBrands.includes(String(o.brandCode).toUpperCase()));
  }
  if (getScope(user, 'orderflow') === 'OWN') {
    orders = orders.filter((order) => (order as any).officerId === user.id || (order as any).createdBy === user.id);
  }

  return NextResponse.json({ success: true, count: orders.length, data: orders });
}

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'orderflow', 'CREATE');
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
      orderDateBs: body.orderDateBs || getTodayBs(),
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
