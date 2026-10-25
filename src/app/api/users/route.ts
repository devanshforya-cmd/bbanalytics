import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';
import { hashPassword } from '@/lib/password-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'settings', 'VIEW');
  if (auth.response) return auth.response;

  const users = db.getUsers();
  // Strip passwords and hashes from response (Fix 56a)
  const safeUsers = users.map(({ password, ...rest }) => rest);

  return NextResponse.json({ success: true, count: safeUsers.length, data: safeUsers });
}

export async function POST(request: Request) {
  // Only SUPER_ADMIN can create/modify users
  const auth = await requireFeatureAccess(request, 'settings', 'CREATE');
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    if (!body.fullName || !body.phone || !body.role) {
      return NextResponse.json(
        { success: false, error: 'Missing required user fields: fullName, phone, role.' },
        { status: 400 }
      );
    }

    // Hash password if supplied
    let hashedPassword = undefined;
    if (body.password) {
      hashedPassword = await hashPassword(body.password);
    }

    const created = db.createUser({
      ...body,
      password: hashedPassword,
    });

    const { password, ...safeUser } = created;
    return NextResponse.json({ success: true, data: safeUser }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to create user' }, { status: 500 });
  }
}
