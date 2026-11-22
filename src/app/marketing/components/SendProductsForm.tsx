'use client';

import React, { useMemo, useState } from 'react';
import { Check, Minus, PackagePlus, Plus, Search, Trash2 } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { canAccessBrand, canPerform } from '@/lib/permissions';
import type { Influencer, MarketingSend } from '@/lib/types';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { activeOrderOptionNames } from '@/lib/order-options';
import { useOrderOptions } from '@/hooks/useOrderOptions';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { syncManager } from '@/lib/offline-sync';
import SlideOverPanel from '@/components/common/SlideOverPanel';
import CreatableSelect from '@/components/common/CreatableSelect';
import DualDateField from '@/components/common/DualDateField';
import { toast } from '@/components/common/Toast';
import { displayDocumentId } from '@/lib/document-ids';

interface CatalogueEntry { id: string; name: string; sku: string; brandCode: string; isCombo: boolean; contents: string }

function ComboBadge() {
  return <span className="ml-1.5 inline-block rounded-full bg-amber-100 px-1.5 py-px align-middle text-[11px] font-bold text-amber-800">Combo</span>;
}

interface SendProductsFormProps {
  influencer: Influencer;
  onClose: () => void;
  onSaved: (send: MarketingSend) => void;
}

const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const HAND_DELIVERY = 'Direct hand delivery';

/**
 * The only place a marketing send is created. It opens from an influencer's
 * profile, so the influencer always exists first, and it has no payment,
 * price, total, COD or order-type field anywhere.
 */
