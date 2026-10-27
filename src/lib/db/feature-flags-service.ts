import type { FeatureFlag, FlagEvent } from '../types';

let flags: FeatureFlag[] = [];
async function request(method: string, body?: unknown, suffix = '') {
  const response = await fetch(`/api/feature-flags${suffix}`, { method, cache: 'no-store', credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.error || 'The feature flag request failed.');
  return payload.data;
}
function changed() { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bb-feature-flags-updated')); }
export async function fetchFeatureFlagsFromSupabase(): Promise<FeatureFlag[]> { flags = await request('GET'); return flags; }
export function getFeatureFlags() { return flags; }
export function getFeatureFlagByName(name: string) { return flags.find((flag) => flag.name === name); }
export async function addFeatureFlag(flag: FeatureFlag): Promise<FeatureFlag> {
  const saved = await request('POST', flag) as FeatureFlag; flags = [...flags.filter((entry) => entry.id !== saved.id), saved]; changed(); return saved;
}
export async function updateFeatureFlag(id: string, updates: Partial<FeatureFlag>): Promise<FeatureFlag> {
  const saved = await request('PATCH', { id, ...updates }) as FeatureFlag; flags = flags.map((flag) => flag.id === id ? saved : flag); changed(); return saved;
}
export async function deleteFeatureFlag(id: string): Promise<boolean> { await request('DELETE', { id }); flags = flags.filter((flag) => flag.id !== id); changed(); return true; }
export async function logFlagEvent(event: Omit<FlagEvent, 'id' | 'createdAt'>): Promise<void> { await request('POST', { ...event, type: 'event' }); }
export async function getFlagAnalytics(flagName: string) { return request('GET', undefined, `?analytics=${encodeURIComponent(flagName)}`); }
