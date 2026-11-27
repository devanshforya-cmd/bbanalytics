'use client';

import NumberInput from '@/components/common/NumberInput';
import Portal from '@/components/common/Portal';
import React, { useState, useEffect, useMemo } from 'react';
import { capturePhoto } from '@/lib/photo-capture';
import {
  X,
  ShoppingBag,
  Plus,
  Trash2,
  Camera,
  CheckCircle,
  Percent,
  Check,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { BeatItem, SecondaryOrderItem, StoreMarginType } from '@/lib/types';
import { db } from '@/lib/db/db-service';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import SearchSelect from '@/components/common/SearchSelect';
import PaymentTermsField from '@/components/stores/PaymentTermsField';
import { productLabel } from '@/lib/sub-brands';

export interface MultiProductOrderData {
  items: SecondaryOrderItem[];
  totalAmount: number;
  totalUnits: number;
  paymentTerms: string;
  brandMargins: Record<string, { pct: number; type: StoreMarginType; perUnitPrices?: Record<string, number> }>;
  notes?: string;
  orderPhotoUrl?: string;
}

interface InlineOrderFormProps {
  isOpen: boolean;
  targetBeat: BeatItem | null;
  onSaveOrder: (data: MultiProductOrderData) => void;
  onClose: () => void;
}

interface DraftLineItem {
  id: string;
  productId: string;
  unitType: 'CASES' | 'PIECES';
  quantity: number;
  scheme: string;
  /** Pieces per case for this order. Starts at the product's case size; the rep can change it when the pack size differs. */
  caseSize?: number;
}

const DEFAULT_CASE = 24;

export default function InlineOrderForm({
  isOpen,
  targetBeat,
  onSaveOrder,
  onClose,
}: InlineOrderFormProps) {
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [products, setProducts] = useState(() => db.getProducts().filter(product => product.active !== false));
  useEffect(() => {
    const refresh = () => setProducts(db.getProducts().filter(product => product.active !== false));
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  // Multi-item rows
  const blankLine = (): DraftLineItem => ({ id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, productId: '', unitType: 'CASES', quantity: 1, scheme: 'NONE' });
  const [lineItems, setLineItems] = useState<DraftLineItem[]>(() => [blankLine()]);
  /** Asked when the last product is removed: cancel the order, or pick another product. */
  const [lastLinePrompt, setLastLinePrompt] = useState(false);
  const [storeBrands, setStoreBrands] = useState<string[]>([]);

  // Brand-level margins config
  const [brandMargins, setBrandMargins] = useState<
    Record<string, { pct: number; type: StoreMarginType }>
  >({});

  const [paymentTerms, setPaymentTerms] = useState<string>('COD');
  const [termsKey, setTermsKey] = useState(0);
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [orderPhotoUrl, setOrderPhotoUrl] = useState<string>('');
  const [isReviewStep, setIsReviewStep] = useState<boolean>(false);

  // Initialize/sync store commercial terms when opening modal
  useEffect(() => {
    if (targetBeat && isOpen) {
      const s = db.getUnifiedStoreById(targetBeat.entityId);
      setIsReviewStep(false);

      // Load margins from store if set
      const margins = s?.defaultMargins as any;
      const initialMargins: Record<string, { pct: number; type: StoreMarginType }> = {};
      const allBrands = db.getBrands('ALL');
      allBrands.forEach((b) => {
        initialMargins[b.code] = {
          pct: margins?.[b.code]?.pct ?? 20,
          type: margins?.[b.code]?.type ?? 'MARKDOWN',
        };
      });
      setBrandMargins(initialMargins);

      // Start each order fresh, with the store's own payment terms and brands.
      setLineItems([blankLine()]);
      setLastLinePrompt(false);
      setPaymentTerms(s?.paymentTerms || 'COD');
      setTermsKey((key) => key + 1);
      setStoreBrands(((s as any)?.brandCodes || []).map((code: string) => code.toUpperCase()));
      setOrderNotes('');
      setOrderPhotoUrl('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetBeat?.id, targetBeat?.entityId, isOpen]);

  if (!isOpen || !targetBeat) return null;

  // Only the brands this store was given (all brands when none are set).
  const offered = storeBrands.length ? products.filter((p) => storeBrands.includes(String(p.brandCode).toUpperCase())) : products;
  const brandName = (code: string) => db.getBrands('ALL').find((b) => b.code === code)?.name || code;
  const chosenLines = lineItems.filter((item) => item.productId);

  // Identify distinct brands present in the selected line items
  const activeBrands = Array.from(
    new Set(
      lineItems
        .map((item) => products.find((p) => p.id === item.productId)?.brandCode)
        .filter(Boolean) as string[]
    )
  );

  // Calculate live store payable price per unit for a given product
  const getStoreUnitPrice = (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return 0;
    const mrp = prod.mrp || 0;
    const marginConfig = brandMargins[prod.brandCode] || { pct: 25, type: 'MARKDOWN' };
    const pct = marginConfig.pct || 0;

    if (marginConfig.type === 'MARKDOWN') {
      return Math.round(mrp * (1 - pct / 100));
    } else {
      // Markup
      return pct > 0 ? Math.round(mrp / (1 + pct / 100)) : mrp;
    }
  };

  // Calculate totals and secondary order items
  const casePcs = (item: DraftLineItem) => item.caseSize || products.find((p) => p.id === item.productId)?.caseSize || DEFAULT_CASE;
  const calculatedItems: SecondaryOrderItem[] = chosenLines.map((item) => {
    const prod = products.find((p) => p.id === item.productId);
    const unitsPerCase = casePcs(item);
    const storePaysUnit = getStoreUnitPrice(item.productId);

    const isCases = item.unitType === 'CASES';
    const cases = isCases ? item.quantity : Math.floor(item.quantity / unitsPerCase);
    const totalUnits = isCases ? item.quantity * unitsPerCase : item.quantity;

    let freeUnits = 0;
    if (isCases) {
      if (item.scheme === 'BUY_2_GET_4_FREE' && item.quantity >= 2) freeUnits = 4;
      else if (item.scheme === 'BUY_5_GET_1_CASE_FREE' && item.quantity >= 5) freeUnits = unitsPerCase;
    }

    // Line payable based on store price
    const lineStoreAmount = storePaysUnit * totalUnits;

    return {
      productId: item.productId,
      productName: prod?.name || 'Product',
      brandCode: prod?.brandCode || (activeBrands[0] || 'BRAND'),
      cases,
      unitsPerCase,
      totalUnits,
      unitPrice: storePaysUnit,
      totalAmount: lineStoreAmount,
      freeUnits,
      appliedScheme: item.scheme !== 'NONE' ? item.scheme : undefined,
    };
  });

  const grandStoreTotal = calculatedItems.reduce((sum, it) => sum + it.totalAmount, 0);
  const grandTotalUnits = calculatedItems.reduce((sum, it) => sum + it.totalUnits, 0);
  const grandMrpValue = chosenLines.reduce((sum, it) => {
    const prod = products.find((p) => p.id === it.productId);
    const mrp = prod?.mrp || 0;
    const upc = casePcs(it);
    const units = it.unitType === 'CASES' ? it.quantity * upc : it.quantity;
    return sum + mrp * units;
  }, 0);

  // Line item manipulation
  const handleAddLineItem = () => { setLineItems((rows) => [...rows, blankLine()]); setLastLinePrompt(false); };

  /** Removing the only product would leave an empty order: ask what to do instead. */
  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length === 1) { setLastLinePrompt(true); return; }
    setLineItems((rows) => rows.filter((it) => it.id !== id));
  };

  const handleUpdateLineItem = (id: string, updates: Partial<DraftLineItem>) => {
    setLineItems(
      lineItems.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, ...updates };

        if (updates.productId) {
          const prod = products.find((p) => p.id === updates.productId);
          delete updated.caseSize; // A new product starts from its own case size.
          if (prod?.orderUnitMode === 'PIECES') updated.unitType = 'PIECES';
          if (prod?.orderUnitMode === 'CASES') updated.unitType = 'CASES';
        }
        return updated;
      })
    );
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    void capturePhoto(e.target.files?.[0], 'beat_plans', setOrderPhotoUrl);
    e.target.value = '';
  };

  const emptyLine = lineItems.findIndex((item) => !item.productId);
  const reviewBlocker = !chosenLines.length ? 'Choose a product to order.'
    : emptyLine >= 0 ? `Choose a product for line ${emptyLine + 1}, or remove it.`
    : grandTotalUnits === 0 ? 'Enter a quantity.' : '';
  const handleProceedToReview = () => {
    if (reviewBlocker) return;
    setIsReviewStep(true);
  };

  const handleFinalSubmit = () => {
    guardedSubmit(async () => {
      const brandMarginsPayload: Record<
        string,
        { pct: number; type: StoreMarginType; perUnitPrices?: Record<string, number> }
      > = {};

      activeBrands.forEach((b) => {
        brandMarginsPayload[b] = {
          pct: brandMargins[b]?.pct ?? 25,
          type: brandMargins[b]?.type ?? 'MARKDOWN',
        };
      });

      onSaveOrder({
        items: calculatedItems,
        totalAmount: grandStoreTotal,
        totalUnits: grandTotalUnits,
        paymentTerms,
        brandMargins: brandMarginsPayload,
        notes: orderNotes || undefined,
        orderPhotoUrl: orderPhotoUrl || undefined,
      });
    });
  };

  return (
    <Portal><div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            {isReviewStep ? (
              <button
                type="button"
                onClick={() => setIsReviewStep(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600">
                <ShoppingBag className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isReviewStep ? 'Review & Confirm Order' : 'Book Secondary Retail Order'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">{targetBeat.storeName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {!isReviewStep ? (
            <>
              {/* 1. Products */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Products ({chosenLines.length})</h4>
                    <p className="text-[11px] text-slate-500">{storeBrands.length ? `This store stocks ${storeBrands.map(brandName).join(', ')}.` : 'All brands.'}</p>
                  </div>
                  <button type="button" onClick={handleAddLineItem}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100">
                    <Plus className="h-3.5 w-3.5" />Add product
                  </button>
                </div>

                {offered.length === 0 && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">No active products for this store&apos;s brands. Add products in Products, or change the store&apos;s brands.</p>
                )}

                <ul className="space-y-2.5">
                  {lineItems.map((item, index) => {
                    const prod = products.find((p) => p.id === item.productId);
                    const unitsPerCase = casePcs(item);
                    const catalogCase = prod?.caseSize || DEFAULT_CASE;
                    const prodMode = prod?.orderUnitMode || 'BOTH';
                    const storePaysUnit = getStoreUnitPrice(item.productId);
                    const isCases = item.unitType === 'CASES';
                    const units = isCases ? item.quantity * unitsPerCase : item.quantity;
                    const lineAmount = storePaysUnit * units;
                    const taken = new Set(lineItems.filter((other) => other.id !== item.id).map((other) => other.productId));
                    const options = offered.filter((p) => !taken.has(p.id)).map((p) => ({ value: p.id, label: productLabel(p), hint: [brandName(p.brandCode), p.mrp ? `MRP Rs. ${p.mrp}` : '', p.sku].filter(Boolean).join(' · '), group: brandName(p.brandCode) }));
                    const segment = (on: boolean) => `flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition ${on ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`;

                    return (
                      <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
                        <div className="flex items-start gap-2">
                          <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <SearchSelect label={`Product ${index + 1}`} options={options} value={item.productId}
                              onChange={(value) => handleUpdateLineItem(item.id, { productId: value })} placeholder="Search product, short name or SKU" />
                          </div>
                          <button type="button" onClick={() => handleRemoveLineItem(item.id)} aria-label={`Remove product ${index + 1}`} title="Remove"
                            className="mt-6 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {prod && (
                          <div className="mt-3 space-y-2.5 pl-8">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                              <div>
                                <span className="text-[11px] font-bold text-slate-500">Order in</span>
                                <div className={`mt-1 flex gap-0.5 rounded-lg bg-slate-100 p-0.5 ${prodMode !== 'BOTH' ? 'opacity-60' : ''}`} role="group" aria-label="Order in cases or pieces">
                                  <button type="button" disabled={prodMode === 'PIECES'} aria-pressed={isCases} onClick={() => handleUpdateLineItem(item.id, { unitType: 'CASES' })} className={segment(isCases)}>Cases</button>
                                  <button type="button" disabled={prodMode === 'CASES'} aria-pressed={!isCases} onClick={() => handleUpdateLineItem(item.id, { unitType: 'PIECES', scheme: 'NONE' })} className={segment(!isCases)}>Pieces</button>
                                </div>
                              </div>
                              <label className="block">
                                <span className="text-[11px] font-bold text-slate-500">{isCases ? 'Cases' : 'Pieces'}</span>
                                <NumberInput type="number" min={1} inputMode="numeric" value={item.quantity}
                                  onChange={(e) => handleUpdateLineItem(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm font-bold text-slate-900" />
                              </label>
                              {isCases ? (
                                <label className="block">
                                  <span className="text-[11px] font-bold text-slate-500">Pcs per case</span>
                                  <NumberInput type="number" min={1} max={1000} inputMode="numeric" value={unitsPerCase}
                                    onChange={(e) => {
                                      const next = Math.min(1000, Math.max(1, parseInt(e.target.value) || 1));
                                      handleUpdateLineItem(item.id, { caseSize: next === catalogCase ? undefined : next });
                                    }}
                                    className={`mt-1 w-full rounded-lg border bg-white px-2 py-1.5 text-center text-sm font-bold ${unitsPerCase !== catalogCase ? 'border-amber-400 text-amber-800' : 'border-slate-300 text-slate-900'}`} />
                                </label>
                              ) : <div className="hidden sm:block" />}
                            </div>
                            {isCases && unitsPerCase !== catalogCase && (
                              <p className="text-[11px] text-amber-800">Usually {catalogCase} per case. <button type="button" onClick={() => handleUpdateLineItem(item.id, { caseSize: undefined })} className="font-semibold underline">Use {catalogCase}</button></p>
                            )}
                            {isCases && (
                              <label className="flex items-center gap-2">
                                <span className="shrink-0 text-[11px] font-bold text-slate-500">Scheme</span>
                                <select value={item.scheme} onChange={(e) => handleUpdateLineItem(item.id, { scheme: e.target.value })}
                                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900">
                                  <option value="NONE">No scheme</option>
                                  <option value="BUY_2_GET_4_FREE">Buy 2 cases, get 4 pcs free</option>
                                  <option value="BUY_5_GET_1_CASE_FREE">Buy 5 cases, get 1 case free</option>
                                </select>
                              </label>
                            )}
                            <div className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                              <span className="text-[11px] text-slate-600">{units} pcs × Rs. {storePaysUnit.toLocaleString()}</span>
                              <span className="text-sm font-bold text-slate-900">Rs. {lineAmount.toLocaleString()}</span>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {lastLinePrompt && (
                  <div role="alertdialog" aria-labelledby="last-line-title" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <p id="last-line-title" className="text-sm font-bold text-rose-900">This is the only product in the order.</p>
                    <p className="mt-0.5 text-xs text-rose-800">Removing it leaves nothing to order. Cancel the order, or choose a different product?</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setLastLinePrompt(false); onClose(); }} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700">Cancel the order</button>
                      <button type="button" onClick={() => { setLineItems([blankLine()]); setLastLinePrompt(false); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50">Choose another product</button>
                      <button type="button" onClick={() => setLastLinePrompt(false)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:underline">Keep it</button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Brand Margins Engine (Section 4 & 9) */}
              <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-slate-900 text-xs">
                    Live brand commercial terms &amp; store margins
                  </h4>
                </div>
                <p className="text-[11px] text-slate-600">
                  Store margins auto-calculate the retailer billing price per piece and total order payout.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {activeBrands.map((brand) => {
                    const margin = brandMargins[brand] || { pct: 25, type: 'MARKDOWN' };
                    const bObj = db.getBrands('ALL').find((b) => b.code === brand);
                    const brandLabel = bObj?.name || brand;

                    return (
                      <div
                        key={brand}
                        className="p-3 bg-white border border-blue-200 rounded-xl shadow-2xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-xs">{brandLabel}</span>
                          <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            {margin.pct}% Margin
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="text-[11px] text-slate-500 font-semibold">
                              Margin %
                            </label>
                            <NumberInput aria-label="Margin %"
                              type="number"
                              min={0}
                              max={60}
                              value={margin.pct}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                setBrandMargins({
                                  ...brandMargins,
                                  [brand]: { ...margin, pct: val },
                                });
                              }}
                              className="w-full mt-0.5 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 text-center"
                            />
                          </div>

                          <div className="flex-1">
                            <label className="text-[11px] text-slate-500 font-semibold">
                              Calc mode
                            </label>
                            <div className="flex items-center gap-1 mt-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setBrandMargins({
                                    ...brandMargins,
                                    [brand]: { ...margin, type: 'MARKDOWN' },
                                  })
                                }
                                className={`flex-1 py-1 text-[11px] font-bold rounded-md transition ${
                                  margin.type === 'MARKDOWN'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                Down
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setBrandMargins({
                                    ...brandMargins,
                                    [brand]: { ...margin, type: 'MARKUP' },
                                  })
                                }
                                className={`flex-1 py-1 text-[11px] font-bold rounded-md transition ${
                                  margin.type === 'MARKUP'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                Up
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Payment Terms & Photo Upload */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <PaymentTermsField key={termsKey} idPrefix="order-terms" terms={paymentTerms} onTermsChange={setPaymentTerms} />
                  <p className="mt-1 text-[11px] text-slate-500">Starts at the store&apos;s terms. Change it for this order only.</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Physical order sheet / counter photo
                  </label>
                  {orderPhotoUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-emerald-300 h-10 bg-slate-900 flex items-center justify-between px-3 text-white text-xs">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                        <CheckCircle className="w-4 h-4" /> Photo Attached
                      </span>
                      <button
                        type="button"
                        onClick={() => setOrderPhotoUrl('')}
                        className="text-slate-300 hover:text-white"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl p-2.5 bg-slate-50 hover:bg-slate-100 cursor-pointer text-slate-600 font-semibold transition">
                      <Camera className="w-4 h-4 text-blue-600" />
                      <span>Take / upload photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoCapture}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* 4. Notes */}
              <div>
                <label htmlFor="inlineorderform-order-instructions-amp-deliv" className="block font-bold text-slate-800 mb-1">
                  Order instructions &amp; delivery notes
                </label>
                <input id="inlineorderform-order-instructions-amp-deliv"
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="e.g. Deliver before 11 AM, urgent weekend stock…"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          ) : (
            /* 2-Step Confirmation Summary Screen */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-500 ">
                  Store information
                </span>
                <div className="text-sm font-bold text-slate-900">{targetBeat.storeName}</div>
                <div className="text-xs text-slate-500">
                  Contact: {targetBeat.contactName} ({targetBeat.contactPhone})
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  Payment Terms: <strong className="text-slate-900">{paymentTerms}</strong>
                </div>
              </div>

              {/* Items Breakdown */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-500 ">
                  Ordered products breakdown
                </span>
                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {calculatedItems.map((item, idx) => (
                    <div key={idx} className="p-3.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{item.productName}</div>
                        <div className="text-[11px] text-slate-500">
                          {item.cases > 0 ? `${item.cases} cases × ${item.unitsPerCase} pcs ` : ''}
                          ({item.totalUnits} total pcs @ Rs. {item.unitPrice})
                          {item.freeUnits ? (
                            <span className="text-emerald-600 font-bold ml-1">
                              + {item.freeUnits} Free Pcs
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-right font-bold text-slate-900">Rs. {item.totalAmount.toLocaleString()}</span>
                        <button type="button" aria-label={`Remove ${item.productName}`} title="Remove"
                          onClick={() => { const line = chosenLines[idx]; if (!line) return; if (lineItems.length === 1) { setIsReviewStep(false); setLastLinePrompt(true); } else handleRemoveLineItem(line.id); }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-600">
                  <span>Catalog MRP value:</span>
                  <span className="font-semibold line-through text-slate-500">
                    Rs. {grandMrpValue.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-600">
                  <span>Total order volume:</span>
                  <span className="font-bold text-slate-900">{grandTotalUnits} pieces</span>
                </div>
                <div className="flex justify-between items-center text-sm font-bold text-emerald-900 pt-2 border-t border-emerald-200">
                  <span>Store payable amount:</span>
                  <span className="text-base text-emerald-700">
                    Rs. {grandStoreTotal.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Big Action Buttons (Section 4 & 5: 56px touch target) */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          {!isReviewStep ? (
            <>
              <div className="text-xs">
                <span className="text-slate-500 block">Total payable:</span>
                <strong className="text-sm font-bold text-slate-900">
                  Rs. {grandStoreTotal.toLocaleString()}
                </strong>
                <span className="text-[11px] text-slate-500 block font-mono">
                  ({grandTotalUnits} units)
                </span>
                {reviewBlocker && <span className="block text-[11px] font-semibold text-amber-700">{reviewBlocker}</span>}
              </div>
              <button
                type="button"
                onClick={handleProceedToReview}
                disabled={!!reviewBlocker}
                title={reviewBlocker || undefined}
                className="flex-1 sm:flex-initial sm:px-8 h-14 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-base shadow-sm transition flex items-center justify-center gap-2"
              >
                <span>Review order with retailer</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsReviewStep(false)}
                className="px-5 h-14 rounded-2xl border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 text-sm transition"
              >
                Back to edit
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="flex-1 h-14 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-base shadow-sm transition flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    <span>Booking order…</span>
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Confirm &amp; book order</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div></Portal>
  );
}
