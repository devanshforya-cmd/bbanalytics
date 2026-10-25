import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { getAssignedBrandCodes, getScope, hasAccess, isSuperAdmin } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { user } = auth;
  const assigned = getAssignedBrandCodes(user);
  const restrictBrands = !assigned.includes('ALL');
  const syncErrors: string[] = [];

  const read = async (table: string, allowed: boolean, columns = '*') => {
    if (!allowed) return [];
    const { data, error } = await supabaseAdmin.from(table).select(columns).limit(500);
    if (error) {
      console.error(`Sync query failed for ${table}:`, error.message);
      syncErrors.push(table);
      return [];
    }
    return data || [];
  };

  const mayReadSettings = hasAccess(user, 'settings');
  const mayReadUsers = mayReadSettings || hasAccess(user, 'staff_scorecards');
  const mayResolveChequeBrands = restrictBrands && hasAccess(user, 'cheque_tracker');
  const [usersRaw, brandsRaw, distributors, branches, retailers, productsRaw, ordersRaw, chequesRaw] = await Promise.all([
    read('users', mayReadUsers,
      mayReadSettings
        ? 'id,full_name,name,email,phone,role,is_super_admin,duty_status,is_active,active,assigned_brands,territory,assigned_territory,reports_to_id,permissions,custom_permissions,calendar_preference'
        : 'id,full_name,name,role,duty_status,is_active,active,reports_to_id'),
    read('brands', ['settings', 'products', 'beat_plans', 'stores', 'orderflow', 'dashboard'].some((feature) => hasAccess(user, feature))),
    read('distributors', hasAccess(user, 'distributors') || hasAccess(user, 'dispatches')),
    read('branches', hasAccess(user, 'distributors') || hasAccess(user, 'stores') || hasAccess(user, 'dispatches') || mayResolveChequeBrands),
    read('retailers', hasAccess(user, 'stores') || hasAccess(user, 'beat_plans') || mayResolveChequeBrands),
    read('products', hasAccess(user, 'products')),
    read('orders', hasAccess(user, 'orderflow')),
    read('cheques', hasAccess(user, 'cheque_tracker')),
  ]);

  let users = usersRaw;
  if (!hasAccess(user, 'settings')) {
    const scope = getScope(user, 'staff_scorecards');
    if (scope === 'OWN') users = usersRaw.filter((row: any) => row.id === user.id);
    if (scope === 'TEAM') users = usersRaw.filter((row: any) => row.id === user.id || row.reports_to_id === user.id);
  }
  const brandCodeById = new Map(brandsRaw.map((row: any) => [row.id, String(row.code || '').trim().toUpperCase()]));
  const brandCodeFor = (row: any) => String(
    row.brand_code || row.brandCode || brandCodeById.get(row.brand_id || row.brandId) || ''
  ).trim().toUpperCase();
  if (restrictBrands) {
    const allowedCodes = new Set(assigned);
    const matchesBrands = (values: unknown) =>
      Array.isArray(values) && values.some((code) => allowedCodes.has(String(code).trim().toUpperCase()));
    brandsRaw.splice(0, brandsRaw.length, ...brandsRaw.filter((row: any) => allowedCodes.has(String(row.code || '').toUpperCase())));
    productsRaw.splice(0, productsRaw.length, ...productsRaw.filter((row: any) => allowedCodes.has(brandCodeFor(row))));
    retailers.splice(0, retailers.length, ...retailers.filter((row: any) =>
      matchesBrands(row.brands_stocked || row.brandsStocked)
    ));
    branches.splice(0, branches.length, ...branches.filter((row: any) =>
      matchesBrands(row.brands_available || row.brandsAvailable)
    ));
    distributors.splice(0, distributors.length, ...distributors.filter((row: any) =>
      matchesBrands(row.brands_carried || row.brandsCarried)
    ));
  }

  let orders = ordersRaw;
  if (restrictBrands) orders = orders.filter((row: any) => assigned.includes(brandCodeFor(row)));
  if (getScope(user, 'orderflow') === 'OWN' && !isSuperAdmin(user)) {
    orders = orders.filter((row: any) => row.officer_id === user.id || row.created_by === user.id);
  }

  let cheques = chequesRaw;
  if (restrictBrands) {
    // Legacy cheques are linked to a store, not a brand column; resolve their store brands server-side.
    const allowedStoreIds = new Set([
      ...retailers.map((row: any) => row.id),
      ...branches.map((row: any) => row.id),
    ]);
    cheques = cheques.filter((row: any) => allowedStoreIds.has(row.entity_id || row.entityId));
  }
  if (getScope(user, 'cheque_tracker') === 'OWN' && !isSuperAdmin(user)) {
    cheques = cheques.filter((row: any) => row.officer_id === user.id || row.officer_name === user.fullName);
  }
  const brandCodesByStore = new Map<string, string[]>([
    ...retailers.map((row: any) => [row.id, row.brands_stocked || row.brandsStocked || []] as [string, string[]]),
    ...branches.map((row: any) => [row.id, row.brands_available || row.brandsAvailable || []] as [string, string[]]),
  ]);
  const chequesWithVisibleBrands = cheques.map((row: any) => ({
    ...row,
    brand_codes: row.brand_code
      ? [row.brand_code]
      : brandCodesByStore.get(row.entity_id || row.entityId) || [],
  }));

  return NextResponse.json({
    success: true,
    data: {
      users,
      brands: brandsRaw,
      distributors: hasAccess(user, 'distributors') || hasAccess(user, 'dispatches') ? distributors : [],
      branches: hasAccess(user, 'distributors') || hasAccess(user, 'stores') || hasAccess(user, 'dispatches') ? branches : [],
      retailers: hasAccess(user, 'stores') || hasAccess(user, 'beat_plans') ? retailers : [],
      products: productsRaw,
      orders,
      cheques: chequesWithVisibleBrands,
    },
    errors: syncErrors,
  });
}
