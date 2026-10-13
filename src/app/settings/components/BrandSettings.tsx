'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tag, Plus, ExternalLink, Edit2, Ban, CheckCircle, X, Sparkles, AlertCircle } from 'lucide-react';
import { Brand, BrandCode, BrandCategory } from '@/lib/types';
import { db } from '@/lib/db/db-service';
import {
  fetchBrandsFromSupabase,
  addBrand as apiAddBrand,
  updateBrand as apiUpdateBrand,
  deactivateBrand as apiDeactivateBrand,
  reactivateBrand as apiReactivateBrand,
} from '@/lib/db/brands-service';
import { toast } from '@/components/common/Toast';

export default function BrandSettings() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);

  // Form Fields
  const [brandName, setBrandName] = useState('');
  const [brandCode, setBrandCode] = useState('');
  const [brandColor, setBrandColor] = useState('#10b981');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [brandCategory, setBrandCategory] = useState<BrandCategory>('Personal Care');
  const [principalCompany, setPrincipalCompany] = useState('');

  const loadBrands = async () => {
    setLoading(true);
    try {
      const fetched = await fetchBrandsFromSupabase();
      if (fetched && fetched.length > 0) {
        setBrands(fetched);
        // Also sync local db state
        fetched.forEach((b) => {
          if (!db.getBrands('ALL').some((existing) => existing.id === b.id || existing.code === b.code)) {
            db.addBrand(b);
          }
        });
      } else {
        setBrands(db.getBrands('ALL'));
      }
    } catch {
      setBrands(db.getBrands('ALL'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrands();
  }, []);

  const handleNameChange = (val: string) => {
    setBrandName(val);
    if (!codeManuallyEdited && !editingBrand) {
      // Auto-generate code: "Forya" -> "FORYA", "Pee Safe" -> "PEE_SAFE"
      const generated = val
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      setBrandCode(generated);
    }
  };

  const openAddModal = () => {
    setEditingBrand(null);
    setBrandName('');
    setBrandCode('');
    setBrandColor('#10b981');
    setCodeManuallyEdited(false);
    setBrandCategory('Personal Care');
    setPrincipalCompany('');
    setShowModal(true);
  };

  const openEditModal = (b: Brand) => {
    setEditingBrand(b);
    setBrandName(b.name);
    setBrandCode(b.code);
    setBrandColor(b.color || '#3b82f6');
    setCodeManuallyEdited(true);
    setBrandCategory(b.category || 'Personal Care');
    setPrincipalCompany(b.principalCompany || '');
    setShowModal(true);
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) {
      toast.error('Brand name is required');
      return;
    }
    const cleanCode = (brandCode || brandName).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    if (!cleanCode) {
      toast.error('Valid brand code is required');
      return;
    }

    try {
      if (editingBrand) {
        // Update existing brand
        const updates: Partial<Brand> = {
          name: brandName.trim(),
          color: brandColor,
          category: brandCategory,
          principalCompany: principalCompany.trim() || undefined,
        };
        db.updateBrand(editingBrand.id, updates);
        await apiUpdateBrand(editingBrand.id, updates);
        toast.success(`Brand "${brandName}" updated successfully`);
      } else {
        // Create new brand
        const newBrandObj: Brand = {
          id: `brand_${cleanCode.toLowerCase()}`,
          code: cleanCode as BrandCode,
          name: brandName.trim(),
          color: brandColor,
          category: brandCategory,
          description: `${brandName.trim()} portfolio under Brand Bucket distribution.`,
          principalCompany: principalCompany.trim() || 'Brand Bucket Nepal',
          isActive: true,
          status: 'ACTIVE',
        };
        db.addBrand(newBrandObj);
        await apiAddBrand(newBrandObj);
        toast.success(`Brand "${brandName}" added! Now available across the platform.`);
      }

      setShowModal(false);
      await loadBrands();
    } catch (err: any) {
      toast.error('Failed to save brand: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleToggleActive = async (b: Brand) => {
    const isCurrentlyActive = b.isActive !== false && b.status !== 'ARCHIVED';
    try {
      if (isCurrentlyActive) {
        db.updateBrand(b.id, { isActive: false, status: 'ARCHIVED' });
        await apiDeactivateBrand(b.id);
        toast.success(`Brand "${b.name}" deactivated. Historical data preserved.`);
      } else {
        db.updateBrand(b.id, { isActive: true, status: 'ACTIVE' });
        await apiReactivateBrand(b.id);
        toast.success(`Brand "${b.name}" reactivated and restored to forms.`);
      }
      await loadBrands();
    } catch (err: any) {
      toast.error('Status update failed: ' + (err?.message || 'Unknown error'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">BRAND MANAGEMENT</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure your brand portfolio. Active brands dynamically populate header filters, product catalogs, and field orders.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Brand</span>
        </button>
      </div>

      {/* Brands List / Empty State */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
          Loading configured brands...
        </div>
      ) : brands.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Tag className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">No brands configured yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Add your first brand to get started. Brands appear across all filters, product catalogs, and field sales forms.
            </p>
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add First Brand</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((b) => {
            const isActive = b.isActive !== false && b.status !== 'ARCHIVED';
            const productCount = db.getProducts(b.code).length;

            return (
              <div
                key={b.id}
                className={`p-5 rounded-2xl border transition shadow-xs space-y-4 ${
                  isActive
                    ? 'bg-white border-slate-200 hover:border-slate-300'
                    : 'bg-slate-50/70 border-slate-200/60 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-white text-sm shadow-xs"
                      style={{ backgroundColor: b.color || '#3b82f6' }}
                    >
                      {b.code.slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <span>{b.name}</span>
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                          style={{ backgroundColor: b.color || '#3b82f6' }}
                        />
                      </h3>
                      <p className="text-xs text-slate-500 font-mono">
                        Code: <strong className="text-slate-800">{b.code}</strong>
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-200 text-slate-600 border-slate-300'
                    }`}
                  >
                    {isActive ? 'Active' : 'Deactivated'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Category</span>
                    <div className="font-semibold text-slate-700 mt-0.5">{b.category || 'FMCG'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Products</span>
                    <div className="font-semibold text-slate-700 mt-0.5">{productCount} SKUs</div>
                  </div>
                </div>

                {/* Actions: Edit, Deactivate/Reactivate (cannot delete) */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(b)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleActive(b)}
                    className={`inline-flex items-center gap-1 text-xs font-semibold transition px-2.5 py-1 rounded-lg border ${
                      isActive
                        ? 'text-amber-700 hover:bg-amber-50 border-amber-200 bg-amber-50/50'
                        : 'text-emerald-700 hover:bg-emerald-50 border-emerald-200 bg-emerald-50/50'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <Ban className="w-3.5 h-3.5" />
                        <span>Deactivate</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Reactivate</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Brand Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                {editingBrand ? `Edit Brand: ${editingBrand.name}` : 'Add Brand'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBrand} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Brand Name *</label>
                <input
                  type="text"
                  required
                  value={brandName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Forya"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Brand Code * <span className="text-slate-400 font-normal">(Auto-generated)</span>
                </label>
                <input
                  type="text"
                  required
                  value={brandCode}
                  onChange={(e) => {
                    setCodeManuallyEdited(true);
                    setBrandCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
                  }}
                  placeholder="e.g. FORYA"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 uppercase font-mono text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Brand Color <span className="text-slate-400 font-normal">(Hex color for badges &amp; charts)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-0.5 bg-white shrink-0"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-28 px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs font-semibold uppercase text-slate-800"
                  />
                  <div
                    className="flex-1 px-3 py-2 rounded-xl text-center font-bold text-white text-xs shadow-2xs"
                    style={{ backgroundColor: brandColor }}
                  >
                    Badge Preview
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Category (Optional)</label>
                <select
                  value={brandCategory}
                  onChange={(e) => setBrandCategory(e.target.value as BrandCategory)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white"
                >
                  <option value="Personal Care">Personal Care</option>
                  <option value="Cosmetics">Cosmetics</option>
                  <option value="Hygiene">Hygiene</option>
                  <option value="Baby Care">Baby Care</option>
                  <option value="Wellness">Wellness</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition cursor-pointer"
                >
                  {editingBrand ? 'Save Changes' : 'Save Brand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
