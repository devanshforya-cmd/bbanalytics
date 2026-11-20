'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { updateBrand } from '@/lib/db/brands-service';
import { canPerform } from '@/lib/permissions';
import { subBrandIdFor } from '@/lib/sub-brands';
import { toast } from '@/components/common/Toast';

/**
 * Sub-brand for a product, always shown so products can be split (Pee Safe → Furr, Comfort, Domina).
 * People who manage brands can add a sub-brand right here instead of leaving the form.
 */
export default function SubBrandPicker({ id, brandCode, value, onChange, savedValue, selectClassName }: {
  id: string;
  brandCode: string;
  value: string;
  onChange: (value: string) => void;
  /** The product's saved sub-brand, so an archived one still shows. */
  savedValue?: string;
  selectClassName: string;
}) {
  const [, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const brand = db.getBrands('ALL').find((b) => b.code === brandCode);
  const subs = (brand?.subBrands || []).filter((sub) => sub.isActive || sub.id === savedValue || sub.id === value);
  const canAdd = !!brand && canPerform(db.getCurrentUser(), 'p.settings_brands', 'EDIT');

  const add = async () => {
    const clean = name.trim();
    if (!brand || !clean) return;
    if ((brand.subBrands || []).some((sub) => sub.name.toLowerCase() === clean.toLowerCase())) { toast.error(`${clean} is already a sub-brand of ${brand.name}.`); return; }
    setSaving(true);
    try {
      const next = [...(brand.subBrands || []), { id: subBrandIdFor(brand.code, clean), name: clean, isActive: true }];
      await updateBrand(brand.id, { subBrands: next });
      onChange(subBrandIdFor(brand.code, clean));
      setAdding(false); setName(''); setVersion((v) => v + 1);
      toast.success(`Sub-brand "${clean}" added to ${brand.name}.`);
    } catch (error) {
      toast.error('Sub-brand not added', error instanceof Error ? error.message : undefined);
    } finally { setSaving(false); }
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold text-slate-700">Sub-brand</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClassName} disabled={!brand}>
        <option value="">{subs.length ? 'None' : `${brand?.name || 'This brand'} has no sub-brands yet`}</option>
        {subs.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}{sub.isActive ? '' : ' (archived)'}</option>)}
      </select>
      {canAdd && !adding && (
        <button type="button" onClick={() => setAdding(true)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"><Plus className="h-3 w-3" /> Add a sub-brand to {brand!.name}</button>
      )}
      {!canAdd && !subs.length && <p className="mt-1 text-[11px] text-slate-500">An admin can add sub-brands in Settings → Brands.</p>}
      {adding && (
        <div className="mt-2 flex gap-2">
          <label htmlFor={`${id}-new`} className="sr-only">New sub-brand name</label>
          <input id={`${id}-new`} autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } if (e.key === 'Escape') setAdding(false); }}
            placeholder="e.g. Furr" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <button type="button" onClick={() => void add()} disabled={saving || !name.trim()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Add</button>
          <button type="button" onClick={() => setAdding(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Cancel</button>
        </div>
      )}
    </div>
  );
}
