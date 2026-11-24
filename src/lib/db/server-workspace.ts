import { normalizeSubBrands } from '../sub-brands';
import { hidesAnything, redactRecord, restoreRedacted } from '../sensitive-data';
import { isOtherReason, REASON_DETAIL_MAX } from '../failure-reason';
import { STORE_COLLECTIONS, storeDeletionPlan } from '../store-deletion';
import { readWorkspaceResetState } from './workspace-reset-server';
import { createHash, randomUUID } from 'node:crypto';
import { validateAlertRules } from '../alert-rules';
import { CALL_PURPOSES, outcomeInfo, validateFollowUpPlan } from '../follow-ups';
import { cleanPrefs, cleanTemplates } from '../metrics/dashboards';
import { defaultOrderOptions, validateOrderOptions, requiredOrderOptionActions, assertActiveOrderOption } from '../order-options';
import { DatabaseService } from './db-service';
import { supabaseAdmin } from './supabase-server';
import { canManageSales, canPerform, getAssignedBrandCodes, getScope, hasAccess, isSuperAdmin } from '../permissions';
import { validateCampaign } from '../offers';
import type { Dispatch, Order } from '../types';
import type { Brand, User, SharedAccessLink } from '../types';
import { WORKSPACE_COLLECTIONS, isWorkspaceCollection, isLookupCollection, type WorkspaceMutation, type WorkspaceSnapshot, type WorkspaceVersions, type WorkspaceRecord } from './workspace-types';
import { RESERVED_PREFIXES, brandPrefix, isShortDocumentId, isPendingDocumentId, validateBrandPrefix } from '../document-ids';
import { nextDocumentId, documentIdTaken } from './document-counter';
import { canMoveTo, dispatchFromOrder, dispatchStatus, orderStatusFor, statusLabel, type StoreRef } from '../dispatch-flow';
import { notifyEvent } from '../notify-server';
import { editNeedsReason, historyEntries } from '../order-history';
import { isFullPhone, phoneDigits } from '../customer-lookup';
import { sameName } from '../marketing';
import { canReadWorkspaceRecord, canWriteWorkspaceRecord, recordBrandCodes, teamMemberIds, type StoredWorkspaceRecord } from './workspace-policy';

export class WorkspaceError extends Error {
  constructor(public status: number, message: string, public currentVersion?: number) { super(message); }
}

const USER_COLUMNS = 'id,full_name,name,email,phone,role,is_super_admin,duty_status,is_active,assigned_brands,territory,assigned_territory,reports_to_id,permissions,custom_permissions,calendar_preference';

export function mapStoredUser(row: Record<string, any>): User {
  return {
    id: row.id, fullName: row.full_name || row.name || 'Staff User', email: row.email || '', phone: row.phone || '',
    role: row.role, isSuperAdmin: row.is_super_admin === true || row.role === 'SUPER_ADMIN', active: row.is_active !== false,
    dutyStatus: row.duty_status || 'OFFLINE', assignedBrands: row.assigned_brands || [],
    territory: row.territory || row.assigned_territory, reportsToId: row.reports_to_id,
    permissions: row.permissions || {}, customPermissions: row.custom_permissions || {}, calendarPreference: row.calendar_preference || 'BS',
  };
}

export async function readStoredUsers(): Promise<User[]> {
  const result: User[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from('users').select(USER_COLUMNS).order('id').range(offset, offset + 999);
    if (error) throw new WorkspaceError(503, 'Staff records could not be loaded.');
    result.push(...(data || []).map(mapStoredUser));
    if (!data || data.length < 1000) return result;
  }
}

async function readBrands(): Promise<Brand[]> {
  const { data, error } = await supabaseAdmin.from('brands').select('*').order('code');
  if (error) throw new WorkspaceError(503, 'Brands could not be loaded.');
  return (data || []).map((r) => ({ id: r.id, code: r.code, name: r.name, description: r.description || '', color: r.color || '#2563eb',
    category: r.category, principalCompany: r.principal_company, logoUrl: r.logo_url, isActive: r.is_active !== false,
    status: r.is_active === false ? 'ARCHIVED' : 'ACTIVE', subBrands: normalizeSubBrands(r.code || '', r.sub_brands) }));
}

async function readRecords(): Promise<StoredWorkspaceRecord[]> {
  const result: StoredWorkspaceRecord[] = [];
  const linkMetrics = new Map<string, Record<string, any>>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from('workspace_records').select('collection,id,data,created_by,version,last_mutation_id')
      .order('collection').order('id').range(offset, offset + 999);
    if (error) throw new WorkspaceError(503, 'Workspace storage is unavailable. Apply the recovery database migration and verify the server credentials.');
    for (const row of data || []) {
      if (isWorkspaceCollection(row.collection)) result.push(row as StoredWorkspaceRecord);
      else if (row.collection === 'sharedLinkAccess') linkMetrics.set(row.id, row.data);
    }
    if (!data || data.length < 1000) return result.map((row) => row.collection === 'sharedAccessLinks' ? { ...row, data: { ...row.data, accessCount: linkMetrics.get(row.id)?.accessCount || 0, lastAccessedAt: linkMetrics.get(row.id)?.lastAccessedAt } } : row);
  }
}

export interface WorkspaceContext { users: User[]; brands: Brand[]; records: StoredWorkspaceRecord[] }
export async function readWorkspaceContext(): Promise<WorkspaceContext> {
  const [users, brands, records] = await Promise.all([readStoredUsers(), readBrands(), readRecords()]);
  return { users, brands, records };
}

/** Only IDs are sent for cache invalidation; historical snapshots stay server-only. */
export async function readDeletedProductIds(user: User): Promise<string[]> {
  if (!['products', 'beat_plans', 'orderflow', 'order_desk', 'dispatches'].some(feature => hasAccess(user, feature))) return [];
  const assigned = getAssignedBrandCodes(user);
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from('workspace_records').select('id,data').eq('collection', 'deletedProducts').order('id').range(offset, offset + 999);
    if (error) throw new WorkspaceError(503, 'Product deletion status could not be refreshed.');
    for (const row of data || []) if (assigned.includes('ALL') || assigned.includes(String(row.data.brandCode || '').toUpperCase())) ids.push(row.id);
    if (!data || data.length < 1000) return ids;
  }
}

export async function readDeletedStoreIds(user: User): Promise<string[]> {
  if (!hasAccess(user, 'stores') && !hasAccess(user, 'distributors') && !hasAccess(user, 'beat_plans')) return [];
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from('workspace_records').select('id').eq('collection', 'deletedStores').order('id').range(offset, offset + 999);
    if (error) throw new WorkspaceError(503, 'Store deletion status is unavailable.');
    ids.push(...(data || []).map(row => row.id));
    if (!data || data.length < 1000) return ids;
  }
}

export async function readSharedAccessLink(token: string): Promise<SharedAccessLink> {
  const { data, error } = await supabaseAdmin.from('workspace_records').select('data,created_by').eq('collection', 'sharedAccessLinks').eq('data->>token', token).maybeSingle();
  if (error) throw new WorkspaceError(503, 'Shared access is temporarily unavailable.');
  if (!data) throw new WorkspaceError(404, 'Access link not found or revoked.');
  const owner = await supabaseAdmin.from('users').select('id').eq('id', data.created_by).eq('is_active', true).maybeSingle();
  if (owner.error) throw new WorkspaceError(503, 'Shared access is temporarily unavailable.');
  if (!owner.data) throw new WorkspaceError(404, 'Access link not found or revoked.');
  return data.data as SharedAccessLink;
}

export async function recordSharedAccess(id: string) {
  const { error } = await supabaseAdmin.rpc('record_shared_access', { p_link_id: id });
  if (error) console.error('[Workspace] Shared access metrics could not be saved:', error.code);
}

async function readMutationContext(mutation: WorkspaceMutation, prior: StoredWorkspaceRecord | null): Promise<WorkspaceContext> {
  const data: Record<string, any> = mutation.data || prior?.data || {};
  const storeIds = [data.storeId, data.entityId, data.distributorId, data.branchId].filter((id): id is string => typeof id === 'string' && !!id);
  const productIds: string[] = Array.isArray(data.items) ? [...new Set<string>(data.items.map((item: any) => item?.productId).filter((id: unknown): id is string => typeof id === 'string'))] : [];
  const related = async (collections: string[], ids: string[]) => {
    if (!ids.length) return [];
    const { data, error } = await supabaseAdmin.from('workspace_records').select('collection,id,data,created_by,version,last_mutation_id').in('collection', collections).in('id', ids);
    if (error) throw new WorkspaceError(503, 'Related workspace records could not be verified.');
    return (data || []) as StoredWorkspaceRecord[];
  };
  const [users, brands, stores, products] = await Promise.all([readStoredUsers(), readBrands(),
    related(['retailers', 'branches', 'distributors'], storeIds), related(['products', 'combos'], productIds)]);
  const config = ['orders', 'deliveryFailures'].includes(mutation.collection) ? await related(['workspaceConfig'], ['workspace']) : [];
  const influencer = ['marketingSends', 'influencerContent'].includes(mutation.collection) && typeof data.influencerId === 'string' ? await related(['influencers'], [data.influencerId]) : [];
  const send = mutation.collection === 'influencerContent' && typeof data.sendId === 'string' && data.sendId ? await related(['marketingSends'], [data.sendId]) : [];
  const calledOrder = mutation.collection === 'customerCalls' && typeof data.orderId === 'string' && data.orderId ? await related(['orders'], [data.orderId]) : [];
  const exchangeReturn = mutation.collection === 'orders' && typeof data.exchangeReturnId === 'string' && data.exchangeReturnId ? await related(['returns'], [data.exchangeReturnId]) : [];
  let lookups: StoredWorkspaceRecord[] = [];
  if (isLookupCollection(mutation.collection)) {
    // Lists are small; the whole list is needed to keep names unique and to protect names in use.
    const collections = mutation.collection === 'influencerNiches' ? ['influencerNiches', 'influencers'] : [mutation.collection];
    const list = await supabaseAdmin.from('workspace_records').select('collection,id,data,created_by,version,last_mutation_id').in('collection', collections).limit(5000);
    if (list.error) throw new WorkspaceError(503, 'The list could not be verified.');
    lookups = (list.data || []) as StoredWorkspaceRecord[];
  }
  const componentIds = products.filter(row => row.collection === 'combos').flatMap(row => (row.data.items || []).map((item: any) => item.productId)).filter((id: unknown): id is string => typeof id === 'string');
  const components = await related(['products'], componentIds);
  return { users, brands, records: [...(prior ? [prior] : []), ...stores, ...products, ...components, ...config, ...influencer, ...send, ...calledOrder, ...exchangeReturn, ...lookups.filter(row => !(prior && row.collection === prior.collection && row.id === prior.id))] };
}

