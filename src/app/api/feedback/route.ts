import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { getTodayBs } from '@/lib/nepali-calendar';
import { dateAd, allowedValue, ApiInputError, apiFailure, assertBrand, readBody, requiredText, visibleFeedback } from '../_workspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'reviews', 'VIEW');
  if (auth.response) return auth.response;
  try {
    const { db } = await openServerWorkspace(auth.user);
    const feedback = visibleFeedback(db, auth.user);
    return NextResponse.json({ success: true, count: feedback.length, data: feedback });
  } catch (error) { return apiFailure(error, 'Failed to load feedback.'); }
}

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'reviews', 'CREATE');
  if (auth.response) return auth.response;
  try {
    const body = await readBody(request);
    const customerName = requiredText(body.customerName, 'customerName');
    const fullText = requiredText(body.fullText, 'fullText');
    const { db, commit } = await openServerWorkspace(auth.user);
    const brandCode = assertBrand(db, auth.user, body.brandCode);
    const product = body.productId ? db.getProducts().find(product => product.id === body.productId && product.brandCode === brandCode) : undefined;
    if (body.productId && !product) throw new ApiInputError('The product does not belong to the selected brand.');
    for (const field of ['screenshotUrls', 'issueCategories']) {
      if (body[field] !== undefined && (!Array.isArray(body[field]) || body[field].some((value: unknown) => typeof value !== 'string'))) throw new ApiInputError(`${field} must be a list of strings.`);
    }
    const feedback = {
      customerName, customerPhone: typeof body.customerPhone === 'string' ? body.customerPhone : '', brandCode,
      productId: product?.id || '', productName: product?.name || '',
      type: allowedValue(body.type, ['REVIEW', 'FEEDBACK', 'COMPLAINT'] as const, 'FEEDBACK', 'type'),
      channel: typeof body.channel === 'string' ? body.channel : '',
      dateReceivedAd: dateAd(body.dateReceivedAd, 'dateReceivedAd', new Date().toISOString().slice(0, 10)), dateReceivedBs: body.dateReceivedBs || getTodayBs(),
      fullText, screenshotUrls: body.screenshotUrls || [], issueCategories: body.issueCategories || [],
      sentiment: allowedValue(body.sentiment, ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const, 'NEUTRAL', 'sentiment'),
      hasScreenshot: Boolean(body.screenshotUrls?.length), usedInDesign: false, postedOnWebsite: false,
      priority: allowedValue(body.priority, ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const, 'MEDIUM', 'priority'),
      complaintStatus: 'OPEN' as const, createdById: auth.user.id,
    };
    const created = db.addFeedback(feedback);
    await commit();
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) { return apiFailure(error, 'Failed to submit feedback.'); }
}
