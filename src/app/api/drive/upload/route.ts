import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

export async function POST(request: NextRequest) {
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
    const file = formData.get('file') as File | null;
    const customName = formData.get('name') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided in form data' },
        { status: 400 }
      );
    }

    const fileName = customName || file.name || `bb_upload_${Date.now()}`;
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
