import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleState, verifyGoogleState, encryptGoogleToken, decryptGoogleToken, canReadDriveFile, detectGoogleUploadType, GOOGLE_STATE_TTL_SECONDS, isSameOriginGoogleMutation } from '../src/lib/google-workspace-security.ts';
import { buildGoogleReportTabs, googleReportValueRequest, nepalReportMonth, quoteGoogleTab, writeGoogleReportTabs, type GoogleReportDatabase, type GoogleReportSheetsClient } from '../src/lib/google-workspace-reports.ts';
import { verifySessionToken } from '../src/lib/auth-session.ts';

const secret = 'test-google-secret-at-least-32-bytes-long';

test('Google refresh tokens are authenticated, randomly encrypted, and purpose-separated from session signatures', () => {
  const token = 'private-refresh-token';
  const encrypted = encryptGoogleToken(token, secret);
  assert.equal(decryptGoogleToken(encrypted, secret), token);
  assert.ok(!encrypted.includes(token));
  assert.notEqual(encrypted, encryptGoogleToken(token, secret));
  assert.throws(() => decryptGoogleToken(encrypted, `${secret}-changed`));
  const pieces = encrypted.split('.');
  pieces[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decryptGoogleToken(pieces.join('.'), secret));
  assert.throws(() => encryptGoogleToken(token, 'short'));
});

test('OAuth state binds nonce, authenticated administrator, signature and ten minute lifetime', () => {
  const now = 1_800_000_000_000;
  const { state, cookie } = createGoogleState('admin-1', secret, now);
  assert.equal(verifySessionToken(cookie, secret, now), null);
  assert.equal(verifyGoogleState(cookie, state, 'admin-1', secret, now + 1), true);
  assert.equal(verifyGoogleState(cookie, state, 'other-admin', secret, now), false);
  assert.equal(verifyGoogleState(cookie, 'wrong-state', 'admin-1', secret, now), false);
  assert.equal(verifyGoogleState(`${cookie}tampered`, state, 'admin-1', secret, now), false);
  assert.equal(verifyGoogleState(cookie, state, 'admin-1', secret, now + GOOGLE_STATE_TTL_SECONDS * 1000), false);
  assert.equal(verifyGoogleState(cookie, state, 'admin-1', `${secret}-changed`, now), false);
  assert.equal(isSameOriginGoogleMutation(new Request('https://bb.test/api/drive/upload', { headers: { origin: 'https://attacker.test' } })), false);
  assert.equal(isSameOriginGoogleMutation(new Request('https://bb.test/api/drive/upload', { headers: { origin: 'https://bb.test' } })), true);
});

test('Drive reads require app ownership, supported feature and owner/team data scope', () => {
  const permissions = { shelf_photos: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE'] } };
  const user = { id: 'staff-1', customPermissions: permissions };
  const properties = { app: 'bb-analytics', feature: 'shelf_photos', uploaderId: 'staff-1' };
  assert.equal(canReadDriveFile(user, properties), true);
  assert.equal(canReadDriveFile(user, { ...properties, uploaderId: 'staff-2' }), false);
  assert.equal(canReadDriveFile(user, { ...properties, app: 'another-app' }), false);
  assert.equal(canReadDriveFile(user, undefined), false);
  assert.equal(canReadDriveFile({ ...user, customPermissions: { shelf_photos: { ...permissions.shelf_photos, scope: 'TEAM' } } }, { ...properties, uploaderId: 'staff-2' }, ['staff-2']), true);
  assert.equal(canReadDriveFile({ ...user, customPermissions: { shelf_photos: { ...permissions.shelf_photos, scope: 'TEAM' } } }, { ...properties, uploaderId: 'staff-3' }, ['staff-2']), false);
  assert.equal(canReadDriveFile({ id: 'admin', isSuperAdmin: true }, { ...properties, uploaderId: '' }), false);
  assert.equal(canReadDriveFile({ ...user, customPermissions: { shelf_photos: { access: 'HIDDEN', scope: 'ALL', actions: [] } } }, properties), false);
  assert.equal(detectGoogleUploadType(Buffer.from('ffd8ff0000', 'hex'), 'photo.jpg'), 'image/jpeg');
  assert.equal(detectGoogleUploadType(Buffer.from('<script>alert(1)</script>'), 'photo.jpg'), null);
  assert.equal(detectGoogleUploadType(Buffer.from('%PDF-1.4'), 'photo.exe'), null);
});

test('seven report tabs use real rows, zero quantities, blank unknowns, monthly boundaries and RAW formula-safe input', () => {
  const db = {
    getFilteredStores: () => [{ id: 'store-1', name: '=IMPORTXML("https://evil.test")', entityType: 'RETAILER', brandsStocked: [], assignedOfficerId: 'staff-1' }],
    getOrders: () => [
      { id: 'oct-order', orderDateAd: '2026-10-26', customerName: '=1+1', totalAmount: 0, items: [{ productName: 'Example', quantity: 0 }] },
      { id: 'old-order', orderDateAd: '2026-09-30', totalAmount: 123, items: [] },
    ],
    getUsers: () => [{ id: 'staff-1', fullName: 'Actual Staff' }],
    getCheques: () => [], getVisits: () => [], getStockCounts: () => [],
  } as unknown as GoogleReportDatabase;
  const tabs = buildGoogleReportTabs(db, '2026-10', new Date('2026-10-26T00:00:00Z'));
  assert.equal(tabs.length, 7);
  const orders = tabs.find((tab) => tab.title === 'Orders-2026-10')!;
  assert.equal(orders.values.length, 2);
  assert.equal(orders.values[1][6], 0);
  assert.equal(orders.values[1][8], 0);
  assert.equal(orders.values[1][9], '');
  assert.equal(tabs.find((tab) => tab.title === 'Stores Directory')!.values[1][7], '');
  const request = googleReportValueRequest(tabs);
  assert.equal(request.valueInputOption, 'RAW');
  assert.equal(request.data[1].range, "'Stores Directory'!A1");
  assert.equal(request.data[1].values[1][1], '=IMPORTXML("https://evil.test")');
  assert.equal(JSON.stringify(tabs).includes('92%'), false);
  assert.equal(quoteGoogleTab("Owner's Data"), "'Owner''s Data'");
  assert.equal(nepalReportMonth(new Date('2026-09-30T19:00:00Z')), '2026-10');
  assert.throws(() => buildGoogleReportTabs(db, 'invalid'));
});

test('report write clears entire target tabs before writing so smaller exports remove stale rows', async () => {
  const calls: string[] = [];
  const tabs = [{ title: "Owner's Data", values: [['Heading'], ['=1+1']] }];
  const client: GoogleReportSheetsClient = { spreadsheets: {
    get: async () => { calls.push('get'); return { data: { spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/actual/edit', sheets: [] } }; },
    batchUpdate: async () => { calls.push('create'); },
    values: {
      batchClear: async ({ requestBody }) => { calls.push('clear'); assert.deepEqual(requestBody.ranges, ["'Owner''s Data'"]); },
      batchUpdate: async ({ requestBody }) => { calls.push('write'); assert.equal(requestBody.valueInputOption, 'RAW'); assert.equal(requestBody.data[0].values[1][0], '=1+1'); },
    },
  } };
  assert.equal(await writeGoogleReportTabs(client, 'actual', tabs), 'https://docs.google.com/spreadsheets/d/actual/edit');
  assert.deepEqual(calls, ['get', 'create', 'clear', 'write']);
});