export default function SendProductsForm({ influencer, onClose, onSaved }: SendProductsFormProps) {
  const user = db.getCurrentUser();
  const orderOptions = useOrderOptions();
  const { formatDate } = useCalendarPreference();
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const brands = db.getBrands('ACTIVE').filter((brand) => canAccessBrand(user, brand.code));
  const staff = db.getUsers().filter((entry) => entry.active !== false);
  const deliveryChannels = [...new Set([...activeOrderOptionNames(orderOptions, 'deliveryMethods'), HAND_DELIVERY])];

  const [step, setStep] = useState<'FORM' | 'CONFIRM'>('FORM');
  const [brandCodes, setBrandCodes] = useState<string[]>(brands.length === 1 ? [brands[0].code] : []);
  const [reachOut, setReachOut] = useState<string[]>([]);
  const [responsibleId, setResponsibleId] = useState(staff.some((entry) => entry.id === user.id) ? user.id : staff[0]?.id || '');
  const [sentAd, setSentAd] = useState(getTodayAd());
  const [sentBs, setSentBs] = useState(getTodayBs());
  const [expectedAd, setExpectedAd] = useState('');
  const [expectedBs, setExpectedBs] = useState('');
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [channel, setChannel] = useState(deliveryChannels.includes('Standard') ? 'Standard' : deliveryChannels[0]);
  const [address, setAddress] = useState(influencer.address || influencer.city || '');
  const [phone, setPhone] = useState(influencer.phone || '');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, refresh] = useState(0);

  const reachOutOptions = db.getMarketingOptions('REACH_OUT');
  // Products and combos (kits) are both sendable. Combos follow their products within each brand.
  const catalogue: CatalogueEntry[] = [
    ...db.getProducts('ALL').filter((product) => product.active !== false)
      .map((product) => ({ id: product.id, name: product.name, sku: product.sku || '', brandCode: product.brandCode, isCombo: false, contents: '' })),
    ...db.getCombos().filter((combo) => combo.active !== false && combo.isActive !== false)
      .map((combo) => ({ id: combo.id, name: combo.name, sku: combo.sku || '', brandCode: combo.brandCode, isCombo: true,
        contents: (combo.items || []).map((item) => `${item.quantity}× ${item.productName}`).join(', ') })),
  ];
  const available = useMemo(() => {
    const term = productQuery.trim().toLowerCase();
    return catalogue.filter((product) => brandCodes.includes(product.brandCode) && (!term || product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term) || product.contents.toLowerCase().includes(term)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandCodes, productQuery, catalogue.length]);
  const brandName = (code: string) => brands.find((brand) => brand.code === code)?.name || code;
  const productOf = (id: string) => catalogue.find((product) => product.id === id);
  const reachOutName = reachOutOptions.find((option) => option.id === reachOut[0])?.name || '';
  const responsible = staff.find((entry) => entry.id === responsibleId);
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

  const toggleBrand = (code: string) => {
    const next = brandCodes.includes(code) ? brandCodes.filter((entry) => entry !== code) : [...brandCodes, code];
    setBrandCodes(next);
    // Products of a brand that was just removed leave the send with it.
    setItems((rows) => rows.filter((row) => next.includes(productOf(row.productId)?.brandCode || '')));
    setErrors((current) => ({ ...current, brands: '' }));
  };
  const setQuantity = (productId: string, quantity: number) => setItems((rows) => rows.map((row) => row.productId === productId ? { ...row, quantity: Math.max(1, Math.min(999, Math.round(quantity) || 1)) } : row));

  const review = () => {
    const next: Record<string, string> = {};
    if (!brandCodes.length) next.brands = 'Choose at least one brand.';
    if (!reachOutName) next.reachOut = 'Choose where you contacted them.';
    if (!responsibleId) next.responsible = 'Choose the responsible person.';
    if (!sentAd) next.sent = 'Choose the sent date.';
    if (expectedAd && expectedAd < sentAd) next.expected = 'Cannot be earlier than the sent date.';
    if (!items.length) next.items = 'Add at least one product or combo.';
    setErrors(next);
    if (Object.keys(next).length) { toast.error('A few details are missing', Object.values(next)[0]); return; }
    setStep('CONFIRM');
  };

  const save = () => guardedSubmit(async () => {
    try {
      const send = db.createMarketingSend({
        influencerId: influencer.id, brandCodes, reachOutPlatform: reachOutName, responsibleId, sentDateAd: sentAd, sentDateBs: sentBs,
        ...(expectedAd ? { expectedContentDateAd: expectedAd, expectedContentDateBs: expectedBs } : {}),
        items: items.map((row) => { const product = productOf(row.productId)!; return { productId: product.id, productName: product.name, brandCode: product.brandCode, quantity: row.quantity, ...(product.isCombo ? { isCombo: true } : {}) }; }),
        deliveryChannel: channel, ...(address.trim() ? { deliveryAddress: address.trim() } : {}), ...(phone.trim() ? { deliveryPhone: phone.trim() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      try { await syncManager.forceSyncNow(); } catch { /* The send stays in the sync queue. */ }
      const saved = db.getMarketingSendById(send.id) || send;
      const pending = syncManager.getWorkspaceMutations().some((mutation) => mutation.collection === 'marketingSends' && mutation.id === send.id);
      if (pending) toast.info('Send saved on this device', 'It will get its MS number when the connection returns. Check Sync status.');
      else toast.success(`Send ${displayDocumentId(saved.sendNumber)} recorded`, `${totalUnits} item${totalUnits === 1 ? '' : 's'} to ${influencer.name}`);
      onSaved(saved);
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : 'The send could not be saved.'); }
  });

  if (!canPerform(user, 'marketing', 'CREATE')) return null;

  const footer = step === 'FORM' ? (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-slate-500">{items.length ? `${items.length} product${items.length === 1 ? '' : 's'} · ${totalUnits} unit${totalUnits === 1 ? '' : 's'}` : 'No products added'}</span>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button type="button" onClick={review} className="rounded-lg bg-purple-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700">Review send</button>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={() => setStep('FORM')} disabled={isSubmitting} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Back to edit</button>
      <button type="button" onClick={save} disabled={isSubmitting} className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-300">
        <Check className="h-3.5 w-3.5" /> {isSubmitting ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Saving…</> : 'Confirm and save send'}
      </button>
    </div>
  );

  return (
    <SlideOverPanel isOpen onClose={isSubmitting ? () => {} : onClose} width="lg" title={`Send products to ${influencer.name}`}
      subtitle={step === 'FORM' ? 'A marketing send. It is never counted as an order or a sale.' : 'Check the details, then confirm.'} footer={footer}>
      {step === 'CONFIRM' ? (
        <div className="space-y-4 p-5 text-xs">
          <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4">
            <p className="text-[11px] font-bold text-purple-700">Sending to</p>
            <p className="mt-0.5 text-base font-black text-slate-900">{influencer.name}</p>
            <p className="text-slate-600">{[channel, address.trim(), phone.trim()].filter(Boolean).join(' · ')}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {[['Brands', brandCodes.map(brandName).join(', ')], ['Reached out on', reachOutName], ['Responsible', responsible?.fullName || '—'], ['Sent', formatDate(sentAd, sentBs)],
              ['Content expected', expectedAd ? formatDate(expectedAd, expectedBs) : 'No date agreed'], ['Delivery', channel]].map(([term, detail]) => (
              <div key={term}><dt className="text-[11px] font-semibold text-slate-500">{term}</dt><dd className="font-bold text-slate-900">{detail}</dd></div>
            ))}
          </dl>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600"><span>Products</span><span>{totalUnits} unit{totalUnits === 1 ? '' : 's'}</span></div>
            <ul className="divide-y divide-slate-100">
              {items.map((row) => { const product = productOf(row.productId); return (
                <li key={row.productId} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{product?.name}{product?.isCombo && <ComboBadge />}</span><span className="text-[11px] text-slate-500">{brandName(product?.brandCode || '')}</span></span>
                  <span className="shrink-0 font-black text-slate-900">× {row.quantity}</span>
                </li>
              ); })}
            </ul>
          </div>
          {notes.trim() && <div><p className="text-[11px] font-semibold text-slate-500">Notes</p><p className="text-slate-800">{notes.trim()}</p></div>}
          {!expectedAd && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">No expected content date is set, so this send will not raise an overdue reminder.</p>}
        </div>
      ) : (
        <div className="space-y-5 p-5 text-xs">
          <section>
            <span className="mb-1.5 block font-bold text-slate-700">1. Brands <span className="text-rose-600">*</span></span>
            {!brands.length ? <p className="rounded-xl border border-dashed border-slate-200 p-3 text-slate-500">No active brand is assigned to your account.</p> : (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Brands">
                {brands.map((brand) => { const on = brandCodes.includes(brand.code); return (
                  <button key={brand.code} type="button" aria-pressed={on} onClick={() => toggleBrand(brand.code)}
                    className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 font-bold transition ${on ? 'border-purple-500 bg-purple-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-purple-300'}`}>
                    {on && <Check className="h-3 w-3" />}{brand.name}
                  </button>
                ); })}
              </div>
            )}
            {errors.brands && <p className="mt-1 text-[11px] font-medium text-rose-600">{errors.brands}</p>}
          </section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CreatableSelect label="2. Reach-out platform" required noun="reach-out platform" value={reachOut} onChange={(ids) => { setReachOut(ids); setErrors((current) => ({ ...current, reachOut: '' })); }}
              options={reachOutOptions.map((option) => ({ id: option.id, name: option.name }))} error={errors.reachOut}
              onCreate={(text) => { const made = db.addMarketingOption('REACH_OUT', text); refresh((n) => n + 1); return { id: made.id, name: made.name }; }}
              placeholder="Where did we contact them?" helper="For example Instagram DM, WhatsApp or an agency." />
            <div>
              <label htmlFor="send-responsible" className="mb-1 block font-bold text-slate-700">3. Responsible person <span className="text-rose-600">*</span></label>
              <select id="send-responsible" value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)} className={field}>
                {staff.map((entry) => <option key={entry.id} value={entry.id}>{entry.fullName}{entry.id === user.id ? ' (you)' : ''}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">Who was in contact about this send.</p>
              {errors.responsible && <p className="text-[11px] font-medium text-rose-600">{errors.responsible}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DualDateField id="send-sent" label="4. Sent date" required valueAd={sentAd} maxAd={getTodayAd()} error={errors.sent}
              onChange={(ad, bs) => { setSentAd(ad); setSentBs(bs); }} />
            <DualDateField id="send-expected" label="5. Expected content date" valueAd={expectedAd} minAd={sentAd} allowClear error={errors.expected}
              helper="Optional. Drives the Content overdue reminder." onChange={(ad, bs) => { setExpectedAd(ad); setExpectedBs(bs); setErrors((current) => ({ ...current, expected: '' })); }} />
          </div>

          <section>
            <span className="mb-1.5 block font-bold text-slate-700">6. Products and combos <span className="text-rose-600">*</span></span>
            {items.length > 0 && (
              <ul className="mb-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {items.map((row) => { const product = productOf(row.productId); return (
                  <li key={row.productId} className="flex items-center justify-between gap-2 bg-white px-3 py-2">
                    <span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{product?.name}{product?.isCombo && <ComboBadge />}</span><span className="text-[11px] text-slate-500">{brandName(product?.brandCode || '')}</span></span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" aria-label={`One fewer ${product?.name}`} onClick={() => setQuantity(row.productId, row.quantity - 1)} disabled={row.quantity <= 1} className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Minus className="h-3 w-3" /></button>
                      <input aria-label={`Quantity of ${product?.name}`} type="number" min={1} max={999} value={row.quantity} onChange={(event) => setQuantity(row.productId, Number(event.target.value))} className="w-12 rounded-lg border border-slate-200 py-1 text-center font-bold" />
                      <button type="button" aria-label={`One more ${product?.name}`} onClick={() => setQuantity(row.productId, row.quantity + 1)} className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"><Plus className="h-3 w-3" /></button>
                      <button type="button" aria-label={`Remove ${product?.name}`} onClick={() => setItems((rows) => rows.filter((entry) => entry.productId !== row.productId))} className="ml-1 rounded-lg p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  </li>
                ); })}
              </ul>
            )}
            {!brandCodes.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-slate-500">Choose a brand to see its products and combos.</p> : (
              <div className="rounded-xl border border-slate-200">
                <div className="relative border-b border-slate-100">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input aria-label="Search products and combos" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Search products and combos by name or SKU" className="w-full rounded-t-xl bg-transparent py-2 pl-8 pr-3 text-xs outline-none" />
                </div>
                <ul className="max-h-52 overflow-y-auto">
                  {brandCodes.map((code) => { const list = available.filter((product) => product.brandCode === code); if (!list.length) return null; return (
                    <li key={code}>
                      <p className="sticky top-0 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">{brandName(code)}</p>
                      <ul>
                        {list.map((product) => { const added = items.some((row) => row.productId === product.id); return (
                          <li key={product.id}>
                            <button type="button" disabled={added} onClick={() => { setItems((rows) => [...rows, { productId: product.id, quantity: 1 }]); setErrors((current) => ({ ...current, items: '' })); }}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-purple-50 disabled:cursor-default disabled:bg-white disabled:text-slate-400">
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{product.name}{product.isCombo && <ComboBadge />}</span>
                                {product.isCombo && product.contents && <span className="block truncate text-[11px] text-slate-500">{product.contents}</span>}
                              </span>
                              <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-bold ${added ? 'text-emerald-600' : 'text-purple-700'}`}>{added ? <><Check className="h-3 w-3" /> Added</> : <><PackagePlus className="h-3 w-3" /> Add</>}</span>
                            </button>
                          </li>
                        ); })}
                      </ul>
                    </li>
                  ); })}
                  {!available.length && <li className="p-4 text-center text-slate-500">{productQuery.trim() ? 'No product or combo matches this search.' : 'No active products or combos are saved for the selected brands.'}</li>}
                </ul>
              </div>
            )}
            {errors.items && <p className="mt-1 text-[11px] font-medium text-rose-600">{errors.items}</p>}
          </section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="send-channel" className="mb-1 block font-bold text-slate-700">7. Delivery channel</label>
              <select id="send-channel" value={channel} onChange={(event) => setChannel(event.target.value)} className={field}>
                {deliveryChannels.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="send-phone" className="mb-1 block font-bold text-slate-700">Delivery phone</label>
              <input id="send-phone" type="tel" value={phone} maxLength={20} onChange={(event) => setPhone(event.target.value)} placeholder="For the rider" className={`${field} font-mono`} />
            </div>
          </div>
          <div>
            <label htmlFor="send-address" className="mb-1 block font-bold text-slate-700">8. Delivery address</label>
            <input id="send-address" value={address} maxLength={300} onChange={(event) => setAddress(event.target.value)} placeholder="Where the parcel goes" className={field} />
            <p className="mt-1 text-[11px] text-slate-500">Filled from the profile. Changes here apply to this send only.</p>
          </div>
          <div>
            <label htmlFor="send-notes" className="mb-1 block font-bold text-slate-700">9. Notes</label>
            <textarea id="send-notes" rows={2} value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} placeholder="Brief, deliverables agreed, anything to remember" className={field} />
          </div>
        </div>
      )}
    </SlideOverPanel>
  );
}
