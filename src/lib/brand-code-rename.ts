/**
 * Changing a brand's code: every saved record that names the old code is rewritten to the new one,
 * so products, orders, stores and settings stay with the brand. Ids are left alone.
 */
const LIST_KEYS = ['brandCodes', 'brandsStocked', 'brandsAvailable', 'brandsCarried', 'brandsPurchased', 'assignedBrands'] as const;
const LINE_KEYS = ['items', 'lines', 'products', 'components'] as const;

const same = (value: unknown, code: string) => typeof value === 'string' && value.trim().toUpperCase() === code;

/** The record's data with the old code replaced, or null when nothing in it names the old code. */
export function renameBrandCodeInData(data: Record<string, any>, from: string, to: string): Record<string, any> | null {
  const oldCode = from.trim().toUpperCase(), newCode = to.trim().toUpperCase();
  if (!oldCode || !newCode || oldCode === newCode) return null;
  let changed = false;
  const next: Record<string, any> = { ...data };
  if (same(next.brandCode, oldCode)) { next.brandCode = newCode; changed = true; }
  for (const key of LIST_KEYS) {
    if (Array.isArray(next[key]) && next[key].some((code: unknown) => same(code, oldCode))) {
      next[key] = [...new Set(next[key].map((code: unknown) => same(code, oldCode) ? newCode : code))];
      changed = true;
    }
  }
  for (const key of LINE_KEYS) {
    if (Array.isArray(next[key]) && next[key].some((line: any) => line && same(line.brandCode, oldCode))) {
      next[key] = next[key].map((line: any) => line && same(line.brandCode, oldCode) ? { ...line, brandCode: newCode } : line);
      changed = true;
    }
  }
  // Workspace settings keyed by brand code (order ID prefixes).
  if (next.brandPrefixes && typeof next.brandPrefixes === 'object' && Object.keys(next.brandPrefixes).some((key) => same(key, oldCode))) {
    const prefixes: Record<string, string> = {};
    for (const [key, value] of Object.entries(next.brandPrefixes as Record<string, string>)) prefixes[same(key, oldCode) ? newCode : key] = value;
    next.brandPrefixes = prefixes;
    changed = true;
  }
  return changed ? next : null;
}
