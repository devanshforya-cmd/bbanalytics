export function getServerSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let validUrl = false;
  try {
    const parsed = new URL(url);
    validUrl = !/placeholder|your-project/i.test(parsed.hostname) && (parsed.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) && !parsed.username && !parsed.password;
  } catch { /* Missing configuration is reported without revealing values. */ }
  if (!validUrl || key.length < 20 || /placeholder|your[_-]/i.test(key)) throw new Error('Supabase server configuration is missing or invalid.');
  return { url, key };
}

export function runtimeReadiness() {
  const missing: string[] = [];
  try { getServerSupabaseConfig(); } catch { missing.push('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); }
  const secret = process.env.AUTH_SESSION_SECRET || '';
  if (Buffer.byteLength(secret) < 32 || /^(generate|replace|your[_-])/i.test(secret)) missing.push('AUTH_SESSION_SECRET');
  return { ready: missing.length === 0, missing };
}
