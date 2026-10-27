import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { requireAuth } from '@/lib/auth-guard';
import { getTeamMemberIds, getScope } from '@/lib/permissions';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { getGoogleWorkspace, logGoogleFailure } from '@/lib/google-workspace';
import { canReadDriveFile, DRIVE_UPLOAD_LIMIT, isDriveFeature } from '@/lib/google-workspace-security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const { id } = await context.params;
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  try {
    const workspace = await getGoogleWorkspace();
    const drive = google.drive({ version: 'v3', auth: workspace.auth });
    const metadata = await drive.files.get({ fileId: id, fields: 'id,name,mimeType,size,appProperties,trashed', supportsAllDrives: true });
    const properties = metadata.data.appProperties;
    let teamIds: string[] = [];
    if (properties && isDriveFeature(properties.feature) && getScope(auth.user, properties.feature) === 'TEAM') {
      const { data, error } = await supabaseAdmin.from('users').select('id,reports_to_id');
      if (error) throw new Error('Team authorization is unavailable.');
      teamIds = await getTeamMemberIds(auth.user.id, data || []);
    }
    if (metadata.data.trashed || !canReadDriveFile(auth.user, properties, teamIds) || Number(metadata.data.size) > DRIVE_UPLOAD_LIMIT) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const content = await drive.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    const mimeType = metadata.data.mimeType || 'application/octet-stream';
    const inline = request.nextUrl.searchParams.get('download') !== '1' && ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType);
    return new NextResponse(Buffer.from(content.data as ArrayBuffer), { headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(metadata.data.name || 'download')}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    } });
  } catch (error) {
    logGoogleFailure('file read', error);
    return NextResponse.json({ error: 'File is unavailable or access was denied.' }, { status: 404 });
  }
}
