import { NextResponse } from 'next/server';
import { requireFeatureAccess } from '@/lib/auth-guard';
import { openServerWorkspace } from '@/lib/db/server-workspace';
import { getTodayBs } from '@/lib/nepali-calendar';
import { dateAd, allowedValue, ApiInputError, apiFailure, readBody, requiredText, scopeOfficerIds } from '../_workspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireFeatureAccess(request, 'tasks', 'VIEW');
  if (auth.response) return auth.response;
  try {
    const { db } = await openServerWorkspace(auth.user);
    const ids = scopeOfficerIds(db, auth.user, 'tasks');
    const tasks = db.getTasks().filter(task => ids === null || ids.has(task.assignedTo));
    return NextResponse.json({ success: true, count: tasks.length, data: tasks });
  } catch (error) { return apiFailure(error, 'Failed to load tasks.'); }
}

export async function POST(request: Request) {
  const auth = await requireFeatureAccess(request, 'tasks', 'CREATE');
  if (auth.response) return auth.response;
  try {
    const body = await readBody(request);
    const title = requiredText(body.title, 'title');
    const assignedTo = requiredText(body.assignedTo, 'assignedTo');
    const { db, commit } = await openServerWorkspace(auth.user);
    const assignedUser = db.getUsers().find(user => user.id === assignedTo && user.active !== false && user.is_active !== false);
    if (!assignedUser) throw new ApiInputError('The selected assignee does not exist or is inactive.');
    const ids = scopeOfficerIds(db, auth.user, 'tasks');
    if (ids !== null && !ids.has(assignedTo)) throw new ApiInputError('Not found.', 404);
    const task = {
      title, description: typeof body.description === 'string' ? body.description : '',
      assignedTo: assignedUser.id, assignedToName: assignedUser.fullName,
      createdBy: auth.user.fullName, createdById: auth.user.id,
      priority: allowedValue(body.priority, ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const, 'MEDIUM', 'priority'),
      dueDateBs: body.dueDateBs || getTodayBs(), dueDateAd: dateAd(body.dueDateAd, 'dueDateAd', new Date().toISOString().slice(0, 10)),
      relatedTo: typeof body.relatedTo === 'string' ? body.relatedTo : undefined,
      relatedId: typeof body.relatedId === 'string' ? body.relatedId : undefined,
      relatedEntityType: body.relatedEntityType === undefined ? undefined : allowedValue(body.relatedEntityType, ['STORE', 'CHEQUE', 'COMPLAINT', 'CALL'] as const, 'STORE', 'relatedEntityType'),
      status: allowedValue(body.status, ['OPEN', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'] as const, 'PENDING', 'status'),
      autoCreated: false,
    };
    const created = db.addTask(task);
    await commit();
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) { return apiFailure(error, 'Failed to create task.'); }
}
