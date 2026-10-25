/** Create the initial Super Admin with a bcrypt-hashed password. */

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;

async function seedSuperAdmin() {
  if (!supabaseUrl || !serviceRoleKey || !initialPassword) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and INITIAL_ADMIN_PASSWORD before seeding.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await supabase.from('users').upsert(
    {
      email: 'admin@brandbucket.com',
      phone: '9800000001',
      full_name: 'Devansh Agarwal',
      role: 'SUPER_ADMIN',
      password_hash: await bcrypt.hash(initialPassword, 12),
      assigned_brands: ['FORYA', 'PEE_SAFE', 'FURR', 'RENEE'],
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'email' }
  );

  if (error) throw new Error(`Failed to upsert Super Admin in Supabase: ${error.message}`);
  console.info('Successfully registered the Super Admin account in Supabase.');
}

seedSuperAdmin().catch((error) => {
  console.error('Fatal error during admin seeding:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
