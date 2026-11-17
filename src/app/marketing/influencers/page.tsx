'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { canPerform, isSuperAdmin } from '@/lib/permissions';
import type { Influencer, InfluencerQualityRating } from '@/lib/types';
import { getTodayAd } from '@/lib/nepali-calendar';
import { influencerNicheNames, influencerSendStats, sendStatusLabel } from '@/lib/marketing';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import InfluencerForm from '../components/InfluencerForm';
import { ChevronRight, History, Plus, Search, Send, Users, X } from 'lucide-react';

const RATING: Record<InfluencerQualityRating, { label: string; style: string; rank: number }> = {
  GREAT: { label: 'Great', style: 'bg-emerald-100 text-emerald-800 border-emerald-200', rank: 3 },
  AVERAGE: { label: 'Average', style: 'bg-amber-100 text-amber-800 border-amber-200', rank: 2 },
  POOR: { label: 'Poor', style: 'bg-rose-100 text-rose-800 border-rose-200', rank: 1 },
  NOT_RATED: { label: 'Not rated', style: 'bg-slate-100 text-slate-600 border-slate-200', rank: 0 },
};

export default function InfluencerDirectoryPage() {
  const router = useRouter();
  const { formatDate } = useCalendarPreference();
  const [, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(() => db.isWorkspaceLoaded());
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('ALL');
  const [rating, setRating] = useState('ALL');
  const [nicheFilter, setNicheFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'RATING' | 'LAST_SEND' | 'CONTENT' | 'NAME'>('LAST_SEND');
  const [showArchived, setShowArchived] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const refresh = () => { setVersion((value) => value + 1); setLoaded(db.isWorkspaceLoaded()); };
    window.addEventListener('bb-db-updated', refresh);
    void db.syncWithSupabase().finally(refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  const user = db.getCurrentUser();
  const canCreate = canPerform(user, 'marketing', 'CREATE');
  const influencers = db.getInfluencers();
  const sends = db.getMarketingSends();
  const content = db.getInfluencerContent();
  const niches = db.getInfluencerNiches(true);
  const today = getTodayAd();
  const legacyOrders = isSuperAdmin(user) ? db.getLegacyMarketingOrderCount() : 0;

  const rows = useMemo(() => influencers.map((influencer) => {
    const own = sends.filter((send) => send.influencerId === influencer.id);
    return { influencer, stats: influencerSendStats(influencer.id, sends), nicheNames: influencerNicheNames(influencer, niches),
      contentCount: content.filter((piece) => piece.influencerId === influencer.id).length,
      overdue: own.filter((send) => sendStatusLabel(send, content, today) === 'Content overdue').length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [influencers, sends, content, niches.length, today]);

  const platforms = [...new Set(influencers.flatMap((influencer) => (influencer.platforms || []).map((entry) => entry.platform)))].sort();
  const usedNiches = niches.filter((niche) => !niche.isArchived || influencers.some((influencer) => (influencer.nicheIds || []).includes(niche.id)));
  const filtered = rows.filter(({ influencer, nicheNames }) => {
    if (!showArchived && influencer.isActive === false) return false;
    const term = search.trim().toLowerCase();
    if (term && !(influencer.name.toLowerCase().includes(term) || (influencer.platforms || []).some((entry) => entry.handle.toLowerCase().includes(term))
      || (influencer.city || '').toLowerCase().includes(term) || nicheNames.some((name) => name.toLowerCase().includes(term)))) return false;
    if (platform !== 'ALL' && !(influencer.platforms || []).some((entry) => entry.platform === platform)) return false;
    if (rating !== 'ALL' && influencer.qualityRating !== rating) return false;
    if (nicheFilter.length && !nicheFilter.some((id) => (influencer.nicheIds || []).includes(id))) return false;
    return true;
  }).sort((a, b) => sortBy === 'NAME' ? a.influencer.name.localeCompare(b.influencer.name)
    : sortBy === 'CONTENT' ? b.contentCount - a.contentCount
    : sortBy === 'RATING' ? RATING[b.influencer.qualityRating].rank - RATING[a.influencer.qualityRating].rank || a.influencer.name.localeCompare(b.influencer.name)
    : (b.stats.lastSendDate || '').localeCompare(a.stats.lastSendDate || '') || a.influencer.name.localeCompare(b.influencer.name));

  const active = rows.filter((row) => row.influencer.isActive !== false);
  const liveSends = sends.filter((send) => send.status !== 'CANCELLED');
  const withContent = liveSends.filter((send) => sendStatusLabel(send, content, today) === 'Content received').length;
  const overdueTotal = liveSends.filter((send) => sendStatusLabel(send, content, today) === 'Content overdue').length;
  const filtering = !!search.trim() || platform !== 'ALL' || rating !== 'ALL' || nicheFilter.length > 0;
  const select = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500';

  return (
    <PageGuard feature="marketing">
      <div className="mx-auto max-w-7xl space-y-6 pb-24">
        <Breadcrumbs items={[{ label: 'Marketing' }, { label: 'Influencers' }]} />

        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Influencers</h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">Open a profile to send products or add content. Every send starts from an influencer.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/marketing/sends" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><History className="h-3.5 w-3.5" /> Send history</Link>
            {canCreate && <button type="button" onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-95"><Plus className="h-4 w-4" /> Add influencer</button>}
          </div>
        </div>

        {legacyOrders > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <span><strong>{legacyOrders} earlier marketing send{legacyOrders === 1 ? ' is' : 's are'} still stored as orders.</strong> They are already hidden from every sales number. Run the data upgrade to move them into send history.</span>
            <Link href="/settings?tab=upgrade" className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 font-bold hover:bg-amber-100">Open data upgrade</Link>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><p className="text-xs font-medium text-slate-500">Active influencers</p><p className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">{active.length}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><p className="text-xs font-medium text-slate-500">Sends recorded</p><p className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">{liveSends.length}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><p className="text-xs font-medium text-slate-500">Sends with content</p><p className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">{withContent}<span className="text-sm font-bold text-slate-400"> / {liveSends.length}</span></p></div>
          <div className={`rounded-2xl border p-4 shadow-2xs ${overdueTotal ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}><p className="text-xs font-medium text-slate-500">Content overdue</p><p className={`mt-1 text-xl font-black sm:text-2xl ${overdueTotal ? 'text-amber-800' : 'text-slate-900'}`}>{overdueTotal}</p></div>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
              <input type="search" aria-label="Search influencers" placeholder="Search name, @handle, city or niche" value={search} onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Platform" value={platform} onChange={(event) => setPlatform(event.target.value)} className={select}><option value="ALL">All platforms</option>{platforms.map((name) => <option key={name} value={name}>{name}</option>)}</select>
              <select aria-label="Quality rating" value={rating} onChange={(event) => setRating(event.target.value)} className={select}><option value="ALL">All ratings</option>{Object.entries(RATING).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select>
              <select aria-label="Sort by" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className={select}>
                <option value="LAST_SEND">Latest send first</option><option value="RATING">Best rated first</option><option value="CONTENT">Most content first</option><option value="NAME">Name A–Z</option>
              </select>
            </div>
          </div>
          {usedNiches.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by niche">
              <span className="mr-1 text-[11px] font-bold text-slate-500">Niche</span>
              {usedNiches.filter((niche) => !niche.isArchived).map((niche) => { const on = nicheFilter.includes(niche.id); return (
                <button key={niche.id} type="button" aria-pressed={on} onClick={() => setNicheFilter((ids) => on ? ids.filter((id) => id !== niche.id) : [...ids, niche.id])}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${on ? 'border-purple-500 bg-purple-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300'}`}>{niche.name}</button>
              ); })}
              {nicheFilter.length > 0 && <button type="button" onClick={() => setNicheFilter([])} className="inline-flex items-center gap-1 px-1.5 text-[11px] font-bold text-slate-500 hover:text-rose-600"><X className="h-3 w-3" /> Clear</button>}
            </div>
          )}
          <label className="flex w-fit cursor-pointer items-center gap-2 text-[11px] font-semibold text-slate-600">
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" /> Show archived profiles
          </label>
        </div>

        {!loaded && !influencers.length ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white" role="status" aria-label="Loading influencers"><div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
        ) : !filtered.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white">
            <EmptyState icon={Users} title={filtering ? 'No influencer matches these filters' : 'No influencers yet'}
              description={filtering ? 'Try a different search or clear a filter.' : 'Add an influencer first. Sends and content are then recorded from their profile.'}
              action={!filtering && canCreate ? { label: 'Add influencer', onClick: () => setShowAdd(true) } : undefined} />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <div className="hidden grid-cols-[2fr_1.4fr_1fr_0.8fr_0.8fr_1.1fr_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 lg:grid">
              <span>Influencer</span><span>Niches</span><span>Rating</span><span className="text-right">Sends</span><span className="text-right">Content</span><span>Last send</span><span className="w-28" />
            </div>
            <ul className="divide-y divide-slate-100">
              {filtered.map(({ influencer, stats, nicheNames, contentCount, overdue }) => (
                <li key={influencer.id}>
                  <div role="link" tabIndex={0} onClick={() => router.push(`/marketing/influencers/${influencer.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') router.push(`/marketing/influencers/${influencer.id}`); }}
                    className={`grid cursor-pointer grid-cols-1 gap-2 px-4 py-3 text-xs transition hover:bg-slate-50 focus:bg-blue-50 focus:outline-none lg:grid-cols-[2fr_1.4fr_1fr_0.8fr_0.8fr_1.1fr_auto] lg:items-center lg:gap-3 ${influencer.isActive === false ? 'opacity-60' : ''}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 font-bold text-purple-700" aria-hidden>{influencer.name.charAt(0).toUpperCase()}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">{influencer.name}{influencer.isActive === false && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Archived</span>}</span>
                        <span className="block truncate text-[11px] text-slate-500">{[(influencer.platforms || []).map((entry) => `${entry.platform} ${entry.handle}`).join(' · '), influencer.city].filter(Boolean).join(' · ') || 'No platforms added'}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">{nicheNames.length ? nicheNames.slice(0, 4).map((name) => <span key={name} className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">{name}</span>) : <span className="text-slate-300">—</span>}{nicheNames.length > 4 && <span className="text-[10px] font-bold text-slate-500">+{nicheNames.length - 4}</span>}</div>
                    <div><span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${RATING[influencer.qualityRating].style}`}>{RATING[influencer.qualityRating].label}</span></div>
                    <div className="font-bold text-slate-900 lg:text-right"><span className="font-medium text-slate-500 lg:hidden">Sends </span>{stats.totalSends}{overdue > 0 && <span className="ml-1.5 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">{overdue} overdue</span>}</div>
                    <div className="font-bold text-slate-900 lg:text-right"><span className="font-medium text-slate-500 lg:hidden">Content </span>{contentCount}</div>
                    <div className="text-slate-600">{stats.lastSendDate ? formatDate(stats.lastSendDate, stats.lastSendDateBs) : <span className="text-slate-400">No sends yet</span>}</div>
                    <div className="flex items-center justify-end gap-1 lg:w-28">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2.5 py-1.5 font-bold text-purple-800"><Send className="h-3 w-3" /> Open</span>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {showAdd && <InfluencerForm onClose={() => setShowAdd(false)} onSaved={(saved) => { setShowAdd(false); router.push(`/marketing/influencers/${saved.id}`); }} />}
    </PageGuard>
  );
}
