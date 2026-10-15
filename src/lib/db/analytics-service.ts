import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { SeasonalPattern, Holiday, Task } from '../types';

let inMemoryTasks: Task[] = [];
let inMemorySeasonalPatterns: SeasonalPattern[] = [];
let inMemoryHolidays: Holiday[] = [];

export async function fetchTasksFromSupabase(): Promise<Task[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchTasks error:', error.message);
      return inMemoryTasks;
    }

    if (data) {
      inMemoryTasks = data.map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description || '',
        assignedTo: row.assigned_to_id || row.assigned_to || '',
        assignedToName: row.assigned_to_name || 'Assigned Officer',
        createdBy: row.created_by || 'Admin',
        priority: row.priority || 'MEDIUM',
        dueDateBs: row.due_date_bs || '',
        dueDateAd: row.due_date_ad || '',
        relatedTo: row.related_to || '',
        relatedId: row.related_entity_id || row.related_id,
        relatedEntityType: row.related_entity_type || 'STORE',
        status: row.status || 'PENDING',
        autoCreated: !!row.auto_created,
        createdAt: row.created_at || new Date().toISOString(),
      })) as Task[];
    }
  } catch (err) {
    console.warn('Supabase fetchTasks error:', err);
  }
  return inMemoryTasks;
}

export function getTasks(assignedToId?: string): Task[] {
  if (assignedToId) {
    return inMemoryTasks.filter((t) => t.assignedTo === assignedToId);
  }
  return inMemoryTasks;
}

export async function addTask(task: Task): Promise<Task> {
  // Prepend in memory
  inMemoryTasks = [task, ...inMemoryTasks.filter((t) => t.id !== task.id)];

  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const payload = {
      id: task.id,
      title: task.title,
      description: task.description || null,
      assigned_to_id: task.assignedTo || null,
      assigned_to_name: task.assignedToName || null,
      priority: task.priority || 'MEDIUM',
      status: task.status || 'PENDING',
      due_date_bs: task.dueDateBs || '2083-05-28',
      due_date_ad: task.dueDateAd || new Date().toISOString().split('T')[0],
      related_entity_type: task.relatedEntityType || 'STORE',
      related_entity_id: task.relatedId || null,
      created_at: task.createdAt || new Date().toISOString(),
    };
    await client.from('tasks').upsert(payload);
  } catch (e) {
    console.warn('Supabase addTask error:', e);
  }
  return task;
}

export async function updateTaskInSupabase(taskId: string, updates: Partial<Task>): Promise<void> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const payload: Record<string, any> = {};
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.priority !== undefined) payload.priority = updates.priority;
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.assignedTo !== undefined) payload.assigned_to_id = updates.assignedTo;
    if (updates.assignedToName !== undefined) payload.assigned_to_name = updates.assignedToName;
    if (updates.dueDateBs !== undefined) payload.due_date_bs = updates.dueDateBs;
    if (updates.dueDateAd !== undefined) payload.due_date_ad = updates.dueDateAd;

    await client.from('tasks').update(payload).eq('id', taskId);
  } catch (e) {
    console.warn('Supabase updateTask error:', e);
  }
}

export function getSeasonalPatterns(): SeasonalPattern[] {
  return inMemorySeasonalPatterns;
}

export function getHolidays(): Holiday[] {
  return inMemoryHolidays;
}
