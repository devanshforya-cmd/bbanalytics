/**
 * Who a cheque, document or order is for: one store, a distributor, a whole MT chain (its head
 * office), or one outlet of a chain. Records for a whole chain are filed under the chain's id, so
 * they appear on the chain's page (head office) and not on any single outlet.
 */
import type { Branch, Distributor, Retailer } from './types';
import { channelLabel, channelOfDistributor, channelOfRetailer } from './store-channels';

export type StoreTargetType = 'RETAILER' | 'BRANCH' | 'DISTRIBUTOR';

export interface StoreTarget {
  entityType: StoreTargetType;
  entityId: string;
  name: string;
  /** For an outlet: its chain. For a whole chain: the chain itself. */
  chainId?: string;
  chainName?: string;
}

export interface TargetOption {
  value: string;
  label: string;
  hint?: string;
  group: string;
  type: StoreTargetType;
  /** Chains: their outlets. Outlets: their chain. */
  chainId?: string;
  chainName?: string;
  isChain?: boolean;
}

export function targetOptions(retailers: Retailer[], branches: Branch[], distributors: Distributor[]): TargetOption[] {
  const options: TargetOption[] = [];
  const outletCount = (id: string) => branches.filter((b) => b.distributorId === id).length;
  for (const d of distributors) {
    const count = outletCount(d.id);
    const isChain = count > 0 || channelOfDistributor(d) === 'CHAIN_STORE';
    options.push({ value: d.id, label: d.name, type: 'DISTRIBUTOR', isChain, chainId: isChain ? d.id : undefined, chainName: isChain ? d.name : undefined,
      group: isChain ? 'MT chains' : 'Distributors', hint: [isChain ? `Chain · ${count} ${count === 1 ? 'outlet' : 'outlets'}` : 'Distributor', d.city].filter(Boolean).join(' · ') });
  }
  for (const b of branches) {
    options.push({ value: b.id, label: b.name, type: 'BRANCH', chainId: b.distributorId, chainName: b.distributorName, group: 'MT outlets',
      hint: [`Outlet of ${b.distributorName || 'a chain'}`, b.area || b.city].filter(Boolean).join(' · ') });
  }
  for (const r of retailers) {
    options.push({ value: r.id, label: r.name, type: 'RETAILER', group: channelLabel(channelOfRetailer(r)), hint: [channelLabel(channelOfRetailer(r)), r.area, r.city].filter(Boolean).join(' · ') });
  }
  const order = ['MT chains', 'MT outlets', 'SAMT', 'Retail store', 'Distributors'];
  return options.sort((a, b) => (order.indexOf(a.group) + 1 || 99) - (order.indexOf(b.group) + 1 || 99) || a.label.localeCompare(b.label));
}

export function toTarget(option: TargetOption | undefined): StoreTarget | null {
  if (!option) return null;
  return { entityType: option.type, entityId: option.value, name: option.label, ...(option.chainId ? { chainId: option.chainId, chainName: option.chainName } : {}) };
}

/** "Whole chain: Bhatbhateni" or "Bhatbhateni Kupondole (Bhatbhateni)" — how a target reads in lists. */
export function targetLabel(target: Pick<StoreTarget, 'entityType' | 'entityId' | 'name' | 'chainId' | 'chainName'>): string {
  if (target.entityType === 'DISTRIBUTOR' && target.chainId === target.entityId) return `${target.name} (whole chain)`;
  if (target.entityType === 'BRANCH' && target.chainName && !target.name.toLowerCase().includes(target.chainName.toLowerCase())) return `${target.name} (${target.chainName})`;
  return target.name;
}
