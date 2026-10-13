'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
}

export default function InlineOrderForm({
  isOpen,
  targetBeat,
  onSaveOrder,
  onClose,
}: InlineOrderFormProps) {
  const products = useMemo(() => db.getProducts(), []);

  // Multi-item rows
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([
    {
      id: 'item_1',
      productId: products[0]?.id || '',
      unitType: 'CASES',
      quantity: 1,
      scheme: 'NONE',
    },
  ]);

  // Brand-level margins config
  const [brandMargins, setBrandMargins] = useState<
    Record<string, { pct: number; type: StoreMarginType }>
  >({});

  const [paymentTerms, setPaymentTerms] = useState<string>('COD');
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

      // Reset items if empty
      if (lineItems.length === 0 && products.length > 0) {
        setLineItems([
          {
            id: `item_${Date.now()}`,
            productId: products[0].id,
            unitType: 'CASES',
            quantity: 1,
            scheme: 'NONE',
          },
        ]);
      }
    }
  }, [targetBeat, isOpen, products]);

  if (!isOpen || !targetBeat) return null;

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
  const calculatedItems: SecondaryOrderItem[] = lineItems.map((item) => {
    const prod = products.find((p) => p.id === item.productId);
    const unitsPerCase = prod?.caseSize || 24;
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
  const grandMrpValue = lineItems.reduce((sum, it) => {
    const prod = products.find((p) => p.id === it.productId);
    const mrp = prod?.mrp || 0;
    const upc = prod?.caseSize || 24;
    const units = it.unitType === 'CASES' ? it.quantity * upc : it.quantity;
    return sum + mrp * units;
  }, 0);

  // Line item manipulation
  const handleAddLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        productId: products[0]?.id || '',
        unitType: 'CASES',
        quantity: 1,
        scheme: 'NONE',
      },
    ]);
  };

  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((it) => it.id !== id));
  };

  const handleUpdateLineItem = (id: string, updates: Partial<DraftLineItem>) => {
    setLineItems(
      lineItems.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, ...updates };

        if (updates.productId) {
          const prod = products.find((p) => p.id === updates.productId);
          if (prod?.orderUnitMode === 'PIECES') updated.unitType = 'PIECES';
          if (prod?.orderUnitMode === 'CASES') updated.unitType = 'CASES';
        }
        return updated;
      })
    );
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) setOrderPhotoUrl(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProceedToReview = () => {
    if (lineItems.length === 0 || grandTotalUnits === 0) {
      return;
    }
    setIsReviewStep(true);
  };

  const handleFinalSubmit = () => {
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
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4">
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
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {!isReviewStep ? (
            <>
              {/* 1. Multi-Item Order Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    Order Products ({lineItems.length} SKUs)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold transition text-xs shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Product</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {lineItems.map((item, index) => {
                    const prod = products.find((p) => p.id === item.productId);
                    const unitsPerCase = prod?.caseSize || 24;
                    const prodMode = prod?.orderUnitMode || 'BOTH';
                    const storePaysUnit = getStoreUnitPrice(item.productId);
                    const isCases = item.unitType === 'CASES';
                    const units = isCases ? item.quantity * unitsPerCase : item.quantity;
                    const lineAmount = storePaysUnit * units;

                    return (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              SKU #{index + 1}
                            </label>
                            <select
                              value={item.productId}
                              onChange={(e) =>
                                handleUpdateLineItem(item.id, { productId: e.target.value })
                              }
                              className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {products.map((p) => {
                                const bObj = db.getBrands('ALL').find((b) => b.code === p.brandCode);
                                const bLabel = bObj?.name || p.brandCode;
                                return (
                                  <option key={p.id} value={p.id}>
                                    [{bLabel}] {p.name} (MRP: Rs. {p.mrp})
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          {lineItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg mt-5 transition"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Quantity and Unit Mode */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-end">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Unit Mode
                            </label>
                            <select
                              value={item.unitType}
                              disabled={prodMode !== 'BOTH'}
                              onChange={(e) =>
                                handleUpdateLineItem(item.id, {
                                  unitType: e.target.value as 'CASES' | 'PIECES',
                                })
                              }
                              className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                            >
                              <option value="CASES">Cases ({unitsPerCase} pcs)</option>
                              <option value="PIECES">Pieces</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Quantity ({item.unitType === 'CASES' ? 'Cases' : 'Pcs'})
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdateLineItem(item.id, {
                                  quantity: Math.max(1, parseInt(e.target.value) || 1),
                                })
                              }
                              className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 text-center"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Promotional Scheme
                            </label>
                            <select
                              value={item.scheme}
                              onChange={(e) =>
                                handleUpdateLineItem(item.id, { scheme: e.target.value })
                              }
                              className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
                            >
                              <option value="NONE">No Scheme</option>
                              <option value="BUY_2_GET_4_FREE">Buy 2c Get 4pcs Free</option>
                              <option value="BUY_5_GET_1_CASE_FREE">Buy 5c Get 1c Free</option>
                            </select>
                          </div>

                          <div className="p-2 bg-white border border-slate-200 rounded-xl text-right">
                            <span className="text-[10px] text-slate-500 block">Store Pays</span>
                            <span className="font-bold text-slate-900 text-xs">
                              Rs. {lineAmount.toLocaleString()}
                            </span>
                            <span className="text-[9px] text-slate-400 block font-mono">
                              ({units} pcs @ Rs.{storePaysUnit})
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Brand Margins Engine (Section 4 & 9) */}
              <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-slate-900 text-xs">
                    Live Brand Commercial Terms &amp; Store Margins
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
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            {margin.pct}% Margin
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] text-slate-500 font-semibold">
                              Margin %
                            </label>
                            <input
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
                            <label className="text-[10px] text-slate-500 font-semibold">
                              Calc Mode
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
                                className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
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
                                className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
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
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Payment Terms
                  </label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white"
                  >
                    <option value="COD">Cash On Delivery (COD)</option>
                    <option value="CREDIT_7_DAYS">7 Days Credit</option>
                    <option value="CREDIT_15_DAYS">15 Days Credit</option>
                    <option value="CREDIT_30_DAYS">30 Days Credit</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Physical Order Sheet / Counter Photo
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
                      <span>Take / Upload Photo</span>
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
                <label className="block font-bold text-slate-800 mb-1">
                  Order Instructions &amp; Delivery Notes
                </label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="e.g. Deliver before 11 AM, urgent weekend stock..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          ) : (
            /* 2-Step Confirmation Summary Screen */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Store Information
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
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Ordered Products Breakdown
                </span>
                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {calculatedItems.map((item, idx) => (
                    <div key={idx} className="p-3.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{item.productName}</div>
                        <div className="text-[11px] text-slate-500">
                          {item.cases > 0 ? `${item.cases} cases ` : ''}
                          ({item.totalUnits} total pcs @ Rs. {item.unitPrice})
                          {item.freeUnits ? (
                            <span className="text-emerald-600 font-bold ml-1">
                              + {item.freeUnits} Free Pcs
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-right font-bold text-slate-900">
                        Rs. {item.totalAmount.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-600">
                  <span>Catalog MRP Value:</span>
                  <span className="font-semibold line-through text-slate-500">
                    Rs. {grandMrpValue.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-600">
                  <span>Total Order Volume:</span>
                  <span className="font-bold text-slate-900">{grandTotalUnits} pieces</span>
                </div>
                <div className="flex justify-between items-center text-sm font-bold text-emerald-900 pt-2 border-t border-emerald-200">
                  <span>Store Payable Amount:</span>
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
                <span className="text-slate-500 block">Total Payable:</span>
                <strong className="text-sm font-bold text-slate-900">
                  Rs. {grandStoreTotal.toLocaleString()}
                </strong>
                <span className="text-[10px] text-slate-400 block font-mono">
                  ({grandTotalUnits} units)
                </span>
              </div>
              <button
                type="button"
                onClick={handleProceedToReview}
                disabled={lineItems.length === 0 || grandTotalUnits === 0}
                className="flex-1 sm:flex-initial sm:px-8 h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-base shadow-sm transition flex items-center justify-center gap-2"
              >
                <span>Review Order with Retailer</span>
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
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                className="flex-1 h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-sm transition flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                <span>Confirm &amp; Book Order</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
