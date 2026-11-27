'use client';

import NumberInput from '@/components/common/NumberInput';
import Portal from '@/components/common/Portal';
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { toast } from '@/components/common/Toast';
import { formatDualDate } from '@/lib/nepali-calendar';
import { productLabel } from '@/lib/sub-brands';
import { buildCountItems, checkCount, countSheet, type SheetRow } from '@/lib/stock-count-sheet';
import { buildSalesItems, currentStock } from '@/lib/store-stock';
import type { StockCount } from '@/lib/types';

export interface CountTarget {
  storeId: string;
  storeName: string;
  entityType: 'BRANCH' | 'RETAILER';
  visitId?: string;
  dateAd?: string;
  dateBs?: string;
  /** Which form opens first: what is on the shelf now, or what was sold today. */
  mode?: 'COUNT' | 'SALES';
}

const todayAd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
const CHECK_TEXT = {
  OUT: { text: 'None on the shelf', tone: 'text-rose-700' },
  MORE_THAN_POSSIBLE: { text: 'More than last count plus deliveries. Check again?', tone: 'text-amber-700' },
  MUCH_LOWER: { text: 'Much lower than expected. Check again?', tone: 'text-amber-700' },
  OK: { text: '', tone: '' },
} as const;

/**
 * Update a store's stock, two ways:
 *  - Stock on shelf now: count the shelf. The count replaces what the records say.
 *  - Sold today: enter units sold. Each is taken off the store's current stock.
 * Lists what the store carries (or, for a new store, every product of its brands). Empty means
 * "not entered", not zero.
 */
