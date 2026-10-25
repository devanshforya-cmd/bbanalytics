import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { requireAuth } from '@/lib/auth-guard';
import { canPerform, hasAccess, type FeatureKey } from '@/lib/permissions';

// Maximum allowed upload size: 15MB
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const BLOCKED_EXTENSIONS = /\.(exe|bat|cmd|sh|php|dll|vbs|bin|com|msi|scr)$/i;

export async function POST(request: NextRequest) {
  // 1. Enforce authentication for file upload
  const session = await requireAuth(request);
  if (session.response) return session.response;

  try {
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Check environment credentials
    if (!serviceAccountEmail || !privateKeyRaw) {
      return NextResponse.json(
        {
          success: false,
          error: 'GOOGLE_CREDENTIALS_MISSING',
          message:
            'Google Drive service account credentials not configured. Please add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to your environment variables.',
        },
        { status: 503 }
      );
    }

    // Format private key (replace escaped newlines if passed in string form)
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    const formData = await request.formData();
    const requestedFeature = formData.get('feature');
    const feature = requestedFeature === 'shelf_photos' || requestedFeature === 'document_handover'
      ? requestedFeature as FeatureKey
      : null;
    if (!feature || !hasAccess(session.user, feature)) {
      return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
    }
    if (!canPerform(session.user, feature, 'CREATE')) {
      return NextResponse.json({ success: false, error: 'You do not have permission to upload files for this feature.' }, { status: 403 });
    }
    const file = formData.get('file') as File | null;
    const customName = formData.get('name') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided in form data' },
        { status: 400 }
      );
    }

    // Enforce file size limit
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 15MB limit.' },
        { status: 413 }
      );
    }

    // Sanitize file name & block dangerous executable extensions
    const rawFileName = customName || file.name || `bb_upload_${Date.now()}`;
    const sanitizedFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, '_');

    if (BLOCKED_EXTENSIONS.test(sanitizedFileName)) {
      return NextResponse.json(
        { success: false, error: 'Executable and script file uploads are prohibited for security.' },
        { status: 400 }
      );
    }

    const fileName = sanitizedFileName;
    const fileMime = file.type || 'application/octet-stream';

    // Convert file buffer to readable stream for googleapis
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    // Authenticate with Google Drive API
    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // Upload to Google Drive folder
    const fileMetadata: any = {
      name: fileName,
    };
    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    const driveResponse = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: fileMime,
        body: stream,
      },
      fields: 'id, name, webViewLink, webContentLink',
    });

    const uploaded = driveResponse.data;

    return NextResponse.json({
      success: true,
      fileId: uploaded.id,
      fileName: uploaded.name,
      viewUrl: uploaded.webViewLink,
      downloadUrl: uploaded.webContentLink,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Google Drive upload error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'DRIVE_UPLOAD_FAILED',
        message: err?.message || 'Failed to upload file to Google Drive',
      },
      { status: 500 }
    );
  }
}
