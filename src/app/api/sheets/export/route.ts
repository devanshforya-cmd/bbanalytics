import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { hasAccess, isSuperAdmin } from '@/lib/permissions';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { buildGoogleReportTabs, nepalReportMonth, writeGoogleReportTabs } from '@/lib/google-workspace-reports';
import { getGoogleWorkspace, logGoogleFailure, saveGoogleExportMetadata } from '@/lib/google-workspace';
import { isSameOriginGoogleMutation } from '@/lib/google-workspace-security';

export async function POST(request: NextRequest) {
  const auth = await requireFeatureAccess(request, 'export', 'CREATE');
  if (auth.response) return auth.response;
  if (!isSuperAdmin(auth.user) || !hasAccess(auth.user, 'settings')) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!isSameOriginGoogleMutation(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  let month = nepalReportMonth();
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = await request.json();
      if (body.month !== undefined) {
        if (typeof body.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) return NextResponse.json({ error: 'Use a report month in YYYY-MM format.' }, { status: 400 });
        month = body.month;
      }
    }
  } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  try {
    const workspace = await getGoogleWorkspace();
    if (!workspace.spreadsheetId) return NextResponse.json({ error: 'Connect Google and prepare the report workbook in Settings → Google Workspace.' }, { status: 503 });
    const { db } = await openServerWorkspace(auth.user);
    const now = new Date();
    const tabs = buildGoogleReportTabs(db, month, now);
    const sheets = google.sheets({ version: 'v4', auth: workspace.auth });
    const spreadsheetUrl = await writeGoogleReportTabs(sheets, workspace.spreadsheetId, tabs);
    const result = { spreadsheetUrl, totalRows: tabs.reduce((sum, tab) => sum + tab.values.length, 0), tabsUpdated: tabs.map((tab) => tab.title), exportedAt: now.toISOString() };
    try { await saveGoogleExportMetadata(result); }
    catch (error) { logGoogleFailure('export metadata save', error); }
    return NextResponse.json({ success: true, message: `Exported ${result.totalRows} rows across ${tabs.length} tabs.`, ...result });
  } catch (error) {
    logGoogleFailure('Sheets export', error);
    return NextResponse.json({ success: false, error: 'Google Sheets export failed. Check the Google connection and report workbook permissions, then retry.' }, { status: 502 });
  }
}
