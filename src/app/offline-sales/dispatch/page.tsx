'use client';

import React, { useState } from 'react';
import { db } from '@/lib/db/db-service';
import { Dispatch, DispatchItem, BrandCode } from '@/lib/types';
import { formatDualDate, getTodayAd, getTodayBs, adToBs } from '@/lib/nepali-calendar';
import CameraCapture from '@/components/common/CameraCapture';
import { toast } from '@/components/common/Toast';
import {
  Truck,
  Plus,
  Calendar,
  Building2,
  FileCheck,
  AlertCircle,
  History,
  Edit2,
  X,
  Check,
} from 'lucide-react';

import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import ConfirmModal from '@/components/common/ConfirmModal';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';

export default function DispatchPage() {
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [dispatches, setDispatches] = useState<Dispatch[]>(db.getDispatches());
  const unifiedStores = db.getStoresUnified();
  const products = db.getProducts();

  // Form State
  const [showLogModal, setShowLogModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState(unifiedStores[0]?.id || '');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [dispatchDateAd, setDispatchDateAd] = useState(getTodayAd());
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [dispatchPhotoUrl, setDispatchPhotoUrl] = useState('');
  const [lightboxChallanUrl, setLightboxChallanUrl] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<{ productId: string; quantity: number }[]>([
    { productId: products[0]?.id || '', quantity: 1 },
  ]);

  // Edit History Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [targetDispatch, setTargetDispatch] = useState<Dispatch | null>(null);
  const [editItem, setEditItem] = useState<{ productId: string; productName: string; quantity: number } | null>(null);
  const [editReason, setEditReason] = useState('');

  const selectedStore = unifiedStores.find((s) => s.id === selectedStoreId);
  const branches = selectedStore?.storeType === 'DISTRIBUTOR' ? db.getBranches(selectedStore.id) : [];

  const handleAddItemRow = () => {
    setSelectedItems([...selectedItems, { productId: products[0]?.id || '', quantity: 12 }]);
  };

  const handleRemoveItemRow = (idx: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: 'productId' | 'quantity', val: string | number) => {
    const updated = [...selectedItems];
    if (field === 'productId') updated[idx].productId = val as string;
    if (field === 'quantity') updated[idx].quantity = Math.max(1, Number(val) || 1);
    setSelectedItems(updated);
  };

  const totalUnits = selectedItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  const handleOpenConfirm = () => {
    if (selectedItems.length === 0 || totalUnits <= 0) return;
    setShowLogModal(false);
    setShowConfirmModal(true);
  };

  const handleConfirmDispatch = () => {
    guardedSubmit(async () => {
      const items: DispatchItem[] = selectedItems.map((si) => {
        const p = products.find((prod) => prod.id === si.productId);
        return {
          productId: si.productId,
          productName: p?.name || 'Product',
          brandCode: p?.brandCode || 'FORYA',
          quantity: si.quantity,
        };
      });

      db.addDispatch({
        distributorId: selectedStoreId,
        distributorName: selectedStore?.name || 'Store',
        branchId: selectedBranchId || undefined,
        branchName: selectedBranchId ? branches.find((b) => b.id === selectedBranchId)?.name : undefined,
        dispatchDateAd,
        dispatchDateBs: formatDualDate(dispatchDateAd).split(' (')[0],
        items,
        notes: dispatchNotes,
        documentUrl: dispatchPhotoUrl || undefined,
      });

      setDispatches([...db.getDispatches()]);
      setShowConfirmModal(false);
      setDispatchPhotoUrl('');
      toast.success('Dispatch recorded successfully. Inventory ledger updated.');
    });
  };

  const handleSaveEdit = () => {
    if (!targetDispatch || !editItem || !editReason.trim()) return;
    guardedSubmit(async () => {
      db.editDispatchItem(targetDispatch.id, editItem.productId, editItem.quantity, editReason);
      setDispatches([...db.getDispatches()]);
      setShowEditModal(false);
      setEditReason('');
      toast.success('Dispatch quantity updated. Reason logged in audit trail.');
    });
  };

  return (
    <PageGuard feature="dispatches">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Distributor Dispatches (Manual Entry)
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Bulk dispatches to distributor chains with 2-step confirmation and audit trail.
            </p>
          </div>

          <button
            onClick={() => setShowLogModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            Log Dispatch
          </button>
        </div>

        {/* Dispatches List */}
        <div className="space-y-4">
          {dispatches.length === 0 ? (
            <EmptyState
              type="generic"
              icon={Truck}
              title="No dispatches logged yet"
              description="Click 'Log Dispatch' to record bulk stock sent to a distributor."
            />
          ) : (
          dispatches.map((disp) => (
            <div
              key={disp.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base">{disp.distributorName}</h3>
                    {disp.branchName && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {disp.branchName}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Date: <strong className="text-slate-800">{disp.dispatchDateBs}</strong> ({disp.dispatchDateAd}) • Logged by: {disp.createdBy}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    {disp.items.reduce((s, i) => s + i.quantity, 0)} Total Units
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px]">
                      <th className="py-2">Product</th>
                      <th className="py-2">Brand</th>
                      <th className="py-2 text-right">Quantity</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {disp.items.map((item) => (
                      <tr key={item.productId} className="hover:bg-slate-50">
                        <td className="py-2 font-medium text-slate-800">{item.productName}</td>
                        <td className="py-2">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            {item.brandCode}
                          </span>
                        </td>
                        <td className="py-2 text-right font-bold text-slate-900">{item.quantity} units</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => {
                              setTargetDispatch(disp);
                              setEditItem(item);
                              setShowEditModal(true);
                            }}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            <Edit2 className="h-3 w-3" />
                            Edit Qty
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Edit History Trail */}
              {disp.edits && disp.edits.length > 0 && (
                <div className="rounded-lg bg-amber-50/60 border border-amber-200/60 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900 text-[11px] uppercase tracking-wider">
                    <History className="h-3.5 w-3.5" />
                    Edit History (Audit Trail)
                  </div>
                  {disp.edits.map((edit) => (
                    <div key={edit.id} className="text-amber-800 text-[11px]">
                      • {edit.productName}: Qty changed from <strong>{edit.oldQty}</strong> to <strong>{edit.newQty}</strong> by {edit.changedBy} — Reason: &quot;{edit.reason}&quot;
                    </div>
                  ))}
                </div>
              )}

              {disp.documentUrl && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Attached Challan / Receipt:</span>
                  <button
                    type="button"
                    onClick={() => setLightboxChallanUrl(disp.documentUrl || null)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition"
                  >
                    <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>View Stamped Challan Photo</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Step 1: Log Dispatch Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Log Dispatch to Distributor</h3>
              <button onClick={() => setShowLogModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Recipient Store / Partner *</label>
                  <select
                    value={selectedStoreId}
                    onChange={(e) => {
                      setSelectedStoreId(e.target.value);
                      setSelectedBranchId('');
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none bg-white text-xs font-medium"
                  >
                    <optgroup label="🏢 Distributor Chains & Central Warehouses">
                      {unifiedStores
                        .filter((s) => s.storeType === 'DISTRIBUTOR')
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.category || 'Distributor'})
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="🏪 Modern Trade / Chain Stores">
                      {unifiedStores
                        .filter((s) => s.storeType === 'CHAIN_STORE')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.category || 'Chain Store'})
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="🏬 Standalone Retail Stores">
                      {unifiedStores
                        .filter((s) => s.storeType === 'STANDALONE_RETAILER')
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.category || 'Retailer'})
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>
                {selectedStore?.storeType === 'DISTRIBUTOR' && branches.length > 0 ? (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Branch (or Central)</label>
                    <select
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none bg-white text-xs font-medium"
                    >
                      <option value="">HQ / Central Warehouse</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Store Location</label>
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 truncate text-xs">
                      {selectedStore?.address || 'Kathmandu Route'}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Dispatch Date</label>
                <input
                  type="date"
                  value={dispatchDateAd}
                  onChange={(e) => setDispatchDateAd(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none bg-white"
                />
              </div>

              {/* Items Rows */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700">Products & Quantities *</label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-blue-600 hover:underline font-semibold text-[11px]"
                  >
                    + Add Product
                  </button>
                </div>

                <div className="space-y-2">
                  {selectedItems.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={row.productId}
                        onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none bg-white"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.brandCode}] {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={row.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        className="w-24 rounded-lg border border-slate-300 px-3 py-2 outline-none text-center font-bold"
                      />
                      {selectedItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Remarks / Delivery Challan Ref</label>
                <input
                  type="text"
                  placeholder="e.g. Challan #DC-99241, Driver: Ram Bahadur"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                />
              </div>

              {/* Delivery Challan Photo Evidence */}
              <CameraCapture
                folder="dispatches"
                label="Photograph Delivery Challan / Bilti Copy"
                sublabel="Capture stamped challan signed by receiving bay"
                maxFiles={1}
                existingUrls={dispatchPhotoUrl ? [dispatchPhotoUrl] : []}
                onRemoveExisting={() => setDispatchPhotoUrl('')}
                onUpload={(results) => setDispatchPhotoUrl(results[0]?.url || '')}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowLogModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleOpenConfirm}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow"
              >
                Review & Confirm Dispatch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIX 50b: Context-Rich Dispatch Confirmation Review Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        title={`Confirm Dispatch to ${selectedStore?.name || 'Store'}?`}
        variant="info"
        confirmLabel="✓ Confirm Dispatch"
        cancelLabel="← Back to Edit"
        details={[
          ...selectedItems.map((si) => {
            const p = products.find((x) => x.id === si.productId);
            return {
              label: p?.name || 'Product',
              value: `${si.quantity} units ${p?.caseSize ? `(${p.caseSize}/carton)` : ''}`,
            };
          }),
          { label: 'Total Volume', value: `${totalUnits} units, ${selectedItems.length} product(s)` },
          { label: 'Dispatch Date', value: formatDualDate(dispatchDateAd).split(' (')[0] },
          { label: 'Payment Terms', value: '15-day credit terms' },
          { label: 'Payment Due Date', value: adToBs(new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]).formatted },
        ]}
        consequences={[
          `Add ${totalUnits} units to ${selectedStore?.name || 'Distributor'} inventory ledger`,
          `Create automated payment follow-up reminder for ${adToBs(new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]).formatted}`,
          'Notify assigned field territory officer of scheduled handover',
        ]}
        onConfirm={handleConfirmDispatch}
        onCancel={() => {
          setShowConfirmModal(false);
          setShowLogModal(true);
        }}
      />

      {/* Edit Quantity with Required Reason Modal */}
      {showEditModal && targetDispatch && editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Edit Dispatch Quantity</h3>
              <button onClick={() => setShowEditModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <div className="font-semibold text-slate-800 mb-1">{editItem.productName}</div>
              <div className="text-slate-500">Distributor: {targetDispatch.distributorName}</div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">New Quantity *</label>
              <input
                type="number"
                min="0"
                value={editItem.quantity}
                onChange={(e) => setEditItem({ ...editItem, quantity: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Reason for change (Required for Audit Trail) *</label>
              <textarea
                rows={3}
                placeholder="e.g. Typo during entry (entered 30 instead of 20), verified with delivery challan copy"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3 outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowEditModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSubmitting || !editReason.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 shadow disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                )}
                {isSubmitting ? 'Saving...' : 'Save & Update Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attached Challan Lightbox Modal */}
      {lightboxChallanUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setLightboxChallanUrl(null)}
        >
          <div
            className="relative max-w-2xl max-h-[90vh] bg-white rounded-2xl overflow-hidden p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxChallanUrl(null)}
              className="absolute top-4 right-4 z-10 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full p-1.5 transition"
            >
              <X className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxChallanUrl}
              alt="Signed Delivery Challan"
              className="max-h-[80vh] w-auto max-w-full object-contain rounded-xl mx-auto"
            />
          </div>
        </div>
      )}
    </div>
    </PageGuard>
  );
}
