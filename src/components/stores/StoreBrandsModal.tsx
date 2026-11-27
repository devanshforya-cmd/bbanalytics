'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import Portal from '@/components/common/Portal';
import BrandPicker from '@/components/stores/BrandPicker';
import { db } from '@/lib/db/db-service';
import { toast } from '@/components/common/Toast';

export interface BrandsTarget {
  type: 'RETAILER' | 'BRANCH' | 'DISTRIBUTOR';
  id: string;
  name: string;
  codes: string[];
  /** For an MT chain: how many outlets it has. */
  outletCount?: number;
}

/** Change which brands an existing store, outlet, chain or distributor is given. */
export default function StoreBrandsModal({ target, onClose, onSaved }: { target: BrandsTarget; onClose: () => void; onSaved?: () => void }) {
  const brands = db.getBrands('ACTIVE').map((brand) => ({ code: brand.code, name: brand.name }));
  const known = new Set(brands.map((brand) => brand.code));
  // Older stores have no list (= every brand): start from all of them.
  const [codes, setCodes] = useState<string[]>(() => target.codes.length ? target.codes.filter((code) => known.has(code)) : brands.map((brand) => brand.code));
  const [outlets, setOutlets] = useState(false);
  const save = () => {
    try {
      db.setStoreBrands(target.type, target.id, codes, { outlets });
      toast.success(`Brands saved for ${target.name}.`);
      onSaved?.();
      onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Brands not saved.'); }
  };
  return (
    <Portal><div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="store-brands-title">
      <div className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="store-brands-title" className="text-base font-bold text-slate-900">Brands</h3>
            <p className="truncate text-xs text-slate-500">{target.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <BrandPicker brands={brands} value={codes} onChange={setCodes} />
        {target.type === 'DISTRIBUTOR' && !!target.outletCount && (
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs">
            <input type="checkbox" checked={outlets} onChange={(event) => setOutlets(event.target.checked)} className="mt-0.5" />
            <span><span className="font-semibold text-slate-800">Give all {target.outletCount} outlets these brands too</span><span className="block text-slate-500">Leave it off to keep each outlet&apos;s own brands.</span></span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={save} disabled={!codes.length} className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Save brands</button>
        </div>
      </div>
    </div></Portal>
  );
}
