import { NextResponse } from 'next/server';
import { requireAuth, requireFeatureAccess } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { canAccessBrand, hasAccess } from '@/lib/permissions';
import { isLocalPreviewAuthEnabled, LOCAL_PREVIEW_USER } from '@/lib/local-preview-auth';

export const dynamic = 'force-dynamic';

const isConfigured = () => Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

function mapBrand(row: any) {
  const isActive = row.is_active !== false && row.active !== false;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    color: row.color || '#3b82f6',
    description: row.description || '',
    logoUrl: row.logo_url || undefined,
    isActive,
    status: isActive ? 'ACTIVE' : 'ARCHIVED',
    category: row.category || undefined,
    principalCompany: row.principal_company || undefined,
  };
}

function unavailable(error?: { code?: string; message?: string } | null) {
  const message = process.env.NODE_ENV === 'development' && error
    ? `Brand storage error${error.code ? ` ${error.code}` : ''}: ${error.message || 'Unknown database error'}`
    : 'Brand storage is unavailable. Check Supabase configuration and the brands table.';
  return NextResponse.json(
    { success: false, error: message },
    { status: 503 }
  );
}

function isMissingColumn(error: { code?: string; message?: string } | null) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /column .* does not exist|could not find .* column/i.test(error?.message || '');
}

function isLocalPreviewUser(user: { id: string }) {
  return isLocalPreviewAuthEnabled() && user.id === LOCAL_PREVIEW_USER.id;
}

function localPreviewOnly() {
  return NextResponse.json({
    success: false,
    localPreviewOnly: true,
    error: 'Local preview mode: this change will be saved in this browser only, not to Supabase.',
  }, { status: 503 });
}

