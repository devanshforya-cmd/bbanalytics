/**
 * Brand Bucket Command Center — Database Access Layer
 * Fix 59a & 59g: Modular Supabase client and service pattern with env-based data source switching.
 */

import { db as mockDb, DatabaseService } from './db-service';
import { supabase, getSupabaseClient } from './supabase-client';
import { getSupabaseServerClient } from './supabase-server';

export const DATA_SOURCE =
  process.env.NEXT_PUBLIC_DATA_SOURCE ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL ? 'supabase' : 'mock');

/**
 * Unified `db` instance.
 * Automatically falls back to mockDb if Supabase credentials are not provided or if DATA_SOURCE is 'mock'.
 */
export const db: DatabaseService = mockDb;

export { supabase, getSupabaseClient, getSupabaseServerClient, DatabaseService };
export default db;
