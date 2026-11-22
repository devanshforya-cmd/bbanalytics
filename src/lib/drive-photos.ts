/**
 * Photos in Google Drive: the folder each kind is filed in, and the hourly job that moves
 * photos taken with no signal (kept on the record as image data) into Drive.
 */
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { auth as googleAuth, drive as googleDrive, type drive_v3 } from '@googleapis/drive';
import { supabaseAdmin } from './db/supabase-server';
import { logGoogleFailure } from './google-workspace';
import { DRIVE_PHOTO_FOLDERS, DRIVE_UPLOAD_LIMIT, type DriveFeature } from './google-workspace-security';
import { isInlineFile } from './photo-links';

const FOLDERS_KEY = 'drive_photo_folders_v1';
type FolderCache = { rootId?: string; photosId?: string; byFeature?: Partial<Record<DriveFeature, string>> };

/** Which kind of photo a record's pictures are, by the list it is in. */
export const PHOTO_FEATURE_BY_COLLECTION: Record<string, DriveFeature> = {
  beatItems: 'beat_plans', visits: 'beat_plans', secondaryOrders: 'beat_plans', facingAudits: 'beat_plans',
  shelfPhotos: 'shelf_photos', cheques: 'cheque_tracker', documents: 'document_handover', dispatches: 'dispatches',
  callLogs: 'call_tracker', returns: 'reviews', feedbackEntries: 'reviews', orders: 'orderflow',
};

async function readCache(): Promise<FolderCache> {
  const { data } = await supabaseAdmin.from('system_settings').select('value').eq('key', FOLDERS_KEY).maybeSingle();
  return (data?.value as FolderCache) || {};
}
async function saveCache(cache: FolderCache) {
  await supabaseAdmin.from('system_settings').upsert({ key: FOLDERS_KEY, value: cache, updated_at: new Date().toISOString() });
}

async function stillThere(drive: drive_v3.Drive, id?: string) {
  if (!id) return false;
  try { const found = await drive.files.get({ fileId: id, fields: 'id,trashed', supportsAllDrives: true }); return !!found.data.id && !found.data.trashed; }
  catch { return false; }
}

async function makeFolder(drive: drive_v3.Drive, name: string, parent: string, kind: string) {
  const made = await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parent], appProperties: { app: 'bb-analytics', kind } }, fields: 'id', supportsAllDrives: true });
  if (!made.data.id) throw new Error(`Drive folder ${name} could not be created.`);
  return made.data.id;
}

/** BB Analytics → Photos → <kind>, made on first use and remembered. */
export async function photoFolder(drive: drive_v3.Drive, rootId: string, feature: DriveFeature, verify = false): Promise<string> {
  let cache = await readCache();
  if (cache.rootId !== rootId) cache = { rootId, byFeature: {} };
  const known = cache.byFeature?.[feature];
  if (known && cache.photosId && (!verify || await stillThere(drive, known))) return known;
  if (!cache.photosId || !(await stillThere(drive, cache.photosId))) { cache.photosId = await makeFolder(drive, 'Photos', rootId, 'photos'); cache.byFeature = {}; }
  const id = await makeFolder(drive, DRIVE_PHOTO_FOLDERS[feature], cache.photosId, `photos:${feature}`);
  cache.byFeature = { ...(cache.byFeature || {}), [feature]: id };
  await saveCache(cache);
  return id;
}

/** Forget remembered folders, after Drive said a parent folder is gone. */
export async function forgetPhotoFolders() { await saveCache({}); }

/** Save one file to the photo folder, retrying once in a fresh folder if the old one was deleted. */
export async function savePhotoToDrive(drive: drive_v3.Drive, rootId: string, feature: DriveFeature, file: { name: string; mimeType: string; bytes: Buffer; uploaderId: string }) {
  const create = async (parent: string) => drive.files.create({
    requestBody: { name: file.name, parents: [parent], appProperties: { app: 'bb-analytics', feature, uploaderId: file.uploaderId } },
    media: { mimeType: file.mimeType, body: Readable.from(file.bytes) }, fields: 'id,name', supportsAllDrives: true,
  });
  try { return await create(await photoFolder(drive, rootId, feature)); }
  catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined;
    if (status !== 404) throw error;
    await forgetPhotoFolders();
    return create(await photoFolder(drive, rootId, feature, true));
  }
}

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** Every inline photo in a record, replaced by what `swap` returns for it. */
export async function replaceInlineFiles(value: unknown, swap: (dataUrl: string) => Promise<string | null>): Promise<{ value: unknown; changed: number }> {
  let changed = 0;
  const walk = async (node: unknown): Promise<unknown> => {
    if (typeof node === 'string') {
      if (!isInlineFile(node)) return node;
      const next = await swap(node);
      if (next) { changed += 1; return next; }
      return node;
    }
    if (Array.isArray(node)) { const out = []; for (const item of node) out.push(await walk(item)); return out; }
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(node)) out[key] = await walk(item);
      return out;
    }
    return node;
  };
  return { value: await walk(value), changed };
}

export interface PhotoMoveResult { records: number; photos: number; failed: number }

/**
 * Move photos still kept on records into Drive. Skips records changed in the last ten minutes,
 * so a phone that is still editing one is not surprised by a newer version.
 */
export async function moveInlinePhotosToDrive(auth: InstanceType<typeof googleAuth.OAuth2> | InstanceType<typeof googleAuth.JWT>, rootId: string, limit = 40): Promise<PhotoMoveResult> {
  const result: PhotoMoveResult = { records: 0, photos: 0, failed: 0 };
  const { data, error } = await supabaseAdmin.rpc('records_with_inline_files', { max_rows: limit });
  if (error) { logGoogleFailure('inline photo scan', error); return result; }
  const drive = googleDrive({ version: 'v3', auth });
  for (const row of (data || []) as { collection: string; id: string; data: unknown; version: number; created_by: string | null }[]) {
    const feature = PHOTO_FEATURE_BY_COLLECTION[row.collection];
    if (!feature) continue;
    let index = 0;
    const replaced = await replaceInlineFiles(row.data, async (dataUrl) => {
      index += 1;
      try {
        const [, mimeType, base64] = dataUrl.match(/^data:([^;]+);base64,([\s\S]*)$/) || [];
        const bytes = Buffer.from(base64 || '', 'base64');
        if (!mimeType || !bytes.length || bytes.length > DRIVE_UPLOAD_LIMIT) { result.failed += 1; return null; }
        const saved = await savePhotoToDrive(drive, rootId, feature, { name: `${row.collection}_${row.id}_${index}.${EXTENSION[mimeType.toLowerCase()] || 'bin'}`.replace(/[^\w.-]/g, '_').slice(-180), mimeType, bytes, uploaderId: row.created_by || 'system' });
        if (!saved.data.id) { result.failed += 1; return null; }
        result.photos += 1;
        return `/api/drive/files/${encodeURIComponent(saved.data.id)}`;
      } catch (cause) { logGoogleFailure('inline photo move', cause); result.failed += 1; return null; }
    });
    if (!replaced.changed) continue;
    const mutationId = `photo_move_${createHash('sha256').update(`${row.collection}:${row.id}:${row.version}`).digest('hex').slice(0, 40)}`;
    const { error: updateError } = await supabaseAdmin.from('workspace_records')
      .update({ data: replaced.value, version: row.version + 1, last_mutation_id: mutationId, updated_at: new Date().toISOString() })
      .eq('collection', row.collection).eq('id', row.id).eq('version', row.version);
    // If the record changed meanwhile, the photos stay in Drive unused and the next run tries again.
    if (!updateError) result.records += 1;
  }
  return result;
}
