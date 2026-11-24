'use client';

import PagedList from '@/components/common/PagedList';
import InfoTip from '@/components/common/InfoTip';
import DownloadButton from '@/components/common/DownloadButton';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { isSuperAdmin } from '@/lib/permissions';
import { getTodayAd } from '@/lib/nepali-calendar';
import { sendStatusLabel } from '@/lib/marketing';
import { displayDocumentId, matchesDocumentId } from '@/lib/document-ids';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import { ChevronRight, Gift, Info, Search, Users } from 'lucide-react';

const STATUS_STYLE: Record<string, string> = {
  'Content received': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Content overdue': 'bg-amber-100 text-amber-900 border-amber-300',
  'Awaiting content': 'bg-slate-100 text-slate-700 border-slate-200',
  Cancelled: 'bg-slate-50 text-slate-400 border-slate-200',
};

/**
 * Read-only history of marketing sends. Nothing is created here: each row
 * opens the influencer, where the Send products button lives.
 */
export default function MarketingSendsPage() {
  const router = useRouter();
  const { formatDate } = useCalendarPreference();
  const [, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(() => db.isWorkspaceLoaded());
  const [search, setSearch] = useState('');
  const [influencerId, setInfluencerId] = useState('ALL');
  const [brand, setBrand] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const refresh = () => { setVersion((value) => value + 1); setLoaded(db.isWorkspaceLoaded()); };
    window.addEventListener('bb-db-updated', refresh);
    void db.syncWithSupabase().finally(refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  const today = getTodayAd();
  const sends = db.getMarketingSends();
  const content = db.getInfluencerContent();
  const influencers = db.getInfluencers().sort((a, b) => a.name.localeCompare(b.name));
  const brands = db.getBrands('ALL');
  const brandName = (code: string) => brands.find((entry) => entry.code === code)?.name || code;
  const legacyOrders = isSuperAdmin(db.getCurrentUser()) ? db.getLegacyMarketingOrderCount() : 0;

  const filtered = sends.filter((send) => {
    const label = sendStatusLabel(send, content, today);
    if (influencerId !== 'ALL' && send.influencerId !== influencerId) return false;
    if (brand !== 'ALL' && !send.brandCodes.includes(brand)) return false;
    if (status !== 'ALL' && label !== status) return false;
    if (from && send.sentDateAd < from) return false;
    if (to && send.sentDateAd > to) return false;
    const term = search.trim().toLowerCase();
    if (term && !(matchesDocumentId(term, send.sendNumber, send.legacyOrderNumber) || send.influencerName.toLowerCase().includes(term)
      || send.items.some((item) => item.productName.toLowerCase().includes(term)) || (send.responsibleName || '').toLowerCase().includes(term))) return false;
    return true;
  });
  const filtering = !!search.trim() || influencerId !== 'ALL' || brand !== 'ALL' || status !== 'ALL' || !!from || !!to;
  const select = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500';

  return (
    <PageGuard feature="marketing">
      <div className="mx-auto max-w-7xl space-y-6 pb-20">
        <Breadcrumbs items={[{ label: 'Marketing', href: '/marketing/influencers' }, { label: 'Marketing sends' }]} />

        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-1.5 text-2xl font-bold tracking-tight text-slate-900">Marketing sends
<InfoTip label="About this page">History of products sent to influencers. Never counted in orders, sales or delivery numbers.</InfoTip></h1>
            
          </div>
          <DownloadButton datasets={['marketing_sends']} records={{ marketingSends: filtered } as any} />
          <Link href="/marketing/influencers" className="inline-flex items-center gap-1.5 self-start rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700"><Users className="h-3.5 w-3.5" /> Choose an influencer to send</Link>
        </div>

        <p className="flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900"><Info className="mt-0.5 h-4 w-4 shrink-0" />
          This list is read-only. To record a send, open the influencer and use <strong className="mx-1">Send products</strong> on their profile.</p>

        {legacyOrders > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <span><strong>{legacyOrders} earlier send{legacyOrders === 1 ? '' : 's'}</strong> still need moving out of orders. They are already excluded from every sales number.</span>
            {isSuperAdmin(db.getCurrentUser())
              ? <Link href="/settings?tab=upgrade" className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 font-bold hover:bg-amber-100">Open data upgrade</Link>
              : <span className="font-semibold">Ask a Super Admin to run settings → Data upgrade.</span>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
            <input type="search" aria-label="Search sends" placeholder="Search MS number, influencer, product" value={search} onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:bg-white" />
          </div>
          <select aria-label="Influencer" value={influencerId} onChange={(event) => setInfluencerId(event.target.value)} className={select}><option value="ALL">All influencers</option>{influencers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
          <select aria-label="Brand" value={brand} onChange={(event) => setBrand(event.target.value)} className={select}><option value="ALL">All brands</option>{brands.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}</select>
          <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)} className={select}><option value="ALL">All statuses</option>{Object.keys(STATUS_STYLE).map((label) => <option key={label} value={label}>{label}</option>)}</select>
          <input aria-label="Sent from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={select} />
          <input aria-label="Sent to" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className={select} />
        </div>

        {!loaded && !sends.length ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white" role="status" aria-label="Loading sends"><div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
        ) : !filtered.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white">
            <EmptyState icon={Gift} title={filtering ? 'No send matches these filters' : 'No sends recorded yet'}
              description={filtering ? 'Clear a filter or widen the dates.' : 'Open an influencer and use Send products. Each send then appears here.'}
              action={filtering ? undefined : { label: 'Go to influencers', href: '/marketing/influencers' }} />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-500">{filtered.length} send{filtered.length === 1 ? '' : 's'}{filtering ? ` of ${sends.length}` : ''}</p>
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[11px] font-bold text-slate-500">
                  <tr><th className="px-4 py-2.5">Send</th><th className="px-3 py-2.5">Sent</th><th className="px-3 py-2.5">Influencer</th><th className="px-3 py-2.5">Brands</th><th className="px-3 py-2.5">Products</th><th className="px-3 py-2.5">Responsible</th><th className="px-3 py-2.5">Content due</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5" /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {<PagedList items={filtered} label="sends" asRow render={(pageRows) => pageRows.map((send) => {
                    const label = sendStatusLabel(send, content, today);
                    const open = () => router.push(`/marketing/influencers/${send.influencerId}`);
                    return (
                      <tr key={send.id} tabIndex={0} role="link" aria-label={`Open ${send.influencerName}`} onClick={open} onKeyDown={(event) => { if (event.key === 'Enter') open(); }} className="cursor-pointer hover:bg-slate-50 focus:bg-blue-50 focus:outline-none">
                        <td className="whitespace-nowrap px-4 py-3 font-mono font-black text-slate-900">{displayDocumentId(send.sendNumber)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(send.sentDateAd, send.sentDateBs)}</td>
                        <td className="px-3 py-3 font-bold text-blue-700">{send.influencerName}</td>
                        <td className="px-3 py-3"><span className="flex flex-wrap gap-1">{send.brandCodes.map((code) => <span key={code} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{brandName(code)}</span>)}</span></td>
                        <td className="max-w-xs px-3 py-3 text-slate-700">{send.items.map((item) => `${item.quantity}× ${item.productName}${item.isCombo ? " (combo)" : ""}`).join(', ')}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{send.responsibleName || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{send.expectedContentDateAd ? formatDate(send.expectedContentDateAd, send.expectedContentDateBs) : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-3"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[label]}`}>{label}</span></td>
                        <td className="px-3 py-3 text-slate-300"><ChevronRight className="h-4 w-4" /></td>
                      </tr>
                    );
                  })} />}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PageGuard>
  );
}
