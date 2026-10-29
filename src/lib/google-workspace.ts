import { google } from 'googleapis';
import { supabaseAdmin } from './db/supabase-server';
import { getAuthSessionSecret } from './auth-session';
import { decryptGoogleToken, encryptGoogleToken } from './google-workspace-security';

const CONNECTION_KEY = 'google_workspace_connection_v1';
const EXPORT_KEY = 'google_workspace_export_v1';
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export interface GoogleConnection {
  encryptedRefreshToken: string;
  connectedBy: string;
  connectedAt: string;
  email: string;
  displayName: string;
  folderId: string;
  spreadsheetId: string;
  lastExport?: { exportedAt: string; totalRows: number; tabsUpdated: string[]; spreadsheetUrl: string };
}

export function googleOAuthConfiguration() {
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] as const;
  const missing: string[] = required.filter((name) => !process.env[name]);
  if (!getAuthSessionSecret()) missing.push('AUTH_SESSION_SECRET (at least 32 bytes)');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('Supabase server configuration');
  let redirectUri: string | null = null;
  try {
    const url = new URL(process.env.GOOGLE_REDIRECT_URI || '');
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.pathname !== '/api/integrations/google/callback' || url.search || url.hash || url.username || url.password) throw new Error();
    redirectUri = url.href;
  } catch { if (process.env.GOOGLE_REDIRECT_URI) missing.push('Valid GOOGLE_REDIRECT_URI ending /api/integrations/google/callback'); }
  return { ready: missing.length === 0 && !!redirectUri, missing, redirectUri };
}

export function createGoogleOAuthClient() {
  const config = googleOAuthConfiguration();
  if (!config.ready) throw new Error('Google OAuth setup is incomplete.');
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, config.redirectUri!);
}

export async function readGoogleConnection(): Promise<GoogleConnection | null> {
  const { data, error } = await supabaseAdmin.from('system_settings').select('value').eq('key', CONNECTION_KEY).maybeSingle();
  if (error) throw new Error('Google connection storage is unavailable.');
  return data?.value as GoogleConnection | null;
}

export async function saveGoogleConnection(connection: GoogleConnection): Promise<void> {
  const { error } = await supabaseAdmin.from('system_settings').upsert({ key: CONNECTION_KEY, value: connection, updated_at: new Date().toISOString() });
  if (error) throw new Error('Google connection could not be saved.');
}

export async function removeGoogleConnection(): Promise<void> {
  const { error } = await supabaseAdmin.from('system_settings').delete().eq('key', CONNECTION_KEY);
  if (error) throw new Error('Google connection could not be removed.');
}

export async function connectGoogleAccount(code: string, connectedBy: string) {
  const auth = createGoogleOAuthClient();
  const { tokens } = await auth.getToken(code);
  // A fresh consent is required so an unrelated account's previous refresh token is never reused.
  if (!tokens.refresh_token) throw new Error('Google did not provide offline access. Connect again and grant consent.');
  auth.setCredentials(tokens);
  const drive = google.drive({ version: 'v3', auth });
  const identity = await drive.about.get({ fields: 'user(emailAddress,displayName)' });
  const connection: GoogleConnection = {
    encryptedRefreshToken: encryptGoogleToken(tokens.refresh_token, getAuthSessionSecret()!),
    connectedBy, connectedAt: new Date().toISOString(),
    email: identity.data.user?.emailAddress || '', displayName: identity.data.user?.displayName || '',
    folderId: '', spreadsheetId: '',
  };
  // Save the recoverable connection before provisioning; a transient Google failure does not discard consent.
  await saveGoogleConnection(connection);
  return provisionGoogleResources(connection);
}

export async function provisionGoogleResources(connection: GoogleConnection) {
  const auth = createGoogleOAuthClient();
  auth.setCredentials({ refresh_token: decryptGoogleToken(connection.encryptedRefreshToken, getAuthSessionSecret()!) });
  const drive = google.drive({ version: 'v3', auth });
  if (!connection.folderId) {
    const folder = await drive.files.create({ requestBody: { name: 'BB Analytics', mimeType: 'application/vnd.google-apps.folder', appProperties: { app: 'bb-analytics' } }, fields: 'id', supportsAllDrives: true });
    if (!folder.data.id) throw new Error('Google folder could not be created.');
    connection = { ...connection, folderId: folder.data.id };
    await saveGoogleConnection(connection);
  }
  if (!connection.spreadsheetId) {
    const workbook = await drive.files.create({ requestBody: { name: 'BB Analytics Reports', mimeType: 'application/vnd.google-apps.spreadsheet', parents: [connection.folderId], appProperties: { app: 'bb-analytics' } }, fields: 'id', supportsAllDrives: true });
    if (!workbook.data.id) throw new Error('Google report workbook could not be created.');
    connection = { ...connection, spreadsheetId: workbook.data.id };
    await saveGoogleConnection(connection);
  }
  return connection;
}

export async function getGoogleWorkspace() {
  const connection = await readGoogleConnection();
  if (connection?.encryptedRefreshToken) {
    const auth = createGoogleOAuthClient();
    auth.setCredentials({ refresh_token: decryptGoogleToken(connection.encryptedRefreshToken, getAuthSessionSecret()!) });
    return { auth, connection, folderId: connection.folderId, spreadsheetId: connection.spreadsheetId, mode: 'oauth' as const };
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) throw new Error('Connect Google in Settings → Google Workspace.');
  const auth = new google.auth.JWT({ email, key: privateKey.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'] });
  return { auth, connection: null, folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '', spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '', mode: 'service-account' as const };
}

export async function saveGoogleExportMetadata(metadata: NonNullable<GoogleConnection['lastExport']>) {
  const { error } = await supabaseAdmin.from('system_settings').upsert({ key: EXPORT_KEY, value: metadata, updated_at: new Date().toISOString() });
  if (error) throw new Error('Export metadata could not be saved.');
}

export async function getGoogleStatus() {
  const config = googleOAuthConfiguration();
  const connection = await readGoogleConnection();
  const { data: lastExport, error: exportError } = await supabaseAdmin.from('system_settings').select('value').eq('key', EXPORT_KEY).maybeSingle();
  if (exportError) throw new Error('Google export metadata is unavailable.');
  const fallback = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  const configured = connection ? config.ready : fallback;
  const spreadsheetId = connection?.spreadsheetId || (fallback ? process.env.GOOGLE_SHEETS_SPREADSHEET_ID : '');
  const folderId = connection?.folderId || (fallback ? process.env.GOOGLE_DRIVE_FOLDER_ID : '');
  return {
    oauthReady: config.ready, missing: config.missing, redirectUri: config.redirectUri,
    connected: !!connection, mode: connection ? 'oauth' : fallback ? 'service-account' : null,
    driveReady: !!folderId && configured, sheetsReady: !!spreadsheetId && configured,
    identity: connection ? { email: connection.email, displayName: connection.displayName, connectedAt: connection.connectedAt } : null,
    spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit` : null,
    lastExport: lastExport?.value || null, schedule: 'manual',
  };
}

/** Never log Google error objects: they can contain Authorization headers and OAuth secrets. */
export function logGoogleFailure(operation: string, error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  console.error(`Google ${operation} failed`, status ? { status } : { status: 'unavailable' });
}
