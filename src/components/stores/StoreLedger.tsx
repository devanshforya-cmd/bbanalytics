'use client';

import { useMemo, useState } from 'react';
import { db } from '@/lib/db/db-service';
import { buildStoreLedger, type LedgerStore } from '@/lib/store-ledger';
import { productLabel } from '@/lib/sub-brands';
import DownloadButton from '@/components/common/DownloadButton';
import Money, { canSeeMoney } from '@/components/common/Money';

/**
 * Stock ledger for a store (or a whole chain): what came in, what sold, what is on the shelf.
 * Read like a balance sheet: In is received, Out is sold between counts, Balance is the shelf.
 */
export default function StoreLedger({ stores, downloadStoreId, fileLabel }: { stores: LedgerStore[]; downloadStoreId: string; fileLabel: string }) {
  const [productId, setProductId] = useState('ALL');
  const seesMoney = canSeeMoney();
  const { entries, summary } = useMemo(() => {
    const names = new Map(db.getProducts('ALL').map((p) => [p.id, productLabel(p)]));
    return buildStoreLedger(stores, db.getDispatches(), db.getStockCounts(), names);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores.map((s) => s.id).join('|')]);
  const multiStore = stores.length > 1;
  const shown = entries.filter((e) => productId === 'ALL' || e.productId === productId).slice().reverse();
  const totals = summary.reduce((sum, row) => ({ received: sum.received + row.received, sold: sum.sold + row.sold, onShelf: sum.onShelf + row.onShelf, inTransit: sum.inTransit + row.inTransit }), { received: 0, sold: 0, onShelf: 0, inTransit: 0 });

  if (!summary.length) {
    return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">No deliveries or shelf counts yet. The ledger fills in as orders are delivered and the shelf is counted.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-xs text-slate-600"><strong>In</strong> is stock delivered to the store. <strong>Out</strong> is what sold, worked out at each shelf count (what should be there minus what was counted and damaged). <strong>Balance</strong> is the shelf after each entry. Stock sent but not yet marked delivered shows as in transit.</p>
        <DownloadButton datasets={['store_ledger']} filters={{ storeId: downloadStoreId }} fileLabel={`${fileLabel}_ledger`} label="Download ledger" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Stock position by product</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">In: received</th>
              <th className="px-3 py-2 text-right">Out: sold</th>
              <th className="px-3 py-2 text-right">Damaged</th>
              <th className="px-3 py-2 text-right">On shelf</th>
              <th className="px-3 py-2 text-right">In transit</th>
              {seesMoney && <th className="px-3 py-2 text-right">Received value</th>}
              {seesMoney && <th className="px-3 py-2 text-right">Sold value</th>}
              <th className="px-3 py-2">Last counted</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.productId} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${productId === row.productId ? 'bg-blue-50' : ''}`} onClick={() => setProductId(productId === row.productId ? 'ALL' : row.productId)}>
                <td className="px-3 py-2 font-semibold text-slate-900">{row.productName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.received.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.sold.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.damaged || '—'}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{row.onShelf.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.inTransit || '—'}</td>
                {seesMoney && <td className="px-3 py-2 text-right tabular-nums">{row.receivedValue ? <Money>{row.receivedValue.toLocaleString()}</Money> : '—'}</td>}
                {seesMoney && <td className="px-3 py-2 text-right tabular-nums">{row.soldValue ? <Money>{row.soldValue.toLocaleString()}</Money> : '—'}</td>}
                <td className="px-3 py-2">{row.lastCountedOn || 'Not counted'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 font-bold">
            <tr>
              <td className="px-3 py-2">All products</td>
              <td className="px-3 py-2 text-right tabular-nums">{totals.received.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{totals.sold.toLocaleString()}</td>
              <td />
              <td className="px-3 py-2 text-right tabular-nums">{totals.onShelf.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{totals.inTransit || '—'}</td>
              {seesMoney && <td />}{seesMoney && <td />}<td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Entries {productId !== 'ALL' && <span className="font-normal text-slate-500">for {summary.find((r) => r.productId === productId)?.productName}</span>}</h3>
        <label className="text-xs font-semibold text-slate-700">Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
            <option value="ALL">All products</option>
            {summary.map((row) => <option key={row.productId} value={row.productId}>{row.productName}</option>)}
          </select>
        </label>
      </div>
      <div className="max-h-[480px] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Ledger entries, newest first</caption>
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">Date</th>
              {multiStore && <th className="px-3 py-2">Outlet</th>}
              {productId === 'ALL' && <th className="px-3 py-2">Product</th>}
              <th className="px-3 py-2">Particulars</th>
              <th className="px-3 py-2 text-right">In</th>
              <th className="px-3 py-2 text-right">Out</th>
              <th className="px-3 py-2 text-right">Damaged</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 400).map((e, i) => (
              <tr key={`${e.storeId}-${e.productId}-${e.date}-${i}`} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{e.date}</td>
                {multiStore && <td className="px-3 py-1.5">{e.storeName}</td>}
                {productId === 'ALL' && <td className="px-3 py-1.5">{e.productName}</td>}
                <td className="px-3 py-1.5 text-slate-700">{e.particulars}{e.adjustment ? <span className="ml-1 text-amber-800">({e.adjustment} more than expected)</span> : null}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{e.in || ''}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-rose-700">{e.out || ''}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{e.damaged || ''}</td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{e.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length > 400 && <p className="p-3 text-center text-xs text-slate-500">Showing the latest 400 entries. Download the ledger for all of them.</p>}
      </div>
    </div>
  );
}
