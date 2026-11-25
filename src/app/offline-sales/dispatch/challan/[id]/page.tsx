'use client';

import Portal from '@/components/common/Portal';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Printer, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import PageGuard from '@/components/common/PageGuard';
import { canSeeMoney } from '@/components/common/Money';
import { productLabel, subBrandName } from '@/lib/sub-brands';
import { destinationName, dispatchStatus, statusLabel } from '@/lib/dispatch-flow';
import { adToBs } from '@/lib/nepali-calendar';

/**
 * Order challan: what the store ordered, laid out to pack from and to send with the goods.
 * Tick boxes make it the picklist; signature boxes make it the delivery note.
 * Opens in its own tab; Print or "Save as PDF" from the print dialog.
 */
export default function ChallanPage() {
  const params = useParams();
  const id = decodeURIComponent(String(params?.id || ''));
  const [, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener('bb-db-updated', refresh);
    void db.syncWithSupabase().catch(() => {}).then(refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);
  const dispatch = db.getDispatches().find((d) => d.id === id);
  const products = db.getProducts();
  const brands = db.getBrands('ALL');
  const withMoney = canSeeMoney();

  const store = !dispatch ? null : dispatch.entityType === 'BRANCH' || dispatch.branchId
    ? db.getBranches().find((b) => b.id === (dispatch.storeId || dispatch.branchId))
    : db.getRetailers().find((r) => r.id === (dispatch.storeId || dispatch.distributorId)) || db.getDistributors().find((d) => d.id === (dispatch.storeId || dispatch.distributorId));
  const storeAddress = (store as { address?: string } | undefined)?.address || '';
  const storeContact = [(store as { contactName?: string } | undefined)?.contactName, (store as { contactPhone?: string } | undefined)?.contactPhone].filter(Boolean).join(', ');

  if (!dispatch) {
    return (
      <PageGuard feature="dispatches">
        <p className="p-8 text-center text-sm text-slate-600">This dispatch order was not found. It may still be syncing; refresh in a moment.</p>
      </PageGuard>
    );
  }

  const lines = dispatch.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const size = item.unitsPerCarton || product?.caseSize || 0;
    return { item, product, size, cartons: size ? Math.floor(item.quantity / size) : 0, loose: size ? item.quantity % size : item.quantity };
  }).sort((a, b) => (a.item.brandCode + productLabel(a.product, a.item.productName)).localeCompare(b.item.brandCode + productLabel(b.product, b.item.productName)));
  const units = dispatch.items.reduce((sum, item) => sum + item.quantity, 0);
  const value = dispatch.items.reduce((sum, item) => sum + item.quantity * (item.unitPrice || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const day = dispatch.dispatchDateAd || dispatch.orderDateAd || dispatch.createdAt?.slice(0, 10) || today;

  return (
    <PageGuard feature="dispatches">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body * { visibility: hidden !important; }
          #challan, #challan * { visibility: visible !important; }
          #challan { position: absolute; inset: 0; padding: 0 !important; box-shadow: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <Portal><div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-100 print:bg-white">
        <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">Order challan {dispatch.dispatchNumber}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"><Printer className="h-4 w-4" /> Print or save as PDF</button>
            <button type="button" onClick={() => window.close()} aria-label="Close" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <article id="challan" className="mx-auto my-6 max-w-[210mm] bg-white p-8 text-xs leading-5 text-black shadow-sm">
          <header className="flex items-start justify-between border-b-2 border-black pb-3">
            <div>
              <p className="text-lg font-bold">Brand Bucket</p>
              <p className="text-[11px] text-slate-700">Kathmandu, Nepal</p>
            </div>
            <div className="text-right">
              <h1 className="text-xl font-bold tracking-tight">Order challan</h1>
              <p className="font-mono text-sm font-bold">{dispatch.dispatchNumber || '—'}</p>
              {dispatch.orderNumber && <p className="font-mono text-[11px]">Store order {dispatch.orderNumber}</p>}
            </div>
          </header>

          <section className="grid grid-cols-2 gap-6 border-b border-slate-300 py-3">
            <div>
              <p className="text-[11px] font-bold uppercase text-slate-600">To</p>
              <p className="text-sm font-bold">{destinationName(dispatch)}</p>
              {dispatch.branchName && dispatch.distributorName !== dispatch.branchName && <p>{dispatch.distributorName}</p>}
              {storeAddress && <p>{storeAddress}</p>}
              {storeContact && <p>{storeContact}</p>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 self-start">
              <dt className="text-slate-600">Date</dt><dd>{day} ({adToBs(`${day}T12:00:00`).formatted})</dd>
              <dt className="text-slate-600">Status</dt><dd>{statusLabel(dispatchStatus(dispatch))}</dd>
              <dt className="text-slate-600">Delivered by</dt><dd>{dispatch.fulfilledBy === 'DISTRIBUTOR' ? dispatch.fulfillerName || 'Distributor' : 'Brand Bucket warehouse'}</dd>
              {dispatch.paymentTerms && <><dt className="text-slate-600">Payment</dt><dd>{dispatch.paymentTerms}{dispatch.paymentDueDateAd ? `, due ${dispatch.paymentDueDateAd}` : ''}</dd></>}
            </dl>
          </section>

          <table className="mt-3 w-full border-collapse text-left">
            <thead>
              <tr className="border-y border-black text-[11px]">
                <th className="py-1.5 pr-2">#</th>
                <th className="py-1.5 pr-2">Product</th>
                <th className="py-1.5 pr-2 text-right">Cartons</th>
                <th className="py-1.5 pr-2 text-right">Loose</th>
                <th className="py-1.5 pr-2 text-right">Units</th>
                {withMoney && <th className="py-1.5 pr-2 text-right">Rate</th>}
                {withMoney && <th className="py-1.5 pr-2 text-right">Amount</th>}
                <th className="py-1.5 text-center">Packed</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ item, product, size, cartons, loose }, index) => (
                <tr key={item.productId} className="border-b border-slate-300 align-top">
                  <td className="py-1.5 pr-2">{index + 1}</td>
                  <td className="py-1.5 pr-2">
                    <span className="font-semibold">{productLabel(product, item.productName)}</span>
                    <span className="block text-[11px] text-slate-600">{[product?.alias ? item.productName : '', product?.sku, subBrandName(brands, item.subBrandId || product?.subBrandId), size ? `${size}/carton` : ''].filter(Boolean).join(' · ')}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{size ? cartons : '—'}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{loose}</td>
                  <td className="py-1.5 pr-2 text-right font-bold tabular-nums">{item.quantity}</td>
                  {withMoney && <td className="py-1.5 pr-2 text-right tabular-nums">{item.unitPrice ? item.unitPrice.toLocaleString() : ''}</td>}
                  {withMoney && <td className="py-1.5 pr-2 text-right tabular-nums">{item.unitPrice ? (item.unitPrice * item.quantity).toLocaleString() : ''}</td>}
                  <td className="py-1.5 text-center"><span className="inline-block h-4 w-4 border border-black" aria-label="Tick when packed" /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-b-2 border-black font-bold">
                <td />
                <td className="py-1.5 pr-2">Total ({dispatch.items.length} {dispatch.items.length === 1 ? 'product' : 'products'})</td>
                <td /><td />
                <td className="py-1.5 pr-2 text-right tabular-nums">{units.toLocaleString()}</td>
                {withMoney && <td />}
                {withMoney && <td className="py-1.5 pr-2 text-right tabular-nums">{value ? `NPR ${value.toLocaleString()}` : ''}</td>}
                <td />
              </tr>
            </tfoot>
          </table>

          {dispatch.notes && <p className="mt-3"><span className="font-semibold">Note:</span> {dispatch.notes}</p>}

          <section className="mt-10 grid grid-cols-3 gap-6 text-[11px]">
            {['Packed by', 'Checked by', 'Received by (store stamp and signature)'].map((label) => (
              <div key={label}>
                <div className="h-14 border-b border-black" />
                <p className="mt-1">{label}</p>
                <p className="text-slate-600">Date:</p>
              </div>
            ))}
          </section>
          <p className="mt-6 text-[11px] text-slate-500">Printed {new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu' })} from Brand Bucket Analytics.</p>
        </article>
      </div></Portal>
    </PageGuard>
  );
}
