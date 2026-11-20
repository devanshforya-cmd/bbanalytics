import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { driveFileId, isInlineFile, photoCells, photoLink } from '../src/lib/photo-links.ts';
import { fitWithin, PHOTO_MAX_SIDE, OFFLINE_TARGET_BYTES, PHOTO_TARGET_BYTES, QUALITY_STEPS } from '../src/lib/file-upload.ts';
import { buildWorkbook } from '../src/lib/export/xlsx.ts';
import { DATASETS } from '../src/lib/export/datasets.ts';
import { canReadDriveFile, DRIVE_FEATURES, DRIVE_PHOTO_FOLDERS, driveUploadFeature } from '../src/lib/google-workspace-security.ts';
import { PHOTO_FEATURE_BY_COLLECTION, replaceInlineFiles } from '../src/lib/drive-photos.ts';
import { validateWorkspaceMutation } from '../src/lib/db/server-workspace.ts';

const DRIVE_ID = '1AbCdEfGhIjKlMnOpQrStUv';
const tinyJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

test('photo links open in Drive, and photos still on the phone say so', () => {
  assert.equal(driveFileId(`/api/drive/files/${DRIVE_ID}`), DRIVE_ID);
  assert.equal(driveFileId(`https://bbanalytics-three.vercel.app/api/drive/files/${DRIVE_ID}?download=1`), DRIVE_ID);
  assert.equal(photoLink(`/api/drive/files/${DRIVE_ID}`), `https://drive.google.com/file/d/${DRIVE_ID}/view`);
  assert.equal(photoLink(tinyJpeg), 'Waiting to upload');
  assert.equal(photoLink('/sample/shelf-1.svg'), 'https://bbanalytics-three.vercel.app/sample/shelf-1.svg');
  assert.equal(photoLink(''), '');
  assert.equal(photoLink('javascript:alert(1)'), '');
  assert.ok(isInlineFile('data:application/pdf;base64,JVBERi0='));
  assert.deepEqual(photoCells([`/api/drive/files/${DRIVE_ID}`, ''], 3), [`https://drive.google.com/file/d/${DRIVE_ID}/view`, '', '']);
});

test('the compressor fits photos inside 1600 px and keeps their shape', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: PHOTO_MAX_SIDE, height: 1200 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: PHOTO_MAX_SIDE });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.ok(PHOTO_TARGET_BYTES <= 500 * 1024 && OFFLINE_TARGET_BYTES < PHOTO_TARGET_BYTES);
  assert.deepEqual([...QUALITY_STEPS].sort((a, b) => b - a), QUALITY_STEPS);
});

test('photo cells in Excel are clickable links', () => {
  const book = buildWorkbook([{ name: 'Visits', columns: [{ header: 'Store' }, { header: 'Check-in photo', type: 'link' }], rows: [['Bhatbhateni', `https://drive.google.com/file/d/${DRIVE_ID}/view`], ['Salesberry', 'Waiting to upload']] }]);
  const xml = strFromU8(unzipSync(book)['xl/worksheets/sheet1.xml']);
  assert.match(xml, /<f>HYPERLINK\(&quot;https:\/\/drive\.google\.com\/file\/d\/1AbCdEfGhIjKlMnOpQrStUv\/view&quot;,&quot;Open&quot;\)<\/f><v>Open<\/v>/);
  assert.match(xml, /Waiting to upload/);
  const styles = strFromU8(unzipSync(book)['xl/styles.xml']);
  assert.match(styles, /<cellXfs count="7">/);
});

test('every sheet with photos has photo link columns, including a Shelf photos sheet', () => {
  const photoColumns = (key: string) => DATASETS.find((d) => d.key === key)!;
  const empty = { brands: [], products: [], combos: [], orders: [], returns: [], feedback: [], deliveryFailures: [], customers: [], secondaryOrders: [], dispatches: [], stockCounts: [], visits: [], cheques: [], shelfPhotos: [], callLogs: [], documents: [], facingAudits: [], retailers: [], branches: [], distributors: [], tasks: [], influencers: [], marketingSends: [] } as any;
  const expected: Record<string, number> = { orders: 2, returns: 1, feedback: 6, store_orders: 2, dispatch_lines: 1, visits: 1, cheques: 1, calls: 1, documents: 8, shelf_photos: 12 };
  for (const [key, count] of Object.entries(expected)) {
    const sheet = photoColumns(key).build(empty, {});
    assert.equal(sheet.columns.filter((c) => c.type === 'link').length, count, key);
  }
  const shelf = photoColumns('shelf_photos').build({ ...empty, shelfPhotos: [{ id: 's1', officerId: 'u1', officerName: 'Ram', entityType: 'RETAILER', entityId: 'r1', storeName: 'Store A', beforePhotoUrls: [`/api/drive/files/${DRIVE_ID}`], afterPhotoUrls: [tinyJpeg], rackSection: 'Eye level', dateAd: '2026-11-20', dateBs: '', createdAt: '2026-11-20T08:00:00Z' }] }, {});
  assert.equal(shelf.rows[0][5], `https://drive.google.com/file/d/${DRIVE_ID}/view`);
  assert.equal(shelf.rows[0][11], 'Waiting to upload');
});

