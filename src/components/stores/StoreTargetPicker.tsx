'use client';

import { useMemo, useState } from 'react';
import SearchSelect from '@/components/common/SearchSelect';
import { db } from '@/lib/db/db-service';
import { targetOptions, toTarget, type StoreTarget, type TargetOption } from '@/lib/store-target';

/**
 * Pick who something is for. Search any store, distributor, MT chain or outlet. For a chain (or one
 * of its outlets) choose whether it is for the whole chain or for one outlet.
 */
export default function StoreTargetPicker({ value, onChange, label = 'Store *', id, options: given, error }: {
  value: StoreTarget | null;
  onChange: (target: StoreTarget | null) => void;
  label?: string;
  id?: string;
  /** Defaults to every store the user can see. */
  options?: TargetOption[];
  error?: string;
}) {
  const options = useMemo(() => given || targetOptions(db.getRetailers(), db.getBranches(), db.getDistributors()), [given]);
  // The chain the user is working in, whether they picked the chain or one of its outlets.
  const chainOf = (target: StoreTarget | null) => target?.chainId || null;
  const [chainId, setChainId] = useState<string | null>(() => chainOf(value));
  const [scope, setScope] = useState<'CHAIN' | 'OUTLET'>(() => (value?.entityType === 'BRANCH' ? 'OUTLET' : 'CHAIN'));

  const chain = chainId ? options.find((o) => o.value === chainId && o.type === 'DISTRIBUTOR') : undefined;
  const outlets = chainId ? options.filter((o) => o.type === 'BRANCH' && o.chainId === chainId) : [];
  const searchValue = chainId ? chainId : value?.entityId || '';
  // Outlets are found by searching too; picking one lands on its chain with that outlet chosen.
  const searchOptions = options;

  const pick = (picked: string) => {
    const option = options.find((o) => o.value === picked);
    if (!option) { setChainId(null); onChange(null); return; }
    if (option.type === 'BRANCH' && option.chainId) {
      setChainId(option.chainId); setScope('OUTLET'); onChange(toTarget(option));
    } else if (option.isChain) {
      setChainId(option.value); setScope('CHAIN'); onChange(toTarget(option));
    } else {
      setChainId(null); onChange(toTarget(option));
    }
  };
  const chooseScope = (next: 'CHAIN' | 'OUTLET') => {
    setScope(next);
    if (next === 'CHAIN') onChange(chain ? toTarget(chain) : null);
    else onChange(value?.entityType === 'BRANCH' ? value : outlets.length === 1 ? toTarget(outlets[0]) : null);
  };

  const segment = (on: boolean) => `flex-1 rounded-lg px-3 py-2 text-left text-xs transition ${on ? 'bg-white font-bold text-slate-900 shadow-xs' : 'font-semibold text-slate-600 hover:text-slate-900'}`;
  return (
    <div className="space-y-2">
      <SearchSelect id={id} label={label} options={searchOptions.map((o) => ({ value: o.value, label: o.label, hint: o.hint, group: o.group }))}
        value={chain ? chain.value : searchValue} onChange={pick} placeholder="Type a store, chain, outlet or distributor" allowClear clearLabel="Clear" />
      {chain && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <div role="radiogroup" aria-label={`Who is this for at ${chain.label}?`} className="flex gap-1 rounded-xl bg-slate-200/60 p-1">
            <button type="button" role="radio" aria-checked={scope === 'CHAIN'} onClick={() => chooseScope('CHAIN')} className={segment(scope === 'CHAIN')}>
              Whole chain<span className="block text-[11px] font-normal text-slate-500">Head office of {chain.label}</span>
            </button>
            <button type="button" role="radio" aria-checked={scope === 'OUTLET'} onClick={() => chooseScope('OUTLET')} disabled={!outlets.length} className={`${segment(scope === 'OUTLET')} disabled:opacity-50`}>
              One outlet<span className="block text-[11px] font-normal text-slate-500">{outlets.length ? `${outlets.length} ${outlets.length === 1 ? 'outlet' : 'outlets'}` : 'No outlets yet'}</span>
            </button>
          </div>
          {scope === 'OUTLET' && (
            <SearchSelect label="Outlet *" options={outlets.map((o) => ({ value: o.value, label: o.label, hint: o.hint }))}
              value={value?.entityType === 'BRANCH' ? value.entityId : ''} onChange={(v) => onChange(toTarget(outlets.find((o) => o.value === v)))} placeholder={`Search ${chain.label} outlets`} />
          )}
        </div>
      )}
      {error && <p className="text-[11px] font-semibold text-rose-700">{error}</p>}
    </div>
  );
}