async function getBrandUsage(code: string) {
  const brandResult = await supabaseAdmin.from('brands').select('id').eq('code', code).maybeSingle();
  if (brandResult.error) return { counts: {}, error: brandResult.error };
  if (!brandResult.data) {
    return { counts: { orders: 0, products: 0, stockCounts: 0, feedback: 0, returns: 0 }, error: null };
  }
  const brandId = brandResult.data.id;

  const tables = [
    ['orders', 'orders'],
    ['products', 'products'],
    ['stock_count_items', 'stockCounts'],
    ['feedback_entries', 'feedback'],
    ['returns', 'returns'],
  ] as const;
  const results = await Promise.all(tables.map(async ([table, key]) => {
    const result = await supabaseAdmin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId);
    return { key, count: result.count || 0, error: result.error };
  }));
  const error = results.find((result) => result.error)?.error;
  return {
    counts: Object.fromEntries(results.map(({ key, count }) => [key, count])),
    error,
  };
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (isLocalPreviewUser(auth.user)) return localPreviewOnly();

  const url = new URL(request.url);
  const checkDelete = url.searchParams.get('checkDelete');
  if (checkDelete) {
    const permission = await requireFeatureAccess(request, 'settings', 'VIEW');
    if (permission.response) return permission.response;
    if (!isConfigured()) return unavailable();
    const { counts, error } = await getBrandUsage(checkDelete.trim().toUpperCase());
    if (error) return unavailable(error);
    const canDelete = Object.values(counts).every((count) => count === 0);
    return NextResponse.json({ success: true, canDelete, counts });
  }

  if (!['settings', 'products', 'beat_plans', 'dashboard'].some((feature) => hasAccess(auth.user, feature))) {
    return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
  }
  if (!isConfigured()) return unavailable();

  const { data, error } = await supabaseAdmin.from('brands').select('*').order('name', { ascending: true });
  if (error) {
    console.error('Brand list query failed:', error.message);
    return unavailable(error);
  }

  let brands = (data || []).map(mapBrand);
  if (!hasAccess(auth.user, 'settings')) {
    brands = brands.filter((brand: any) => canAccessBrand(auth.user, brand.code));
    brands = brands.filter((brand: any) => brand.isActive);
  }

  return NextResponse.json({ success: true, data: brands });
}

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'settings', 'CREATE');
  if (auth.response) return auth.response;
  if (isLocalPreviewUser(auth.user)) return localPreviewOnly();
  if (!isConfigured()) return unavailable();

  try {
    const body = await request.json();
    const code = String(body.code || '').trim().toUpperCase();
    const name = String(body.name || '').trim();
    if (!name || !/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(code)) {
      return NextResponse.json({ success: false, error: 'A valid brand name and code are required.' }, { status: 400 });
    }

    const fullBrand = {
      code,
      name,
      color: body.color || '#3b82f6',
      description: body.description || '',
      category: body.category || null,
      principal_company: body.principalCompany || null,
      logo_url: body.logoUrl || null,
      is_active: body.isActive !== false,
      updated_at: new Date().toISOString(),
    };

    // Older deployments may not have a UNIQUE constraint on `code`, which makes
    // PostgREST upsert(onConflict: 'code') fail. Look up first, then update or
    // insert; a normalized unique index migration handles concurrent requests.
    const { data: existingRows, error: lookupError } = await supabaseAdmin
      .from('brands')
      .select('id, code')
      .limit(1000);
    if (lookupError) {
      console.error('Brand lookup failed:', lookupError.code, lookupError.message);
      return unavailable(lookupError);
    }

    const matches = (existingRows || []).filter((row: any) => String(row.code || '').trim().toUpperCase() === code);
    if (matches.length > 1) {
      return NextResponse.json({
        success: false,
        error: `More than one brand uses code ${code}. Resolve duplicate brand codes before saving.`,
      }, { status: 409 });
    }

    const existingId = matches[0]?.id;
    const write = async (values: Record<string, unknown>) => {
      const query = existingId
        ? supabaseAdmin.from('brands').update(values).eq('id', existingId)
        : supabaseAdmin.from('brands').insert(values);
      return query.select('*').single();
    };

    const candidates: Record<string, unknown>[] = [
      fullBrand,
      { code, name, logo_url: body.logoUrl || null, is_active: body.isActive !== false },
      { code, name, logo_url: body.logoUrl || null, active: body.isActive !== false },
      { code, name, is_active: body.isActive !== false },
      { code, name, active: body.isActive !== false },
      { code, name },
    ];
    let saved: any = null;
    let saveError: any = null;
    for (const values of candidates) {
      const result = await write(values);
      if (!result.error) {
        saved = result.data;
        saveError = null;
        break;
      }
      saveError = result.error;
      if (!isMissingColumn(result.error)) break;
    }

    if (saveError || !saved) {
      console.error('Brand save failed:', saveError?.code, saveError?.message);
      const message = process.env.NODE_ENV === 'development' && saveError
        ? `Brand could not be saved (${saveError.code || 'database error'}): ${saveError.message || 'Unknown database error'}`
        : 'Brand could not be saved. Check Supabase access, the brands table, and the brand code.';
      return NextResponse.json({ success: false, error: message }, { status: saveError?.code === '23505' ? 409 : 503 });
    }
    return NextResponse.json({ success: true, data: mapBrand(saved) }, { status: existingId ? 200 : 201 });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid brand payload.' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireFeatureAccess(request, 'settings', 'EDIT');
  if (auth.response) return auth.response;
  if (isLocalPreviewUser(auth.user)) return localPreviewOnly();
  if (!isConfigured()) return unavailable();

  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ success: false, error: 'Brand ID is required.' }, { status: 400 });
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.code !== undefined) updates.code = String(body.code).trim().toUpperCase();
    if (body.color !== undefined) updates.color = body.color;
    if (body.description !== undefined) updates.description = body.description;
    if (body.category !== undefined) updates.category = body.category || null;
    if (body.principalCompany !== undefined) updates.principal_company = body.principalCompany || null;
    if (body.logoUrl !== undefined) updates.logo_url = body.logoUrl || null;
    if (body.isActive !== undefined) updates.is_active = body.isActive;
    let { data, error } = await supabaseAdmin.from('brands').update(updates).eq('id', body.id).select('*').maybeSingle();
    if (error && isMissingColumn(error)) {
      const legacyUpdates = Object.fromEntries(
        Object.entries(updates).filter(([key]) => ['name', 'code', 'logo_url', 'is_active'].includes(key))
      );
      if (Object.keys(legacyUpdates).length > 0) {
        ({ data, error } = await supabaseAdmin.from('brands').update(legacyUpdates).eq('id', body.id).select('*').maybeSingle());
      }
    }
    if (error && isMissingColumn(error) && body.isActive !== undefined) {
      const legacyUpdates = Object.fromEntries(
        Object.entries(updates).filter(([key]) => ['name', 'code', 'logo_url'].includes(key))
      );
      legacyUpdates.active = body.isActive;
      ({ data, error } = await supabaseAdmin.from('brands').update(legacyUpdates).eq('id', body.id).select('*').maybeSingle());
    }
    if (error || !data) return NextResponse.json({ success: false, error: 'Brand could not be updated.' }, { status: error ? 400 : 404 });
    return NextResponse.json({ success: true, data: mapBrand(data) });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid brand payload.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireFeatureAccess(request, 'settings', 'DELETE');
  if (auth.response) return auth.response;
  if (isLocalPreviewUser(auth.user)) return localPreviewOnly();
  if (!isConfigured()) return unavailable();

  try {
    const body = await request.json();
    if (!body.id || !body.code) return NextResponse.json({ success: false, error: 'Brand ID and code are required.' }, { status: 400 });
    const { counts, error: usageError } = await getBrandUsage(String(body.code).toUpperCase());
    if (usageError) return unavailable();
    if (Object.values(counts).some((count) => count > 0)) {
      return NextResponse.json({ success: false, error: 'Brand has linked records and cannot be deleted.', counts }, { status: 409 });
    }
    const { error } = await supabaseAdmin.from('brands').delete().eq('id', body.id);
    if (error) return NextResponse.json({ success: false, error: 'Brand could not be deleted.' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid delete request.' }, { status: 400 });
  }
}
