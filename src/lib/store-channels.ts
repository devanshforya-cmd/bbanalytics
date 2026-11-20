/**
 * The four kinds of store account, in the words the team uses.
 *
 * - MT: modern trade chains (Bhatbhateni, Salesberry…). A head office with outlets; supplied by us directly.
 * - SAMT: a single semi-modern-trade store.
 * - Distributor: buys in bulk and supplies stores.
 * - Retail store: a single general-trade shop.
 *
 * SAMT, distributors and retail stores should be linked to the distributor that supplies them.
 * It is not required, but stores without one are flagged so the gap is visible.
 * The stored values keep their older names so existing records stay valid.
 */
import type { StoreType } from './types';

export interface StoreChannel {
  type: StoreType;
  label: string;
  description: string;
  /** Kept in the distributors list (head office) rather than the stores list. */
  account: 'distributors' | 'retailers';
  /** Should name the distributor that supplies it. */
  wantsDistributor: boolean;
  /** Can have outlets under it. */
  hasOutlets: boolean;
}

export const STORE_CHANNELS: StoreChannel[] = [
  { type: 'CHAIN_STORE', label: 'MT', description: 'Modern trade chain with one or more outlets. Supplied by us directly.', account: 'distributors', wantsDistributor: false, hasOutlets: true },
  { type: 'SAMT', label: 'SAMT', description: 'Single semi-modern-trade store.', account: 'retailers', wantsDistributor: true, hasOutlets: false },
  { type: 'DISTRIBUTOR', label: 'Distributor', description: 'Buys in bulk and supplies stores.', account: 'distributors', wantsDistributor: true, hasOutlets: false },
  { type: 'STANDALONE_RETAILER', label: 'Retail store', description: 'Single general-trade shop.', account: 'retailers', wantsDistributor: true, hasOutlets: false },
];

export function storeChannel(type?: string | null): StoreChannel {
  return STORE_CHANNELS.find((c) => c.type === type) || STORE_CHANNELS[3];
}

export const channelLabel = (type?: string | null) => storeChannel(type).label;

/** The channel a stored account belongs to, reading older records too. */
export function channelOfDistributor(d: { storeType?: StoreType; type?: string }): StoreType {
  if (d.storeType === 'CHAIN_STORE' || d.storeType === 'DISTRIBUTOR') return d.storeType;
  return d.type === 'Retail Chain' || d.type === 'Pharmacy Chain' ? 'CHAIN_STORE' : 'DISTRIBUTOR';
}
export function channelOfRetailer(r: { storeType?: StoreType }): StoreType {
  return r.storeType === 'SAMT' ? 'SAMT' : 'STANDALONE_RETAILER';
}

/** True when this account should name its distributor but does not. */
export function missingDistributor(type: StoreType, distributorId?: string | null): boolean {
  return storeChannel(type).wantsDistributor && !distributorId;
}
