import { createHash } from 'node:crypto';
import { validateAlertRules } from '../alert-rules';
import { DatabaseService } from './db-service';
import { supabaseAdmin } from './supabase-server';
import { getAssignedBrandCodes, getScope, hasAccess, isSuperAdmin } from '../permissions';
import type { Brand, User, SharedAccessLink } from '../types';
import { WORKSPACE_COLLECTIONS, isWorkspaceCollection, type WorkspaceMutation, type WorkspaceSnapshot, type WorkspaceVersions } from './workspace-types';
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
    status: r.is_active === false ? 'ARCHIVED' : 'ACTIVE' }));
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
  const storeId = data.storeId || data.entityId;
  const productIds: string[] = Array.isArray(data.items) ? [...new Set<string>(data.items.map((item: any) => item?.productId).filter((id: unknown): id is string => typeof id === 'string'))] : [];
  const related = async (collections: string[], ids: string[]) => {
    if (!ids.length) return [];
    const { data, error } = await supabaseAdmin.from('workspace_records').select('collection,id,data,created_by,version,last_mutation_id').in('collection', collections).in('id', ids);
    if (error) throw new WorkspaceError(503, 'Related workspace records could not be verified.');
    return (data || []) as StoredWorkspaceRecord[];
  };
  const [users, brands, stores, products] = await Promise.all([readStoredUsers(), readBrands(),
    related(['retailers', 'branches', 'distributors'], typeof storeId === 'string' ? [storeId] : []), related(['products'], productIds)]);
  return { users, brands, records: [...(prior ? [prior] : []), ...stores, ...products] };
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
  const rosterFeatures = ['settings', 'staff_scorecards', 'tasks', 'gps_tracking', 'beat_plans'].filter((feature) => hasAccess(user, feature));
  const allRoster = isSuperAdmin(user) || rosterFeatures.some((feature) => getScope(user, feature) === 'ALL');
  const teamRoster = rosterFeatures.some((feature) => getScope(user, feature) === 'TEAM');
  const users = context.users.filter((entry) => entry.id === user.id || allRoster || teamRoster && team.has(entry.id));
  const safeUsers = hasAccess(user, 'settings') ? users : users.map((entry) => entry.id === user.id ? entry : ({
    id: entry.id, fullName: entry.fullName, role: entry.role, active: entry.active, dutyStatus: entry.dutyStatus,
    reportsToId: entry.reportsToId, email: '', phone: '', assignedBrands: [],
  }));
  const assigned = getAssignedBrandCodes(user);
  const mayReadBrands = ['settings', 'products', 'beat_plans', 'stores', 'distributors', 'dispatches', 'cheque_tracker', 'orderflow', 'reviews', 'marketing', 'dashboard', 'export'].some((feature) => hasAccess(user, feature));
  const brands = mayReadBrands ? context.brands.filter((brand) => assigned.includes('ALL') || assigned.includes(brand.code.toUpperCase())) : [];
  return { data: { ...snapshot, users: safeUsers, brands }, snapshot, versions };
}

