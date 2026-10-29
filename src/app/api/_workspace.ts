import { NextResponse } from 'next/server';
import type { DatabaseService } from '@/lib/db/db-service';
import { canAccessBrand, getAssignedBrandCodes, getScope, type FeatureKey } from '@/lib/permissions';
import type { User } from '@/lib/types';

export class ApiInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function apiFailure(error: unknown, fallback: string) {
  const status = error instanceof SyntaxError ? 400
    : typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 500;
  const message = error instanceof SyntaxError ? 'Invalid JSON request body.'
    : error instanceof Error ? error.message : fallback;
  return NextResponse.json({ success: false, error: message }, { status: status >= 400 && status <= 599 ? status : 500 });
}

export async function readBody(request: Request): Promise<Record<string, any>> {
  const body = await request.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiInputError('A JSON object is required.');
  return body;
}

export function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ApiInputError(`${field} is required.`);
  return value.trim();
}

export function validDateAd(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateAd(value: unknown, field: string, fallback?: string): string {
  if (value === undefined && fallback) return fallback;
  if (!validDateAd(value)) throw new ApiInputError(`${field} must be a valid YYYY-MM-DD date.`);
  return value;
}

export function positiveNumber(value: unknown, field: string, integer = false): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw new ApiInputError(`${field} must be a positive number.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || (integer && !Number.isInteger(parsed))) throw new ApiInputError(`${field} must be a positive ${integer ? 'integer' : 'number'}.`);
  return parsed;
}

export function allowedValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T, field: string): T {
  if (value === undefined) return fallback;
  if (!allowed.includes(value as T)) throw new ApiInputError(`Invalid ${field}.`);
  return value as T;
}

export function scopeOfficerIds(db: DatabaseService, user: User, feature: FeatureKey): Set<string> | null {
  const scope = getScope(user, feature);
  if (scope === 'ALL') return null;
  const ids = new Set([user.id]);
  if (scope === 'TEAM') {
    const users = db.getUsers();
    let previousSize = 0;
    while (previousSize !== ids.size) {
      previousSize = ids.size;
      for (const member of users) if (ids.has(member.reportsToId || member.reports_to_id || '')) ids.add(member.id);
    }
  }
  return ids;
}

export function ownsRecord(record: Record<string, any>, ids: Set<string> | null): boolean {
  return ids === null || [record.officerId, record.createdById, record.createdBy, record.assignedTo].some(id => typeof id === 'string' && ids.has(id));
}

export function assertBrand(db: DatabaseService, user: User, value: unknown): string {
  const code = requiredText(value, 'brandCode').toUpperCase();
  const brand = db.getBrands().find(brand => String(brand.code).toUpperCase() === code);
  if (!brand) throw new ApiInputError('Unknown brandCode.');
  if (!canAccessBrand(user, code)) throw new ApiInputError('Not found.', 404);
  return brand.code;
}

export function visibleOrders(db: DatabaseService, user: User) {
  const ids = scopeOfficerIds(db, user, 'orderflow');
  return db.getOrders().filter(order => canAccessBrand(user, order.brandCode) && ownsRecord(order, ids));
}

export function visibleCheques(db: DatabaseService, user: User) {
  const ids = scopeOfficerIds(db, user, 'cheque_tracker');
  const stores = new Map([...db.getRetailers(), ...db.getBranches()].map(store => [store.id, store]));
  return db.getCheques().filter(cheque => {
    const store = stores.get(cheque.entityId);
    const codes = cheque.brandCodes?.length ? cheque.brandCodes : store && ('brandsStocked' in store ? store.brandsStocked : store.brandsAvailable) || [];
    return ownsRecord(cheque, ids) && (getAssignedBrandCodes(user).includes('ALL') || codes.some(code => canAccessBrand(user, code)));
  });
}

export function visibleFeedback(db: DatabaseService, user: User) {
  const ids = scopeOfficerIds(db, user, 'reviews');
  return db.getFeedback().filter(entry => canAccessBrand(user, entry.brandCode) && ownsRecord(entry, ids));
}

export function visibleCustomers(db: DatabaseService, user: User) {
  const ids = scopeOfficerIds(db, user, 'customers');
  const phones = new Set(db.getOrders().filter(order => ownsRecord(order, ids) && canAccessBrand(user, order.brandCode)).map(order => order.customerPhone));
  return db.getCustomers().filter(customer => (getAssignedBrandCodes(user).includes('ALL') || customer.brandsPurchased.some(code => canAccessBrand(user, code))) && (ids === null || phones.has(customer.phone)));
}

export function visibleDispatches(db: DatabaseService, user: User) {
  const ids = scopeOfficerIds(db, user, 'dispatches');
  const stores = new Map([...db.getBranches(), ...db.getRetailers()].map(store => [store.id, store]));
  return db.getDispatches().filter(dispatch => ownsRecord(dispatch, ids) || (ids !== null && ids.has(stores.get(dispatch.branchId || '')?.assignedOfficerId || '')))
    .map(dispatch => ({ ...dispatch, items: dispatch.items.filter(item => canAccessBrand(user, item.brandCode)) }))
    .filter(dispatch => dispatch.items.length > 0);
}
