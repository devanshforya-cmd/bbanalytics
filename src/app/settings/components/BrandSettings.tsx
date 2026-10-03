'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Tag, Plus, ExternalLink, Sparkles, Check, X } from 'lucide-react';
import { Brand, BrandCode, BrandCategory } from '@/lib/types';
import { db } from '@/lib/db/db-service';
import { toast } from '@/components/common/Toast';

export default function BrandSettings() {
  const [brands, setBrands] = useState<Brand[]>(db.getBrands());
  const [showAddBrandModal, setShowAddBrandModal] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandCode, setNewBrandCode] = useState('');
  const [newBrandCategory, setNewBrandCategory] = useState<BrandCategory>('Personal Care');
  const [newBrandColor, setNewBrandColor] = useState('#2563eb');
  const [newBrandPrincipal, setNewBrandPrincipal] = useState('');

  const refreshBrands = () => {
    setBrands([...db.getBrands()]);
  };

  const handleCreateBrand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName || !newBrandCode) {
      toast.error('Brand name and code are required.');
      return;
    }

    const cleanCode = newBrandCode.toUpperCase().replace(/\s+/g, '_') as BrandCode;
    db.addBrand({
      id: `brand_${cleanCode.toLowerCase()}`,
      code: cleanCode,
      name: newBrandName,
      category: newBrandCategory,
      color: newBrandColor,
      description: `${newBrandName} product line under Brand Bucket distribution.`,
      principalCompany: newBrandPrincipal || 'Brand Bucket Nepal',
    });

    toast.success(`Brand portfolio ${newBrandName} successfully registered.`);
    setShowAddBrandModal(false);
    setNewBrandName('');
    setNewBrandCode('');
    refreshBrands();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-800">Brand Portfolio Configuration</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure managed brands, color coding, principal import companies, and SKU mappings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddBrandModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Register New Brand</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {brands.map((b) => {
          const productCount = db.getProducts(b.code).length;

          return (
            <div
              key={b.id}
              className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm shadow-xs"
                    style={{ backgroundColor: b.color || '#2563eb' }}
                  >
                    {b.code.slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{b.name}</h3>
                    <p className="text-xs text-slate-500">
                      Code: <strong className="font-mono text-slate-700">{b.code}</strong>
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                  Active
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">{b.description}</p>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold">Category</span>
                  <div className="font-semibold text-slate-800 mt-0.5">{b.category || 'FMCG'}</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold">Principal Co.</span>
                  <div className="font-semibold text-slate-800 mt-0.5 truncate">
                    {b.principalCompany || 'Brand Bucket'}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  {productCount} SKUs in catalog
                </span>
                <Link
                  href={`/products?brand=${b.code}`}
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                >
                  <span>View SKUs</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Brand Modal */}
      {showAddBrandModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Register New Brand</h3>
              <button
                onClick={() => setShowAddBrandModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBrand} className="space-y-3.5 pt-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Brand Name *</label>
                <input
                  type="text"
                  required
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  placeholder="e.g. Dot &amp; Key"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Brand Code *</label>
                  <input
                    type="text"
                    required
                    value={newBrandCode}
                    onChange={(e) => setNewBrandCode(e.target.value)}
                    placeholder="e.g. DOT_KEY"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 uppercase font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Theme Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newBrandColor}
                      onChange={(e) => setNewBrandColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                    />
                    <span className="font-mono text-xs">{newBrandColor}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Principal Company</label>
                <input
                  type="text"
                  value={newBrandPrincipal}
                  onChange={(e) => setNewBrandPrincipal(e.target.value)}
                  placeholder="e.g. Dot &amp; Key India Ltd"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddBrandModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs"
                >
                  Create Brand
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