export function validateWorkspaceMutation(value: unknown): asserts value is WorkspaceMutation {
  if (!value || typeof value !== 'object') throw new WorkspaceError(400, 'A workspace mutation is required.');
  const m = value as WorkspaceMutation;
  if (!isWorkspaceCollection(m.collection) || !/^[A-Za-z0-9_:-]{1,180}$/.test(m.id || '') || !['upsert', 'delete'].includes(m.operation)
    || typeof m.mutationId !== 'string' || m.mutationId.length < 8 || m.mutationId.length > 180
    || !Number.isSafeInteger(m.expectedVersion) || m.expectedVersion < 0) throw new WorkspaceError(400, 'Invalid workspace mutation.');
  if (m.operation === 'upsert' && (!m.data || typeof m.data !== 'object' || Array.isArray(m.data) || m.data.id !== m.id)) throw new WorkspaceError(400, 'The record ID must match its mutation.');
  if (m.data && Buffer.byteLength(JSON.stringify(m.data)) > 512 * 1024) throw new WorkspaceError(413, 'This record is too large. Upload photos and documents to Drive first.');
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
  if (m.collection === 'products' && m.data && (!m.data.name || !m.data.sku || !m.data.brandCode)) throw new WorkspaceError(400, 'Product name, SKU, and brand are required.');
  if (m.collection === 'sharedAccessLinks' && m.data && !/^bb_[A-Za-z0-9_-]{43,128}$/.test(m.data.token || '')) throw new WorkspaceError(400, 'Regenerate this legacy sharing link before saving it.');
  if (m.collection === 'workspaceConfig' && m.data?.alertRules !== undefined) {
    try { validateAlertRules(m.data.alertRules); } catch { throw new WorkspaceError(400, 'Enter valid alert thresholds.'); }
  }
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

function prepareRecordData(user: User, mutation: WorkspaceMutation, prior: StoredWorkspaceRecord | undefined | null, context: WorkspaceContext) {
  if (!mutation.data) return;
  mutation.data = { ...mutation.data, createdById: prior?.created_by || user.id };
  const data = mutation.data;
  if (mutation.collection === 'orders' && typeof data.orderNumber === 'string') data.orderNumber = data.orderNumber.trim().toUpperCase();
  if (mutation.collection === 'sharedAccessLinks') { data.accessCount = 0; delete data.lastAccessedAt; }
  const codes = recordBrandCodes({ collection: mutation.collection, id: mutation.id, data, created_by: prior?.created_by || user.id, version: prior?.version || 0 }, context.records);
  if (codes.some((code) => code !== 'ALL' && !context.brands.some((brand) => brand.code.toUpperCase() === code))) throw new WorkspaceError(400, 'Configure the record’s brand in Settings before saving it.');
  for (const [idKey, nameKey] of [['officerId', 'officerName'], ['assignedOfficerId', 'assignedOfficerName'], ['assignedTo', 'assignedToName']]) {
    if (!data[idKey]) continue;
    const staff = context.users.find((entry) => entry.id === data[idKey]);
    if (!staff) throw new WorkspaceError(400, 'Choose an existing staff member.');
    if (mutation.collection === 'tasks' && idKey === 'assignedTo' && (staff.active === false || !hasAccess(staff, 'tasks'))) throw new WorkspaceError(400, 'The assignee must be active and have access to Tasks.');
    data[nameKey] = staff.fullName;
  }
}

async function notifyRecordChange(user: User, mutation: WorkspaceMutation, context: WorkspaceContext, created: boolean) {
  if (mutation.operation === 'delete') return;
  const recipients = new Set<string>();
  if (mutation.collection === 'tasks' && mutation.data?.assignedTo && mutation.data.assignedTo !== user.id) recipients.add(mutation.data.assignedTo);
  if (created && !isSuperAdmin(user) && ['cheques', 'documents', 'secondaryOrders', 'feedbackEntries', 'returns'].includes(mutation.collection)) {
    for (const admin of context.users) if (admin.active !== false && isSuperAdmin(admin)) recipients.add(admin.id);
  }
  for (const recipient of recipients) {
    const id = `notification_${createHash('sha256').update(mutation.mutationId + ':' + recipient).digest('hex')}`;
    const data = { id, userId: recipient, title: mutation.collection === 'tasks' ? 'Task assigned to you' : 'New field submission',
      message: mutation.collection === 'tasks' ? String(mutation.data?.title || '') : `${user.fullName} submitted ${mutation.collection}.`,
      priority: mutation.data?.priority || 'MEDIUM', read: false, entityType: mutation.collection, entityId: mutation.id, createdAt: new Date().toISOString() };
    const { error } = await supabaseAdmin.from('workspace_records').upsert({ collection: 'notifications', id, data, created_by: user.id, version: 1, last_mutation_id: mutation.mutationId }, { onConflict: 'collection,id', ignoreDuplicates: true });
    if (error) console.error('[Workspace] Notification could not be saved:', error.code);
  }
}

export async function saveWorkspaceMutation(user: User, input: unknown, suppliedContext?: WorkspaceContext): Promise<{ version: number }> {
  validateWorkspaceMutation(input);
  const mutation = input;
  const { data: previous, error: readError } = await supabaseAdmin.from('workspace_records').select('*').eq('collection', mutation.collection).eq('id', mutation.id).maybeSingle();
  if (readError) throw new WorkspaceError(503, 'This record could not be read.');
  const prior = previous as StoredWorkspaceRecord | null;
  const context = suppliedContext || await readMutationContext(mutation, prior);
  prepareRecordData(user, mutation, prior, context);
  const candidate: StoredWorkspaceRecord = { collection: mutation.collection, id: mutation.id, data: mutation.data || prior?.data || { id: mutation.id },
    created_by: prior?.created_by || user.id, version: prior?.version || 0 };
  const action = mutation.operation === 'delete' ? 'DELETE' : prior ? 'EDIT' : 'CREATE';
  if (!canWriteWorkspaceRecord(user, candidate, action, context.users, context.records)
    || (prior && !canWriteWorkspaceRecord(user, prior, action, context.users, context.records))) throw new WorkspaceError(403, 'This record is outside your permitted features, brands, or team.');
  if (prior?.last_mutation_id === mutation.mutationId) return { version: prior.version };
  if (mutation.operation === 'delete' && !prior) return { version: 0 };
  if ((prior?.version || 0) !== mutation.expectedVersion) throw new WorkspaceError(409, 'This record changed on another device. Review both versions before retrying.', prior?.version || 0);
  const version = (prior?.version || 0) + 1;
  let result;
  if (mutation.operation === 'delete') {
    result = await supabaseAdmin.from('workspace_records').delete().eq('collection', mutation.collection).eq('id', mutation.id).eq('version', mutation.expectedVersion).select('id');
  } else {
    const payload = { data: mutation.data, version, last_mutation_id: mutation.mutationId, updated_at: new Date().toISOString() };
    result = prior
      ? await supabaseAdmin.from('workspace_records').update(payload).eq('collection', mutation.collection).eq('id', mutation.id).eq('version', mutation.expectedVersion).select('id')
      : await supabaseAdmin.from('workspace_records').insert({ ...payload, collection: mutation.collection, id: mutation.id, created_by: user.id }).select('id');
  }
  if (result.error?.code === '23505' || (!result.error && !result.data?.length)) throw new WorkspaceError(409, 'This record changed on another device. Refresh and review your pending change.');
  if (result.error) { console.error('[Workspace] Save failed:', result.error.code); throw new WorkspaceError(503, 'The record was not saved. Your pending change is safe on this device.'); }
  context.records = context.records.filter((r) => r.collection !== mutation.collection || r.id !== mutation.id);
  if (mutation.operation !== 'delete') context.records.push({ ...candidate, version, last_mutation_id: mutation.mutationId });
  await appendAudit(user, mutation, !prior);
  await notifyRecordChange(user, mutation, context, !prior);
  return { version: mutation.operation === 'delete' ? 0 : version };
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
  return { db, async commit() {
    const pending: WorkspaceMutation[] = [];
    for (const mutation of db.getPendingMutations()) {
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
    const { error } = await supabaseAdmin.rpc('commit_workspace_mutations', { p_mutations: pending.map((mutation) => ({ ...mutation, createdBy: user.id })) });
    if (error?.code === '40001' || error?.code === '23505') throw new WorkspaceError(409, 'A record changed on another device. Refresh before retrying this operation.');
    if (error) { console.error('[Workspace] Transaction failed:', error.code); throw new WorkspaceError(503, 'The operation was not saved. Please retry.'); }
    for (const mutation of pending) {
      await appendAudit(user, mutation, mutation.expectedVersion === 0);
      await notifyRecordChange(user, mutation, context, mutation.expectedVersion === 0);
    }
  } };
}

export async function openSystemWorkspace() {
  const users = await readStoredUsers();
  const admin = users.find((entry) => entry.active !== false && isSuperAdmin(entry));
  if (!admin) throw new WorkspaceError(503, 'An active Super Admin is required for workspace jobs.');
  return openServerWorkspace(admin);
}