test('each kind of photo has a Drive folder and a list it comes from', () => {
  for (const feature of DRIVE_FEATURES) assert.ok(DRIVE_PHOTO_FOLDERS[feature], feature);
  for (const feature of Object.values(PHOTO_FEATURE_BY_COLLECTION)) assert.ok((DRIVE_FEATURES as readonly string[]).includes(feature));
  const migration = readFileSync('supabase/migrations/20261120170000_inline_photo_scan.sql', 'utf8');
  for (const collection of Object.keys(PHOTO_FEATURE_BY_COLLECTION)) assert.match(migration, new RegExp(`'${collection}'`));
});

test('a rider can add shelf and cheque photos from the beat plan, and see their own', () => {
  const rider = { id: 'u1', role: 'SALES_OFFICER', custom_permissions: { beat_plans: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] } } } as any;
  assert.equal(driveUploadFeature(rider, 'shelf_photos'), 'beat_plans');
  assert.equal(driveUploadFeature(rider, 'cheque_tracker'), 'beat_plans');
  assert.equal(driveUploadFeature(rider, 'reviews'), null);
  assert.equal(canReadDriveFile(rider, { app: 'bb-analytics', feature: 'shelf_photos', uploaderId: 'u1' }), true);
  assert.equal(canReadDriveFile(rider, { app: 'bb-analytics', feature: 'shelf_photos', uploaderId: 'u2' }), false);
  const desk = { id: 'u3', role: 'OFFICE_STAFF', custom_permissions: { order_desk: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] } } } as any;
  assert.equal(driveUploadFeature(desk, 'reviews'), 'order_desk');
  assert.equal(canReadDriveFile(desk, { app: 'bb-analytics', feature: 'reviews', uploaderId: 'u9' }), true);
});

test('photos kept on a record are swapped for Drive links, nothing else changes', async () => {
  const record = { id: 'r1', storeName: 'A', beforePhotoUrls: [tinyJpeg, `/api/drive/files/${DRIVE_ID}`], nested: { proof: tinyJpeg }, note: 'data: not a photo' };
  let n = 0;
  const out = await replaceInlineFiles(record, async () => `/api/drive/files/NEWFILE00000${++n}`);
  assert.equal(out.changed, 2);
  assert.deepEqual(out.value, { id: 'r1', storeName: 'A', beforePhotoUrls: ['/api/drive/files/NEWFILE000001', `/api/drive/files/${DRIVE_ID}`], nested: { proof: '/api/drive/files/NEWFILE000002' }, note: 'data: not a photo' });
  const failed = await replaceInlineFiles(record, async () => null);
  assert.equal(failed.changed, 0);
});

test('a record may carry photos taken offline, but its other data keeps the 512 KB limit', () => {
  const photo = `data:image/jpeg;base64,${'A'.repeat(150 * 1024)}`;
  const base = { collection: 'shelfPhotos', id: 's1', operation: 'upsert', mutationId: 'mutation_1', expectedVersion: 0 };
  assert.doesNotThrow(() => validateWorkspaceMutation({ ...base, data: { id: 's1', beforePhotoUrls: [photo, photo, photo, photo, photo] } }));
  assert.throws(() => validateWorkspaceMutation({ ...base, data: { id: 's1', notes: 'x'.repeat(600 * 1024) } }), /too large/);
  assert.throws(() => validateWorkspaceMutation({ ...base, data: { id: 's1', beforePhotoUrls: Array(25).fill(photo) } }), /too large/);
});

test('every photo input in the app goes through the shared photo saver', () => {
  for (const file of ['src/app/offline-sales/beat-plan/page.tsx', 'src/app/offline-sales/beat-plan/components/CheckInFlow.tsx', 'src/app/offline-sales/beat-plan/components/InlineOrderForm.tsx', 'src/app/reviews/feedback/page.tsx', 'src/app/reviews/returns/components/LogReturnForm.tsx', 'src/app/offline-sales/shelf-photos/page.tsx']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /readAsDataURL/, file);
  }
  assert.match(readFileSync('src/app/reviews/feedback/page.tsx', 'utf8'), /folder="reviews"/);
});
