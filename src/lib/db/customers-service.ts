import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { CustomerProfile, CustomerTimelineEvent } from '../types';

let inMemoryCustomers: CustomerProfile[] = [];
let inMemoryEvents: CustomerTimelineEvent[] = [];

export async function fetchCustomersFromSupabase(): Promise<CustomerProfile[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client.from('customers').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchCustomers error:', error.message);
      return inMemoryCustomers;
    }
    if (data) {
      inMemoryCustomers = data as CustomerProfile[];
    }
  } catch (err) {
    console.warn('Supabase fetchCustomers error:', err);
  }
  return inMemoryCustomers;
}

export function getCustomers(): CustomerProfile[] {
  return inMemoryCustomers;
}

export function getCustomerByPhone(phone: string): CustomerProfile | undefined {
  const clean = phone.replace(/\D/g, '');
  return inMemoryCustomers.find((c) => c.phone.replace(/\D/g, '') === clean);
}

export async function upsertCustomer(customer: CustomerProfile): Promise<CustomerProfile> {
  const idx = inMemoryCustomers.findIndex((c) => c.phone === customer.phone || c.id === customer.id);
  if (idx >= 0) {
    inMemoryCustomers[idx] = { ...inMemoryCustomers[idx], ...customer };
  } else {
    inMemoryCustomers.unshift(customer);
  }
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('customers').upsert(customer);
  } catch (e) {
    console.warn('Supabase upsertCustomer error:', e);
  }
  return customer;
}

export function getCustomerTimeline(phone: string): CustomerTimelineEvent[] {
  const clean = phone.replace(/\D/g, '');
  return inMemoryEvents.filter((e) => e.customerPhone?.replace(/\D/g, '') === clean);
}

export async function addTimelineEvent(event: CustomerTimelineEvent): Promise<CustomerTimelineEvent> {
  inMemoryEvents.unshift(event);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('customer_timeline').upsert(event);
  } catch (e) {
    console.warn('Supabase addTimelineEvent error:', e);
  }
  return event;
}
