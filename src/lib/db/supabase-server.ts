import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseConfig } from '../runtime-config';

let cached: { url: string; key: string; client: SupabaseClient } | undefined;

export function getSupabaseServerClient(): SupabaseClient {
  if (typeof window !== 'undefined') throw new Error('The privileged database client is server-only.');
  const { url, key } = getServerSupabaseConfig();
  if (!cached || cached.url !== url || cached.key !== key) {
    cached = { url, key, client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
  }
  return cached.client;
}

// Lazy creation lets Next build routes before runtime secrets are provisioned.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabaseServerClient();
    const value = Reflect.get(client, property);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
