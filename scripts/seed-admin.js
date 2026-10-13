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
    assigned_brands: ['FORYA', 'PEESAFE', 'FURR', 'RENEE'],
    assigned_territory: 'ALL',
    is_active: true,
    active: true,
    calendar_preference: 'AD',
  });

  if (userError) {
    console.error('Failed to create admin:', userError);
    return;
  }
  console.log('✅ Super Admin created: devansh@brandbucket.com');

  // Seed default brands
  const { error: brandError } = await supabase.from('brands').upsert([
    { id: 'brand_forya', code: 'FORYA', name: 'Forya', color: '#10b981', is_active: true },
    { id: 'brand_peesafe', code: 'PEESAFE', name: 'Pee Safe', color: '#8b5cf6', is_active: true },
    { id: 'brand_furr', code: 'FURR', name: 'FURR', color: '#7c3aed', is_active: true },
    { id: 'brand_renee', code: 'RENEE', name: 'Renee', color: '#ec4899', is_active: true },
  ]);

  if (brandError) {
    console.error('Failed to seed brands:', brandError);
    return;
  }
  console.log('✅ Brands seeded: Forya, Pee Safe, FURR, Renee');

  console.log('\n🎉 Done! Login with:');
  console.log('   Email: devansh@brandbucket.com');
  console.log('   Password: BrandBucket@2083');
  console.log('\n⚠️  CHANGE YOUR PASSWORD after first login!');
}

seed();
