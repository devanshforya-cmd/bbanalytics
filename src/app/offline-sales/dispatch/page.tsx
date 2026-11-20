'use client';

import InfoTip from '@/components/common/InfoTip';
import DownloadButton from '@/components/common/DownloadButton';
import React, { useEffect, useState } from 'react';
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
  // Keep the list current when a sync brings in new or changed dispatches.
  useEffect(() => {
    const refresh = () => setDispatches([...db.getDispatches()]);
    refresh();
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);
  const unifiedStores = db.getStoresUnified();
  const products = db.getProducts().filter(product => product.active !== false);

  // Form State
  const [showLogModal, setShowLogModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState(unifiedStores[0]?.id || '');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [dispatchDateAd, setDispatchDateAd] = useState(getTodayAd());
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [dispatchPhotoUrl, setDispatchPhotoUrl] = useState('');
  const [lightboxChallanUrl, setLightboxChallanUrl] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<{ productId: string; cartons: number; units: number }[]>([{ productId: '', cartons: 0, units: 0 }]);

  // Correcting a logged dispatch: all its lines at once, one reason.
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Record<string, number>>({});
  const [correctionReason, setCorrectionReason] = useState('');

  // The store list fills in after the first render, so fall back to the option the select is showing.
  const effectiveStoreId = selectedStoreId || unifiedStores[0]?.id || '';
  const selectedStore = unifiedStores.find((s) => s.id === effectiveStoreId);
  const branches = selectedStore?.storeType === 'DISTRIBUTOR' ? db.getBranches(selectedStore.id) : [];
  const caseSize = (productId: string) => products.find((p) => p.id === productId)?.caseSize || 0;
  const lineUnits = (row: { productId: string; cartons: number; units: number }) => row.cartons * caseSize(row.productId) + row.units;
  const filledLines = selectedItems.filter((row) => row.productId && lineUnits(row) > 0);
  const totalUnits = filledLines.reduce((sum, row) => sum + lineUnits(row), 0);
  const terms = selectedStore?.paymentTerms || '';
  const termDays = Number(/(\d+)/.exec(terms)?.[1] || 0);
  const dueDateAd = termDays ? new Date(Date.parse(`${dispatchDateAd}T00:00:00Z`) + termDays * 86400000).toISOString().slice(0, 10) : '';

  const resetForm = () => {
    setSelectedItems([{ productId: '', cartons: 0, units: 0 }]);
    setDispatchNotes('');
    setDispatchPhotoUrl('');
    setSelectedBranchId('');
    setDispatchDateAd(getTodayAd());
  };

  const updateLine = (idx: number, patch: Partial<{ productId: string; cartons: number; units: number }>) => {
    setSelectedItems((rows) => rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const handleOpenConfirm = () => {
    if (!effectiveStoreId) { toast.error('Choose who the stock is going to.'); return; }
    if (!filledLines.length) { toast.error('Add at least one product with a quantity.'); return; }
    setShowLogModal(false);
    setShowConfirmModal(true);
  };

  const handleConfirmDispatch = () => {
    guardedSubmit(async () => {
      const items: DispatchItem[] = filledLines.map((row) => {
        const p = products.find((prod) => prod.id === row.productId);
        if (!p) throw new Error('Choose an active product before dispatching.');
        return { productId: p.id, productName: p.name, brandCode: p.brandCode, quantity: lineUnits(row), quantityPcs: lineUnits(row) };
      });
      db.addDispatch({
        distributorId: effectiveStoreId,
        distributorName: selectedStore?.name || 'Store',
        branchId: selectedBranchId || undefined,
        branchName: selectedBranchId ? branches.find((b) => b.id === selectedBranchId)?.name : undefined,
        dispatchDateAd,
        dispatchDateBs: formatDualDate(dispatchDateAd).split(' (')[0],
        items,
        notes: dispatchNotes,
        documentUrl: dispatchPhotoUrl || undefined,
        paymentTerms: terms || undefined,
        paymentDueDateAd: dueDateAd || undefined,
        paymentDueDateBs: dueDateAd ? adToBs(`${dueDateAd}T12:00:00`).formatted : undefined,
        paymentStatus: terms && !/cash/i.test(terms) ? 'PENDING' : undefined,
      });
      setDispatches([...db.getDispatches()]);
      setShowConfirmModal(false);
      resetForm();
      toast.success('Dispatch logged.');
    });
  };

  const startCorrecting = (disp: Dispatch) => {
    setCorrecting(disp.id);
    setCorrections(Object.fromEntries(disp.items.map((item) => [item.productId, item.quantity])));
    setCorrectionReason('');
  };

  const saveCorrections = (disp: Dispatch) => {
    const changed = disp.items.filter((item) => corrections[item.productId] !== item.quantity);
    if (!changed.length) { setCorrecting(null); return; }
    if (!correctionReason.trim()) { toast.error('Say why the quantities changed. It goes in the history.'); return; }
    guardedSubmit(async () => {
      for (const item of changed) db.editDispatchItem(disp.id, item.productId, Math.max(0, corrections[item.productId] || 0), correctionReason.trim());
      setDispatches([...db.getDispatches()]);
      setCorrecting(null);
      toast.success(`${changed.length} ${changed.length === 1 ? 'quantity' : 'quantities'} corrected.`);
    });
  };

  return (
    <PageGuard feature="dispatches">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Distributor Dispatches (Manual Entry)
<InfoTip label="About this page">Bulk dispatches to distributor chains with 2-step confirmation and audit trail.</InfoTip></h1>
            
          </div>
          <DownloadButton datasets={['dispatch_lines']} records={{ dispatches } as any} />

          <button
            onClick={() => { resetForm(); setShowLogModal(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            Log dispatch
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
                    {disp.dispatchNumber && <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">{disp.dispatchNumber}</span>}
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

              {/* Items, with one correction mode for the whole dispatch */}
              {(() => {
                const editing = correcting === disp.id;
                const changes = editing ? disp.items.filter((item) => corrections[item.productId] !== item.quantity).length : 0;
                return (
                  <div className={editing ? 'rounded-xl ring-2 ring-blue-200 bg-blue-50/30 p-3 -mx-1' : ''}>
                    <div className="overflow-x-auto" tabIndex={0}>
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-500 text-[11px]">
                            <th className="py-2 font-semibold">Product</th>
                            <th className="py-2 font-semibold">Brand</th>
                            <th className="py-2 text-right font-semibold">Units</th>
                            {editing && <th className="py-2 pl-4 font-semibold">Corrected to</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {disp.items.map((item) => {
                            const next = corrections[item.productId] ?? item.quantity;
                            const diff = next - item.quantity;
                            return (
                              <tr key={item.productId}>
                                <td className="py-2 font-medium text-slate-800">{item.productName}</td>
                                <td className="py-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{item.brandCode}</span></td>
                                <td className={`py-2 text-right font-bold ${editing && diff ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.quantity}</td>
                                {editing && (
                                  <td className="py-1.5 pl-4">
                                    <div className="flex items-center gap-2">
                                      <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
                                        <button type="button" aria-label={`Fewer ${item.productName}`} onClick={() => setCorrections((c) => ({ ...c, [item.productId]: Math.max(0, next - 1) }))} className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100">−</button>
                                        <input aria-label={`Corrected units of ${item.productName}`} type="number" min={0} value={next}
                                          onChange={(e) => setCorrections((c) => ({ ...c, [item.productId]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                          className="w-16 border-x border-slate-200 py-1.5 text-center font-bold outline-none" />
                                        <button type="button" aria-label={`More ${item.productName}`} onClick={() => setCorrections((c) => ({ ...c, [item.productId]: next + 1 }))} className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100">+</button>
                                      </div>
                                      {diff !== 0 && <span className={`text-[11px] font-bold ${diff > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{diff > 0 ? '+' : ''}{diff}</span>}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {editing ? (
                      <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-2">
                        <label className="flex-1 text-xs">
                          <span className="block font-semibold text-slate-700 mb-1">Why are these changing?{changes ? '' : ' (change a quantity first)'}</span>
                          <input value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="e.g. Challan shows 60, entered 72 by mistake"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500" />
                        </label>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setCorrecting(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                          <button type="button" onClick={() => saveCorrections(disp)} disabled={isSubmitting || !changes || !correctionReason.trim()}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                            {changes ? `Save ${changes} ${changes === 1 ? 'correction' : 'corrections'}` : 'Save corrections'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex justify-end">
                        <button type="button" onClick={() => startCorrecting(disp)} disabled={!!correcting}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                          <Edit2 className="h-3 w-3" /> Correct quantities
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {disp.edits && disp.edits.length > 0 && (
                <details className="rounded-lg bg-amber-50/60 border border-amber-200/60 px-3 py-2 text-xs">
                  <summary className="cursor-pointer select-none flex items-center gap-1.5 font-semibold text-amber-900 text-[11px]">
                    <History className="h-3.5 w-3.5" /> {disp.edits.length} {disp.edits.length === 1 ? 'correction' : 'corrections'} made
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {disp.edits.map((edit) => (
                      <li key={edit.id} className="text-amber-900 text-[11px]">
                        <strong>{edit.productName}</strong>: {edit.oldQty} → {edit.newQty} by {edit.changedBy}, {new Date(edit.createdAt).toLocaleDateString()}. <span className="text-amber-800">“{edit.reason}”</span>
                      </li>
                    ))}
                  </ul>
                </details>
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

      {/* Step 1: Log Dispatch */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 sm:p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="dispatch-title">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 id="dispatch-title" className="font-bold text-slate-900 text-base">Log a dispatch</h3>
                <p className="text-xs text-slate-500 mt-0.5">Stock leaving the warehouse for a distributor, chain or store.</p>
              </div>
              <button onClick={() => setShowLogModal(false)} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-xs">
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block sm:col-span-2">
                  <span className="block font-semibold text-slate-700 mb-1">Going to *</span>
                  <select value={effectiveStoreId} onChange={(e) => { setSelectedStoreId(e.target.value); setSelectedBranchId(''); }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none bg-white text-sm focus:border-blue-500">
                    {([['DISTRIBUTOR', 'Distributors'], ['CHAIN_STORE', 'Chains'], ['STANDALONE_RETAILER', 'Retail stores']] as const).map(([type, label]) => {
                      const list = unifiedStores.filter((store) => store.storeType === type);
                      return list.length ? <optgroup key={type} label={label}>{list.map((store) => <option key={store.id} value={store.id}>{store.name}{store.city ? `, ${store.city}` : ''}</option>)}</optgroup> : null;
                    })}
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {[selectedStore?.address, terms ? `Terms: ${terms}` : 'No payment terms on file'].filter(Boolean).join(' · ')}
                  </span>
                </label>
                {branches.length > 0 && (
                  <label className="block">
                    <span className="block font-semibold text-slate-700 mb-1">Branch</span>
                    <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none bg-white text-sm">
                      <option value="">Head office / central warehouse</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="block font-semibold text-slate-700 mb-1">Dispatch date</span>
                  <input type="date" value={dispatchDateAd} onChange={(e) => setDispatchDateAd(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none bg-white text-sm" />
                  <span className="mt-1 block text-[11px] text-slate-500">{formatDualDate(dispatchDateAd).split(' (')[0]}</span>
                </label>
              </section>

              <section>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="font-semibold text-slate-700">Products *</span>
                  <span className="text-[11px] text-slate-500">Cartons are worked out from each product&apos;s case size.</span>
                </div>
                <div className="rounded-xl border border-slate-200">
                  <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_88px_88px_72px_32px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500 rounded-t-xl">
                    <span>Product</span><span className="text-center">Cartons</span><span className="text-center">Loose units</span><span className="text-right">Total</span><span />
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {selectedItems.map((row, idx) => {
                      const size = caseSize(row.productId);
                      const taken = new Set(selectedItems.filter((_, i) => i !== idx).map((r) => r.productId));
                      return (
                        <li key={idx} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_88px_88px_72px_32px] items-center gap-2 px-3 py-2">
                          <select aria-label={`Product ${idx + 1}`} value={row.productId} onChange={(e) => updateLine(idx, { productId: e.target.value })}
                            className="col-span-2 sm:col-span-1 min-w-0 rounded-lg border border-slate-300 px-2.5 py-2 outline-none bg-white text-sm">
                            <option value="">Choose a product…</option>
                            {products.map((p) => <option key={p.id} value={p.id} disabled={taken.has(p.id)}>{(p as any).alias || p.name}{p.caseSize ? ` (${p.caseSize}/carton)` : ''}</option>)}
                          </select>
                          <input aria-label={`Cartons of product ${idx + 1}`} type="number" min={0} value={row.cartons || ''} placeholder="Cartons" disabled={!size}
                            title={size ? `${size} units per carton` : 'No case size set for this product'}
                            onChange={(e) => updateLine(idx, { cartons: Math.max(0, parseInt(e.target.value) || 0) })}
                            className="rounded-lg border border-slate-300 px-2 py-2 text-center font-semibold outline-none disabled:bg-slate-50" />
                          <input aria-label={`Loose units of product ${idx + 1}`} type="number" min={0} value={row.units || ''} placeholder="Units"
                            onChange={(e) => updateLine(idx, { units: Math.max(0, parseInt(e.target.value) || 0) })}
                            className="rounded-lg border border-slate-300 px-2 py-2 text-center font-semibold outline-none" />
                          <span className="text-right font-bold text-slate-900 text-sm">{lineUnits(row) || '–'}</span>
                          <button type="button" onClick={() => setSelectedItems((rows) => rows.length > 1 ? rows.filter((_, i) => i !== idx) : [{ productId: '', cartons: 0, units: 0 }])}
                            aria-label={`Remove product ${idx + 1}`} className="justify-self-end rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
                    <button type="button" disabled={selectedItems.length >= products.length}
                      onClick={() => setSelectedItems((rows) => [...rows, { productId: '', cartons: 0, units: 0 }])}
                      className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add product</button>
                    <span className="text-slate-600">Total <strong className="text-slate-900 text-sm">{totalUnits.toLocaleString()}</strong> units</span>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <label className="block">
                  <span className="block font-semibold text-slate-700 mb-1">Challan number or note</span>
                  <input type="text" placeholder="e.g. Challan DC-99241, driver Ram Bahadur" value={dispatchNotes} onChange={(e) => setDispatchNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none text-sm" />
                </label>
                <CameraCapture folder="dispatches" label="Photo of the signed challan" sublabel="Optional. Take it once the receiving bay has stamped it."
                  maxFiles={1} existingUrls={dispatchPhotoUrl ? [dispatchPhotoUrl] : []} onRemoveExisting={() => setDispatchPhotoUrl('')} onUpload={(results) => setDispatchPhotoUrl(results[0]?.url || '')} />
              </section>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
              <span className="text-xs text-slate-500">{filledLines.length} {filledLines.length === 1 ? 'product' : 'products'}, {totalUnits.toLocaleString()} units</span>
              <div className="flex gap-2">
                <button onClick={() => setShowLogModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={handleOpenConfirm} disabled={!filledLines.length} className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow disabled:opacity-50">Review dispatch</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: confirm */}
      <ConfirmModal
        isOpen={showConfirmModal}
        title={`Dispatch to ${selectedStore?.name || 'store'}${selectedBranchId ? `, ${branches.find((b) => b.id === selectedBranchId)?.name}` : ''}?`}
        variant="info"
        confirmLabel="Log dispatch"
        cancelLabel="Back to edit"
        details={[
          ...filledLines.map((row) => {
            const p = products.find((x) => x.id === row.productId);
            return { label: p?.name || 'Product', value: `${lineUnits(row)} units${row.cartons ? ` (${row.cartons} × ${caseSize(row.productId)}${row.units ? ` + ${row.units}` : ''})` : ''}` };
          }),
          { label: 'Total', value: `${totalUnits.toLocaleString()} units, ${filledLines.length} ${filledLines.length === 1 ? 'product' : 'products'}` },
          { label: 'Dispatch date', value: formatDualDate(dispatchDateAd).split(' (')[0] },
          { label: 'Payment terms', value: terms || 'None on file' },
          ...(dueDateAd ? [{ label: 'Payment due', value: adToBs(`${dueDateAd}T12:00:00`).formatted }] : []),
        ]}
        consequences={[
          'Add it to the dispatch list and the store’s record',
          ...(dueDateAd && !/cash/i.test(terms) ? ['Mark the payment as pending until it is collected'] : []),
        ]}
        onConfirm={handleConfirmDispatch}
        onCancel={() => { setShowConfirmModal(false); setShowLogModal(true); }}
      />

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
