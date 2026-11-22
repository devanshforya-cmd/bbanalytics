'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { PortalTab, SharedPortalData } from '@/app/api/shared/[token]/projection';
import { MonthlySalesBreakdown, MonthlySalesCards, MonthlySalesTable, monthlySalesCsv } from '@/components/reports/MonthlySalesView';
import { downloadCSV } from '@/lib/csv';

const labels: Record<PortalTab, string> = { dashboard: 'Dashboard Overview', products: 'Products & Performance', 'delivery-failures': 'Delivery Failures', returns: 'Returns & Quality', 'monthly-sales': 'Monthly Sales Sheet' };

export default function SharedAccessPortalPage() {
  const token = useParams()?.token as string;
  const [data, setData] = useState<SharedPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [requiresPasscode, setRequiresPasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [name, setName] = useState('Shared view');
  const [activeTab, setActiveTab] = useState<PortalTab>('dashboard');

  const [view, setView] = useState<{ brand?: string; month?: string }>({});
  async function load(sharedPasscode = '', signal?: AbortSignal, nextView: { brand?: string; month?: string } = view) {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams(Object.entries(nextView).filter(([, value]) => !!value) as [string, string][]).toString();
      const response = await fetch(`/api/shared/${encodeURIComponent(token)}${query ? `?${query}` : ''}`, { cache: 'no-store', credentials: 'omit', headers: sharedPasscode ? { 'x-shared-passcode': sharedPasscode } : {}, signal });
      const result = await response.json();
      if (signal?.aborted) return;
      if (response.status === 401 && result.requiresPasscode) {
        setRequiresPasscode(true);
        setName(result.name || 'Shared view');
        setError(sharedPasscode ? 'That password is not right. Check it and try again.' : '');
        try { sessionStorage.removeItem(`shared-pass:${token}`); } catch { /* private mode */ }
        return;
      }
      if (!response.ok || !result.success) {
        setExpired(response.status === 410);
        throw new Error(result.error || 'Shared data could not be loaded.');
      }
      const sharedData = result.data as SharedPortalData;
      setData(sharedData);
      setRequiresPasscode(false);
      // Remember the password for this browser tab, so a refresh or brand/month switch does not ask again.
      try { if (sharedPasscode) sessionStorage.setItem(`shared-pass:${token}`, sharedPasscode); } catch { /* private mode */ }
      if (!query) setActiveTab(sharedData.link.allowedPages[0]);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Shared data could not be loaded.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setRequiresPasscode(false);
    setExpired(false);
    let saved = '';
    try { saved = sessionStorage.getItem(`shared-pass:${token}`) || ''; } catch { /* private mode */ }
    if (saved) setPasscode(saved);
    if (token) void load(saved, controller.signal);
    else { setError('Access link not found.'); setLoading(false); }
    return () => controller.abort();
    // Token changes start a fresh public token authentication request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading && !data) return <main className="min-h-screen flex items-center justify-center bg-slate-900 text-white"><p role="status">Verifying shared access…</p></main>;

  if (requiresPasscode && !data) return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <form onSubmit={event => { event.preventDefault(); void load(passcode); }} className="w-full max-w-md space-y-5 rounded-3xl border border-slate-700 bg-slate-950 p-8 text-white">
        <Lock className="h-8 w-8 text-blue-400" />
        <h1 className="text-xl font-bold">{name}</h1>
        <p className="text-sm text-slate-300">Enter the password Brand Bucket gave you with this link. No account needed.</p>
        <label className="block text-sm" htmlFor="shared-passcode">Password</label>
        <input id="shared-passcode" type="password" autoComplete="off" required value={passcode} onChange={event => setPasscode(event.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-900 p-3" />
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <button disabled={loading} className="w-full rounded-xl bg-blue-600 p-3 font-bold disabled:opacity-50">{loading ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Verifying…</> : 'Open'}</button>
      </form>
    </main>
  );

  if (!data) return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md space-y-4 p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-rose-600" />
        <h1 className="text-xl font-bold">{expired ? 'This link has expired' : 'This link is not available'}</h1>
        <p role="alert" className="text-sm text-slate-600">{error}</p>
        <p className="text-sm text-slate-500">Contact your Brand Bucket account manager for updated access.</p>
        <button onClick={() => void load()} className="rounded-xl border px-4 py-2 text-sm font-bold">Try again</button>
      </div>
    </main>
  );

  const { link, summary } = data;
  const products = data.products || [];
  const failures = data.deliveryFailures || [];
  const returns = data.returns || [];
  const failureRate = summary?.totalOrders ? (summary.failureCount / summary.totalOrders * 100).toFixed(1) : '0.0';
  const returnRate = summary?.totalOrders ? (summary.returnCount / summary.totalOrders * 100).toFixed(1) : '0.0';

  return (
    <div className="min-h-screen bg-slate-50 pb-16 text-slate-900">
      <header className="border-b bg-white px-4 py-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-lg font-bold">Shared view</h1><p className="text-sm text-slate-500">{link.name} • {link.brandScope === 'ALL' ? 'All brands' : link.brandScope.join(', ')}</p></div>
          <span className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800"><ShieldCheck className="h-4 w-4" />Read only • Customer details protected</span>
        </div>
        <nav aria-label="Shared sections" className="mx-auto mt-4 flex max-w-7xl gap-2 overflow-x-auto">
          {link.allowedPages.map(tab => <button key={tab} onClick={() => setActiveTab(tab)} aria-current={activeTab === tab ? 'page' : undefined} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{labels[tab]}</button>)}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        {link.dateRangeType === 'FIXED' && <p className="text-sm text-slate-500">Reporting period: {link.dateFrom} to {link.dateTo}</p>}
        {activeTab === 'dashboard' && summary && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[['Total orders', summary.totalOrders], ['Delivery failure rate', `${failureRate}% (${summary.failureCount})`], ['Return rate', `${returnRate}% (${summary.returnCount})`], ['Catalog products', summary.productCount]].map(([label, value]) => <section key={label} className="rounded-2xl border bg-white p-5"><h2 className="text-xs font-bold text-slate-500">{label}</h2><p className="mt-2 text-3xl font-bold">{value}</p></section>)}
        </div>}
        {activeTab === 'products' && data.products && <div className="overflow-x-auto rounded-2xl border bg-white" tabIndex={0}><table className="w-full text-left text-sm"><caption className="p-4 text-left font-bold">Product performance</caption><thead className="bg-slate-100"><tr>{['Product', 'Brand', 'Category', 'SKU', 'Orders', 'Returns'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{products.map(product => <tr key={product.id} className="border-t"><td className="p-3">{product.name}</td><td className="p-3">{product.brandCode}</td><td className="p-3">{product.category}</td><td className="p-3">{product.sku}</td><td className="p-3">{product.orderCount}</td><td className="p-3">{product.returnCount}</td></tr>)}</tbody></table>{products.length === 0 && <p className="p-4 text-sm text-slate-500">No products in this shared scope.</p>}</div>}
        {activeTab === 'monthly-sales' && data.monthlySales && (() => {
          const sheet = data.monthlySales;
          const change = (next: { brand?: string; month?: string }) => { const merged = { brand: sheet.brand, month: sheet.month, ...next }; setView(merged); void load(passcode, undefined, merged); };
          return (
            <div className="space-y-4" aria-busy={loading}>
              <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4">
                <label className="text-xs font-semibold text-slate-700">Brand
                  <select value={sheet.brand} onChange={(event) => change({ brand: event.target.value })} className="mt-1 block min-h-[42px] min-w-40 rounded-lg border border-slate-300 px-3 text-sm">
                    {sheet.brands.map((brand) => <option key={brand.code} value={brand.code}>{brand.name}</option>)}
                  </select></label>
                <label className="text-xs font-semibold text-slate-700">Month
                  <input type="month" value={sheet.month} min={sheet.firstMonth} max={sheet.lastMonth} onChange={(event) => event.target.value && change({ month: event.target.value })} className="mt-1 block min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm" /></label>
                <button type="button" onClick={() => downloadCSV(monthlySalesCsv(sheet.report, sheet.showMoney), `monthly-sales-${sheet.brand}-${sheet.from}-to-${sheet.to}.csv`)} className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white"><Download className="h-4 w-4" />Download CSV</button>
                <p className="text-xs text-slate-500">{sheet.from} to {sheet.to}{loading ? ' · updating…' : ''}</p>
              </div>
              <MonthlySalesCards report={sheet.report} showMoney={sheet.showMoney} />
              <MonthlySalesTable report={sheet.report} showMoney={sheet.showMoney} />
              <MonthlySalesBreakdown report={sheet.report} showMoney={sheet.showMoney} />
            </div>
          );
        })()}
        {activeTab === 'delivery-failures' && data.deliveryFailures && <div className="overflow-x-auto rounded-2xl border bg-white" tabIndex={0}><table className="w-full text-left text-sm"><caption className="p-4 text-left font-bold">Delivery failures</caption><thead className="bg-slate-100"><tr>{['Order ID', 'Date', 'Brand', 'Customer', 'Phone', 'Region', 'Reason', 'Status'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{failures.map(failure => <tr key={failure.id} className="border-t"><td className="p-3 font-mono">{failure.orderNumber || '—'}</td><td className="p-3">{failure.dateBs || failure.dateAd}</td><td className="p-3">{failure.brandCode}</td><td className="p-3">{failure.customerName}</td><td className="p-3">{failure.customerPhone}</td><td className="p-3">{failure.valley}</td><td className="p-3">{failure.reason}</td><td className="p-3">{failure.status}</td></tr>)}</tbody></table>{failures.length === 0 && <p className="p-4 text-sm text-slate-500">No delivery failure rows are shared.</p>}</div>}
        {activeTab === 'returns' && data.returns && <div className="overflow-x-auto rounded-2xl border bg-white" tabIndex={0}><table className="w-full text-left text-sm"><caption className="p-4 text-left font-bold">Returns &amp; quality</caption><thead className="bg-slate-100"><tr>{['Order ID', 'Date', 'Product', 'Brand', 'Customer', 'Phone', 'Reason', 'Resolution'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{returns.map(entry => <tr key={entry.id} className="border-t"><td className="p-3 font-mono">{entry.orderNumber || '—'}</td><td className="p-3">{entry.dateBs || entry.dateAd}</td><td className="p-3">{entry.productName}</td><td className="p-3">{entry.brandCode}</td><td className="p-3">{entry.customerName}</td><td className="p-3">{entry.customerPhone}</td><td className="p-3">{entry.reasonCategory}</td><td className="p-3">{entry.orderStatus}</td></tr>)}</tbody></table>{returns.length === 0 && <p className="p-4 text-sm text-slate-500">No return rows are shared.</p>}</div>}
      </main>
      <footer className="mt-8 px-4 text-center text-xs text-slate-500">Confidential • Shared with {link.name} • Brand Bucket</footer>
    </div>
  );
}
