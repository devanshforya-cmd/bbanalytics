import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'node:stream';
import { requireAuth } from '@/lib/auth-guard';
import { canPerform, hasAccess } from '@/lib/permissions';
import { getGoogleWorkspace, logGoogleFailure } from '@/lib/google-workspace';
import { DRIVE_UPLOAD_LIMIT, detectGoogleUploadType, isDriveFeature, isSameOriginGoogleMutation } from '@/lib/google-workspace-security';

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session.response) return session.response;
  if (!isSameOriginGoogleMutation(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (Number(request.headers.get('content-length')) > DRIVE_UPLOAD_LIMIT + 64 * 1024) return NextResponse.json({ error: 'File size exceeds 4MB limit.' }, { status: 413 });
  try {
    const form = await request.formData();
    const feature = form.get('feature');
    if (!isDriveFeature(feature) || !hasAccess(session.user, feature)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    if (!canPerform(session.user, feature, 'CREATE')) return NextResponse.json({ error: 'You do not have permission to upload files for this feature.' }, { status: 403 });
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'Provide an image or PDF file.' }, { status: 400 });
    if (file.size > DRIVE_UPLOAD_LIMIT) return NextResponse.json({ error: 'File size exceeds 4MB limit.' }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = detectGoogleUploadType(bytes, file.name);
    if (!mimeType) return NextResponse.json({ error: 'Only valid JPEG, PNG, WebP and PDF files are supported.' }, { status: 400 });
    const workspace = await getGoogleWorkspace();
    if (!workspace.folderId) return NextResponse.json({ error: 'Google Drive folder is not configured. Ask an administrator to finish Google Workspace setup.' }, { status: 503 });
    const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-180) || 'upload';
    const drive = google.drive({ version: 'v3', auth: workspace.auth });
    const result = await drive.files.create({
      requestBody: { name, parents: [workspace.folderId], appProperties: { app: 'bb-analytics', feature, uploaderId: session.user.id } },
      media: { mimeType, body: Readable.from(bytes) }, fields: 'id,name', supportsAllDrives: true,
    });
    if (!result.data.id) throw new Error('Missing uploaded file id.');
    const url = `/api/drive/files/${encodeURIComponent(result.data.id)}`;
    return NextResponse.json({ success: true, fileId: result.data.id, fileName: result.data.name, viewUrl: url, downloadUrl: `${url}?download=1`, uploadedAt: new Date().toISOString() });
  } catch (error) {
    logGoogleFailure('upload', error);
    return NextResponse.json({ success: false, error: 'Google Drive upload failed. Ask an administrator to check the Google connection, then retry.' }, { status: 502 });
  }
}
