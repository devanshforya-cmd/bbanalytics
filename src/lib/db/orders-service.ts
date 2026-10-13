import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { Order, SecondaryOrder, DeliveryFailure, ReturnEntry } from '../types';

let inMemoryOrders: Order[] = [];
let inMemorySecondaryOrders: SecondaryOrder[] = [];
let inMemoryDeliveryFailures: DeliveryFailure[] = [];
let inMemoryReturns: ReturnEntry[] = [];

export async function fetchOrdersFromSupabase(): Promise<Order[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client.from('orders').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchOrders error, returning local state:', error.message);
      return inMemoryOrders;
    }
    if (data) {
      inMemoryOrders = data as Order[];
      return inMemoryOrders;
    }
  } catch (err) {
    console.warn('Supabase unavailable:', err);
  }
  return inMemoryOrders;
}

export function getOrders(brandCode?: string): Order[] {
  let list = inMemoryOrders;
  if (brandCode && brandCode !== 'ALL') {
    list = list.filter((o) => o.brandCode === brandCode);
  }
  return list;
}

export function getOrderById(id: string): Order | undefined {
  return inMemoryOrders.find((o) => o.id === id || o.orderNumber === id || (o as any).orderNo === id);
}

export async function addOrder(order: Order): Promise<Order> {
  inMemoryOrders.unshift(order);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('orders').upsert({
      id: order.id,
      order_no: order.orderNumber || (order as any).orderNo,
      platform: order.platform,
      order_type: order.orderType,
      brand_code: order.brandCode,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      items: order.items,
      total_amount: order.totalAmount,
      delivery_status: order.status || (order as any).deliveryStatus,
      order_date_bs: order.orderDateBs,
      order_date_ad: order.orderDateAd,
      remarks: order.notes || (order as any).remarks,
    });
  } catch (e) {
    console.warn('Supabase addOrder error:', e);
  }
  return order;
}

export async function updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
  const ord = inMemoryOrders.find((o) => o.id === id);
  if (ord) {
    Object.assign(ord, updates);
    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      await client.from('orders').update(updates).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateOrder error:', e);
    }
  }
  return ord;
}

export function getSecondaryOrders(officerId?: string): SecondaryOrder[] {
  if (officerId) {
    return inMemorySecondaryOrders.filter((s) => s.officerId === officerId);
  }
  return inMemorySecondaryOrders;
}

export async function addSecondaryOrder(order: SecondaryOrder): Promise<SecondaryOrder> {
  inMemorySecondaryOrders.unshift(order);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('secondary_orders').upsert(order);
  } catch (e) {
    console.warn('Supabase addSecondaryOrder error:', e);
  }
  return order;
}

export function getDeliveryFailures(): DeliveryFailure[] {
  return inMemoryDeliveryFailures;
}

export async function addDeliveryFailure(failure: DeliveryFailure): Promise<DeliveryFailure> {
  inMemoryDeliveryFailures.unshift(failure);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('delivery_failures').upsert(failure);
  } catch (e) {
    console.warn('Supabase addDeliveryFailure error:', e);
  }
  return failure;
}

export function getReturns(): ReturnEntry[] {
  return inMemoryReturns;
}

export async function addReturn(ret: ReturnEntry): Promise<ReturnEntry> {
  inMemoryReturns.unshift(ret);
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    await client.from('returns').upsert(ret);
  } catch (e) {
    console.warn('Supabase addReturn error:', e);
  }
  return ret;
}
