import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { getTodayBs } from '@/lib/nepali-calendar';
import { dateAd, allowedValue, ApiInputError, apiFailure, assertBrand, positiveNumber, readBody, requiredText, visibleOrders } from '../_workspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'orderflow', 'VIEW');
  if (auth.response) return auth.response;
  try {
    const { db } = await openServerWorkspace(auth.user);
    const orders = visibleOrders(db, auth.user);
    return NextResponse.json({ success: true, count: orders.length, data: orders });
  } catch (error) { return apiFailure(error, 'Failed to load orders.'); }
}

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'orderflow', 'CREATE');
  if (auth.response) return auth.response;
  try {
    const body = await readBody(request);
    const customerName = requiredText(body.customerName, 'customerName');
    const customerPhone = requiredText(body.customerPhone, 'customerPhone');
    if (!Array.isArray(body.items) || body.items.length === 0) throw new ApiInputError('A non-empty items list is required.');
    const { db, commit } = await openServerWorkspace(auth.user);
    const brandCode = assertBrand(db, auth.user, body.brandCode);
    const items = body.items.map((item: any) => {
      const product = db.getProducts().find(product => product.id === item?.productId && product.brandCode === brandCode);
      if (!product) throw new ApiInputError('Each item must reference a product in the selected brand.');
      const quantity = positiveNumber(item.quantity, 'quantity', true);
      const unitPrice = positiveNumber(item.unitPrice, 'unitPrice');
      const totalPrice = quantity * unitPrice;
      if (!Number.isFinite(totalPrice)) throw new ApiInputError('Item total is too large.');
      return { productId: product.id, productName: product.name, brandCode: product.brandCode, quantity, unitPrice, totalPrice };
    });
    const order = {
      orderNumber: typeof body.orderNumber === 'string' && body.orderNumber.trim() ? body.orderNumber.trim().toUpperCase() : `ORD-${randomUUID()}`.toUpperCase(),
      brandCode, customerName, customerPhone,
      platform: allowedValue(body.platform, ['Instagram', 'Messenger', 'WhatsApp', 'Website', 'TikTok', 'Walk-in', 'Pathao Bazaar', 'Phone Call', 'Field Order', 'YouTube', 'Facebook', 'Other'] as const, 'Other', 'platform'),
      orderDateAd: dateAd(body.orderDateAd, 'orderDateAd', new Date().toISOString().slice(0, 10)),
      orderDateBs: body.orderDateBs || getTodayBs(),
      province: requiredText(body.province, 'province'), district: requiredText(body.district, 'district'), address: requiredText(body.address, 'address'),
      deliveryMethod: allowedValue(body.deliveryMethod, ['Standard', 'Pathao', 'InDrive', 'Yango', 'Pick-up'] as const, 'Standard', 'deliveryMethod'),
      paymentTerms: allowedValue(body.paymentTerms, ['COD', 'Prepaid', 'Credit 15 days', 'Credit 30 days', 'Advance'] as const, 'COD', 'paymentTerms'),
      orderType: allowedValue(body.orderType, ['NEW', 'REPEAT'] as const, 'NEW', 'orderType'),
      items, totalAmount: items.reduce((sum, item) => sum + item.totalPrice, 0),
      status: allowedValue(body.status, ['PENDING', 'DISPATCHED', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED', 'EXCHANGED'] as const, 'PENDING', 'status'),
      source: 'MANUAL' as const, notes: typeof body.notes === 'string' ? body.notes : typeof body.remarks === 'string' ? body.remarks : '',
      createdById: auth.user.id,
    };
    if (!Number.isFinite(order.totalAmount)) throw new ApiInputError('Order total is too large.');
    const created = db.addOrder(order);
    await commit();
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) { return apiFailure(error, 'Failed to create order.'); }
}
