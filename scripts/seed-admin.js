try {
  require('@next/env').loadEnvConfig(process.cwd());
} catch (_) {}

const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SERVICE_ROLE_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  if (supabaseUrl === 'YOUR_SUPABASE_URL' || supabaseKey === 'YOUR_SERVICE_ROLE_KEY') {
    console.error('⚠️ Please replace YOUR_SUPABASE_URL and YOUR_SERVICE_ROLE_KEY in scripts/seed-admin.js or set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment before running.');
    process.exit(1);
  }

  // Hash password
  const hash = await bcrypt.hash('BrandBucket@2083', 12);

  // Create Super Admin
  const { error: userError } = await supabase.from('users').upsert({
    id: 'user_devansh',
    name: 'Devansh Agarwal',
    full_name: 'Devansh Agarwal',
    email: 'devansh@brandbucket.com',
    phone: '',
    password_hash: hash,
    is_super_admin: true,
    role: 'SUPER_ADMIN',
    permissions: {},  // super admin bypasses all permissions
    assigned_brands: ['ALL'],
    assigned_territory: 'ALL',
    is_active: true,
    calendar_preference: 'AD',
  });

  if (userError) {
    console.error('Failed to create admin:', userError);
    return;
  }
  console.log('✅ Super Admin created: devansh@brandbucket.com');
  console.log('Password: BrandBucket@2083');
  console.log('🌱 No preset brands seeded — add your brands in Settings.');
}

seed();
