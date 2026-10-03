/**
 * Brand Bucket Command Center — Brands Seeder
 * Fix 59d: Populate verified Brand Bucket principal brands.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const BRANDS = [
  {
    code: 'FORYA',
    name: 'Forya Natural Deodorants',
    category: 'PERSONAL_CARE',
    color: '#10b981',
    description: 'Natural aluminum-free deodorant roll-ons and organic body personal care.',
    principal_company: 'Brand Bucket Nepal',
    active: true,
  },
  {
    code: 'PEE_SAFE',
    name: 'Pee Safe & FURR Hygiene',
    category: 'HYGIENE',
    color: '#8b5cf6',
    description: 'Daily feminine and toilet hygiene sanitizers, menstrual cups, and FURR razors.',
    principal_company: 'Redcliffe Hygiene Pvt. Ltd. (Brand Bucket Distributor)',
    active: true,
  },
  {
    code: 'RENEE',
    name: 'Renee Cosmetics',
    category: 'COSMETICS',
    color: '#f43f5e',
    description: 'Everyday cruelty-free matte lipsticks, FAB 5-in-1, and pH adaptive glosses.',
    principal_company: 'Renee Cosmetics Pvt. Ltd. (Brand Bucket Nepal)',
    active: true,
  },
];

async function seedBrands() {
  console.info('=== Brand Bucket Brand Catalog Seeding ===');

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await supabase
        .from('brands')
        .upsert(BRANDS, { onConflict: 'code' })
        .select();

      if (error) {
        console.error('Failed to upsert Brands in Supabase:', error.message);
      } else {
        console.info(`Successfully registered ${data.length} brands in Supabase database.`);
      }
    } catch (err: any) {
      console.error('Supabase connection failed:', err?.message || err);
    }
  } else {
    console.info('\n[Offline / Mock Mode]: Generated SQL for manual execution:');
    BRANDS.forEach((b) => {
      console.info(`
INSERT INTO brands (code, name, category, color, description, principal_company, active)
VALUES ('${b.code}', '${b.name}', '${b.category}', '${b.color}', '${b.description}', '${b.principal_company}', true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color;
      `);
    });
  }
}

seedBrands().catch((err) => {
  console.error('Fatal error during brand seeding:', err);
  process.exit(1);
});
