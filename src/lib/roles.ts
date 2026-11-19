/**
 * Roles and per-person access.
 *
 * A role is a named set of page permissions and sensitive-detail switches. A person gets one
 * role and, optionally, one-off changes on top. What is stored on the person is the resolved
 * result, so every check on the server and in the browser reads one place:
 *
 *   { _v: 2, _role: { id, name }, _overrides: {...}, "p.orders_all": {...}, "s.money": {...}, "order_desk": {...} }
 *
 * Anything not listed is denied.
 */
import { PAGES, SENSITIVE, isPageKey, isSensitiveKey, pageDefinition, type PageKey, type SensitiveKey } from './access-catalog';
import type { ActionPermission, DataScope, FeatureAccess, FeaturePermission, UserCustomPermissions } from './permissions';

export const ACCESS_VERSION = 2;
export type AccessMap = Record<string, FeaturePermission>;

export interface StaffRole {
  id: string;
  name: string;
  description?: string;
  color?: string;
  /** Page and sensitive keys only. Missing means no access. */
  permissions: AccessMap;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface ResolvedAccess {
  _v: typeof ACCESS_VERSION;
  _role: { id: string; name: string } | null;
  _overrides: AccessMap;
  [key: string]: unknown;
}

export const ROLE_COLORS = ['#1470b0', '#188038', '#a15500', '#8e3fb8', '#d70015', '#5b5b60', '#0e7490', '#9a3412'];

const OFF: FeaturePermission = { access: 'HIDDEN', scope: null, actions: [] };
const ORDER: ActionPermission[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE'];
const SCOPE_RANK: Record<DataScope, number> = { OWN: 0, TEAM: 1, ALL: 2 };

export function accessFor(actions: ActionPermission[]): FeatureAccess {
  if (!actions.includes('VIEW')) return 'HIDDEN';
  if (actions.includes('DELETE') || (actions.includes('CREATE') && actions.includes('EDIT'))) return 'FULL';
  if (actions.length > 1) return 'VIEW_EDIT';
  return 'VIEW_ONLY';
}

/** Keep a page permission within what the page offers. Any action implies View. */
export function normalizePagePermission(key: PageKey, value: Partial<FeaturePermission> | undefined | null): FeaturePermission {
  const def = pageDefinition(key);
  if (!def || !value || value.access === 'HIDDEN') return OFF;
  const wanted = new Set((Array.isArray(value.actions) ? value.actions : []).filter((action) => def.actions.includes(action)));
  if (value.access === 'VIEW_ONLY' && !wanted.size) wanted.add('VIEW');
  if (wanted.size) wanted.add('VIEW');
  const actions = ORDER.filter((action) => wanted.has(action));
  if (!actions.length) return OFF;
  const scope = def.scoped ? (value.scope && value.scope in SCOPE_RANK ? value.scope : 'ALL') : null;
  return { access: accessFor(actions), scope, actions };
}

export function normalizeSensitive(value: Partial<FeaturePermission> | undefined | null): FeaturePermission {
  return value && value.access && value.access !== 'HIDDEN' ? { access: 'VIEW_ONLY', scope: null, actions: ['VIEW'] } : OFF;
}

/** Clean a role's or a person's map: known keys only, each within its page's limits. */
export function normalizeAccessMap(map: Record<string, any> | undefined | null): AccessMap {
  const result: AccessMap = {};
  for (const [key, value] of Object.entries(map || {})) {
    if (isPageKey(key)) result[key] = normalizePagePermission(key, value);
    else if (isSensitiveKey(key)) result[key] = normalizeSensitive(value);
  }
  return result;
}

export function isOn(value: FeaturePermission | undefined): boolean {
  return !!value && value.access !== 'HIDDEN' && value.actions.includes('VIEW');
}

function same(a: FeaturePermission | undefined, b: FeaturePermission | undefined): boolean {
  const left = a && isOn(a) ? a : OFF; const right = b && isOn(b) ? b : OFF;
  return left.access === right.access && (left.scope || null) === (right.scope || null) && left.actions.join() === right.actions.join();
}

/** Changes a person has on top of their role. */
export function diffAccess(role: AccessMap, person: AccessMap): AccessMap {
  const result: AccessMap = {};
  for (const key of [...PAGES.map((p) => p.key), ...SENSITIVE.map((s) => s.key)]) {
    if (!same(role[key], person[key])) result[key] = person[key] && isOn(person[key]) ? person[key] : OFF;
  }
  return result;
}

/** Sensitive details a page needs when someone can add or change things on it. */
export function requiredSensitive(map: AccessMap): SensitiveKey[] {
  const needed = new Set<SensitiveKey>();
  for (const def of PAGES) {
    const value = map[def.key];
    if (!def.needs || !isOn(value)) continue;
    if (value.actions.some((action) => action !== 'VIEW')) def.needs.forEach((key) => needed.add(key));
  }
  return [...needed];
}

/** The final map stored on a person. */
export function resolveAccess(rolePermissions: AccessMap, overrides: AccessMap, role: { id: string; name: string } | null): ResolvedAccess {
  const merged = normalizeAccessMap({ ...rolePermissions, ...overrides });
  for (const key of requiredSensitive(merged)) merged[key] = normalizeSensitive({ access: 'VIEW_ONLY' });
  const result: ResolvedAccess = { _v: ACCESS_VERSION, _role: role, _overrides: normalizeAccessMap(overrides) };
  for (const def of PAGES) result[def.key] = merged[def.key] && isOn(merged[def.key]) ? merged[def.key] : OFF;
  for (const sensitive of SENSITIVE) result[sensitive.key] = merged[sensitive.key] && isOn(merged[sensitive.key]) ? merged[sensitive.key] : OFF;

  // Older feature keys: granted when any of their pages is, at the widest level.
  const features = new Map<string, FeaturePermission>();
  for (const def of PAGES) {
    const value = result[def.key] as FeaturePermission;
    if (!isOn(value)) continue;
    const prior = features.get(def.feature);
    const actions = ORDER.filter((action) => value.actions.includes(action) || !!prior?.actions.includes(action));
    const scopes = [prior?.scope, value.scope ?? 'ALL'].filter(Boolean) as DataScope[];
    const scope = scopes.sort((a, b) => SCOPE_RANK[b] - SCOPE_RANK[a])[0] || 'ALL';
    features.set(def.feature, { access: accessFor(actions), scope, actions });
  }
  for (const def of PAGES) if (!features.has(def.feature)) features.set(def.feature, OFF);
  for (const [feature, value] of features) result[feature] = value;
  return result;
}

export function isResolvedAccess(value: unknown): value is ResolvedAccess {
  return !!value && typeof value === 'object' && (value as any)._v === ACCESS_VERSION;
}

/** Page and sensitive entries of a resolved map, for the editor. */
export function pagesOf(resolved: Record<string, any> | undefined | null): AccessMap {
  const result: AccessMap = {};
  for (const [key, value] of Object.entries(resolved || {})) if ((isPageKey(key) || isSensitiveKey(key)) && value && typeof value === 'object') result[key] = value as FeaturePermission;
  return normalizeAccessMap(result);
}

/** Turn an older feature map (or template) into pages: each page takes its feature's setting. */
export function pagesFromFeatures(features: UserCustomPermissions | Record<string, any>, sensitive: SensitiveKey[] = []): AccessMap {
  const result: AccessMap = {};
  for (const def of PAGES) {
    const source = features[def.feature];
    if (!source || source.access === 'HIDDEN') continue;
    const actions: ActionPermission[] = source.access === 'VIEW_ONLY' ? ['VIEW'] : (Array.isArray(source.actions) && source.actions.length ? source.actions : ['VIEW']);
    result[def.key] = normalizePagePermission(def.key, { access: source.access, scope: source.scope, actions });
  }
  for (const key of sensitive) result[key] = normalizeSensitive({ access: 'VIEW_ONLY' });
  return result;
}

export function newRoleId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `role_${random}`;
}

/** Plain-words summary for a role card: "12 pages · Money · Customer details". */
export function summarizeAccess(map: AccessMap): { pages: number; sensitive: string[] } {
  return {
    pages: PAGES.filter((def) => isOn(map[def.key])).length,
    sensitive: SENSITIVE.filter((entry) => isOn(map[entry.key])).map((entry) => entry.label),
  };
}

/** The role name to show for a person: "Super Admin", their role, or "Staff". */
export function roleLabel(user: { isSuperAdmin?: boolean; is_super_admin?: boolean; role?: string; customPermissions?: any } | null | undefined): string {
  if (!user) return 'Staff';
  if (user.isSuperAdmin || user.is_super_admin || user.role === 'SUPER_ADMIN') return 'Super Admin';
  const stored = user.customPermissions;
  if (isResolvedAccess(stored)) return stored._role?.name || 'Custom access';
  return user.role ? user.role.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : 'Staff';
}
