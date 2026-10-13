'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tag, Plus, Edit2, Ban, CheckCircle, X, Trash2, AlertTriangle, AlertCircle } from 'lucide-react';
import { Brand, BrandCode, BrandCategory } from '@/lib/types';
import { db } from '@/lib/db/db-service';
import {
  fetchBrandsFromSupabase,
  addBrand as apiAddBrand,
  updateBrand as apiUpdateBrand,
  deactivateBrand as apiDeactivateBrand,
  reactivateBrand as apiReactivateBrand,
  canDeleteBrand,
  deleteBrand as apiDeleteBrand,
  getBrandEntityCounts,
} from '@/lib/db/brands-service';
import { toast } from '@/components/common/Toast';
import SubmitButton from '@/components/common/SubmitButton';

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

  // Delete State
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null);
  const [deleteBlockedData, setDeleteBlockedData] = useState<{
    reason: string;
    counts: { orders: number; products: number; stockCounts: number; feedback: number; returns: number };
  } | null>(null);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const loadBrands = async () => {
    setLoading(true);
    try {
      const fetched = await fetchBrandsFromSupabase();
      if (fetched) {
        setBrands(fetched);
        // Sync local memory and persistence
        (db as any).brands = fetched;
        (db as any).persistState();
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

  const handleSaveBrand = async () => {
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

    if (isCurrentlyActive) {
      const confirmed = window.confirm(
        `Deactivate "${b.name}"?\n\nIt will be hidden from all forms and filters. Historical data is preserved. You can reactivate anytime.`
      );
      if (!confirmed) return;
    }

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

  const handleDeleteClick = async (b: Brand) => {
    setBrandToDelete(b);
    try {
      const check = await canDeleteBrand(b.code);
      if (!check.canDelete) {
        setDeleteBlockedData({
          reason: check.reason || '',
          counts: check.counts,
        });
        setShowConfirmDeleteModal(false);
      } else {
        setDeleteBlockedData(null);
        setDeleteConfirmText('');
        setShowConfirmDeleteModal(true);
      }
    } catch (err: any) {
      toast.error('Could not verify brand data: ' + err?.message);
    }
  };

  const handlePermanentDelete = async () => {
    if (!brandToDelete || deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    setIsDeleting(true);
    try {
      const res = await apiDeleteBrand(brandToDelete.id, brandToDelete.code);
      if (!res.success) {
        toast.error(res.error || 'Failed to delete brand');
      } else {
        toast.success(`Brand "${brandToDelete.name}" permanently deleted.`);
        setShowConfirmDeleteModal(false);
        setBrandToDelete(null);
        await loadBrands();
      }
    } catch (err: any) {
      toast.error('Deletion error: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsDeleting(false);
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
            const entityCounts = getBrandEntityCounts(b.code);

            return (
              <div
                key={b.id}
                className={`p-5 rounded-2xl border transition shadow-xs space-y-4 ${
                  isActive
                    ? 'bg-white border-slate-200 hover:border-slate-300'
                    : 'bg-slate-50/80 border-slate-200 opacity-80'
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

                {/* Products, Orders, Stores Count metrics */}
                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                  <span>Products: <strong className="text-slate-900">{entityCounts.products}</strong></span>
                  <span>&bull;</span>
                  <span>Orders: <strong className="text-slate-900">{entityCounts.orders}</strong></span>
                  <span>&bull;</span>
                  <span>Stores: <strong className="text-slate-900">{entityCounts.stores}</strong></span>
                </div>

                {/* Actions: Edit, Deactivate/Reactivate, Delete */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(b)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(b)}
                      className={`inline-flex items-center gap-1 text-xs font-semibold transition px-2.5 py-1 rounded-lg border cursor-pointer ${
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

                    <button
                      type="button"
                      onClick={() => handleDeleteClick(b)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg border border-transparent hover:border-rose-200 transition cursor-pointer"
                      title="Permanently remove brand"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
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
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 pt-4 text-xs">
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
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <SubmitButton
                  onClick={handleSaveBrand}
                  label={editingBrand ? 'Save Changes' : 'Save Brand'}
                  loadingLabel="Saving..."
                  variant="primary"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Blocked Deletion Modal (Has associated data) */}
      {deleteBlockedData && brandToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Cannot Delete &ldquo;{brandToDelete.name}&rdquo;
                </h3>
                <p className="text-xs text-slate-500">Brand has active references in database</p>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2">
              <p className="font-semibold text-slate-800">
                This brand is referenced by existing operations:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 font-medium">
                <li>{deleteBlockedData.counts.orders} orders</li>
                <li>{deleteBlockedData.counts.products} products</li>
                <li>{deleteBlockedData.counts.stockCounts} stock counts</li>
                <li>{deleteBlockedData.counts.feedback} feedback entries</li>
                <li>{deleteBlockedData.counts.returns} returns</li>
              </ul>
              <p className="text-[11px] text-slate-500 pt-1">
                Deleting would destroy this operational history. Use <strong>Deactivate</strong> instead to hide the brand from all current forms while preserving history.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setDeleteBlockedData(null);
                  setBrandToDelete(null);
                }}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = brandToDelete;
                  setDeleteBlockedData(null);
                  setBrandToDelete(null);
                  handleToggleActive(target);
                }}
                className="px-4 py-2 font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                Deactivate Instead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Permanent Delete (0 data) */}
      {showConfirmDeleteModal && brandToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Delete &ldquo;{brandToDelete.name}&rdquo; permanently?
                </h3>
                <p className="text-xs text-slate-500">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This brand has zero associated orders, products, or records. It will be permanently deleted from the database.
            </p>

            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Type &ldquo;DELETE&rdquo; to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 uppercase"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmDeleteModal(false);
                  setBrandToDelete(null);
                }}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <SubmitButton
                onClick={handlePermanentDelete}
                label="🗑️ Delete Forever"
                loadingLabel="Deleting..."
                variant="danger"
                disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE' || isDeleting}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
