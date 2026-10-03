'use client';

import React from 'react';
import { X, ShoppingBag, Check, Camera, Trash2 } from 'lucide-react';
import { BeatItem } from '@/lib/types';
import { db } from '@/lib/db/db-service';

interface InlineOrderFormProps {
  isOpen: boolean;
  targetBeat: BeatItem | null;
  orderProductId: string;
  setOrderProductId: (id: string) => void;
  orderUnitType: 'CASES' | 'PIECES';
  setOrderUnitType: (type: 'CASES' | 'PIECES') => void;
  orderCases: number;
  setOrderCases: (cases: number) => void;
  orderPieces: number;
  setOrderPieces: (pcs: number) => void;
  orderScheme: string;
  setOrderScheme: (scheme: string) => void;
  orderNotes: string;
  setOrderNotes: (notes: string) => void;
  orderPhotoUrl: string;
  setOrderPhotoUrl: (url: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export default function InlineOrderForm({
  isOpen,
  targetBeat,
  orderProductId,
  setOrderProductId,
  orderUnitType,
  setOrderUnitType,
  orderCases,
  setOrderCases,
  orderPieces,
  setOrderPieces,
  orderScheme,
  setOrderScheme,
  orderNotes,
  setOrderNotes,
  orderPhotoUrl,
  setOrderPhotoUrl,
  onSubmit,
  onClose,
}: InlineOrderFormProps) {
  if (!isOpen || !targetBeat) return null;

  const products = db.getProducts();
  const selectedProduct = products.find((p) => p.id === orderProductId);
  const unitsPerCase = selectedProduct?.caseSize || 24;
  const productMode = selectedProduct?.orderUnitMode || 'BOTH';

  const effectiveUnitType =
    productMode === 'CASES' ? 'CASES' : productMode === 'PIECES' ? 'PIECES' : orderUnitType;

  const totalUnits =
    effectiveUnitType === 'CASES' ? orderCases * unitsPerCase : orderPieces;

  let freeUnits = 0;
  if (effectiveUnitType === 'CASES') {
    if (orderScheme === 'BUY_2_GET_4_FREE' && orderCases >= 2) {
      freeUnits = 4;
    } else if (orderScheme === 'BUY_5_GET_1_CASE_FREE' && orderCases >= 5) {
      freeUnits = unitsPerCase;
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setOrderPhotoUrl(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Book Secondary Retail Order</h3>
              <p className="text-xs text-slate-500">{targetBeat.storeName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Select Product SKU</label>
            <select
              value={orderProductId}
              onChange={(e) => {
                const nextId = e.target.value;
                setOrderProductId(nextId);
                const prod = products.find((p) => p.id === nextId);
                if (prod?.orderUnitMode === 'PIECES') {
                  setOrderUnitType('PIECES');
                } else if (prod?.orderUnitMode === 'CASES') {
                  setOrderUnitType('CASES');
                }
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Choose SKU from catalog --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.brandCode === 'PEE_SAFE' ? 'Pee Safe & FURR' : p.brandCode}] {p.name} ({p.caseSize || 24} pcs/case)
                  {p.orderUnitMode === 'PIECES'
                    ? ' [Pieces Only]'
                    : p.orderUnitMode === 'CASES'
                    ? ' [Cases Only]'
                    : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Unit Toggle if product allows both */}
          {productMode === 'BOTH' && (
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="font-semibold text-slate-700">Booking Unit:</span>
              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setOrderUnitType('CASES')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                    effectiveUnitType === 'CASES'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Cases ({unitsPerCase} pcs/case)
                </button>
                <button
                  type="button"
                  onClick={() => setOrderUnitType('PIECES')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                    effectiveUnitType === 'PIECES'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Individual Pieces
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {effectiveUnitType === 'CASES' ? (
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Order Quantity (Cases)
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOrderCases(Math.max(1, orderCases - 1))}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={orderCases}
                    onChange={(e) => setOrderCases(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-center py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setOrderCases(orderCases + 1)}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition"
                  >
                    +
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Order Quantity (Pieces)
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOrderPieces(Math.max(1, orderPieces - 1))}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={orderPieces}
                    onChange={(e) => setOrderPieces(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-center py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setOrderPieces(orderPieces + 1)}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Promotional Scheme</label>
              <select
                value={orderScheme}
                onChange={(e) => setOrderScheme(e.target.value)}
                disabled={effectiveUnitType === 'PIECES'}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="NONE">Standard Trade Terms</option>
                <option value="BUY_2_GET_4_FREE">Buy 2 Cases + 4 Free Units</option>
                <option value="BUY_5_GET_1_CASE_FREE">Buy 5 Cases + 1 Free Case</option>
              </select>
            </div>
          </div>

          {/* Unit calculation preview banner */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-600">Calculated secondary units:</span>
              <strong className="text-slate-900 ml-1.5">
                {totalUnits} pieces {effectiveUnitType === 'CASES' && `(${orderCases} cases)`}
              </strong>
            </div>
            {freeUnits > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                + {freeUnits} Free Bonus Units
              </span>
            )}
          </div>

          {/* Order Photo Upload */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Order Proof / Written PO / Invoice Picture (Optional)
            </label>
            {orderPhotoUrl ? (
              <div className="relative rounded-xl border border-slate-200 p-2 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src={orderPhotoUrl}
                    alt="Order proof"
                    className="w-12 h-12 object-cover rounded-lg border border-slate-200"
                  />
                  <span className="text-xs text-slate-700 font-medium">Order proof attached</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOrderPhotoUrl('')}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                  title="Remove image"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 w-full p-3 border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 rounded-xl cursor-pointer transition text-slate-600 font-medium text-xs">
                <Camera className="w-4 h-4 text-blue-600" />
                <span>Take Photo / Upload Purchase Order</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleImageChange}
                />
              </label>
            )}
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Delivery Notes &amp; Chalan Specs</label>
            <textarea
              rows={2}
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="e.g. Urgent morning dispatch, deliver via Kalimati distributor branch..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition"
          >
            <Check className="w-4 h-4" />
            <span>Confirm &amp; Queue Order</span>
          </button>
        </div>
      </div>
    </div>
  );
}
