import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { dateAd, allowedValue, ApiInputError, apiFailure, readBody, requiredText } from '../_workspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'settings', 'VIEW');
  if (auth.response) return auth.response;
  try {
    const { db } = await openServerWorkspace(auth.user);
    return NextResponse.json({ success: true, data: { brands: db.getBrands(), holidays: db.getHolidays(), systemTime: new Date().toISOString(), version: '2.0.0' } });
  } catch (error) { return apiFailure(error, 'Failed to load settings.'); }
}

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'settings', 'EDIT');
  if (auth.response) return auth.response;
  try {
    const body = await readBody(request);
    if (body.type !== 'holiday' || !body.holiday || typeof body.holiday !== 'object') throw new ApiInputError('A supported settings update is required.');
    const holiday = body.holiday;
    const name = requiredText(holiday.name, 'name');
    const holidayDateAd = dateAd(holiday.dateAd, 'dateAd');
    const dateBs = requiredText(holiday.dateBs, 'dateBs');
    const yearBs = Number(holiday.yearBs);
    if (!Number.isInteger(yearBs) || yearBs < 2000 || yearBs > 2200) throw new ApiInputError('A valid yearBs is required.');
    const { db, commit } = await openServerWorkspace(auth.user);
    const added = db.addHoliday({ name, dateAd: holidayDateAd, dateBs, yearBs, type: allowedValue(holiday.type, ['PUBLIC', 'COMPANY', 'OPTIONAL'] as const, 'PUBLIC', 'holiday type'), notes: typeof holiday.notes === 'string' ? holiday.notes : undefined });
    await commit();
    return NextResponse.json({ success: true, data: added });
  } catch (error) { return apiFailure(error, 'Failed to update settings.'); }
}