export function visibleWorkspace(user: User, context: WorkspaceContext) {
  const snapshot: WorkspaceSnapshot = {};
  const versions: WorkspaceVersions = {};
  for (const collection of WORKSPACE_COLLECTIONS) { snapshot[collection] = []; versions[collection] = {}; }
  for (const row of context.records) {
    if (canReadWorkspaceRecord(user, row, context.users, context.records)) {
      snapshot[row.collection]!.push({ ...row.data, createdById: row.created_by }); versions[row.collection]![row.id] = row.version;
    }
  }
  const team = teamMemberIds(user, context.users);
  const rosterFeatures = ['settings', 'staff_scorecards', 'tasks', 'gps_tracking', 'beat_plans', 'orderflow'].filter((feature) => hasAccess(user, feature));
  const allRoster = isSuperAdmin(user) || rosterFeatures.some((feature) => getScope(user, feature) === 'ALL');
  const teamRoster = rosterFeatures.some((feature) => getScope(user, feature) === 'TEAM');
  const users = context.users.filter((entry) => entry.id === user.id || allRoster || teamRoster && team.has(entry.id));
  const safeUsers = hasAccess(user, 'settings') ? users : users.map((entry) => entry.id === user.id ? entry : ({
    id: entry.id, fullName: entry.fullName, role: entry.role, active: entry.active, dutyStatus: entry.dutyStatus,
    reportsToId: entry.reportsToId, email: '', phone: '', assignedBrands: [],
    orderflowAssignable: entry.active !== false && hasAccess(entry, 'orderflow'),
    orderflowBrands: getAssignedBrandCodes(entry).includes('ALL') ? getAssignedBrandCodes(user) : getAssignedBrandCodes(entry).filter(code => getAssignedBrandCodes(user).includes('ALL') || getAssignedBrandCodes(user).includes(code)),
  }));
  const assigned = getAssignedBrandCodes(user);
  const mayReadBrands = ['settings', 'products', 'beat_plans', 'stores', 'distributors', 'dispatches', 'cheque_tracker', 'orderflow', 'order_desk', 'reviews', 'marketing', 'dashboard', 'export'].some((feature) => hasAccess(user, feature));
  const brands = mayReadBrands ? context.brands.filter((brand) => assigned.includes('ALL') || assigned.includes(brand.code.toUpperCase())) : [];
  // What leaves the server has money, customer and influencer details removed when the role lacks them.
  const outgoing: WorkspaceSnapshot = {};
  for (const collection of WORKSPACE_COLLECTIONS) outgoing[collection] = hidesAnything(collection, user) ? snapshot[collection]!.map((row) => redactRecord(collection, row, user)) : snapshot[collection];
  return { data: { ...outgoing, users: safeUsers, brands }, snapshot, versions };
}

