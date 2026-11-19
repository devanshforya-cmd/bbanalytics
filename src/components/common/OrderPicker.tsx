'use client';

import React, { useMemo, useState } from 'react';
import { CheckCircle2, PackageSearch, Search } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import type { Order } from '@/lib/types';
import { phoneDigits } from '@/lib/customer-lookup';
import { displayDocumentId, matchesDocumentId } from '@/lib/document-ids';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';

const UNDELIVERED = new Set(['PENDING', 'DISPATCHED', 'FAILED']);
const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200', DISPATCHED: 'bg-blue-50 text-blue-800 border-blue-200', DELIVERED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-800 border-rose-200', CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200', RETURNED: 'bg-purple-50 text-purple-800 border-purple-200', EXCHANGED: 'bg-purple-50 text-purple-800 border-purple-200',
};
const statusLabel = (status: string) => status.charAt(0) + status.slice(1).toLowerCase();

interface OrderPickerProps {
  /** Show this customer's orders. Leave empty to only search by order ID. */
  customerPhone?: string;
  selectedId: string;
  onSelect: (order: Order | null) => void;
  /** Called from the empty state so the form can put focus back on the phone field. */
  onCheckNumber?: () => void;
  /** Fewer filters, for forms where the order is optional. */
  compact?: boolean;
  label?: string;
  required?: boolean;
  error?: string | null;
}

/**
 * Pick one of a customer's orders from cards instead of typing an order
 * number. Orders not yet delivered come first, then newest first.
 */
export default function OrderPicker({ customerPhone, selectedId, onSelect, onCheckNumber, compact, label = 'Select order', required, error }: OrderPickerProps) {
  const { formatDate } = useCalendarPreference();
  const [brand, setBrand] = useState('ALL');
  const [product, setProduct] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [byId, setById] = useState(false);
  const [idQuery, setIdQuery] = useState('');

  const allOrders = db.getOrders('ALL');
  const digits = phoneDigits(customerPhone);
  const customerOrders = useMemo(() => !digits ? [] : allOrders.filter((order) => phoneDigits(order.customerPhone) === digits || phoneDigits(order.alternatePhone) === digits)
    .sort((a, b) => Number(UNDELIVERED.has(b.status)) - Number(UNDELIVERED.has(a.status)) || b.orderDateAd.localeCompare(a.orderDateAd) || (b.createdAt || '').localeCompare(a.createdAt || '')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [digits, allOrders.length]);
  const idMatches = useMemo(() => idQuery.trim().length < 2 ? [] : allOrders.filter((order) => matchesDocumentId(idQuery, order.orderNumber, order.legacyOrderNumber)).slice(0, 8),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [idQuery, allOrders.length]);

  const brands = [...new Set(customerOrders.map((order) => order.brandCode))];
  const filtered = customerOrders.filter((order) => (brand === 'ALL' || order.brandCode === brand)
    && (!product.trim() || order.items.some((item) => item.productName.toLowerCase().includes(product.trim().toLowerCase())))
    && (!from || order.orderDateAd >= from) && (!to || order.orderDateAd <= to));
  const filtering = brand !== 'ALL' || !!product.trim() || !!from || !!to;
  const limit = compact ? 3 : 4;
  const visible = showAll || filtering ? filtered : filtered.slice(0, limit);
  const selected = allOrders.find((order) => order.id === selectedId);
  const brandName = (code: string) => db.getBrands('ALL').find((entry) => entry.code === code)?.name || code;

  const card = (order: Order) => {
    const isSelected = order.id === selectedId;
    return (
      <button key={order.id} type="button" role="radio" aria-checked={isSelected} onClick={() => onSelect(isSelected ? null : order)}
        className={`w-full rounded-xl border p-3 text-left text-xs transition ${isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-black text-slate-900">{displayDocumentId(order.orderNumber)}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{brandName(order.brandCode)}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[order.status] || STATUS_STYLE.PENDING}`}>{statusLabel(order.status)}</span>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">{formatDate(order.orderDateAd, order.orderDateBs)}{isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600" />}</span>
        </div>
        <p className="mt-1.5 text-slate-700">{order.items.map((item) => `${item.quantity}× ${item.productName}`).join(', ')}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{order.deliveryMethod}{order.district ? ` · ${order.district}` : ''}</p>
      </button>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">{label} {required && <span className="text-rose-600">*</span>}</span>
        <button type="button" onClick={() => { setById((value) => !value); setIdQuery(''); }} className="text-[11px] font-bold text-blue-700 hover:underline">
          {byId ? 'Back to this customer’s orders' : 'Search by order ID'}
        </button>
      </div>

      {byId ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input type="text" autoFocus value={idQuery} onChange={(event) => setIdQuery(event.target.value)} placeholder="e.g. FOR-0421, for0421 or 421" aria-label="Order ID"
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 font-mono text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div role="radiogroup" aria-label="Matching orders" className="space-y-2">{idMatches.map(card)}</div>
          {idQuery.trim().length >= 2 && !idMatches.length && <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500">No order has this ID. The old long ID works here too.</p>}
        </div>
      ) : !digits ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">Choose the customer first. Their orders will appear here.</p>
      ) : !customerOrders.length ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-4 text-center text-xs">
          <PackageSearch className="mx-auto mb-1.5 h-6 w-6 text-amber-500" />
          <p className="font-bold text-slate-800">No orders found for this number</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {onCheckNumber && <button type="button" onClick={onCheckNumber} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50">Check the number</button>}
            <button type="button" onClick={() => setById(true)} className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 font-bold text-blue-700 hover:bg-blue-50">Search by order ID</button>
          </div>
        </div>
      ) : (
        <>
          {!compact && customerOrders.length > 1 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <select aria-label="Filter by brand" value={brand} onChange={(event) => setBrand(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px]">
                <option value="ALL">All brands</option>
                {brands.map((code) => <option key={code} value={code}>{brandName(code)}</option>)}
              </select>
              <input aria-label="Filter by product" value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Product" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px]" />
              <input aria-label="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px]" />
              <input aria-label="To date" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px]" />
            </div>
          )}
          <div role="radiogroup" aria-label="Customer orders" className="space-y-2">{visible.map(card)}</div>
          {!visible.length && <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500">No order matches these filters.</p>}
          {!filtering && filtered.length > limit && (
            <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-slate-600">
              <input type="checkbox" role="switch" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
              Show all {filtered.length} orders
            </label>
          )}
        </>
      )}
      {selected && !visible.some((order) => order.id === selected.id) && !idMatches.some((order) => order.id === selected.id) && (
        <div className="space-y-1"><p className="text-[11px] font-semibold text-slate-500">Selected</p>{card(selected)}</div>
      )}
      {error && <p className="text-[11px] font-medium text-rose-600" role="alert">{error}</p>}
    </div>
  );
}
