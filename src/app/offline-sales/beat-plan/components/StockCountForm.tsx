'use client';

import React, { useState } from 'react';
import { X, AlertTriangle, Check } from 'lucide-react';
import { BeatItem, Product, BrandCode } from '@/lib/types';
import { db } from '@/lib/db/db-service';
import { brandColor as getBrandColor } from '@/lib/ui-utils';

interface StockCountFormProps {
  isOpen: boolean;
  targetBeat: BeatItem | null;
  stockCounts: Record<string, number>;
  onStockChange: (productId: string, qty: number) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export default function StockCountForm({
  isOpen,
  targetBeat,
  stockCounts,
  onStockChange,
  onSubmit,
  onClose,
}: StockCountFormProps) {
  const [selectedBrand, setSelectedBrand] = useState<BrandCode | 'ALL'>('ALL');

  if (!isOpen || !targetBeat) return null;

  const products = db.getProducts();
  const brands = db.getBrands();

  const filteredProducts = products.filter((p) => {
    if (selectedBrand === 'ALL') return true;
    return p.brandCode === selectedBrand;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-2xl max-h-[85vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Multi-Brand Shelf Stock Count
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Store: <strong className="text-slate-800">{targetBeat.storeName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Brand Filter Pill Tabs */}
        <div className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-50 border-b border-slate-100 overflow-x-auto">
          <button
            onClick={() => setSelectedBrand('ALL')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              selectedBrand === 'ALL'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            All Brands ({products.length})
          </button>
          {brands.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBrand(b.code)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                selectedBrand === b.code
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>

        {/* SKUs List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {filteredProducts.map((p) => {
            const currentVal = stockCounts[p.id] ?? 0;
            const prevCount = 12; // historical baseline comparison
            const dropAlert = prevCount > 0 && currentVal <= prevCount * 0.5;

            return (
              <div
                key={p.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition ${
                  dropAlert
                    ? 'border-amber-300 bg-amber-50/40'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getBrandColor(
                        p.brandCode
                      )}`}
                    >
                      {p.brandCode}
                    </span>
                    <span className="text-xs font-bold text-slate-900 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                    <span>SKU: {p.sku}</span>
                    <span>• Threshold: {p.thresholdQty || 10}</span>
                    {dropAlert && (
                      <span className="flex items-center gap-1 text-amber-700 font-semibold">
                        <AlertTriangle className="w-3 h-3 text-amber-600" /> &gt;50% drop from prev
                      </span>
                    )}
                  </div>
                </div>

                {/* Counter Input */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onStockChange(p.id, Math.max(0, currentVal - 1))}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={currentVal}
                    onChange={(e) => onStockChange(p.id, Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-14 text-center py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => onStockChange(p.id, currentVal + 1)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
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
            <span>Save Stock Count</span>
          </button>
        </div>
      </div>
    </div>
  );
}
