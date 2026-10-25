import test from 'node:test';
import assert from 'node:assert/strict';

// Test 1: Nepali Calendar & Conversion Engine
import {
  adToBs,
  bsToAd,
  formatDualDate,
  formatBsDateOnly,
  getTodayBs,
  getTodayAd,
  matchesDateCriteria,
  NEPALI_MONTHS,
} from '../src/lib/nepali-calendar.ts';

test('Nepali Calendar - accurately converts reference anchor date', () => {
  // Reference: 2081 Baisakh 1 = 2024 April 13
  const bs = adToBs('2024-04-13');
  assert.equal(bs.year, 2081);
  assert.equal(bs.month, 1);
  assert.equal(bs.day, 1);
  assert.equal(bs.monthName, 'Baisakh');
  assert.equal(bs.formatted, 'Baisakh 1, 2081');
});

test('Nepali Calendar - round-trip conversion bsToAd -> adToBs', () => {
  const adDate = bsToAd(2083, 5, 24);
  const bsAgain = adToBs(adDate);

  assert.equal(bsAgain.year, 2083);
  assert.equal(bsAgain.month, 5);
  assert.equal(bsAgain.day, 24);
  assert.equal(bsAgain.monthName, 'Bhadra');
});

test('Nepali Calendar - dynamic today formatters return non-empty valid strings', () => {
  const todayBs = getTodayBs();
  const todayAd = getTodayAd();

  assert.ok(todayBs.length > 5, 'todayBs must be non-empty');
  assert.match(todayAd, /^\d{4}-\d{2}-\d{2}$/, 'todayAd must match YYYY-MM-DD');
});

test('Nepali Calendar - matchesDateCriteria date filtering', () => {
  const adStr = '2026-09-08';
  const bsStr = 'Bhadra 23, 2083';

  // No filter -> true
  assert.equal(matchesDateCriteria(adStr, bsStr, {}), true);

  // Exact date match
  assert.equal(matchesDateCriteria(adStr, bsStr, { dateExact: '2026-09-08' }), true);
  assert.equal(matchesDateCriteria(adStr, bsStr, { dateExact: '2026-09-09' }), false);

  // Month filter
  assert.equal(matchesDateCriteria(adStr, bsStr, { month: 'Bhadra' }), true);
  assert.equal(matchesDateCriteria(adStr, bsStr, { month: 'Shrawan' }), false);
});

// Test 2: RFC CSV & TSV Parser
import { parseCSV, generateCSV } from '../src/lib/csv.ts';

test('CSV Parser - handles standard comma-separated data', () => {
  const csv = `Order Number,Customer Name,Total NPR\nBB-101,Aayush Shrestha,2400\nBB-102,Binod Karki,1850`;
  const result = parseCSV(csv);

  assert.equal(result.headers.length, 3);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0]['Customer Name'], 'Aayush Shrestha');
  assert.equal(result.rows[1]['Total NPR'], '1850');
});

test('CSV Parser - handles quoted cells with commas, newlines and escaped quotes', () => {
  const csv = `"Order ID","Delivery Address","Notes"\n"ORD-1","House #4, Ring Road, Kathmandu","Special instructions: ""Call before arrival"""\n"ORD-2","Lakeside,\nPokhara","Standard"`;
  const result = parseCSV(csv);

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0]['Delivery Address'], 'House #4, Ring Road, Kathmandu');
  assert.equal(result.rows[0]['Notes'], 'Special instructions: "Call before arrival"');
  assert.equal(result.rows[1]['Delivery Address'], 'Lakeside,\nPokhara');
});

test('CSV Parser - handles tab-separated TSV files automatically', () => {
  const tsv = `SKU\tProduct Name\tPrice\nFORYA-01\tForya Hair Serum\t1200\nPEE-02\tPee Safe Spray\t650`;
  const result = parseCSV(tsv);

  assert.equal(result.headers.length, 3);
  assert.equal(result.rows[0]['Product Name'], 'Forya Hair Serum');
  assert.equal(result.rows[1]['Price'], '650');
});

