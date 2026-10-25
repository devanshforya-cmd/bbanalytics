import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { db } from '@/lib/db/db-service';
import { getTodayBs } from '@/lib/nepali-calendar';
import { getScope } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'tasks', 'VIEW');
  if (auth.response) return auth.response;

  const { user } = auth;
  let tasks = db.getTasks();

  const isOfficer =
    !user.isSuperAdmin &&
    !user.is_super_admin &&
    (user.role === 'SALES_OFFICER' || getScope(user, 'tasks') === 'OWN');

  if (isOfficer) {
    const uName = (user.fullName || '').toLowerCase();
    const uFirst = uName.split(' ')[0] || '';
    tasks = tasks.filter(
      (t) =>
        t.assignedTo === user.id ||
        (t.assignedToName &&
          (t.assignedToName.toLowerCase() === uName ||
            (uFirst.length > 2 && t.assignedToName.toLowerCase().includes(uFirst))))
    );
  }

  return NextResponse.json({ success: true, count: tasks.length, data: tasks });
}

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'tasks', 'CREATE');
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    if (!body.title) {
      return NextResponse.json(
        { success: false, error: 'Task title is required.' },
        { status: 400 }
      );
    }

    const allUsers = db.getUsers();
    const assignedUser = allUsers.find((u) => u.id === body.assignedTo) || auth.user;

    const newTask = db.addTask({
      title: body.title,
      description: body.description || '',
      assignedTo: assignedUser.id,
      assignedToName: assignedUser.fullName || body.assignedToName || 'Assigned Officer',
      createdBy: auth.user.fullName || 'HQ Admin',
      priority: body.priority || 'MEDIUM',
      dueDateBs: body.dueDateBs || getTodayBs(),
      dueDateAd: body.dueDateAd || new Date().toISOString().split('T')[0],
      relatedTo: body.relatedTo || 'Store visit',
      relatedEntityType: body.relatedEntityType || 'STORE',
      status: body.status || 'PENDING',
      autoCreated: !!body.autoCreated,
    });

    return NextResponse.json({ success: true, data: newTask }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create task' },
      { status: 500 }
    );
  }
}