export function validateWorkspaceMutation(value: unknown): asserts value is WorkspaceMutation {
  if (!value || typeof value !== 'object') throw new WorkspaceError(400, 'A workspace mutation is required.');
  const m = value as WorkspaceMutation;
  if (!isWorkspaceCollection(m.collection) || !/^[A-Za-z0-9_:-]{1,180}$/.test(m.id || '') || !['upsert', 'delete'].includes(m.operation)
    || typeof m.mutationId !== 'string' || m.mutationId.length < 8 || m.mutationId.length > 180
    || !Number.isSafeInteger(m.expectedVersion) || m.expectedVersion < 0) throw new WorkspaceError(400, 'Invalid workspace mutation.');
  if (m.operation === 'upsert' && (!m.data || typeof m.data !== 'object' || Array.isArray(m.data) || m.data.id !== m.id)) throw new WorkspaceError(400, 'The record ID must match its mutation.');
  if (m.data) {
    // Photos taken with no signal ride on the record until the hourly job moves them to Drive,
    // so they get extra room; everything else keeps the 512 KB limit.
    const text = JSON.stringify(m.data);
    const withoutPhotos = text.replace(/"data:(?:image\/[a-z0-9.+-]+|application\/pdf);base64,[A-Za-z0-9+/=]*"/gi, '""');
    if (Buffer.byteLength(withoutPhotos) > 512 * 1024 || Buffer.byteLength(text) > 3 * 1024 * 1024) throw new WorkspaceError(413, 'This record is too large. Upload photos and documents to Drive first.');
  }
  if (m.data) {
    for (const field of ['brandCodes', 'brandsStocked', 'brandsAvailable', 'brandsCarried', 'brandsPurchased', 'items', 'contacts', 'history']) {
      if (m.data[field] !== undefined && !Array.isArray(m.data[field])) throw new WorkspaceError(400, `${field} must be a list.`);
    }
    for (const field of ['amount', 'totalAmount', 'totalValue', 'creditLimit', 'mrp', 'price', 'costPrice']) {
      if (m.data[field] !== undefined && (typeof m.data[field] !== 'number' || !Number.isFinite(m.data[field]) || m.data[field] < 0)) throw new WorkspaceError(400, `${field} must be a nonnegative number.`);
    }
  }
  if (m.collection === 'orders' && m.data && (!Array.isArray(m.data.items) || !m.data.items.length || !m.data.customerName || !m.data.customerPhone || !m.data.brandCode || !m.data.orderNumber)) throw new WorkspaceError(400, 'An order needs a customer, brand, order number, and line items.');
  if (m.collection === 'orders' && m.data?.items.some((item: any) => !item || typeof item !== 'object' || !item.productName || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) throw new WorkspaceError(400, 'Order line items need a product, positive quantity, and nonnegative price.');
  if (m.collection === 'tasks' && m.data && !String(m.data.title || '').trim()) throw new WorkspaceError(400, 'A task title is required.');
  if (m.collection === 'marketingSends' && m.data) {
    const d = m.data;
    // A send is never a sale: money and order fields are refused outright.
    const money = ['totalAmount', 'amount', 'paymentTerms', 'paymentStatus', 'price', 'unitPrice', 'totalPrice', 'statedPrice', 'discountPercent', 'orderType', 'orderNumber'];
    if (money.some(field => d[field] !== undefined) || (Array.isArray(d.items) && d.items.some((item: any) => item && money.some(field => item[field] !== undefined)))) throw new WorkspaceError(400, 'Marketing sends cannot carry price, payment or order fields.');
    if (typeof d.influencerId !== 'string' || !d.influencerId) throw new WorkspaceError(400, 'Open an influencer profile to create a send.');
    if (!Array.isArray(d.brandCodes) || !d.brandCodes.length || d.brandCodes.some((code: unknown) => typeof code !== 'string' || !code)) throw new WorkspaceError(400, 'Choose at least one brand.');
    if (!Array.isArray(d.items) || !d.items.length || d.items.length > 100 || d.items.some((item: any) => !item || typeof item.productId !== 'string' || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999)) throw new WorkspaceError(400, 'Add at least one product with a whole-number quantity.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.sentDateAd || '')) throw new WorkspaceError(400, 'A sent date is required.');
    if (d.expectedContentDateAd && (!/^\d{4}-\d{2}-\d{2}$/.test(d.expectedContentDateAd) || d.expectedContentDateAd < d.sentDateAd)) throw new WorkspaceError(400, 'The expected content date cannot be earlier than the sent date.');
    if (!String(d.reachOutPlatform || '').trim() || !String(d.deliveryChannel || '').trim()) throw new WorkspaceError(400, 'Choose the reach-out platform and delivery channel.');
    if (!['SENT', 'CONTENT_RECEIVED', 'CANCELLED'].includes(d.status)) throw new WorkspaceError(400, 'Invalid send status.');
  }
  if (m.collection === 'influencers' && m.data) {
    if (!String(m.data.name || '').trim()) throw new WorkspaceError(400, 'An influencer needs a name.');
    if (m.data.nicheIds !== undefined && (!Array.isArray(m.data.nicheIds) || m.data.nicheIds.length > 30 || m.data.nicheIds.some((id: unknown) => typeof id !== 'string'))) throw new WorkspaceError(400, 'Invalid niche categories.');
  }
  if (m.collection === 'influencerContent' && m.data) {
    const d = m.data;
    const links = Array.isArray(d.links) ? d.links : d.url ? [{ platform: d.platform, url: d.url }] : [];
    const http = (value: unknown) => { try { return ['http:', 'https:'].includes(new URL(String(value)).protocol); } catch { return false; } };
    if (!links.length || links.length > 20 || links.some((link: any) => !link || !String(link.platform || '').trim() || !http(link.url))) throw new WorkspaceError(400, 'Add at least one platform link with a valid web address.');
    if (d.driveUrl && !http(d.driveUrl)) throw new WorkspaceError(400, 'The backup link must be a valid web address.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.datePostedAd || '')) throw new WorkspaceError(400, 'The date posted is required.');
  }
  if (isLookupCollection(m.collection) && m.data) {
    const name = String(m.data.name || '').trim();
    if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) throw new WorkspaceError(400, 'Enter a name of at most 60 characters.');
    if (m.collection === 'marketingOptions' && !['REACH_OUT', 'CONTENT_PLATFORM'].includes(m.data.list)) throw new WorkspaceError(400, 'Invalid list.');
  }
  if (m.collection === 'userPreferences' && m.data && Object.keys(m.data).some(key => !['id', 'setupGuideDismissedAt', 'updatedAt', 'createdById', 'reportPresets', 'dashboards'].includes(key))) throw new WorkspaceError(400, 'Invalid preference.');
  if (m.collection === 'userPreferences' && m.data?.reportPresets !== undefined) {
    const presets = m.data.reportPresets;
    const plain = (value: unknown, max: number) => value === undefined || (typeof value === 'string' && value.length <= max);
    if (!Array.isArray(presets) || presets.length > 30 || JSON.stringify(presets).length > 30000
      || presets.some((preset: any) => !preset || typeof preset !== 'object' || typeof preset.id !== 'string' || typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 80
        || !Array.isArray(preset.datasets) || preset.datasets.length > 30 || preset.datasets.some((key: unknown) => typeof key !== 'string' || key.length > 40)
        || !plain(preset.range, 30) || !['fromAd', 'toAd', 'brandCode', 'subBrandId', 'storeId', 'officerId'].every((key) => plain(preset[key], 120))))
      throw new WorkspaceError(400, 'Invalid saved report.');
  }
  if (m.collection === 'workspaceConfig' && m.data?.brandPrefixes !== undefined) {
    const prefixes = m.data.brandPrefixes;
    if (!prefixes || typeof prefixes !== 'object' || Array.isArray(prefixes)) throw new WorkspaceError(400, 'Invalid order ID prefixes.');
    const seen = new Set<string>();
    for (const value of Object.values(prefixes)) {
      let prefix: string;
      try { prefix = validateBrandPrefix(value); } catch (error) { throw new WorkspaceError(400, error instanceof Error ? error.message : 'Invalid order ID prefix.'); }
      if (seen.has(prefix)) throw new WorkspaceError(400, `Two brands cannot share the order ID prefix ${prefix}.`);
      seen.add(prefix);
    }
  }
  if (['retailers', 'branches'].includes(m.collection) && m.data) {
    for (const field of ['city', 'area']) if (m.data[field] !== undefined && (typeof m.data[field] !== 'string' || m.data[field].length > 100 || /[\u0000-\u001f\u007f]/.test(m.data[field]))) throw new WorkspaceError(400, 'Store city and area must be text of at most 100 characters.');
  }
  if (m.collection === 'products' && m.data && (!m.data.name || !m.data.sku || !m.data.brandCode)) throw new WorkspaceError(400, 'Product name, SKU, and brand are required.');
  if (m.collection === 'sharedAccessLinks' && m.data && !/^bb_[A-Za-z0-9_-]{43,128}$/.test(m.data.token || '')) throw new WorkspaceError(400, 'Regenerate this legacy sharing link before saving it.');
  if (m.collection === 'workspaceConfig' && m.data?.orderOptions !== undefined) {
    try { validateOrderOptions(m.data.orderOptions); } catch (error) { throw new WorkspaceError(400, error instanceof Error ? error.message : 'Invalid channel options.'); }
  }
  if (m.collection === 'userPreferences' && m.data?.dashboards !== undefined) {
    try { m.data.dashboards = cleanPrefs(m.data.dashboards); } catch (error) { throw new WorkspaceError(400, error instanceof Error ? error.message : 'Invalid dashboards.'); }
  }
  if (m.collection === 'workspaceConfig' && m.data?.dashboardTemplates !== undefined) {
    try { m.data.dashboardTemplates = cleanTemplates(m.data.dashboardTemplates); } catch (error) { throw new WorkspaceError(400, error instanceof Error ? error.message : 'Invalid shared dashboards.'); }
  }
  if (m.collection === 'workspaceConfig' && m.data?.followUpPlan !== undefined) {
    try { m.data.followUpPlan = validateFollowUpPlan(m.data.followUpPlan); } catch (error) { throw new WorkspaceError(400, error instanceof Error ? error.message : 'Invalid follow-up settings.'); }
  }
  if (m.collection === 'customerCalls' && m.data) {
    const d = m.data;
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (!outcomeInfo(d.outcome)) throw new WorkspaceError(400, 'Choose how the call went.');
    if (!String(d.customerName || '').trim() && !String(d.customerPhone || '').trim()) throw new WorkspaceError(400, 'A call needs the customer’s name or phone number.');
    if (!(CALL_PURPOSES as readonly string[]).includes(d.purpose)) throw new WorkspaceError(400, 'Choose what the call was about.');
    if (!day.test(d.dateAd || '')) throw new WorkspaceError(400, 'A call needs a date.');
    if (d.outcome === 'CALL_BACK' && !day.test(d.callbackDateAd || '')) throw new WorkspaceError(400, 'Choose when to call back.');
    if (d.callbackDateAd !== undefined && (!day.test(d.callbackDateAd) || d.callbackDateAd < d.dateAd)) throw new WorkspaceError(400, 'The call-back date cannot be before the call.');
    if (d.durationMinutes !== undefined && (!Number.isFinite(d.durationMinutes) || d.durationMinutes < 0 || d.durationMinutes > 600)) throw new WorkspaceError(400, 'Call length must be 0 to 600 minutes.');
    for (const [field, max] of [['notes', 1000], ['customerName', 120], ['customerPhone', 30], ['followUpStepLabel', 60], ['followUpStepId', 40]] as const) {
      if (d[field] !== undefined && (typeof d[field] !== 'string' || d[field].length > max)) throw new WorkspaceError(400, 'A call detail is too long.');
    }
  }
  if (m.collection === 'workspaceConfig' && m.data?.alertRules !== undefined) {
    try { validateAlertRules(m.data.alertRules); } catch { throw new WorkspaceError(400, 'Enter valid alert thresholds.'); }
  }
}

/** Record an access change (role saved, person's access changed) in the Activity trail. */
export async function recordAccessChange(user: User, action: 'CREATE' | 'UPDATE' | 'DELETE', entityType: 'staffRoles' | 'users', entityId: string, details: Record<string, unknown>) {
  const id = `act_access_${randomUUID()}`;
  const { error } = await supabaseAdmin.from('workspace_records').insert({ collection: 'activityLogs', id, created_by: user.id,
    data: { id, userId: user.id, userName: user.fullName, userRole: user.role, action, entityType, entityId, details, createdAt: new Date().toISOString() },
    version: 1, last_mutation_id: id });
  if (error) console.error('[Access] Activity record could not be saved:', error.code);
}

async function appendAudit(user: User, mutation: WorkspaceMutation, created: boolean) {
  const id = `act_${mutation.mutationId}`;
  const { error } = await supabaseAdmin.from('workspace_records').upsert({ collection: 'activityLogs', id, created_by: user.id,
    data: { id, userId: user.id, userName: user.fullName, userRole: user.role, action: mutation.operation === 'delete' ? 'DELETE' : created ? 'CREATE' : 'UPDATE',
      entityType: mutation.collection, entityId: mutation.id, details: { collection: mutation.collection }, createdAt: new Date().toISOString() },
    version: 1, last_mutation_id: mutation.mutationId,
  }, { onConflict: 'collection,id', ignoreDuplicates: true });
  if (error) console.error('[Workspace] Audit record could not be saved:', error.code);
}

export function prepareRecordData(user: User, mutation: WorkspaceMutation, prior: StoredWorkspaceRecord | undefined | null, context: WorkspaceContext) {
  if (!mutation.data) return;
  // Someone who could not see a detail cannot change it: put the stored value back first.
  mutation.data = { ...restoreRedacted(mutation.collection, mutation.data, prior?.data, user), createdById: prior?.created_by || user.id };
  const data = mutation.data;
  if (mutation.collection === 'workspaceConfig' && prior?.data.orderOptions && data.orderOptions === undefined) throw new WorkspaceError(400, 'Keep the configured channel lists when saving workspace settings.');
  if (mutation.collection === 'workspaceConfig' && data.orderOptions !== undefined) {
    if (mutation.id !== 'workspace') throw new WorkspaceError(400, 'Channel options belong to workspace settings.');
    const before = prior?.data.orderOptions ? validateOrderOptions(prior.data.orderOptions) : defaultOrderOptions();
    const after = validateOrderOptions(data.orderOptions);
    if (requiredOrderOptionActions(before, after).some(action => !canPerform(user, 'p.settings_channels', action))) throw new WorkspaceError(403, 'Your access to Sales channels & delivery does not allow this change.');
    data.orderOptions = after;
  }
  if (mutation.collection === 'campaigns') {
    // One set of rules for the browser and the server; who created it and when never changes.
    if (!canManageSales(user)) throw new WorkspaceError(403, 'Managing sales and offers needs Settings or Marketing edit access.');
    try { mutation.data = { ...validateCampaign({ ...data, id: mutation.id }), id: mutation.id, createdById: data.createdById,
      createdAt: prior?.data.createdAt || data.createdAt || new Date().toISOString(), ...(prior?.data.createdBy || data.createdBy ? { createdBy: prior?.data.createdBy || data.createdBy } : {}),
      updatedAt: new Date().toISOString() }; }
    catch (error) { throw new WorkspaceError(400, error instanceof Error ? error.message : 'This sale could not be saved.'); }
    return;
  }
  if (mutation.collection === 'orders' || mutation.collection === 'deliveryFailures') {
    const configured = context.records.find(row => row.collection === 'workspaceConfig' && row.id === 'workspace')?.data.orderOptions;
    const options = configured ? validateOrderOptions(configured) : defaultOrderOptions();
    try {
      if (mutation.collection === 'orders') assertActiveOrderOption(options, 'channels', data.platform, prior?.data.platform);
      if (mutation.collection === 'orders' || data.deliveryMethod) assertActiveOrderOption(options, 'deliveryMethods', data.deliveryMethod, prior?.data.deliveryMethod);
    } catch (error) { throw new WorkspaceError(400, error instanceof Error ? error.message : 'Choose an active channel and delivery method.'); }
  }
  if (mutation.collection === 'deliveryFailures') {
    if (data.reasonDetail != null && (typeof data.reasonDetail !== 'string' || data.reasonDetail.length > REASON_DETAIL_MAX || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(data.reasonDetail))) throw new WorkspaceError(400, `Keep the written reason under ${REASON_DETAIL_MAX} characters.`);
    if (typeof data.reasonDetail === 'string') { data.reasonDetail = data.reasonDetail.trim(); if (!data.reasonDetail) delete data.reasonDetail; }
    // A new failure or attempt marked "Other" must say why. Older "Other" rows saved before this rule can still be updated.
    const newReason = !prior || prior.data.reason !== data.reason || (Number(data.attempts) || 1) > (Number(prior.data.attempts) || 1);
    if (newReason && isOtherReason(data.reason) && !data.reasonDetail) throw new WorkspaceError(400, 'Write the reason when Other is chosen.');
  }
  if (mutation.collection === 'orders' && prior && !isSuperAdmin(user) && !canPerform(user, 'orderflow', 'EDIT')) {
    // Order Desk staff move orders along (status and exchange links); the order's details stay as entered.
    const locked = EDITABLE_ORDER_FIELDS.filter(field => !ORDER_DESK_FIELDS.includes(field));
    const changed = locked.find(field => JSON.stringify(data[field] ?? null) !== JSON.stringify(prior.data[field] ?? null));
    if (changed) throw new WorkspaceError(403, 'The Order Desk can update delivery status and exchanges. Ask someone with OrderFlow edit access to change order details.');
  }
  if (mutation.collection === 'orders' && !prior && !isSuperAdmin(user) && !canPerform(user, 'orderflow', 'CREATE')) {
    // Order Desk staff create an order only as the replacement for a return that exists, for that return's customer.
    const ret = data.exchangeReturnId && context.records.find(row => row.collection === 'returns' && row.id === data.exchangeReturnId);
    if (!ret) throw new WorkspaceError(403, 'Only a replacement order for a logged return can be created from the Order Desk.');
    if (phoneDigits(String(ret.data.customerPhone || '')) !== phoneDigits(String(data.customerPhone || ''))) throw new WorkspaceError(400, 'The replacement order must be for the customer who returned the product.');
  }
  if (mutation.collection === 'orders') {
    for (const field of ['province', 'district']) {
      if (data[field] != null && (typeof data[field] !== 'string' || data[field].length > 200 || /[\u0000-\u001f\u007f]/.test(data[field]))) throw new WorkspaceError(400, `Invalid ${field}.`);
      if (typeof data[field] === 'string') data[field] = data[field].trim();
    }
    const previous = prior?.data.assignedToId || prior?.created_by;
    const assigneeId = data.assignedToId || previous || user.id;
    if (assigneeId !== (previous || user.id) && (!canPerform(user, 'orderflow', 'EDIT') || !(isSuperAdmin(user) || getScope(user, 'orderflow') === 'ALL' || getScope(user, 'orderflow') === 'TEAM' && teamMemberIds(user, context.users).has(assigneeId)))) throw new WorkspaceError(403, 'You cannot assign this order to that staff member.');
    const assignee = context.users.find(entry => entry.id === assigneeId);
    if (!assignee || ((!prior || assigneeId !== previous) && (assignee.active === false || !(hasAccess(assignee, 'orderflow') || hasAccess(assignee, 'order_desk')) || !getAssignedBrandCodes(assignee).some(code => code === 'ALL' || code === String(data.brandCode).toUpperCase())))) throw new WorkspaceError(400, 'Choose an active staff member with access to OrderFlow and this brand.');
    data.assignedToId = assignee.id;
    data.assignedToName = assignee.fullName;
  }
  if (mutation.collection === 'orders') {
    // `_edit` is a transient note from the edit form. It is read here and never stored.
    const edit = data._edit && typeof data._edit === 'object' ? data._edit as { token?: unknown; reason?: unknown; overwrote?: unknown } : null;
    delete data._edit;
    if (!prior) {
      // Marketing sends have their own collection and form. An order can never be one.
      if (data.isMarketing) throw new WorkspaceError(400, 'Marketing sends are created from the influencer profile, not as orders.');
      data.editHistory = [];
      delete data.lastEditToken; delete data.lastEditedById; delete data.lastEditedByName; delete data.lastEditedAt;
    } else {
      // The short ID and creation time never change, whatever a browser sends.
      data.orderNumber = prior.data.orderNumber;
      if (prior.data.legacyOrderNumber !== undefined) data.legacyOrderNumber = prior.data.legacyOrderNumber; else delete data.legacyOrderNumber;
      if (prior.data.createdAt) data.createdAt = prior.data.createdAt;
      if (!prior.data.isMarketing) delete data.isMarketing;
      const token = typeof edit?.token === 'string' && edit.token.length <= 80 ? edit.token : '';
      const fresh = !!token && token !== prior.data.lastEditToken;
      const reason = fresh && typeof edit?.reason === 'string' ? edit.reason.trim().slice(0, 300) : '';
      if (editNeedsReason(prior.data, data) && !reason) throw new WorkspaceError(400, 'Give a short reason when the phone number or the order date changes.');
      const overwrote = fresh && typeof edit?.overwrote === 'string' ? edit.overwrote : undefined;
      // History is rebuilt here from the stored record, so it cannot be edited or forged.
      const entries = historyEntries(prior.data, data, { id: user.id, name: user.fullName }, { reason, overwroteVersionBy: overwrote });
      data.editHistory = [...entries, ...(Array.isArray(prior.data.editHistory) ? prior.data.editHistory : [])].slice(0, 300);
      if (entries.length) { data.lastEditedById = user.id; data.lastEditedByName = user.fullName; data.lastEditedAt = entries[0].timestamp; }
      else { for (const key of ['lastEditedById', 'lastEditedByName', 'lastEditedAt']) { if (prior.data[key] !== undefined) data[key] = prior.data[key]; else delete data[key]; } }
      if (fresh) data.lastEditToken = token; else if (prior.data.lastEditToken !== undefined) data.lastEditToken = prior.data.lastEditToken; else delete data.lastEditToken;
    }
  }
  if (mutation.collection === 'marketingSends') {
    const influencer = context.records.find(row => row.collection === 'influencers' && row.id === data.influencerId);
    if (!influencer) throw new WorkspaceError(400, 'Create the influencer first, then send from their profile.');
    if (!prior && influencer.data.isActive === false) throw new WorkspaceError(400, 'This influencer is archived.');
    data.influencerName = influencer.data.name;
    const responsible = context.users.find(entry => entry.id === data.responsibleId);
    if (!responsible || ((!prior || prior.data.responsibleId !== data.responsibleId) && responsible.active === false)) throw new WorkspaceError(400, 'Choose an active staff member as the responsible person.');
    data.responsibleName = responsible.fullName;
    data.brandCodes = [...new Set((data.brandCodes as string[]).map(code => code.trim().toUpperCase()))];
    data.items = (data.items as any[]).map((item) => {
      const product = context.records.find(row => row.collection === 'products' && row.id === item.productId);
      const unchanged = prior?.data.items?.some((previous: any) => previous.productId === item.productId);
      if (!product && !unchanged) throw new WorkspaceError(400, 'Choose products from the saved catalogue.');
      if (product && !unchanged && product.data.active === false) throw new WorkspaceError(400, 'Choose active products from the saved catalogue.');
      const brandCode = String(product?.data.brandCode || item.brandCode || '').toUpperCase();
      if (!data.brandCodes.includes(brandCode)) throw new WorkspaceError(400, 'Every product must belong to one of the selected brands.');
      return { productId: item.productId, productName: product?.data.name || item.productName, brandCode, quantity: item.quantity };
    });
    if (prior) { data.sendNumber = prior.data.sendNumber; if (prior.data.createdAt) data.createdAt = prior.data.createdAt; }
  }
  if (isLookupCollection(mutation.collection)) {
    data.name = String(data.name).trim();
    const clash = context.records.find(row => row.collection === mutation.collection && row.id !== mutation.id && sameName(row.data.name, data.name)
      && (mutation.collection !== 'marketingOptions' || row.data.list === data.list));
    if (clash) throw new WorkspaceError(409, `"${clash.data.name}" already exists${clash.data.isArchived ? ' (archived). Restore it in Settings.' : '.'}`);
    data.isArchived = data.isArchived === true;
    if (!prior) { data.createdBy = user.fullName; data.createdAt = data.createdAt || new Date().toISOString(); }
  }
  if (mutation.collection === 'workspaceConfig' && JSON.stringify(data.followUpPlan) !== JSON.stringify(prior?.data.followUpPlan) && data.followUpPlan !== undefined
    && !canPerform(user, 'p.settings_follow_ups', prior?.data.followUpPlan ? 'EDIT' : 'CREATE') && !isSuperAdmin(user)) throw new WorkspaceError(403, 'Changing follow-up calls needs the Follow-up calls settings.');
  if (mutation.collection === 'workspaceConfig' && data.dashboardTemplates !== undefined && JSON.stringify(data.dashboardTemplates) !== JSON.stringify(prior?.data.dashboardTemplates ?? [])
    && !isSuperAdmin(user)) throw new WorkspaceError(403, 'Only Super Admins share dashboards with everyone.');
  if (mutation.collection === 'customerCalls') {
    // A call is logged by the person who made it; the order decides its number and brand.
    data.officerId = prior?.data.officerId || user.id;
    if (data.orderId) {
      const order = context.records.find((row) => row.collection === 'orders' && row.id === data.orderId);
      if (!order) throw new WorkspaceError(400, 'That order no longer exists.');
      data.orderNumber = order.data.orderNumber;
      data.brandCode = order.data.brandCode;
    }
  }
  if (mutation.collection === 'userPreferences' && mutation.id !== user.id) throw new WorkspaceError(403, 'Preferences belong to the signed-in account.');
  if (mutation.collection === 'workspaceConfig' && mutation.id === 'workspace' && prior) {
    // A browser running an older build must not drop settings it does not know about.
    if (data.brandPrefixes === undefined && prior.data.brandPrefixes !== undefined) data.brandPrefixes = prior.data.brandPrefixes;
    if (data.followUpPlan === undefined && prior.data.followUpPlan !== undefined) data.followUpPlan = prior.data.followUpPlan;
    if (data.dashboardTemplates === undefined && prior.data.dashboardTemplates !== undefined) data.dashboardTemplates = prior.data.dashboardTemplates;
  }
  if (mutation.collection === 'orders' && typeof data.orderNumber === 'string') data.orderNumber = data.orderNumber.trim().toUpperCase();
  if (mutation.collection === 'orders' && !prior && !data.orderTime) {
    // Orders entered on the day they come in get the time they were entered, so "when orders come in" can be charted.
    const nepal = new Date(Date.now() + (5 * 60 + 45) * 60000).toISOString();
    if (data.orderDateAd === nepal.slice(0, 10)) data.orderTime = nepal.slice(11, 16);
  }
  if (mutation.collection === 'feedbackEntries' && data.rating !== undefined && data.rating !== null) {
    if (![1, 2, 3, 4, 5].includes(Number(data.rating))) throw new WorkspaceError(400, 'A rating must be from 1 to 5 stars.');
    data.rating = Number(data.rating);
  } else if (mutation.collection === 'feedbackEntries') delete data.rating;
  if (mutation.collection === 'products') {
    if (data.alias !== undefined) { data.alias = String(data.alias || '').trim().replace(/\s+/g, ' ').slice(0, 60); if (!data.alias) delete data.alias; }
    if (data.barcode !== undefined) { data.barcode = String(data.barcode || '').replace(/\s+/g, '').slice(0, 32); if (!data.barcode) delete data.barcode; }
    if (data.subBrandId) {
      const brand = context.brands.find((entry) => entry.code.toUpperCase() === String(data.brandCode || '').toUpperCase());
      const sub = brand?.subBrands?.find((entry) => entry.id === data.subBrandId);
      if (!sub) throw new WorkspaceError(400, 'Choose a sub-brand of this product’s brand.');
      if (!sub.isActive && prior?.data.subBrandId !== data.subBrandId) throw new WorkspaceError(400, 'That sub-brand is archived. Choose an active one.');
    } else delete data.subBrandId;
  }
  if (mutation.collection === 'stockCounts') {
    for (const item of data.items || []) {
      const product = context.records.find(row => row.collection === 'products' && row.id === item.productId);
      if (!item.subBrandId && product?.data.subBrandId) item.subBrandId = product.data.subBrandId;
    }
  }
  if (mutation.collection === 'sharedAccessLinks') { data.accessCount = 0; delete data.lastAccessedAt; }
  const codes = recordBrandCodes({ collection: mutation.collection, id: mutation.id, data, created_by: prior?.created_by || user.id, version: prior?.version || 0 }, context.records);
  const previousCodes = prior ? recordBrandCodes(prior, context.records) : [];
  if (codes.some((code) => code !== 'ALL' && !previousCodes.includes(code) && !context.brands.some((brand) => brand.code.toUpperCase() === code))) throw new WorkspaceError(400, 'Configure the record’s brand in Settings before saving it.');
  if (mutation.collection === 'dispatches' && prior && mutation.operation === 'upsert') {
    const from = dispatchStatus(prior.data as { status?: Dispatch["status"] }), to = dispatchStatus(data as { status?: Dispatch["status"] });
    if (from !== to && !canMoveTo(from, to)) throw new WorkspaceError(409, `This dispatch is already ${from.toLowerCase().replace('_', ' ')}. Refresh to see its latest step.`);
  }
  if (['orders', 'secondaryOrders', 'dispatches'].includes(mutation.collection)) {
    for (const item of data.items || []) {
      if (prior?.data.items?.some((previous: any) => previous.productId === item.productId && JSON.stringify(previous) === JSON.stringify(item))) continue;
      const product = context.records.find(row => ['products', 'combos'].includes(row.collection) && row.id === item.productId);
      if (!product || product.data.active === false || product.data.isActive === false) throw new WorkspaceError(400, 'Choose an active product from the saved catalogue.');
      // Keep the sub-brand the product had at this moment, so later catalogue moves do not rewrite reports.
      if (!item.subBrandId && product.collection === 'products' && product.data.subBrandId) item.subBrandId = product.data.subBrandId;
      if (product.collection === 'combos' && product.data.items?.some((component: any) => !context.records.some(row => row.collection === 'products' && row.id === component.productId && row.data.active !== false))) throw new WorkspaceError(400, 'This bundle includes an archived or missing product. Choose an active bundle.');
    }
  }
  for (const [idKey, nameKey] of [['officerId', 'officerName'], ['assignedOfficerId', 'assignedOfficerName'], ['assignedTo', 'assignedToName']]) {
    if (!data[idKey]) continue;
    const staff = context.users.find((entry) => entry.id === data[idKey]);
    if (!staff) throw new WorkspaceError(400, 'Choose an existing staff member.');
    if (mutation.collection === 'tasks' && idKey === 'assignedTo' && (staff.active === false || !hasAccess(staff, 'tasks'))) throw new WorkspaceError(400, 'The assignee must be active and have access to Tasks.');
    data[nameKey] = staff.fullName;
  }
}

/**
 * Automatic notifications for a saved record. Each goes through notifyEvent, so the Super
 * Admin's notification settings decide who gets it; links open the record itself.
 */
async function notifyRecordChange(user: User, mutation: WorkspaceMutation, context: WorkspaceContext, prior: StoredWorkspaceRecord | null | undefined) {
  if (mutation.operation === 'delete' || !mutation.data) return;
  const d = mutation.data as Record<string, any>;
  const was = (prior?.data || {}) as Record<string, any>;
  const created = !prior;
  const users = context.users;
  const key = mutation.mutationId;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  try {
    switch (mutation.collection) {
      case 'tasks':
        if (d.assignedTo && (created || was.assignedTo !== d.assignedTo)) await notifyEvent(user, 'task_assigned', users, { dedupeKey: key, personIds: [d.assignedTo],
          title: 'Task for you', message: `${String(d.title || 'A task')}${d.dueDateAd ? `, due ${d.dueDateAd}` : ''}. From ${user.fullName}.`, link: '/opscore/tasks', entityType: 'tasks', entityId: mutation.id, priority: d.priority });
        break;
      case 'beatItems':
        // Standing weekly stops are made every day; the rider already knows them, so only one-off and reassigned stops notify.
        if (d.officerId && ((created && !d.scheduleId) || (!created && was.officerId !== d.officerId))) await notifyEvent(user, 'visit_assigned', users, { dedupeKey: key, personIds: [d.officerId],
          title: 'Store visit added to your beat', message: `${d.storeName || 'A store'} on ${d.dateAd || 'your beat'}. Added by ${user.fullName}.`, link: '/offline-sales/beat-plan', entityType: 'beatItems', entityId: mutation.id });
        break;
      case 'secondaryOrders':
        if (created && d.status !== 'CANCELLED') await notifyEvent(user, 'store_order_new', users, { dedupeKey: key,
          title: `New store order ${d.orderNumber || ''}`.trim(), message: `${d.storeName}: ${plural(Number(d.totalUnits) || 0, 'unit')}, ${plural((d.items || []).length, 'product')}. Taken by ${d.officerName || user.fullName}.`,
          link: `/offline-sales/dispatch?q=${encodeURIComponent(d.orderNumber || '')}`, entityType: 'secondaryOrders', entityId: mutation.id });
        break;
      case 'orders':
        if (created && !d.isMarketing) await notifyEvent(user, 'online_order_new', users, { dedupeKey: key,
          title: `New online order ${d.orderNumber || ''}`.trim(), message: `${d.customerName || 'Customer'}${d.district ? `, ${d.district}` : ''}: ${plural((d.items || []).length, 'item')}${d.platform ? ` via ${d.platform}` : ''}.`,
          link: `/orderflow/orders/${encodeURIComponent(mutation.id)}`, entityType: 'orders', entityId: mutation.id });
        break;
      case 'returns':
        if (created) await notifyEvent(user, 'return_new', users, { dedupeKey: key,
          title: `${({ EXCHANGE: 'Exchange', SHORT_SHIPPED: 'Short shipment', WRONG_ITEM: 'Wrong item sent', RTO: 'RTO parcel' } as Record<string, string>)[String(d.ticketType || (d.orderStatus === 'Exchanged' ? 'EXCHANGE' : ''))] || 'Return'} logged${d.orderNumber ? ` for ${d.orderNumber}` : ''}`,
          message: `${d.customerName || 'Customer'}${d.reasonCategory ? `: ${String(d.reasonCategory).slice(0, 100)}` : ''}. Logged by ${user.fullName}.`,
          link: `/reviews/returns?ticket=${encodeURIComponent(mutation.id)}`, entityType: 'returns', entityId: mutation.id });
        break;
      case 'feedbackEntries':
        if (created && d.type === 'COMPLAINT') await notifyEvent(user, 'complaint_new', users, { dedupeKey: key, priority: d.priority === 'URGENT' ? 'URGENT' : 'HIGH',
          title: `New ${d.priority === 'URGENT' ? 'urgent ' : ''}complaint`, message: `${d.customerName || 'Customer'}${(d.issueCategories || []).length ? `: ${(d.issueCategories as string[]).join(', ')}` : ''}. Logged by ${user.fullName}.`,
          link: '/reviews/feedback', entityType: 'feedbackEntries', entityId: mutation.id });
        break;
      case 'cheques':
        if (created) await notifyEvent(user, 'cheque_new', users, { dedupeKey: key,
          title: `Cheque collected: ${d.storeName}`, message: `Cheque ${d.chequeNumber}${d.bankName ? `, ${d.bankName}` : ''}, to bank on ${d.cashDateAd}. Collected by ${d.officerName || user.fullName}.`,
          link: '/offline-sales/cheques', entityType: 'cheques', entityId: mutation.id });
        else if (['BOUNCED', 'DELAYED'].includes(d.status) && was.status !== d.status) await notifyEvent(user, 'cheque_problem', users, { dedupeKey: key, priority: d.status === 'BOUNCED' ? 'URGENT' : 'HIGH',
          title: `Cheque ${d.status === 'BOUNCED' ? 'bounced' : 'delayed'}: ${d.storeName}`, message: `Cheque ${d.chequeNumber}${d.delayedReason ? `: ${d.delayedReason}` : ''}. Marked by ${user.fullName}.`,
          link: '/offline-sales/cheques', entityType: 'cheques', entityId: mutation.id });
        break;
      case 'documents':
        if (created) await notifyEvent(user, 'document_new', users, { dedupeKey: key,
          title: `Store document: ${d.storeName || 'store'}`, message: `${d.documentType || d.type || 'Document'}${d.documentNumber ? ` ${d.documentNumber}` : ''}, logged by ${user.fullName}.`,
          link: '/offline-sales/documents', entityType: 'documents', entityId: mutation.id });
        break;
      case 'marketingSends':
        if (created && d.responsibleId) await notifyEvent(user, 'marketing_send_assigned', users, { dedupeKey: key, personIds: [d.responsibleId],
          title: `Marketing send ${d.sendNumber} is yours`, message: `${user.fullName} recorded a send to ${d.influencerName}. You follow up the content.`,
          link: '/marketing/sends', entityType: 'marketingSends', entityId: mutation.id });
        break;
    }
  } catch (error) { console.error('[Workspace] Notification not sent:', error instanceof Error ? error.message : 'unknown'); }
}

/** What the Order Desk may change on an existing order. */
const ORDER_DESK_FIELDS = ['status', 'dispatchedDateAd', 'deliveredDateAd', 'cancelledDateAd', 'exchangeOfOrderId', 'exchangeReturnId'];

/** Fields the order edit form may change. Used to merge a save made against an older version. */
const EDITABLE_ORDER_FIELDS = ['customerName', 'customerPhone', 'alternatePhone', 'address', 'province', 'district', 'brandCode', 'platform',
  'orderDateAd', 'orderDateBs', 'paymentTerms', 'deliveryMethod', 'notes', 'items', 'totalAmount', 'statedPrice', 'discountPercent', 'assignedToId', 'status',
  'dispatchedDateAd', 'deliveredDateAd', 'cancelledDateAd', 'exchangeOfOrderId', 'exchangeReturnId'];

/**
 * Give a new record its short ID. Runs on the server only, immediately before
 * the write, so a browser can never choose or reuse a number.
 */
export async function assignDocumentNumber(user: User, mutation: WorkspaceMutation, context: WorkspaceContext): Promise<void> {
  const data = mutation.data;
  if (!data || mutation.operation !== 'upsert') return;
  if (mutation.collection === 'orders') {
    const supplied = typeof data.orderNumber === 'string' ? data.orderNumber.trim().toUpperCase() : '';
    const prefixes = context.records.find(row => row.collection === 'workspaceConfig' && row.id === 'workspace')?.data.brandPrefixes;
    // An order with more than one brand uses the prefix of its first product's brand.
    const firstBrand = String(data.items?.[0]?.brandCode || data.brandCode || '');
    const prefix = brandPrefix(firstBrand || String(data.brandCode), prefixes);
    data.orderNumber = await nextDocumentId(prefix, user.id, candidate => documentIdTaken('orders', 'orderNumber', candidate));
    // An ID that arrived with the order (an import or an older device) stays searchable.
    if (supplied && !isPendingDocumentId(supplied) && supplied !== data.orderNumber) data.legacyOrderNumber = supplied; else delete data.legacyOrderNumber;
  } else if (mutation.collection === 'marketingSends') {
    data.sendNumber = await nextDocumentId(RESERVED_PREFIXES.marketingSends, user.id, candidate => documentIdTaken('marketingSends', 'sendNumber', candidate));
  } else if (mutation.collection === 'secondaryOrders') {
    const supplied = typeof data.orderNumber === 'string' ? data.orderNumber.trim() : '';
    data.orderNumber = await nextDocumentId(RESERVED_PREFIXES.secondaryOrders, user.id, candidate => documentIdTaken('secondaryOrders', 'orderNumber', candidate));
    if (supplied && !isPendingDocumentId(supplied) && !isShortDocumentId(supplied)) data.legacyOrderNumber = supplied;
  } else if (mutation.collection === 'dispatches') {
    data.dispatchNumber = await nextDocumentId(RESERVED_PREFIXES.dispatches, user.id, candidate => documentIdTaken('dispatches', 'dispatchNumber', candidate));
  }
}

async function readCollection(collection: string): Promise<StoredWorkspaceRecord[]> {
  const rows: StoredWorkspaceRecord[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from('workspace_records').select('collection,id,data,created_by,version,last_mutation_id').eq('collection', collection).order('id').range(offset, offset + 999);
    if (error) throw new WorkspaceError(503, 'Related records could not be loaded.');
    rows.push(...((data || []) as StoredWorkspaceRecord[]));
    if (!data || data.length < 1000) return rows;
  }
}

/**
 * Keep Customer 360 right when an order moves to another phone number or is
 * deleted. Runs on the server because only the server sees every order,
 * whatever the editor's own brand or team scope.
 */
export async function syncCustomersForPhones(user: User, phones: string[], reference: string): Promise<void> {
  const wanted = [...new Set(phones.map(phoneDigits).filter(Boolean))];
  if (!wanted.length) return;
  const [orders, customers, failures, returns, feedback] = await Promise.all(['orders', 'customers', 'deliveryFailures', 'returns', 'feedbackEntries'].map(readCollection));
  for (const digits of wanted) {
    const own = orders.filter(row => !row.data.isMarketing && phoneDigits(row.data.customerPhone) === digits)
      .sort((a, b) => String(a.data.orderDateAd).localeCompare(String(b.data.orderDateAd)));
    const existing = customers.find(row => phoneDigits(row.data.phone) === digits);
    const mutationId = `customer_sync_${createHash('sha256').update(`${reference}:${digits}`).digest('hex').slice(0, 40)}`;
    if (existing?.last_mutation_id === mutationId) continue;
    const latest = own[own.length - 1]?.data;
    const stats = { totalOrders: own.length, firstOrderDate: own[0]?.data.orderDateAd, lastOrderDate: latest?.orderDateAd,
      brandsPurchased: [...new Set(own.map(row => String(row.data.brandCode)).filter(Boolean))] };
    if (existing) {
      const referenced = [failures, returns, feedback].some(list => list.some(row => phoneDigits(row.data.customerPhone) === digits));
      if (!own.length && !referenced) {
        // A mistyped number that no longer has any order or history should not linger as a customer.
        const removed = await supabaseAdmin.from('workspace_records').delete().eq('collection', 'customers').eq('id', existing.id).eq('version', existing.version);
        if (removed.error) console.error('[Workspace] Stray customer could not be removed:', removed.error.code);
        continue;
      }
      const data = { ...existing.data, ...stats, brandsPurchased: own.length ? stats.brandsPurchased : existing.data.brandsPurchased || [] };
      if (JSON.stringify(data) === JSON.stringify(existing.data)) continue;
      const updated = await supabaseAdmin.from('workspace_records').update({ data, version: existing.version + 1, last_mutation_id: mutationId, updated_at: new Date().toISOString() })
        .eq('collection', 'customers').eq('id', existing.id).eq('version', existing.version);
      if (updated.error) console.error('[Workspace] Customer totals could not be updated:', updated.error.code);
    } else if (latest) {
      const id = `cust_${createHash('sha256').update(digits).digest('hex').slice(0, 32)}`;
      const data = { id, phone: latest.customerPhone, name: latest.customerName, city: latest.district || '', province: latest.province || '', ...stats,
        totalDelivered: 0, totalReturns: 0, totalDeliveryFailures: 0, totalCancellations: 0, totalComplaints: 0, totalReviews: 0,
        karmaScore: 72, segment: 'NEW', activeFlags: [] };
      const inserted = await supabaseAdmin.from('workspace_records').insert({ collection: 'customers', id, data, created_by: user.id, version: 1, last_mutation_id: mutationId });
      if (inserted.error && inserted.error.code !== '23505') console.error('[Workspace] Customer could not be created:', inserted.error.code);
    }
  }
}


export async function saveWorkspaceMutation(user: User, input: unknown, suppliedContext?: WorkspaceContext): Promise<{ version: number; assigned?: Record<string, string | undefined> }> {
  validateWorkspaceMutation(input);
  const mutation = input;
  const { data: previous, error: readError } = await supabaseAdmin.from('workspace_records').select('*').eq('collection', mutation.collection).eq('id', mutation.id).maybeSingle();
  if (readError) throw new WorkspaceError(503, 'This record could not be read.');
  const prior = previous as StoredWorkspaceRecord | null;
  if (['products', 'combos'].includes(mutation.collection) && mutation.operation === 'upsert') {
    const history = await supabaseAdmin.from('workspace_records').select('id').eq('collection', 'deletedProducts').eq('id', mutation.id).maybeSingle();
    if (history.error) throw new WorkspaceError(503, 'Product deletion history could not be checked.');
    if (history.data) throw new WorkspaceError(409, 'This catalogue item was deleted. Add a new item instead of reusing its identifier.');
  }
  const storeCollection = (STORE_COLLECTIONS as readonly string[]).includes(mutation.collection);
  const context = suppliedContext || (storeCollection && mutation.operation === 'delete' ? await readWorkspaceContext() : await readMutationContext(mutation, prior));
  if (storeCollection && mutation.operation === 'upsert') {
    const deleted = await supabaseAdmin.from('workspace_records').select('id').eq('collection', 'deletedStores').eq('id', mutation.id).maybeSingle();
    if (deleted.error) throw new WorkspaceError(503, 'Store deletion status could not be checked.');
    if (deleted.data) throw new WorkspaceError(409, 'This store was deleted. Add a new store instead.');
  }
  // Two people editing the same order: the last save wins for the fields that person changed,
  // everything else keeps the other person's values, and both versions stay in the history.
  let overwrote: { id?: string; name: string } | null = null;
  const edit = mutation.collection === 'orders' && mutation.operation === 'upsert' ? mutation.data?._edit as { token?: unknown; fields?: unknown } | undefined : undefined;
  if (prior && edit && prior.last_mutation_id !== mutation.mutationId && prior.version !== mutation.expectedVersion
    && typeof edit.token === 'string' && edit.token !== prior.data.lastEditToken && Array.isArray(edit.fields)) {
    const merged: Record<string, any> = { ...prior.data };
    for (const field of edit.fields) if (typeof field === 'string' && EDITABLE_ORDER_FIELDS.includes(field)) merged[field] = mutation.data![field];
    overwrote = { id: prior.data.lastEditedById, name: prior.data.lastEditedByName || 'another person' };
    mutation.data = { ...merged, id: mutation.id, _edit: { ...edit, overwrote: overwrote.name } };
    mutation.expectedVersion = prior.version;
  }
  if (mutation.operation === 'delete' && mutation.collection === 'influencerNiches' && prior
    && context.records.some(row => row.collection === 'influencers' && Array.isArray(row.data.nicheIds) && row.data.nicheIds.includes(mutation.id))) throw new WorkspaceError(409, 'This niche is used by at least one influencer. Archive or merge it instead.');
  if (mutation.operation === 'delete' && mutation.collection === 'influencers' && prior) {
    const sends = await supabaseAdmin.from('workspace_records').select('id').eq('collection', 'marketingSends').eq('data->>influencerId', mutation.id).limit(1);
    if (sends.error) throw new WorkspaceError(503, 'Send history could not be checked.');
    if (sends.data?.length) throw new WorkspaceError(409, 'This influencer has send history. Archive the profile instead of deleting it.');
  }
  if (mutation.operation === 'delete' && mutation.collection === 'campaigns' && prior) {
    const priced = await supabaseAdmin.from('workspace_records').select('id').eq('collection', 'orders').contains('data', { campaignIds: [mutation.id] }).limit(1);
    if (priced.error) throw new WorkspaceError(503, 'Orders priced with this sale could not be checked.');
    if (priced.data?.length) throw new WorkspaceError(409, 'Orders were priced with this sale. End it instead so its results stay in the reports.');
  }
  prepareRecordData(user, mutation, prior, context);
  const candidate: StoredWorkspaceRecord = { collection: mutation.collection, id: mutation.id, data: mutation.data || prior?.data || { id: mutation.id },
    created_by: prior?.created_by || user.id, version: prior?.version || 0 };
  const action = mutation.operation === 'delete' ? 'DELETE' : prior ? 'EDIT' : 'CREATE';
  if (!canWriteWorkspaceRecord(user, candidate, action, context.users, context.records)
    || (prior && !canWriteWorkspaceRecord(user, prior, action, context.users, context.records))) throw new WorkspaceError(403, 'This record is outside your permitted features, brands, or team.');
  if (prior?.last_mutation_id === mutation.mutationId) return { version: prior.version };
  if (mutation.operation === 'delete' && !prior) return { version: 0 };
  if ((prior?.version || 0) !== mutation.expectedVersion) throw new WorkspaceError(409, 'This record changed on another device. Review both versions before retrying.', prior?.version || 0);
  if (!prior) await assignDocumentNumber(user, mutation, context);
  const version = (prior?.version || 0) + 1;
  let result;
  if (mutation.operation === 'delete' && storeCollection) {
    const plan = storeDeletionPlan(prior!, context.records);
    if (plan.children.length) throw new WorkspaceError(409, 'Delete the linked branches and retailers first.');
    const deletion = await supabaseAdmin.rpc('commit_workspace_mutations', { p_mutations: [
      { collection: 'deletedStores', id: mutation.id, operation: 'upsert', data: { id: mutation.id }, expectedVersion: 0, mutationId: `${mutation.mutationId}:deleted`, createdBy: user.id },
      ...plan.pending.map(row => ({ collection: row.collection, id: row.id, operation: 'delete', expectedVersion: row.version, mutationId: `${mutation.mutationId}:${row.id}`, createdBy: user.id })),
      { ...mutation, createdBy: user.id },
    ] });
    if (deletion.error?.code === '40001' || deletion.error?.code === '23505') throw new WorkspaceError(409, 'The store or its route changed. Refresh before deleting.');
    if (deletion.error) throw new WorkspaceError(503, 'The store was not deleted. Please retry.');
    result = { data: [{ id: mutation.id }], error: null };
  } else if (mutation.operation === 'delete' && ['products', 'combos'].includes(mutation.collection)) {
    // The existing transaction preserves private history and removes the live SKU together.
    // Keep the full snapshot as JSON text so old invalid component links cannot block removal.
    const history = { id: mutation.id, collection: mutation.collection, name: prior!.data.name, sku: prior!.data.sku, brandCode: prior!.data.brandCode,
      stockQty: prior!.data.stockQty ?? 0, deletedAt: new Date().toISOString(), deletedById: user.id,
      originalCreatedById: prior!.created_by, snapshotJson: JSON.stringify(prior!.data) };
    const deletion = await supabaseAdmin.rpc('commit_workspace_mutations', { p_mutations: [
      { collection: 'deletedProducts', id: mutation.id, operation: 'upsert', data: history, expectedVersion: 0,
        mutationId: `${mutation.mutationId}:history`, createdBy: user.id },
      { ...mutation, createdBy: user.id },
    ] });
    if (deletion.error?.code === '40001' || deletion.error?.code === '23505') throw new WorkspaceError(409, 'This product changed on another device. Refresh before deleting it.');
    if (deletion.error) throw new WorkspaceError(503, 'The product was not deleted. Refresh and try again.');
    result = { data: [{ id: mutation.id }], error: null };
  } else if (mutation.operation === 'delete') {
    result = await supabaseAdmin.from('workspace_records').delete().eq('collection', mutation.collection).eq('id', mutation.id).eq('version', mutation.expectedVersion).select('id');
  } else if (storeCollection && (mutation.data?.distributorId || mutation.data?.branchId)) {
    const parents = [['distributorId', 'distributors'], ['branchId', 'branches']].filter(([key]) => mutation.data?.[key]).map(([key, collection]) => {
      const row = context.records.find(row => row.collection === collection && row.id === mutation.data![key]);
      if (!row) throw new WorkspaceError(409, 'The parent store no longer exists. Refresh the directory.');
      return row;
    });
    const saved = await supabaseAdmin.rpc('commit_workspace_mutations', { p_mutations: [
      ...parents.map(row => ({ collection: row.collection, id: row.id, operation: 'upsert', data: row.data, expectedVersion: row.version, mutationId: `${mutation.mutationId}:${row.id}`, createdBy: row.created_by })),
      { ...mutation, createdBy: user.id },
    ] });
    if (saved.error?.code === '40001' || saved.error?.code === '23505') throw new WorkspaceError(409, 'The store or its parent changed. Refresh and try again.');
    result = { data: saved.error ? [] : [{ id: mutation.id }], error: saved.error };
  } else {
    const payload = { data: mutation.data, version, last_mutation_id: mutation.mutationId, updated_at: new Date().toISOString() };
    result = prior
      ? await supabaseAdmin.from('workspace_records').update(payload).eq('collection', mutation.collection).eq('id', mutation.id).eq('version', mutation.expectedVersion).select('id')
      : await supabaseAdmin.from('workspace_records').insert({ ...payload, collection: mutation.collection, id: mutation.id, created_by: user.id }).select('id');
  }
  if (result.error?.code === '23505' || (!result.error && !result.data?.length)) throw new WorkspaceError(409, 'This record changed on another device. Refresh and review your pending change.');
  if (result.error?.code === '23503') throw new WorkspaceError(409, 'A referenced product no longer exists. Refresh the catalogue before saving.');
  if (result.error) { console.error('[Workspace] Save failed:', result.error.code); throw new WorkspaceError(503, 'The record was not saved. Your pending change is safe on this device.'); }
  context.records = context.records.filter((r) => r.collection !== mutation.collection || r.id !== mutation.id);
  if (mutation.operation !== 'delete') context.records.push({ ...candidate, version, last_mutation_id: mutation.mutationId });
  await appendAudit(user, mutation, !prior);
  await notifyRecordChange(user, mutation, context, prior);
  try { await linkOrderAndDispatch(user, mutation, prior, context.users); }
  catch (error) { console.error('[Workspace] Order and dispatch were not linked:', error instanceof Error ? error.message : 'unknown'); }
  if (mutation.collection === 'orders' && prior) {
    const before = phoneDigits(prior.data.customerPhone);
    const now = mutation.operation === 'delete' ? '' : phoneDigits(mutation.data?.customerPhone);
    // Customer totals follow the order: both numbers are recounted from every saved order.
    if (before !== now) {
      try { await syncCustomersForPhones(user, [before, now], mutation.mutationId); }
      catch (error) { console.error('[Workspace] Customer totals were not refreshed:', error instanceof Error ? error.message : 'unknown'); }
    }
    if (overwrote?.id && overwrote.id !== user.id) {
      await notifyEvent(user, 'order_overwrite', context.users, { dedupeKey: mutation.mutationId, personIds: [overwrote.id], priority: 'HIGH',
        title: `Order ${prior.data.orderNumber} was edited after you`, entityType: 'orders', entityId: mutation.id, link: `/orderflow/orders/${encodeURIComponent(mutation.id)}`,
        message: `${user.fullName} saved a later change to order ${prior.data.orderNumber}. Their changes are now showing; both versions are in the order history.` });
    }
  }
  if (mutation.operation === 'upsert' && ['feedbackEntries', 'returns'].includes(mutation.collection) && mutation.data?.customerLink === 'NEW' && prior?.data.customerLink !== 'NEW' && isFullPhone(mutation.data.customerPhone)) {
    // "New customer": the profile is created here from the entry, whatever the staff member's own Customers permission.
    try {
      const digits = phoneDigits(mutation.data.customerPhone);
      const existing = (await readCollection('customers')).some(row => phoneDigits(row.data.phone) === digits);
      if (!existing) {
        const id = `cust_${createHash('sha256').update(digits).digest('hex').slice(0, 32)}`;
        const d = mutation.data;
        const data = { id, phone: digits, name: String(d.customerName || '').trim() || 'Customer', city: String(d.customerCity || ''), province: '',
          totalOrders: 0, totalDelivered: 0, totalReturns: mutation.collection === 'returns' ? 1 : 0, totalDeliveryFailures: 0, totalCancellations: 0,
          totalComplaints: d.type === 'COMPLAINT' ? 1 : 0, totalReviews: d.type === 'REVIEW' ? 1 : 0, karmaScore: 72, segment: 'NEW', activeFlags: [], brandsPurchased: [] };
        const inserted = await supabaseAdmin.from('workspace_records').insert({ collection: 'customers', id, data, created_by: user.id, version: 1, last_mutation_id: `profile_${mutation.mutationId}`.slice(0, 170) });
        if (inserted.error && inserted.error.code !== '23505') console.error('[Workspace] Customer profile could not be created:', inserted.error.code);
      }
    } catch (error) { console.error('[Workspace] Customer profile could not be created:', error instanceof Error ? error.message : 'unknown'); }
  }
  if (mutation.collection === 'influencerContent' && mutation.operation === 'upsert' && typeof mutation.data?.sendId === 'string' && mutation.data.sendId) {
    // Linking content to a send clears its overdue follow-up task.
    const taskId = `task_send_overdue_${mutation.data.sendId}`.slice(0, 170);
    const task = await supabaseAdmin.from('workspace_records').select('data,version').eq('collection', 'tasks').eq('id', taskId).maybeSingle();
    if (task.data && task.data.data?.status !== 'COMPLETED') {
      await supabaseAdmin.from('workspace_records').update({ data: { ...task.data.data, status: 'COMPLETED' }, version: task.data.version + 1, last_mutation_id: `close_${mutation.mutationId}`.slice(0, 170), updated_at: new Date().toISOString() })
        .eq('collection', 'tasks').eq('id', taskId).eq('version', task.data.version);
    }
  }
  return { version: mutation.operation === 'delete' ? 0 : version, ...(mutation.operation === 'upsert' && !prior ? { assigned: { orderNumber: mutation.data?.orderNumber, sendNumber: mutation.data?.sendNumber, dispatchNumber: mutation.data?.dispatchNumber } } : {}) };
}

/** Find a store record (retailer, chain outlet or distributor/chain) for a dispatch order. */
async function storeRefFor(entityType: string, id: string): Promise<StoreRef | null> {
  const collection = entityType === 'BRANCH' ? 'branches' : entityType === 'RETAILER' ? 'retailers' : 'distributors';
  const { data } = await supabaseAdmin.from('workspace_records').select('data').eq('collection', collection).eq('id', id).maybeSingle();
  const row = data?.data as Record<string, any> | undefined;
  if (!row) return null;
  return { id, name: row.name, type: entityType as StoreRef['type'], chainId: row.distributorId, chainName: row.distributorName,
    distributorId: entityType === 'RETAILER' ? row.distributorId : undefined, distributorName: entityType === 'RETAILER' ? row.distributorName : undefined };
}

/**
 * Keep store orders and dispatch orders in step, whoever makes the change:
 * - a new store order starts a dispatch order ("Order received") straight away;
 * - a store order cancelled before dispatch cancels its dispatch order;
 * - moving a dispatch order along updates its store order's status.
 */
async function linkOrderAndDispatch(user: User, mutation: WorkspaceMutation, prior: StoredWorkspaceRecord | null, users: User[] = []) {
  if (mutation.operation !== 'upsert' || !mutation.data) return;
  const stamp = () => new Date().toISOString();
  if (mutation.collection === 'secondaryOrders') {
    const order = mutation.data as any;
    const dispatchId = `disp_so_${order.id}`.slice(0, 170);
    if (!prior && order.status !== 'CANCELLED') {
      const draft = dispatchFromOrder(order, await storeRefFor(order.entityType, order.entityId), user.fullName);
      const dispatchNumber = await nextDocumentId(RESERVED_PREFIXES.dispatches, user.id, candidate => documentIdTaken('dispatches', 'dispatchNumber', candidate));
      const data = { ...draft, dispatchNumber, ...(order.isSample ? { isSample: true } : {}) };
      const inserted = await supabaseAdmin.from('workspace_records').insert({ collection: 'dispatches', id: dispatchId, data, created_by: user.id, version: 1, last_mutation_id: `dispatch_${mutation.mutationId}`.slice(0, 170) });
      if (inserted.error && inserted.error.code !== '23505') console.error('[Workspace] Dispatch order could not be created:', inserted.error.code);
    } else if (prior && order.status === 'CANCELLED' && prior.data.status !== 'CANCELLED') {
      const linked = await supabaseAdmin.from('workspace_records').select('data,version').eq('collection', 'dispatches').eq('id', dispatchId).maybeSingle();
      const current = linked.data?.data as any;
      if (current && ['ORDER_RECEIVED', 'PACKED'].includes(dispatchStatus(current))) {
        const next = { ...current, status: 'CANCELLED', statusHistory: [...(current.statusHistory || []), { status: 'CANCELLED', at: stamp(), byName: user.fullName, note: 'Store order cancelled' }] };
        await supabaseAdmin.from('workspace_records').update({ data: next, version: linked.data!.version + 1, last_mutation_id: `cancel_${mutation.mutationId}`.slice(0, 170), updated_at: stamp() })
          .eq('collection', 'dispatches').eq('id', dispatchId).eq('version', linked.data!.version);
      }
    }
    return;
  }
  if (mutation.collection === 'dispatches') {
    const dispatch = mutation.data as any;
    if (!dispatch.orderId) return;
    const status = dispatchStatus(dispatch);
    if (prior && dispatchStatus(prior.data as { status?: Dispatch["status"] }) === status) return;
    const linked = await supabaseAdmin.from('workspace_records').select('data,version').eq('collection', 'secondaryOrders').eq('id', dispatch.orderId).maybeSingle();
    const order = linked.data?.data as any;
    const target = orderStatusFor(status);
    if (order && prior && status !== 'ORDER_RECEIVED') {
      await notifyEvent(user, 'dispatch_step', users, { dedupeKey: mutation.mutationId, personIds: [order.officerId],
        title: `${order.orderNumber || 'Store order'}: ${statusLabel(status).toLowerCase()}`, message: `${dispatch.storeName || order.storeName}: dispatch ${dispatch.dispatchNumber || ''} is now ${statusLabel(status).toLowerCase()}.`.replace('  ', ' '),
        link: `/offline-sales/stores/${encodeURIComponent(order.entityId)}`, entityType: 'secondaryOrders', entityId: order.id, priority: status === 'CANCELLED' ? 'HIGH' : 'MEDIUM' });
    }
    if (!order || order.status === target) return;
    await supabaseAdmin.from('workspace_records').update({ data: { ...order, status: target, dispatchId: dispatch.id, dispatchNumber: dispatch.dispatchNumber }, version: linked.data!.version + 1, last_mutation_id: `status_${mutation.mutationId}`.slice(0, 170), updated_at: stamp() })
      .eq('collection', 'secondaryOrders').eq('id', dispatch.orderId).eq('version', linked.data!.version);
  }
}

export async function openServerWorkspace(user: User) {
  const context = await readWorkspaceContext();
  const view = visibleWorkspace(user, context);
  const db = new DatabaseService({ server: true });
  db.hydrateSnapshot(view.snapshot, user, view.versions);
  // Users and brands remain in their dedicated, protected tables.
  db.replaceUsers(context.users);
  db.replaceBrands(view.data.brands);
  db.hydrateSnapshot(db.exportSnapshot(), user, view.versions);
  return { db,
    /** Every order in the workspace, whatever this person can see: offer limits (gift stock, once per customer) count them all. */
    allOrders: () => context.records.filter((row) => row.collection === 'orders' && !row.data.isMarketing).map((row) => row.data as Order),
    async commit(): Promise<Record<string, string> | void> {
    const pending: WorkspaceMutation[] = [];
    for (const mutation of db.getPendingMutations()) {
      if (['products', 'combos', ...STORE_COLLECTIONS].includes(mutation.collection) && mutation.operation === 'delete') throw new WorkspaceError(400, 'Use the catalogue or store directory to check and delete this record.');
      if (mutation.collection === 'activityLogs' || mutation.collection === 'staffLiveLocations') continue;
      if (mutation.collection === 'notifications' && !isSuperAdmin(user) && mutation.data?.userId !== user.id) continue;
      if (mutation.collection === 'notifications' && !isSuperAdmin(user) && mutation.expectedVersion === 0) continue;
      validateWorkspaceMutation(mutation);
      const prior = context.records.find((row) => row.collection === mutation.collection && row.id === mutation.id);
      prepareRecordData(user, mutation, prior, context);
      const candidate: StoredWorkspaceRecord = { collection: mutation.collection, id: mutation.id,
        data: mutation.data || prior?.data || { id: mutation.id }, created_by: prior?.created_by || user.id, version: prior?.version || 0 };
      const action = mutation.operation === 'delete' ? 'DELETE' : prior ? 'EDIT' : 'CREATE';
      if (!canWriteWorkspaceRecord(user, candidate, action, context.users, context.records)
        || (prior && !canWriteWorkspaceRecord(user, prior, action, context.users, context.records))) throw new WorkspaceError(403, 'This operation includes a record outside your permissions.');
      pending.push(mutation);
    }
    if (!pending.length) return;
    // Number new documents only after every permission check has passed.
    for (const mutation of pending) {
      if (!context.records.some(row => row.collection === mutation.collection && row.id === mutation.id)) await assignDocumentNumber(user, mutation, context);
    }
    const { error } = await supabaseAdmin.rpc('commit_workspace_mutations', { p_mutations: pending.map((mutation) => ({ ...mutation, createdBy: user.id })) });
    if (error?.code === '40001' || error?.code === '23505') throw new WorkspaceError(409, 'A record changed on another device. Refresh before retrying this operation.');
    if (error?.code === '23503') throw new WorkspaceError(409, 'A referenced product no longer exists. Refresh the catalogue before saving.');
    if (error) { console.error('[Workspace] Transaction failed:', error.code); throw new WorkspaceError(503, 'The operation was not saved. Please retry.'); }
    const assigned: Record<string, string> = {};
    for (const mutation of pending) {
      const before = context.records.find((row) => row.collection === mutation.collection && row.id === mutation.id && mutation.expectedVersion > 0);
      await appendAudit(user, mutation, mutation.expectedVersion === 0);
      await notifyRecordChange(user, mutation, context, before);
      try { await linkOrderAndDispatch(user, mutation, before || null, context.users); }
      catch (error) { console.error('[Workspace] Order and dispatch were not linked:', error instanceof Error ? error.message : 'unknown'); }
      const number = mutation.data?.orderNumber || mutation.data?.sendNumber || mutation.data?.dispatchNumber;
      if (mutation.operation === 'upsert' && typeof number === 'string') assigned[mutation.id] = number;
    }
    return assigned;
  } };
}

export async function openSystemWorkspace() {
  if ((await readWorkspaceResetState()).resetting) throw new WorkspaceError(503, 'Workspace reset is in progress.');
  const users = await readStoredUsers();
  const admin = users.find((entry) => entry.active !== false && isSuperAdmin(entry));
  if (!admin) throw new WorkspaceError(503, 'An active Super Admin is required for workspace jobs.');
  return openServerWorkspace(admin);
}
