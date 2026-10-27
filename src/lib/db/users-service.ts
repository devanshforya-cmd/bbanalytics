import type { User } from '../types';

let users: User[] = [];
async function request(method: string, body?: unknown) {
  const response = await fetch('/api/users', { method, credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Staff records could not be saved.');
  return payload.data;
}
export async function fetchUsersFromSupabase(): Promise<User[]> { users = await request('GET'); return users; }
export function getUsers(): User[] { return users; }
export function getUserById(id: string) { return users.find((user) => user.id === id); }
export function getUserByEmailOrPhone(value: string) {
  const clean = value.trim().toLowerCase();
  return users.find((user) => user.email?.toLowerCase() === clean || user.phone?.replace(/\D/g, '') === clean.replace(/\D/g, ''));
}
export async function createUser(user: User): Promise<User> {
  const saved = await request('POST', user) as User;
  users = [...users.filter((entry) => entry.id !== saved.id), saved];
  return saved;
}
export async function updateUser(id: string, updates: Partial<User>): Promise<User> {
  const saved = await request('PATCH', { id, ...updates }) as User;
  users = [...users.filter((entry) => entry.id !== id), saved];
  return saved;
}
export async function deactivateUser(id: string) { return updateUser(id, { active: false }); }
