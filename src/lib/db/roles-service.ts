import type { StaffRole, AccessMap } from '../roles';

async function request<T>(method: string, body?: unknown, query = ''): Promise<T> {
  const response = await fetch(`/api/roles${query}`, { method, credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Roles could not be reached. Check your connection and try again.');
  return payload as T;
}

export async function fetchRoles(): Promise<StaffRole[]> { return (await request<{ data: StaffRole[] }>('GET')).data; }
export async function createRole(role: { name: string; description?: string; color?: string; permissions: AccessMap }): Promise<StaffRole> {
  return (await request<{ data: StaffRole }>('POST', role)).data;
}
export async function updateRole(role: { id: string; name: string; description?: string; color?: string; permissions: AccessMap }): Promise<{ role: StaffRole; updatedPeople: number }> {
  const result = await request<{ data: StaffRole; updatedPeople: number }>('PATCH', role);
  return { role: result.data, updatedPeople: result.updatedPeople };
}
export async function deleteRole(id: string): Promise<void> { await request('DELETE', undefined, `?id=${encodeURIComponent(id)}`); }
