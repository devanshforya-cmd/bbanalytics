import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'DATA_ENTRY']);
  if (auth.response) return auth.response;

  const { user } = auth;
  let feedback = db.getFeedback();

  if (user.assignedBrands && user.assignedBrands.length > 0 && !user.assignedBrands.includes('ALL')) {
    feedback = feedback.filter((f) => user.assignedBrands!.includes(f.brandCode as any));
  }

  return NextResponse.json({ success: true, count: feedback.length, data: feedback });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, ['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'DATA_ENTRY']);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    if (!body.customerName || !body.fullText || !body.brandCode) {
      return NextResponse.json(
        { success: false, error: 'Missing required feedback fields: customerName, fullText, brandCode.' },
        { status: 400 }
      );
    }

    const created = db.addFeedback({
      customerName: body.customerName,
      customerPhone: body.customerPhone || '9800000000',
      brandCode: body.brandCode,
      productId: body.productId || 'prod_general',
      productName: body.productName || 'General Product',
      type: body.type || 'FEEDBACK',
      channel: body.channel || 'WhatsApp',
      dateReceivedAd: body.dateReceivedAd || new Date().toISOString().split('T')[0],
      dateReceivedBs: body.dateReceivedBs || '2083-05-27',
      fullText: body.fullText,
      screenshotUrls: body.screenshotUrls || [],
      issueCategories: body.issueCategories || [],
      sentiment: body.sentiment || 'NEUTRAL',
      hasScreenshot: Boolean(body.screenshotUrls?.length),
      usedInDesign: false,
      postedOnWebsite: false,
      priority: body.priority || 'MEDIUM',
      complaintStatus: body.complaintStatus || 'OPEN',
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to submit feedback' }, { status: 500 });
  }
}
