'use client';

import NumberInput from '@/components/common/NumberInput';
import Money from '@/components/common/Money';
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import MobileBottomSheet from '@/components/common/MobileBottomSheet';
import { toast } from '@/components/common/Toast';
import { db } from '@/lib/db/db-service';
import SubBrandPicker from '@/components/products/SubBrandPicker';
import { isSuperAdmin } from '@/lib/permissions';
import type { Combo, Product } from '@/lib/types';
import { suggestComboKeywords, suggestProductKeywords } from '@/lib/keyword-suggest';

const inputClass = 'mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal';
const words = (text: string) => text.split(',').map(word => word.trim()).filter(Boolean);

type Part = { productId: string; quantity: number };
export default function CatalogEditor({ item, kind, products, onChanged }: { item: Product | Combo; kind: 'products' | 'combos'; products: Product[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [version, setVersion] = useState(0), [name, setName] = useState(''), [sku, setSku] = useState('');
  const [category, setCategory] = useState(''), [mrp, setMrp] = useState(''), [caseSize, setCaseSize] = useState(''), [threshold, setThreshold] = useState('0'), [unit, setUnit] = useState('BOTH');
  const [alias, setAlias] = useState(''), [subBrandId, setSubBrandId] = useState(''), [barcode, setBarcode] = useState('');
  const [keywords, setKeywords] = useState(''), [extractorKeywords, setExtractorKeywords] = useState(''), [description, setDescription] = useState('');
  const [parts, setParts] = useState<Part[]>([]), [comboPrice, setComboPrice] = useState(''), [discount, setDiscount] = useState(''), [priceDetection, setPriceDetection] = useState(false), [confirmation, setConfirmation] = useState('');
  const user = db.getCurrentUser();
  if (!isSuperAdmin(user)) return null;
  const available = products.filter(product => product.brandCode === item.brandCode && product.active !== false);
  const total = Math.round(parts.reduce((sum, part) => sum + (available.find(product => product.id === part.productId)?.mrp || 0) * part.quantity, 0) * 100) / 100;
  const inspect = async () => {
    setOpen(true); setBusy(true); setError(''); setVersion(0); setConfirmation('');
    try {
      const sync = await db.syncWithSupabase(); if (!sync.success) throw new Error(sync.message);
      const response = await fetch(`/api/${kind}/${encodeURIComponent(item.id)}`, { cache: 'no-store', headers: { 'X-Workspace-User': user.id } });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Could not load the latest details.');
      const current = (kind === 'products' ? result.product : result.combo) as Product & Combo;
      setVersion(result.version); setName(current.name); setSku(current.sku); setExtractorKeywords((current.extractorKeywords || []).join(', '));
      if (kind === 'products') {
        setCategory(current.category); setMrp(String(current.mrp)); setCaseSize(current.caseSize == null ? '' : String(current.caseSize));
        setThreshold(String(current.thresholdQty ?? 0)); setUnit(current.orderUnitMode || 'BOTH'); setKeywords((current.keywords || []).join(', '));
        setAlias(current.alias || ''); setSubBrandId(current.subBrandId || ''); setBarcode(current.barcode || '');
      } else {
        setDescription(current.description || ''); setParts(current.items.map(part => ({ productId: part.productId, quantity: part.quantity })));
        setComboPrice(String(current.comboPrice)); setDiscount(''); setPriceDetection(current.priceDetectionEnabled !== false);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load the latest details.'); }
    finally { setBusy(false); }
  };
  const change = async (method: 'PATCH' | 'DELETE') => {
    if (!version || (method === 'DELETE' && confirmation !== 'DELETE')) return;
    setBusy(true); setError('');
    const updates = kind === 'products'
      ? { name, sku, category, mrp: Number(mrp), caseSize: caseSize === '' ? '' : Number(caseSize), thresholdQty: Number(threshold), orderUnitMode: unit, keywords: words(keywords), extractorKeywords: words(extractorKeywords), alias, subBrandId, barcode }
      : { name, sku, description, items: parts, comboPrice: Number(comboPrice), extractorKeywords: words(extractorKeywords), priceDetectionEnabled: priceDetection };
    try {
      const response = await fetch(`/api/${kind}/${encodeURIComponent(item.id)}`, { method, headers: { 'Content-Type': 'application/json', 'X-Workspace-User': user.id }, body: JSON.stringify({ expectedVersion: version, ...(method === 'PATCH' ? { updates } : {}) }) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Changes could not be saved.');
      const sync = await db.syncWithSupabase();
      toast.success(method === 'DELETE' ? 'Combo deleted. Past order history is preserved.' : 'Changes saved. Past order prices stay unchanged.');
      if (!sync.success) toast.error(`Saved on the server. ${sync.message}`);
      onChanged(); setOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Changes could not be saved.'); }
    finally { setBusy(false); }
  };
  const field = (label: string, value: string, set: (value: string) => void, type = 'text', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="block text-sm font-semibold text-slate-700">{label}<input className={inputClass} type={type} value={value} onChange={e => set(e.target.value)} {...extra} /></label>;
  return <>
    <button type="button" onClick={inspect} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" />{kind === 'products' ? 'Edit product' : 'Edit / delete combo'}</button>
    <MobileBottomSheet isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title={kind === 'products' ? 'Edit product' : 'Edit or delete combo'} subtitle={item.name}>
      <div className="space-y-4" aria-busy={busy}>
        {busy && <p role="status">Loading or saving…</p>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {!!version && <>
          {field('Name', name, setName)}
          {kind === 'products' && <>
            {field('Short name (shown to field staff)', alias, setAlias, 'text', { maxLength: 60, placeholder: 'e.g. Aqua roll-on 50ml' })}
            <div>
              <SubBrandPicker id="catalog-sub-brand" brandCode={item.brandCode} value={subBrandId} onChange={setSubBrandId} savedValue={(item as Product).subBrandId} selectClassName={inputClass} />
              {(item as Product).subBrandId !== (subBrandId || undefined) && <span className="mt-1 block text-xs font-normal text-amber-800">Orders already placed keep their sub-brand; new orders use this one.</span>}
            </div>
          </>}
          {field('SKU', sku, setSku)}
          {kind === 'products' ? <>
            {field('Barcode (optional)', barcode, setBarcode, 'text', { inputMode: 'numeric', placeholder: 'EAN printed on the pack' })}
            {field('Category', category, setCategory)} {field('MRP (NPR)', mrp, setMrp, 'number', { min: '0.01', step: '0.01' })}
            {field('Case size (optional)', caseSize, setCaseSize, 'number', { min: '1', step: '1' })}
            {field('Low stock threshold', threshold, setThreshold, 'number', { min: '0', step: '1' })}
            <label className="block text-sm font-semibold text-slate-700">Order units<select className={inputClass} value={unit} onChange={e => setUnit(e.target.value)}><option value="BOTH">Cases and pieces</option><option value="CASES">Cases</option><option value="PIECES">Pieces</option></select></label>
            {field('Product keywords (comma separated)', keywords, setKeywords)}
          </> : <>
            {field('Description', description, setDescription)}
            <p className="text-sm font-semibold">Combo products</p>
            {parts.map((part, index) => <div key={index} className="flex items-end gap-2">
              <label className="min-w-0 flex-1 text-xs font-semibold">Product<select className={inputClass} value={part.productId} onChange={e => setParts(parts.map((entry, i) => i === index ? { ...entry, productId: e.target.value } : entry))}>
                <option value="">Select product</option>{!available.some(product => product.id === part.productId) && <option value={part.productId} disabled>Unavailable product — choose another</option>}
                {available.map(product => <option key={product.id} value={product.id}>{product.name} — <Money>{product.mrp}</Money></option>)}
              </select></label>
              <label className="w-20 text-xs font-semibold">Quantity<NumberInput className={inputClass} type="number" min="1" step="1" value={part.quantity} onChange={e => setParts(parts.map((entry, i) => i === index ? { ...entry, quantity: Number(e.target.value) } : entry))} /></label>
              <button type="button" aria-label={`Remove product ${index + 1}`} className="min-h-[44px] text-rose-700" onClick={() => setParts(parts.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></button>
            </div>)}
            <button type="button" className="text-sm font-semibold text-blue-700" onClick={() => setParts([...parts, { productId: '', quantity: 1 }])}>+ Add product</button>
            <p className="text-sm text-slate-600">Current component MRP: <Money>{total.toFixed(2)}</Money></p>
            {field('Combo selling price (NPR)', comboPrice, setComboPrice, 'number', { min: '0.01', step: '0.01' })}
            <div className="flex items-end gap-2"><div className="flex-1">{field('Discount percentage', discount, setDiscount, 'number', { min: '0', max: '99.99', step: '0.01' })}</div><button type="button" className="min-h-[40px] rounded-lg border border-blue-300 px-3 text-sm font-semibold text-blue-700" onClick={() => { const pct = Number(discount); if (discount === '' || !Number.isFinite(pct) || pct < 0 || pct >= 100 || total <= 0) { setError('Enter a discount from 0 to less than 100% and select valid products.'); return; } setComboPrice(String(Math.round(total * (1 - pct / 100) * 100) / 100)); setError(''); }}>Apply %</button></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={priceDetection} onChange={e => setPriceDetection(e.target.checked)} />Suggest this combo when its components and exact price match</label>
          </>}
          {field('Extractor phrases (comma separated)', extractorKeywords, setExtractorKeywords)}
          <button type="button" className="text-sm font-semibold text-blue-700" onClick={() => {
            const brandName = db.getBrands().find(brand => brand.code === item.brandCode)?.name;
            const suggested = kind === 'products' ? suggestProductKeywords(name, brandName) : suggestComboKeywords(name, brandName, parts.map(part => available.find(product => product.id === part.productId)?.name || '').filter(Boolean));
            const current = words(extractorKeywords);
            const added = suggested.filter(word => !current.includes(word));
            setExtractorKeywords([...current, ...added].join(', '));
            toast.success(added.length ? `${added.length} phrases added` : 'No new phrases', added.length ? 'Includes common misspellings. Remove any that could mean another item, then save.' : undefined);
          }}>+ Suggest phrases and misspellings</button>
          <p className="text-xs text-slate-500">Existing orders keep their original items and prices. Use distinctive combo phrases to avoid accidental matches.</p>
          <button type="button" disabled={busy} onClick={() => change('PATCH')} className="min-h-[44px] rounded-xl bg-blue-700 px-4 font-semibold text-white disabled:opacity-50">Save changes</button>
          {kind === 'combos' && <div className="space-y-2 border-t border-slate-200 pt-4"><p className="text-sm text-slate-700">Permanently delete this combo from the catalogue. Existing order history is preserved.</p>{field('Type DELETE to confirm', confirmation, setConfirmation)}<button type="button" disabled={busy || confirmation !== 'DELETE'} onClick={() => change('DELETE')} className="min-h-[44px] rounded-xl bg-rose-700 px-4 font-semibold text-white disabled:opacity-50">Delete combo</button></div>}
        </>}
      </div>
    </MobileBottomSheet>
  </>;
}
