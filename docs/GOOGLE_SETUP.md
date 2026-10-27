# Google Workspace setup

Supabase is the source of truth. Google Drive stores uploaded photos/documents; Google Sheets is a manually refreshed report copy. The application does not run scheduled Sheets exports. Existing browser-only scheduling preferences have no effect.

## Recommended: administrator OAuth

1. In a Google Cloud project, enable **Google Drive API** and **Google Sheets API**. Configure the OAuth consent screen and create an OAuth client with application type **Web application**.
2. Register the exact production callback URI: `https://YOUR_APP_DOMAIN/api/integrations/google/callback`. Use the same origin as the app; preview deployment domains need their own exact registered URI and environment setting. Local development can use `http://localhost:3000/api/integrations/google/callback` for local testing, including a local production build. The connection endpoint requires the browser origin to match the configured callback origin.
3. Set these **server-only** hosting environment variables and redeploy:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (the exact registered URI)
   - `AUTH_SESSION_SECRET` (at least 32 bytes; keep stable because it also derives the encryption key)
   - `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
4. Apply the production database migrations. The existing `system_settings(key,value,updated_at)` table must be server-only: revoke anon/authenticated access and remove permissive policies. The Google refresh token is additionally encrypted using AES-256-GCM and a purpose-separated key derived from `AUTH_SESSION_SECRET`. Never put Google credentials in `NEXT_PUBLIC_*`, browser localStorage, code, logs, or user records.
5. Sign in as Super Admin on the configured app origin. Open **Settings → Google Workspace → Connect Google**. Complete Google's real consent screen with the Google account intended to own the app folder. This is the only account authorization step; an existing Codex Google connector is unrelated and its tokens are never reused.
6. Google consent requests only `https://www.googleapis.com/auth/drive.file`. The server creates a private **BB Analytics** folder and **BB Analytics Reports** workbook. If resource creation fails after consent, click **Prepare resources** to retry; completed resource IDs are retained.
7. Open **OpsCore → Reports & Exports**, select an AD month, and click **Export seven core tabs**. Verify the returned workbook and a small photo upload with an ordinary field account. Only actual successful export timestamps/counts are shown. Configured status does not prove a token is still valid; a revoked grant requires reconnecting.

For an External consent app in Testing, add the intended administrator as a test user. Google testing grants can expire; use the appropriate published/internal consent configuration for lasting production access and complete any Google-required verification. Google documents [offline consent, refresh tokens, and exact redirect URIs](https://developers.google.com/identity/protocols/oauth2/web-server) and [file-scoped Drive authorization](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Changing `AUTH_SESSION_SECRET` invalidates existing sessions and the stored Google token. Reconnect Google after changing it. **Remove app connection** deletes the locally stored token without deleting existing Google files or revoking the Google grant. To revoke the grant too, remove the app in your [Google account connections](https://myaccount.google.com/connections). Reconnecting creates a new report folder/workbook; historical documents remain in the previous folder/account.

## Existing service-account / shared-drive fallback

Keep OAuth connection unset and configure:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (escaped `\\n` newlines are accepted)
- `GOOGLE_DRIVE_FOLDER_ID` (an existing shared-drive folder writable by that account)
- `GOOGLE_SHEETS_SPREADSHEET_ID` (an existing workbook editable by that account)

Share only the intended folder/workbook with the service account. Service accounts cannot generally use personal Drive storage as ordinary human accounts; use a shared drive for uploads. Shared-drive requests include `supportsAllDrives`. The fallback uses Drive and Sheets scopes for those existing resources. It does not make files public; inherited shared-folder permissions still apply. A saved OAuth connection takes precedence over these environment values.

## Upload and report boundaries

- Only authenticated callers with the feature's CREATE action can upload. Each upload is capped at **4 MB** before multipart overhead to fit hosted request limits. Supported file types are JPEG, PNG, WebP and PDF, checked by both extension and file signature. The client compresses photos and strips EXIF metadata before upload.
- Uploads carry app, feature and uploader metadata. App URLs use `/api/drive/files/ID`; reading requires feature VIEW access plus OWN/TEAM/ALL scope. Untagged files and arbitrary files in the Google owner's Drive are unavailable through this proxy. Existing embedded data URLs are not automatically migrated.
- Seven reports use persisted canonical business data: Summary, Stores Directory, Orders-YYYY-MM, Stock Counts-YYYY-MM, Cheques, Visits and Staff Scorecard. Orders/stock counts use the selected AD month; the other tabs cover the current workspace. Missing values remain blank; numeric zero is retained. Staff counts are actual records, with no fabricated performance percentage.
- Export clears each target tab before a RAW batch write, including empty datasets, so removed rows do not remain visible. Text beginning `=` stays text. Existing non-target tabs are retained. A failed write after clearing may leave a tab empty until retry; exports are report copies, and Supabase records remain authoritative.
- Do not share the report workbook publicly: the export includes workspace customer/store/staff data and is restricted to Super Admin in the app. Drive-native sharing is managed separately by the Google owner.

No live Google consent, remote file creation/upload, or end-to-end export is performed by the code checks. An administrator must supply their own Google Cloud OAuth client and complete consent after deployment.