export default function ShelfCountSheet({ target, onClose, onSaved }: { target: CountTarget | null; onClose: () => void; onSaved?: (count: StockCount) => void }) {
  const [quantities, setQuantities] = useState<Record<string, number | null>>({});
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [adding, setAdding] = useState('');
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [mode, setMode] = useState<'COUNT' | 'SALES'>(target?.mode || 'COUNT');
  // Callers pass a new object each render: reset only when a different store (or form) is opened.
  const targetKey = target ? `${target.storeId}|${target.visitId || ''}|${target.dateAd || ''}|${target.mode || ''}` : '';
  const [openedFor, setOpenedFor] = useState('');
  if (targetKey !== openedFor) { setOpenedFor(targetKey); setMode(target?.mode || 'COUNT'); setQuantities({}); setExtraIds([]); setConfirmPartial(false); }
  const today = target?.dateAd || todayAd();

  const { sheet, stock } = useMemo(() => {
    if (!target) return { sheet: { rows: [], others: [] }, stock: new Map<string, number>() };
    const orders = db.getSecondaryOrders({ allBrands: true });
    const stockNow = currentStock({ storeId: target.storeId, dispatches: db.getDispatches(), secondaryOrders: orders, stockCounts: db.getStockCounts() });
    const store = db.getUnifiedStoreById(target.storeId);
    return { stock: stockNow, sheet: countSheet({ storeId: target.storeId, products: db.getProducts('ALL'), secondaryOrders: orders, stockCounts: db.getStockCounts(), todayAd: today, brandCodes: store?.brandCodes || null, stock: stockNow }) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, today]);

  if (!target) return null;
  const selling = mode === 'SALES';

  const extraRows: SheetRow[] = extraIds.map((id) => {
    const product = sheet.others.find((entry) => entry.id === id)!;
    return { productId: id, label: productLabel(product), fullName: product.name, brandCode: product.brandCode, subBrandId: product.subBrandId,
      lastQty: null, lastDateAd: null, deliveredSince: 0, perDay: null, expected: null };
  });
  const rows = [...sheet.rows, ...extraRows];
  const counted = rows.filter((row) => typeof quantities[row.productId] === 'number').length;
  const missing = rows.length - counted;
  const set = (id: string, value: number | null) => { setConfirmPartial(false); setQuantities((q) => ({ ...q, [id]: value === null ? null : Math.max(0, value) })); };

  const switchMode = (next: 'COUNT' | 'SALES') => { if (next === mode) return; setMode(next); setQuantities({}); setConfirmPartial(false); };
  const saveSales = () => {
    const items = buildSalesItems(rows.map((row) => ({ productId: row.productId, productName: row.fullName, brandCode: row.brandCode, subBrandId: row.subBrandId })), quantities, stock);
    if (!items.length) { toast.error('Enter units sold for at least one product.'); return; }
    const saved = db.recordStockCount({
      storeName: target.storeName, entityType: target.entityType, entityId: target.storeId, visitId: target.visitId, items, mode: 'SALES',
      dateAd: today, dateBs: target.dateBs || formatDualDate(today).split(' (')[0],
    });
    const units = items.reduce((sum, item) => sum + (item.soldQty || 0), 0);
    toast.success(`Sales saved: ${units} ${units === 1 ? 'unit' : 'units'} taken off ${target.storeName}'s stock.`);
    setQuantities({}); setExtraIds([]); setConfirmPartial(false);
    onSaved?.(saved);
    onClose();
  };

  const save = (fillMissingWithZero = false) => {
    if (selling) { saveSales(); return; }
    if (!counted && !fillMissingWithZero) { toast.error('Count at least one product.'); return; }
    if (missing && !fillMissingWithZero && !confirmPartial) { setConfirmPartial(true); return; }
    const values = fillMissingWithZero ? Object.fromEntries(rows.map((row) => [row.productId, quantities[row.productId] ?? 0])) : quantities;
    const items = buildCountItems(rows, values);
    const saved = db.recordStockCount({
      storeName: target.storeName, entityType: target.entityType, entityId: target.storeId, visitId: target.visitId, items, mode: 'COUNT',
      dateAd: today, dateBs: target.dateBs || formatDualDate(today).split(' (')[0],
    });
    toast.success(`Shelf count saved: ${items.length} ${items.length === 1 ? 'product' : 'products'} at ${target.storeName}.`);
    setQuantities({}); setExtraIds([]); setConfirmPartial(false);
    onSaved?.(saved);
    onClose();
  };

  return (
    <Portal><div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 sm:p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="count-title">
      <div className="flex max-h-[94vh] w-full max-w-xl flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 id="count-title" className="text-base font-bold text-slate-900">Update stock</h3>
            <p className="mt-0.5 text-xs text-slate-500">{target.storeName} · {formatDualDate(today).split(' (')[0]}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b border-slate-100 px-5 py-3">
          <div role="tablist" aria-label="What are you entering?" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {([['COUNT', 'Stock on shelf now', 'Count what is there'], ['SALES', 'Sold today', 'Take sales off the stock']] as const).map(([key, label, hint]) => (
              <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => switchMode(key)}
                className={`rounded-lg px-3 py-2 text-left transition ${mode === key ? 'bg-white shadow-xs' : 'hover:bg-white/60'}`}>
                <span className={`block text-xs font-bold ${mode === key ? 'text-slate-900' : 'text-slate-600'}`}>{label}</span>
                <span className="block text-[11px] text-slate-500">{hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{selling ? 'Each unit sold comes off the store’s current stock.' : 'The count becomes the store’s stock. Any gap from the records shows as a count difference.'}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-600">
              No products listed for this store yet. Give the store its brands, or add a product below.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => {
                const qty = quantities[row.productId];
                const check = typeof qty === 'number' && !selling ? checkCount(row, qty) : 'OK';
                const inStock = stock.get(row.productId);
                const after = selling && typeof qty === 'number' ? (inStock || 0) - qty : null;
                return (
                  <li key={row.productId} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900" title={row.fullName}>{row.label}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          In stock: <strong className={inStock === undefined ? 'text-slate-500' : inStock <= 0 ? 'text-rose-700' : 'text-slate-800'}>{inStock === undefined ? 'no record yet' : inStock}</strong>
                          {!selling && (row.lastQty === null ? ' · not counted before' : ` · last count ${row.lastQty} on ${formatDualDate(row.lastDateAd!).split(' (')[0]}`)}
                          {after !== null && <> · after: <strong className={after < 0 ? 'text-rose-700' : 'text-emerald-700'}>{after}</strong></>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center rounded-xl border border-slate-300 bg-white">
                        <button type="button" aria-label={`One fewer ${row.label}`} onClick={() => set(row.productId, (qty ?? 0) - 1)} className="h-10 w-10 text-lg text-slate-600 hover:bg-slate-100 rounded-l-xl">−</button>
                        <NumberInput aria-label={`${selling ? 'Units sold' : 'Shelf count'} of ${row.label}`} type="number" inputMode="numeric" min={0} placeholder="–" value={qty ?? ''}
                          onChange={(e) => set(row.productId, e.target.value === '' ? null : parseInt(e.target.value) || 0)}
                          className="h-10 w-14 border-x border-slate-200 text-center text-base font-bold outline-none placeholder:text-slate-300" />
                        <button type="button" aria-label={`One more ${row.label}`} onClick={() => set(row.productId, (qty ?? 0) + 1)} className="h-10 w-10 text-lg text-slate-600 hover:bg-slate-100 rounded-r-xl">+</button>
                      </div>
                    </div>
                    {after !== null && after < 0 && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700"><AlertTriangle className="h-3 w-3" />More than the records show in stock. A delivery may be missing; count the shelf to correct it.</p>
                    )}
                    {check !== 'OK' && (
                      <p className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${CHECK_TEXT[check].tone}`}>
                        {check !== 'OUT' && <AlertTriangle className="h-3 w-3" />}{CHECK_TEXT[check].text}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {sheet.others.length > extraIds.length && (
            <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3">
              <select aria-label="Add another product" value={adding} onChange={(e) => setAdding(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs">
                <option value="">Another product on the shelf…</option>
                {sheet.others.filter((product) => !extraIds.includes(product.id)).map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}
              </select>
              <button type="button" disabled={!adding} onClick={() => { setExtraIds((ids) => [...ids, adding]); setAdding(''); }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3">
          {confirmPartial ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-slate-700">{missing} {missing === 1 ? 'product is' : 'products are'} not counted.</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmPartial(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Keep counting</button>
                <button type="button" onClick={() => save(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800">Save them as 0</button>
                <button type="button" onClick={() => save(false)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Save counted only</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{selling ? `${counted} ${counted === 1 ? 'product' : 'products'} sold. Leave the rest empty.` : `${counted} of ${rows.length} counted. Empty means not counted.`}</span>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={() => save(false)} disabled={!counted} className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{selling ? 'Save sales' : 'Save count'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div></Portal>
  );
}
