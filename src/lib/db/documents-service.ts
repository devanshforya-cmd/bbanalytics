import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { HandoverDocument } from '../types';

let inMemoryDocuments: HandoverDocument[] = [];

export async function fetchDocumentsFromSupabase(): Promise<HandoverDocument[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client.from('handover_documents').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchDocuments error:', error.message);
      return inMemoryDocuments;
    }
    if (data) {
      inMemoryDocuments = data as HandoverDocument[];
    }
  } catch (err) {
    console.warn('Supabase fetchDocuments error:', err);
  }
  return inMemoryDocuments;
}

export function getDocuments(officerId?: string): HandoverDocument[] {
  if (officerId) {
    return inMemoryDocuments.filter((d) => d.officerId === officerId);
  }
  return inMemoryDocuments;
}

export function getDocumentById(id: string): HandoverDocument | undefined {
  return inMemoryDocuments.find((d) => d.id === id);
}

export async function addDocument(doc: HandoverDocument): Promise<HandoverDocument> {
  inMemoryDocuments.unshift(doc);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('handover_documents').upsert(doc);
  } catch (e) {
    console.warn('Supabase addDocument error:', e);
  }
  return doc;
}

export async function updateDocument(id: string, updates: Partial<HandoverDocument>): Promise<HandoverDocument | undefined> {
  const item = inMemoryDocuments.find((d) => d.id === id);
  if (item) {
    Object.assign(item, updates);
    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      await client.from('handover_documents').update(updates).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateDocument error:', e);
    }
  }
  return item;
}