test('CSV Generator - escapes special characters properly', () => {
  const cols = [
    { key: 'name', label: 'Full Name' },
    { key: 'city', label: 'Location' },
  ];
  const data = [
    { name: 'Devansh, Agarwal', city: 'Kathmandu' },
    { name: 'Sita "Lead" Gurung', city: 'Pokhara' },
  ];
  const generated = generateCSV(cols, data);

  assert.ok(generated.includes('"Devansh, Agarwal"'));
  assert.ok(generated.includes('"Sita ""Lead"" Gurung"'));
});

// Test 3: Phone Number Normalization & Validation
import { normalizePhoneNumber } from '../src/lib/auth.ts';
import { hashPassword, verifyPassword } from '../src/lib/password-utils.ts';
import { validateNepaliPhone } from '../src/lib/validation.ts';

test('Phone normalization - cleans +977 prefix and dashes', () => {
  assert.equal(normalizePhoneNumber('+977-9801234567'), '9801234567');
  assert.equal(normalizePhoneNumber('977 9841 234 567'), '9841234567');
  assert.equal(normalizePhoneNumber('09841234567'), '9841234567');
  assert.equal(normalizePhoneNumber('9801234567'), '9801234567');
});

test('Nepali phone validation - recognizes valid mobile prefixes', () => {
  assert.equal(validateNepaliPhone('9801234567'), null, 'Valid number returns null error');
  assert.equal(validateNepaliPhone('9841234567'), null, 'Valid NTC number returns null error');
  assert.equal(validateNepaliPhone('9851122334'), null, 'Valid post-paid returns null error');
  assert.equal(validateNepaliPhone('9741234567'), null, 'Valid 974 returns null error');
  assert.ok(validateNepaliPhone('98123') !== null, 'Too short number returns error');
  assert.ok(validateNepaliPhone('1234567890') !== null, 'Invalid prefix returns error');
});

test('Password verification - accepts bcrypt hashes and rejects default or plain-text passwords', async () => {
  const passwordHash = await hashPassword('SecretPass123');
  assert.equal(await verifyPassword('SecretPass123', passwordHash), true);
  assert.equal(await verifyPassword('WrongPass', passwordHash), false);
  assert.equal(await verifyPassword('BrandBucket@2083', 'any_stored_hash'), false);
  assert.equal(await verifyPassword('SecretPass123', 'SecretPass123'), false);
});

// Test 4: Role-Based Redirect Resolution
import { getRedirectPathForUser } from '../src/lib/auth.ts';

test('Role Redirects - routes each role to optimal landing page', () => {
  const superAdmin = {
    id: 'user_devansh',
    role: 'SUPER_ADMIN',
    isSuperAdmin: true,
    permissions: {},
  };
  assert.equal(getRedirectPathForUser(superAdmin), '/dashboard');

  const salesOfficer = {
    id: 'user_rohan',
    role: 'SALES_OFFICER',
    isSuperAdmin: false,
    permissions: { beat_plans: { access: 'FULL', scope: 'OWN', actions: ['VIEW'] } },
  };
  assert.equal(getRedirectPathForUser(salesOfficer), '/offline-sales/beat-plan');

  const opsManager = {
    id: 'user_ops',
    role: 'ADMIN',
    isSuperAdmin: false,
    permissions: { dashboard: { access: 'FULL', scope: 'ALL', actions: ['VIEW'] } },
  };
  assert.equal(getRedirectPathForUser(opsManager), '/dashboard');

  const tasksOnly = {
    id: 'user_limited',
    role: 'CUSTOM',
    customPermissions: { tasks: { access: 'FULL', scope: 'OWN', actions: ['VIEW'] } },
  };
  assert.equal(getRedirectPathForUser(tasksOnly), '/opscore/tasks');
});

// Test 5: WhatsApp Extractor Pattern Separation
import { splitMessageBlocks, splitRawChatIntoBlocks } from '../src/lib/whatsapp-extractor.ts';

test('WhatsApp Extractor - splits messages by separator lines', () => {
  const chat = `Name: Sita Gurung\nPhone: 9841234567\nAddress: Thamel\n---\nName: Anjali\nPhone: 9801234567\nAddress: Patan`;
  const blocks = splitRawChatIntoBlocks(chat);
  assert.equal(blocks.length, 2);
  assert.ok(blocks[0].includes('Sita Gurung'));
  assert.ok(blocks[1].includes('Anjali'));
});
