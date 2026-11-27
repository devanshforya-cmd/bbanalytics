'use client';

import { useEffect, useState } from 'react';
import { Filter } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { hiddenByBrandFilter } from '@/lib/brand-filter';

/**
 * The brand chosen at the top of the app hides every other brand's records on every page, and it
 * stays chosen after a refresh. Say so on every page, with what it is hiding and a way out.
 */
export default function BrandFilterBanner() {
  const [, setVersion] = useState(0);
  useEffect(() => { const refresh = () => setVersion((n) => n + 1); window.addEventListener('bb-db-updated', refresh); return () => window.removeEventListener('bb-db-updated', refresh); }, []);
  const brand = db.getActiveBrandFilter();
  if (!brand || brand === 'ALL') return null;
  const brands = db.getBrands('ALL');
  const current = brands.find((b) => b.code === brand);
  const sub = db.getActiveSubBrandFilter();
  const subName = sub ? current?.subBrands?.find((s) => s.id === sub)?.name : '';
  const label = subName ? `${current?.name || brand} › ${subName}` : current?.name || brand;
  const hidden = hiddenByBrandFilter(
    { orders: db.getOrders('ALL'), tickets: db.getOrderIssues('ALL') },
    { orders: db.getOrders(), tickets: db.getOrderIssues() },
  );
  const clear = () => { db.setActiveBrandFilter('ALL'); window.location.reload(); };
  return (
    <div role="status" className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2">
        <Filter className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <span>
          <strong>Showing {label} only.</strong> Other brands are hidden on every page until you switch back.
          {hidden && <> Hidden right now: {hidden}.</>}
        </span>
      </p>
      <button type="button" onClick={clear} className="shrink-0 self-start rounded-lg bg-amber-900 px-3 py-1.5 font-semibold text-white hover:bg-amber-950 sm:self-auto">Show all brands</button>
    </div>
  );
}
