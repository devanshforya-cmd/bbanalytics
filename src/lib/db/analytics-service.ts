import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { SeasonalPattern, Holiday, Task } from '../types';

let inMemoryTasks: Task[] = [];
let inMemorySeasonalPatterns: SeasonalPattern[] = [];
let inMemoryHolidays: Holiday[] = [];

export async function fetchTasksFromSupabase(): Promise<Task[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client.from('tasks').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchTasks error:', error.message);
      return inMemoryTasks;
    }
    if (data) {
      inMemoryTasks = data as Task[];
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
  inMemoryTasks.unshift(task);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('tasks').upsert(task);
  } catch (e) {
    console.warn('Supabase addTask error:', e);
  }
  return task;
}

export function getSeasonalPatterns(): SeasonalPattern[] {
  return inMemorySeasonalPatterns;
}

export function getHolidays(): Holiday[] {
  return inMemoryHolidays;
}
