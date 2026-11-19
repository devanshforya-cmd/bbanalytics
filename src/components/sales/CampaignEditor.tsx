'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, Plus, Search, Trash2, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import type { OfferReward, OfferTargetMode, SaleCampaign, SaleOffer } from '@/lib/types';
import { OFFER_TEMPLATES, describeReward } from '@/lib/offers';
import { isSellableCombo } from '@/lib/product-catalog';
import { activeOrderOptionNames } from '@/lib/order-options';
import { useOrderOptions } from '@/hooks/useOrderOptions';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { syncManager } from '@/lib/offline-sync';
import SlideOverPanel from '@/components/common/SlideOverPanel';
import InfoTip from '@/components/common/InfoTip';
import { confirmAction } from '@/components/common/confirm';
import { toast } from '@/components/common/Toast';

const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const label = 'mb-1 block text-[11px] font-semibold text-slate-600';
const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${on ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`;

type Draft = Omit<SaleCampaign, 'id' | 'createdAt'> & { id?: string; createdAt?: string };
const today = () => new Date(Date.now() + (5 * 60 + 45) * 60000).toISOString().slice(0, 10);
const newId = () => `offer_${globalThis.crypto.randomUUID().slice(0, 12)}`;

const TARGETS: [OfferTargetMode, string][] = [['ALL', 'Everything'], ['COMBOS', 'Combos only'], ['SINGLES', 'Single products only'], ['CATEGORY', 'A category'], ['ITEMS', 'Chosen items'], ['EXCEPT', 'Everything except']];
const REWARDS: [OfferReward['type'], string][] = [['PERCENT_OFF', '% off'], ['AMOUNT_OFF_EACH', 'NPR off each item'], ['FIXED_PRICE', 'Fixed sale price'], ['ORDER_AMOUNT_OFF', 'NPR off the order'], ['BUY_X_GET_Y', 'Buy X get Y'], ['BUNDLE_PRICE', 'Any N for one price'], ['TIERED', 'Tiers (spend more, save more)'], ['FREE_GIFT', 'Free gift'], ['FREE_DELIVERY', 'Free delivery']];
const STACKING: [SaleOffer['stacking'], string, string][] = [
  ['STACK', 'Stacks', 'Adds to the other offers, e.g. a gift on top of 10% off.'],
  ['BEST', 'Best one wins', 'Among offers set this way, the customer gets the one that saves more, never both.'],
  ['EXCLUSIVE', 'Exclusive', 'If it applies, no other offer does. For clearance prices.'],
];

function defaultReward(type: OfferReward['type']): OfferReward {
  switch (type) {
    case 'PERCENT_OFF': return { type, percent: 10 };
    case 'AMOUNT_OFF_EACH': return { type, amount: 100 };
    case 'FIXED_PRICE': return { type, price: 499 };
    case 'ORDER_AMOUNT_OFF': return { type, amount: 200 };
    case 'BUY_X_GET_Y': return { type, buy: 1, get: 1, percent: 100 };
    case 'BUNDLE_PRICE': return { type, pick: 3, price: 1999 };
    case 'TIERED': return { type, basis: 'ORDER_VALUE', tiers: [{ min: 2000, percent: 10 }, { min: 3000, percent: 15 }] };
    case 'FREE_GIFT': return { type, giftItemId: '', quantity: 1 };
    case 'FREE_DELIVERY': return { type };
  }
}

/** Search-and-pick for products and combos of the sale's brands. */
function ItemPicker({ value, onChange, brands, single = false, productsOnly = false, placeholder }: { value: string[]; onChange: (ids: string[]) => void; brands: string[]; single?: boolean; productsOnly?: boolean; placeholder: string }) {
  const [query, setQuery] = useState('');
  const products = db.getProducts('ALL');
  const items = useMemo(() => [
    ...products.filter((product) => product.active !== false && (!brands.length || brands.includes(product.brandCode))).map((product) => ({ id: product.id, name: product.name, combo: false })),
    ...(productsOnly ? [] : db.getCombos('ALL').filter((combo) => (!brands.length || brands.includes(combo.brandCode)) && isSellableCombo(combo, products)).map((combo) => ({ id: combo.id, name: combo.name, combo: true }))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [brands.join(','), productsOnly, products.length]);
  const term = query.trim().toLowerCase();
  const matches = items.filter((item) => !value.includes(item.id) && (!term || item.name.toLowerCase().includes(term))).slice(0, 8);
  const name = (id: string) => items.find((item) => item.id === id)?.name || 'Unavailable item';
  return (
    <div>
      {value.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1">{value.map((id) => (
        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800">{name(id)}
          <button type="button" aria-label={`Remove ${name(id)}`} onClick={() => onChange(value.filter((entry) => entry !== id))}><X className="h-3 w-3" /></button></span>
      ))}</div>}
      {(!single || !value.length) && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className={`${field} pl-8`} aria-label={placeholder} />
          {term && <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {matches.map((item) => <li key={item.id}><button type="button" onClick={() => { onChange(single ? [item.id] : [...value, item.id]); setQuery(''); }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-blue-50">
              {item.name}{item.combo && <span className="rounded-full bg-amber-100 px-1.5 text-[9px] font-bold text-amber-800">Combo</span>}</button></li>)}
            {!matches.length && <li className="px-3 py-2 text-xs text-slate-500">No match.</li>}
          </ul>}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer, brands, onChange, onRemove, open, onToggle }: { offer: SaleOffer; brands: string[]; onChange: (offer: SaleOffer) => void; onRemove: () => void; open: boolean; onToggle: () => void }) {
  const set = (patch: Partial<SaleOffer>) => onChange({ ...offer, ...patch });
  const condition = offer.condition || {};
  const setCondition = (patch: Partial<SaleOffer['condition']>) => set({ condition: { ...condition, ...patch } });
  const reward = offer.reward;
  const setReward = (patch: Record<string, unknown>) => set({ reward: { ...reward, ...patch } as OfferReward });
  const number = (value: string) => value === '' ? undefined : Number(value);
  const categories = [...new Set(db.getProducts('ALL').filter((product) => !brands.length || brands.includes(product.brandCode)).map((product) => product.category).filter(Boolean))];
  const giftName = (id: string) => db.getProducts('ALL').find((product) => product.id === id)?.name || 'choose a gift';
  return (
    <div className={`rounded-2xl border ${offer.enabled ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{offer.name || 'Offer'}</span>
            <span className="block truncate text-[11px] text-slate-500">{describeReward(reward, giftName)} · {TARGETS.find(([mode]) => mode === offer.target.mode)?.[1]} · {STACKING.find(([value]) => value === offer.stacking)?.[1]}</span></span>
        </button>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><input type="checkbox" checked={offer.enabled} onChange={(event) => set({ enabled: event.target.checked })} /> On</label>
        <button type="button" onClick={onRemove} aria-label={`Remove ${offer.name}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
      </div>
      {open && (
        <div className="space-y-4 border-t border-slate-100 px-3 py-3 text-xs">
          <div><label className={label} htmlFor={`name_${offer.id}`}>Offer name</label><input id={`name_${offer.id}`} value={offer.name} maxLength={120} onChange={(event) => set({ name: event.target.value })} className={field} /></div>

          <section><p className="mb-1.5 text-[11px] font-bold text-slate-800">Applies to</p>
            <div className="flex flex-wrap gap-1.5">{TARGETS.map(([mode, title]) => <button key={mode} type="button" className={chip(offer.target.mode === mode)} onClick={() => set({ target: { mode } })}>{title}</button>)}</div>
            {(offer.target.mode === 'ITEMS' || offer.target.mode === 'EXCEPT') && <div className="mt-2"><ItemPicker brands={brands} value={offer.target.itemIds || []} onChange={(itemIds) => set({ target: { ...offer.target, itemIds } })} placeholder={offer.target.mode === 'ITEMS' ? 'Search products or combos to include' : 'Search products or combos to leave out'} /></div>}
            {offer.target.mode === 'CATEGORY' && <div className="mt-2 flex flex-wrap gap-1.5">{categories.map((name) => { const on = (offer.target.categories || []).includes(name); return <button key={name} type="button" className={chip(on)} onClick={() => set({ target: { ...offer.target, categories: on ? (offer.target.categories || []).filter((entry) => entry !== name) : [...(offer.target.categories || []), name] } })}>{name}</button>; })}{!categories.length && <span className="text-slate-500">No categories for these brands.</span>}</div>}
          </section>

          <section><p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-slate-800">When <InfoTip label="About conditions">Leave everything empty and the offer always applies while the sale runs. Every condition you fill in must be met.</InfoTip></p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div><label className={label}>At least units</label><input aria-label="At least units" type="number" min={1} value={condition.minUnits ?? ''} onChange={(event) => setCondition({ minUnits: number(event.target.value) })} className={field} placeholder="Any" /></div>
              <div><label className={label}>Order total at least (NPR)</label><input aria-label="Order total at least (NPR)" type="number" min={1} value={condition.minOrderValue ?? ''} onChange={(event) => setCondition({ minOrderValue: number(event.target.value) })} className={field} placeholder="Any" /></div>
              <div><label className={label}>Code word in the message</label><input aria-label="Code word in the message" value={condition.codeWord ?? ''} maxLength={40} onChange={(event) => setCondition({ codeWord: event.target.value.toUpperCase() || undefined })} className={field} placeholder="e.g. DASHAIN10" /></div>
              <div><label className={label}>Daily hours from</label><input aria-label="Daily hours from" type="time" value={condition.hours?.from ?? ''} onChange={(event) => setCondition({ hours: event.target.value ? { from: event.target.value, to: condition.hours?.to || '23:59' } : undefined })} className={field} /></div>
              <div><label className={label}>to</label><input aria-label="to" type="time" value={condition.hours?.to ?? ''} disabled={!condition.hours} onChange={(event) => setCondition({ hours: condition.hours ? { ...condition.hours, to: event.target.value } : undefined })} className={field} /></div>
              <label className="flex items-end gap-2 pb-2 text-[11px] font-semibold text-slate-700"><input type="checkbox" checked={!!condition.firstOrderOnly} onChange={(event) => setCondition({ firstOrderOnly: event.target.checked || undefined })} /> Customer’s first order only</label>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><label className={label}>Only when all of these are in the order</label><ItemPicker brands={brands} value={condition.requiresAll || []} onChange={(requiresAll) => setCondition({ requiresAll: requiresAll.length ? requiresAll : undefined })} placeholder="Search items (optional)" /></div>
              <div><label className={label}>Only for these customers (mobiles, comma separated)</label><input aria-label="Only for these customers (mobiles, comma separated)" value={(condition.customerPhones || []).join(', ')} onChange={(event) => setCondition({ customerPhones: event.target.value.split(/[,\s]+/).filter(Boolean) })} className={field} placeholder="Everyone" /></div>
              <div><label className={label}>Offer starts (if later than the sale)</label><input aria-label="Offer starts (if later than the sale)" type="datetime-local" value={offer.startsAt ?? ''} onChange={(event) => set({ startsAt: event.target.value || undefined })} className={field} /></div>
              <div><label className={label}>Offer ends (if earlier than the sale)</label><input aria-label="Offer ends (if earlier than the sale)" type="datetime-local" value={offer.endsAt ?? ''} onChange={(event) => set({ endsAt: event.target.value || undefined })} className={field} /></div>
            </div>
          </section>

          <section><p className="mb-1.5 text-[11px] font-bold text-slate-800">Gets</p>
            <select value={reward.type} onChange={(event) => set({ reward: defaultReward(event.target.value as OfferReward['type']) })} className={`${field} mb-2 sm:w-64`} aria-label="What the customer gets">{REWARDS.map(([type, title]) => <option key={type} value={type}>{title}</option>)}</select>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {reward.type === 'PERCENT_OFF' && <div><label className={label}>Percent off</label><input aria-label="Percent off" type="number" min={0.01} max={100} step="0.01" value={reward.percent} onChange={(event) => setReward({ percent: Number(event.target.value) })} className={field} /></div>}
              {(reward.type === 'AMOUNT_OFF_EACH' || reward.type === 'ORDER_AMOUNT_OFF') && <div><label className={label}>NPR off</label><input aria-label="NPR off" type="number" min={1} value={reward.amount} onChange={(event) => setReward({ amount: Number(event.target.value) })} className={field} /></div>}
              {reward.type === 'FIXED_PRICE' && <div><label className={label}>Sale price (NPR each)</label><input aria-label="Sale price (NPR each)" type="number" min={0} value={reward.price} onChange={(event) => setReward({ price: Number(event.target.value) })} className={field} /></div>}
              {reward.type === 'BUY_X_GET_Y' && <>
                <div><label className={label}>Buy</label><input aria-label="Buy" type="number" min={1} value={reward.buy} onChange={(event) => setReward({ buy: Number(event.target.value) })} className={field} /></div>
                <div><label className={label}>Get</label><input aria-label="Get" type="number" min={1} value={reward.get} onChange={(event) => setReward({ get: Number(event.target.value) })} className={field} /></div>
                <div><label className={label}>% off the extra (100 = free)</label><input aria-label="% off the extra (100 = free)" type="number" min={1} max={100} value={reward.percent} onChange={(event) => setReward({ percent: Number(event.target.value) })} className={field} /></div>
              </>}
              {reward.type === 'BUNDLE_PRICE' && <>
                <div><label className={label}>Any</label><input aria-label="Any" type="number" min={2} value={reward.pick} onChange={(event) => setReward({ pick: Number(event.target.value) })} className={field} /></div>
                <div><label className={label}>For NPR</label><input aria-label="For NPR" type="number" min={0} value={reward.price} onChange={(event) => setReward({ price: Number(event.target.value) })} className={field} /></div>
              </>}
              {reward.type === 'FREE_GIFT' && <>
                <div className="col-span-2"><label className={label}>Gift product</label><ItemPicker brands={brands} productsOnly single value={reward.giftItemId ? [reward.giftItemId] : []} onChange={(ids) => setReward({ giftItemId: ids[0] || '' })} placeholder="Search the gift product" /></div>
                <div><label className={label}>Quantity</label><input aria-label="Quantity" type="number" min={1} value={reward.quantity} onChange={(event) => setReward({ quantity: Number(event.target.value) })} className={field} /></div>
              </>}
            </div>
            {reward.type === 'TIERED' && (
              <div className="space-y-1.5">
                <div className="flex gap-1.5">{(['ORDER_VALUE', 'UNITS'] as const).map((basis) => <button key={basis} type="button" className={chip(reward.basis === basis)} onClick={() => setReward({ basis })}>{basis === 'UNITS' ? 'By units' : 'By order total'}</button>)}</div>
                {reward.tiers.map((tier, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-slate-500">{reward.basis === 'UNITS' ? 'From' : 'From NPR'}</span><input type="number" min={0} value={tier.min} onChange={(event) => setReward({ tiers: reward.tiers.map((entry, i) => i === index ? { ...entry, min: Number(event.target.value) } : entry) })} className={`${field} w-28`} aria-label={`Tier ${index + 1} minimum`} />
                    <span className="text-slate-500">→</span><input type="number" min={0.01} max={100} value={tier.percent} onChange={(event) => setReward({ tiers: reward.tiers.map((entry, i) => i === index ? { ...entry, percent: Number(event.target.value) } : entry) })} className={`${field} w-20`} aria-label={`Tier ${index + 1} percent`} /><span className="text-slate-500">% off</span>
                    <button type="button" aria-label={`Remove tier ${index + 1}`} disabled={reward.tiers.length < 2} onClick={() => setReward({ tiers: reward.tiers.filter((_, i) => i !== index) })} className="p-1 text-slate-500 hover:text-rose-600 disabled:opacity-30"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                {reward.tiers.length < 10 && <button type="button" className="text-[11px] font-semibold text-blue-700" onClick={() => setReward({ tiers: [...reward.tiers, { min: (reward.tiers[reward.tiers.length - 1]?.min || 0) + 1000, percent: (reward.tiers[reward.tiers.length - 1]?.percent || 0) + 5 }] })}>+ Add a tier</button>}
              </div>
            )}
          </section>

          <section><p className="mb-1.5 text-[11px] font-bold text-slate-800">With other offers</p>
            <div className="grid gap-1.5 sm:grid-cols-3">{STACKING.map(([value, title, hint]) => (
              <button key={value} type="button" onClick={() => set({ stacking: value })} className={`rounded-xl border p-2 text-left ${offer.stacking === value ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="block font-semibold text-slate-900">{title}</span><span className="block text-[11px] text-slate-500">{hint}</span></button>
            ))}</div>
          </section>

          <section><p className="mb-1.5 text-[11px] font-bold text-slate-800">Limits</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div><label className={label}>Uses per customer</label><input aria-label="Uses per customer" type="number" min={1} value={offer.limits?.perCustomer ?? ''} onChange={(event) => set({ limits: { ...offer.limits, perCustomer: number(event.target.value) } })} className={field} placeholder="No limit" /></div>
              <div><label className={label}>Total uses</label><input aria-label="Total uses" type="number" min={1} value={offer.limits?.totalUses ?? ''} onChange={(event) => set({ limits: { ...offer.limits, totalUses: number(event.target.value) } })} className={field} placeholder="No limit" /></div>
              {reward.type === 'FREE_GIFT' && <div><label className={label}>Gifts in stock</label><input aria-label="Gifts in stock" type="number" min={0} value={offer.limits?.giftStock ?? ''} onChange={(event) => set({ limits: { ...offer.limits, giftStock: number(event.target.value) } })} className={field} placeholder="No limit" /></div>}
              <div><label className={label}>Never below % of MRP</label><input aria-label="Never below % of MRP" type="number" min={1} max={100} value={offer.floorPercent ?? ''} onChange={(event) => set({ floorPercent: number(event.target.value) })} className={field} placeholder="No floor" /></div>
              <div><label className={label}>Order (lower runs first)</label><input aria-label="Order (lower runs first)" type="number" min={0} value={offer.priority} onChange={(event) => set({ priority: Number(event.target.value) || 0 })} className={field} /></div>
              <div><label className={label}>Website coupon code</label><input aria-label="Website coupon code" value={offer.websiteCode ?? ''} maxLength={40} onChange={(event) => set({ websiteCode: event.target.value.toUpperCase() || undefined })} className={field} placeholder="For the website import" /></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

interface CampaignEditorProps { campaign?: SaleCampaign | null; onClose: () => void; onSaved?: (campaign: SaleCampaign) => void }

/** Create or change a sale: when, which brands and channels, and the offers inside it. */
export default function CampaignEditor({ campaign, onClose, onSaved }: CampaignEditorProps) {
  const options = useOrderOptions();
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const brands = db.getBrands('ACTIVE');
  const channels = activeOrderOptionNames(options, 'channels');
  const [draft, setDraft] = useState<Draft>(() => campaign ? JSON.parse(JSON.stringify(campaign)) : {
    name: '', brandCodes: brands.length === 1 ? [brands[0].code] : [], channels: [], startsAt: `${today()}T00:00`, endsAt: `${today()}T23:59`, status: 'DRAFT', offers: [] });
  const [openOffer, setOpenOffer] = useState<string | null>(campaign?.offers[0]?.id || null);
  const [picking, setPicking] = useState(!campaign?.offers.length);
  const templates = db.getCampaigns().filter((entry) => entry.isTemplate && entry.id !== campaign?.id);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const addOffer = (key: string) => {
    const template = OFFER_TEMPLATES.find((entry) => entry.key === key)!;
    const offer: SaleOffer = { ...template.build(), id: newId(), priority: draft.offers.length };
    set({ offers: [...draft.offers, offer] }); setOpenOffer(offer.id); setPicking(false);
  };
  const fromTemplate = (id: string) => {
    const template = templates.find((entry) => entry.id === id); if (!template) return;
    set({ name: draft.name || template.name.replace(/\s*\(template\)$/i, ''), brandCodes: template.brandCodes, channels: template.channels, offers: template.offers.map((offer) => ({ ...offer, id: newId() })), notes: template.notes });
    setPicking(false);
  };
  const save = (status: SaleCampaign['status']) => guardedSubmit(async () => {
    try {
      const saved = db.saveCampaign({ ...draft, status } as SaleCampaign);
      try { await syncManager.forceSyncNow(); } catch { /* Queued and retried. */ }
      toast.success(status === 'SCHEDULED' ? `${saved.name} is scheduled` : draft.isTemplate ? 'Template saved' : 'Saved as a draft', status === 'SCHEDULED' ? 'Orders in its dates are priced with its offers.' : undefined);
      onSaved?.(saved); onClose();
    } catch (error) { toast.error('Not saved', error instanceof Error ? error.message : 'Please check the details.'); }
  });
  const scheduled = draft.status !== 'DRAFT' && !draft.isTemplate;
  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
      {draft.isTemplate ? <button type="button" onClick={() => save('DRAFT')} disabled={isSubmitting} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700">Save template</button> : <>
        {!scheduled && <button type="button" onClick={() => save('DRAFT')} disabled={isSubmitting} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Save draft</button>}
        <button type="button" onClick={() => save(scheduled ? draft.status : 'SCHEDULED')} disabled={isSubmitting} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700">{scheduled ? 'Save changes' : 'Schedule'}</button>
      </>}
    </div>
  );
  return (
    <SlideOverPanel isOpen onClose={isSubmitting ? () => {} : onClose} width="lg" title={campaign ? (draft.isTemplate ? 'Edit template' : 'Edit sale') : 'New sale'} subtitle={scheduled ? 'Changes apply to orders saved from now on. Orders already saved keep their prices.' : undefined} footer={footer}>
      <div className="space-y-5 p-5 text-xs">
        {!campaign && templates.length > 0 && (
          <div><label className={label} htmlFor="from-template">Start from a saved template</label>
            <select id="from-template" defaultValue="" onChange={(event) => fromTemplate(event.target.value)} className={field}><option value="">Start from scratch</option>{templates.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></div>
        )}
        <div><label className={label} htmlFor="sale-name">Name</label><input id="sale-name" value={draft.name} maxLength={120} onChange={(event) => set({ name: event.target.value })} className={field} placeholder="e.g. Dashain Sale" autoFocus={!campaign} /></div>
        {!draft.isTemplate && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={label} htmlFor="sale-start">Starts (Nepal time)</label><input id="sale-start" type="datetime-local" value={draft.startsAt} onChange={(event) => set({ startsAt: event.target.value })} className={field} /></div>
          <div><label className={label} htmlFor="sale-end">Ends</label><input id="sale-end" type="datetime-local" value={draft.endsAt} onChange={(event) => set({ endsAt: event.target.value })} className={field} /></div>
        </div>}
        <div><p className={label}>Brands</p><div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(!draft.brandCodes.length)} onClick={() => set({ brandCodes: [] })}>All brands</button>
          {brands.map((brand) => { const on = draft.brandCodes.includes(brand.code); return <button key={brand.code} type="button" className={chip(on)} onClick={() => set({ brandCodes: on ? draft.brandCodes.filter((code) => code !== brand.code) : [...draft.brandCodes, brand.code] })}>{brand.name}</button>; })}
        </div></div>
        <div><p className={label}>Channels</p><div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(!draft.channels.length)} onClick={() => set({ channels: [] })}>Every channel</button>
          {channels.map((name) => { const on = draft.channels.includes(name); return <button key={name} type="button" className={chip(on)} onClick={() => set({ channels: on ? draft.channels.filter((entry) => entry !== name) : [...draft.channels, name] })}>{name}</button>; })}
        </div></div>

        <section>
          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-slate-900">Offers</p>
            {!picking && <button type="button" onClick={() => setPicking(true)} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"><Plus className="h-3.5 w-3.5" /> Add offer</button>}</div>
          <div className="space-y-2">
            {draft.offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} brands={draft.brandCodes} open={openOffer === offer.id} onToggle={() => setOpenOffer(openOffer === offer.id ? null : offer.id)}
                onChange={(next) => set({ offers: draft.offers.map((entry) => entry.id === offer.id ? next : entry) })}
                onRemove={async () => { if (await confirmAction({ title: `Remove ${offer.name}?`, message: 'Orders already priced with it keep their prices.', confirmLabel: 'Remove', destructive: true })) set({ offers: draft.offers.filter((entry) => entry.id !== offer.id) }); }} />
            ))}
          </div>
          {picking && (
            <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-[11px] font-semibold text-slate-600">Start from</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {OFFER_TEMPLATES.map((template) => (
                  <button key={template.key} type="button" onClick={() => addOffer(template.key)} className="rounded-xl border border-slate-200 bg-white p-2 text-left hover:border-blue-300 hover:bg-blue-50">
                    <span className="block font-semibold text-slate-900">{template.title}</span><span className="block text-[11px] text-slate-500">{template.hint}</span></button>
                ))}
              </div>
              {draft.offers.length > 0 && <button type="button" onClick={() => setPicking(false)} className="mt-2 text-[11px] font-semibold text-slate-500">Cancel</button>}
            </div>
          )}
        </section>
        <div><label className={label} htmlFor="sale-notes">Notes</label><input id="sale-notes" value={draft.notes ?? ''} maxLength={500} onChange={(event) => set({ notes: event.target.value })} className={field} placeholder="Optional" /></div>
      </div>
    </SlideOverPanel>
  );
}
