/**
 * Brand Bucket Command Center — Super Admin Seeder
 * Fix 59c: Create the initial Super Admin account with bcrypt-hashed credentials.
 */

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function seedSuperAdmin() {
  const plainPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Admin@123';
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

  const superAdminData = {
    email: 'admin@brandbucket.com',
    phone: '9800000001',
    full_name: 'Devansh Agarwal',
    role: 'SUPER_ADMIN',
    password_hash: hashedPassword,
    assigned_brands: ['FORYA', 'PEE_SAFE', 'FURR', 'RENEE'],
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  console.info('=== Brand Bucket Super Admin Account ===');
  console.info('Email:', superAdminData.email);
  console.info('Phone:', superAdminData.phone);
  console.info('Role:', superAdminData.role);
  console.info('Bcrypt Hash generated successfully (12 rounds).');

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await supabase
        .from('users')
        .upsert([superAdminData], { onConflict: 'email' })
        .select();

      if (error) {
        console.error('Failed to upsert Super Admin in Supabase:', error.message);
      } else {
        console.info('Successfully registered Super Admin in Supabase database:', data);
      }
    } catch (err: any) {
      console.error('Supabase connection failed:', err?.message || err);
    }
  } else {
    console.info('\n[Offline / Mock Mode]: No Supabase environment variables detected.');
    console.info('Generated SQL for manual execution:');
    console.info(`
INSERT INTO users (email, phone, full_name, role, password_hash, assigned_brands, active)
VALUES ('${superAdminData.email}', '${superAdminData.phone}', '${superAdminData.full_name}', '${superAdminData.role}', '${superAdminData.password_hash}', ARRAY['FORYA', 'PEE_SAFE', 'FURR', 'RENEE'], true)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `);
  }
}

seedSuperAdmin().catch((err) => {
  console.error('Fatal error during admin seeding:', err);
  process.exit(1);
});
