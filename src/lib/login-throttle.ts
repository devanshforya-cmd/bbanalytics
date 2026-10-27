import { createHmac } from 'node:crypto';
import { supabaseAdmin } from './db/supabase-server';

export function loginThrottleKey(identifier: string, ip: string, secret: string): string {
  return createHmac('sha256', secret).update(`login:${ip}:${identifier.toLowerCase()}`).digest('hex');
}

export async function takeLoginAttempt(key: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { data, error } = await supabaseAdmin.rpc('take_login_attempt', { p_key: key });
  if (error || typeof data?.allowed !== 'boolean') throw new Error('Login attempt protection is unavailable.');
  return data;
}

export async function clearLoginAttempts(key: string): Promise<void> {
  const { error } = await supabaseAdmin.from('login_rate_limits').delete().eq('key', key);
  if (error) throw new Error('Login attempt protection could not be reset.');
}
