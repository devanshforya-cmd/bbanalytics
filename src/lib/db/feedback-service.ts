import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { FeedbackEntry, ReviewCategory } from '../types';

let inMemoryFeedback: FeedbackEntry[] = [];
let inMemoryReviewCategories: ReviewCategory[] = [];

export async function fetchFeedbackFromSupabase(): Promise<FeedbackEntry[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client.from('feedback_entries').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchFeedback error:', error.message);
      return inMemoryFeedback;
    }
    if (data) {
      inMemoryFeedback = data as FeedbackEntry[];
    }
  } catch (err) {
    console.warn('Supabase fetchFeedback error:', err);
  }
  return inMemoryFeedback;
}

export function getFeedback(brandCode?: string): FeedbackEntry[] {
  if (brandCode && brandCode !== 'ALL') {
    return inMemoryFeedback.filter((f) => f.brandCode === brandCode);
  }
  return inMemoryFeedback;
}

export function getFeedbackById(id: string): FeedbackEntry | undefined {
  return inMemoryFeedback.find((f) => f.id === id);
}

export async function addFeedback(feedback: FeedbackEntry): Promise<FeedbackEntry> {
  inMemoryFeedback.unshift(feedback);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('feedback_entries').upsert(feedback);
  } catch (e) {
    console.warn('Supabase addFeedback error:', e);
  }
  return feedback;
}

export async function updateFeedback(id: string, updates: Partial<FeedbackEntry>): Promise<FeedbackEntry | undefined> {
  const item = inMemoryFeedback.find((f) => f.id === id);
  if (item) {
    Object.assign(item, updates);
    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      await client.from('feedback_entries').update(updates).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateFeedback error:', e);
    }
  }
  return item;
}

export function getReviewCategories(): ReviewCategory[] {
  return inMemoryReviewCategories;
}

export async function addReviewCategory(cat: ReviewCategory): Promise<ReviewCategory> {
  inMemoryReviewCategories.push(cat);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('review_categories').upsert(cat);
  } catch (e) {
    console.warn('Supabase addReviewCategory error:', e);
  }
  return cat;
}
