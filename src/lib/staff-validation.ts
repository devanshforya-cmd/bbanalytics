import { ALL_FEATURE_KEYS } from './permissions';
import { normalizePhoneNumber } from './auth-utils';

export function staffPatch(body: Record<string, any>, creating: boolean): Record<string, any> {
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (creating || body.fullName !== undefined) {
    const name = String(body.fullName || '').trim();
    if (!name || name.length > 160) throw new Error('A staff name of 1–160 characters is required.');
    patch.full_name = name; patch.name = name;
  }
  if (creating || body.email !== undefined) {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('A valid email address is required.');
    patch.email = email;
  }
  if (creating || body.phone !== undefined) {
    const phone = normalizePhoneNumber(String(body.phone || ''));
    if (!/^9[78]\d{8}$/.test(phone)) throw new Error('Enter a valid Nepal mobile number.');
    patch.phone = phone;
  }
  if (body.password !== undefined && body.password !== '') {
    if (typeof body.password !== 'string' || Buffer.byteLength(body.password) < 16 || Buffer.byteLength(body.password) > 72) throw new Error('Passwords must contain 16–72 bytes.');
  } else if (creating) throw new Error('A password is required for a new staff account.');
  if (creating || body.role !== undefined) {
    const role = body.role || 'SALES_OFFICER';
    if (!['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'SALES_OFFICER', 'DATA_ENTRY', 'VIEWER', 'OFFICE_STAFF'].includes(role)) throw new Error('Choose a valid staff role.');
    patch.role = role; patch.is_super_admin = role === 'SUPER_ADMIN';
  }
  if (creating || body.active !== undefined) {
    if (body.active !== undefined && typeof body.active !== 'boolean') throw new Error('Active must be true or false.');
    patch.is_active = body.active !== false;
    patch.deactivated_at = patch.is_active ? null : new Date().toISOString();
  }
  if (creating || body.assignedBrands !== undefined) {
    const brands = body.assignedBrands ?? ['ALL'];
    if (!Array.isArray(brands) || brands.some((code) => typeof code !== 'string' || code.length > 64)) throw new Error('Assigned brands must be a list of brand codes.');
    patch.assigned_brands = [...new Set(brands.map((code: string) => code.trim().toUpperCase()).filter(Boolean))];
  }
  if (body.territory !== undefined) { patch.territory = String(body.territory).slice(0, 200); patch.assigned_territory = patch.territory; }
  if (body.reportsToId !== undefined) {
    if (body.reportsToId !== null && (typeof body.reportsToId !== 'string' || (body.reportsToId && !/^[A-Za-z0-9_-]{1,180}$/.test(body.reportsToId)))) throw new Error('Choose a valid manager.');
    patch.reports_to_id = body.reportsToId || null;
  }
  if (body.calendarPreference !== undefined) {
    if (!['BS', 'AD', 'BOTH'].includes(body.calendarPreference)) throw new Error('Choose a valid calendar preference.');
    patch.calendar_preference = body.calendarPreference;
  }
  if (body.permissions !== undefined) {
    if (!body.permissions || typeof body.permissions !== 'object' || Array.isArray(body.permissions)) throw new Error('Invalid permissions.');
    patch.permissions = body.permissions;
  }
  if (body.customPermissions !== undefined) {
    if (!body.customPermissions || typeof body.customPermissions !== 'object' || Array.isArray(body.customPermissions)) throw new Error('Invalid feature permissions.');
    for (const [feature, value] of Object.entries(body.customPermissions) as [string, any][]) {
      if (!(ALL_FEATURE_KEYS as string[]).includes(feature) || !value || !['HIDDEN', 'VIEW_ONLY', 'VIEW_EDIT', 'FULL'].includes(value.access)
        || (value.scope !== null && !['OWN', 'TEAM', 'ALL'].includes(value.scope)) || !Array.isArray(value.actions)
        || value.actions.some((action: string) => !['VIEW', 'CREATE', 'EDIT', 'DELETE'].includes(action))) throw new Error(`Invalid permission for ${feature}.`);
    }
    patch.custom_permissions = body.customPermissions;
  }
  return patch;
}
