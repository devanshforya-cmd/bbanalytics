'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BadgePercent, Copy, MoreHorizontal, Pause, Play, Plus, Square, Trash2 } from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import InfoTip from '@/components/common/InfoTip';
import { confirmAction } from '@/components/common/confirm';
import { toast } from '@/components/common/Toast';
import CampaignEditor from '@/components/sales/CampaignEditor';
import { db } from '@/lib/db/db-service';
import { canManageSales } from '@/lib/permissions';
import { campaignOverlaps, campaignState, describeReward, nepalNow, type CampaignState } from '@/lib/offers';
import { syncManager } from '@/lib/offline-sync';
import type { SaleCampaign } from '@/lib/types';

const STATE_STYLE: Record<CampaignState, string> = {
  Live: 'bg-emerald-100 text-emerald-800', Scheduled: 'bg-blue-100 text-blue-800', Paused: 'bg-amber-100 text-amber-800',
  Draft: 'bg-slate-100 text-slate-700', Ended: 'bg-slate-100 text-slate-500', Template: 'bg-purple-100 text-purple-800',
};
const ORDER: CampaignState[] = ['Live', 'Scheduled', 'Paused', 'Draft', 'Ended', 'Template'];
const when = (value: string) => new Date(`${value}:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const DAY = 86400000;

/** Six weeks from the start of this week, with a bar for each sale that touches them. */
function Timeline({ campaigns, now }: { campaigns: SaleCampaign[]; now: string }) {
  const start = new Date(`${now.slice(0, 10)}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY).toISOString().slice(0, 10));
  const first = days[0], last = days[days.length - 1];
  const shown = campaigns.filter((campaign) => !campaign.isTemplate && campaign.status !== 'DRAFT' && campaign.endsAt.slice(0, 10) >= first && campaign.startsAt.slice(0, 10) <= last);
  if (!shown.length) return null;
  const index = (date: string) => Math.max(0, Math.min(41, Math.round((Date.parse(`${date}T00:00:00Z`) - start.getTime()) / DAY)));
  return (
    <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4" aria-label="Sales calendar">
      <div className="min-w-[720px]">
        <div className="grid text-[10px] text-slate-500" style={{ gridTemplateColumns: 'repeat(42, minmax(0, 1fr))' }}>
          {days.map((day) => <div key={day} className={`border-l border-slate-100 pl-0.5 ${day === now.slice(0, 10) ? 'font-bold text-blue-700' : ''}`}>{day.endsWith('-01') || day === first ? new Date(`${day}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) : ''}<span className="block">{Number(day.slice(8))}</span></div>)}
        </div>
        <div className="mt-1 space-y-1">
          {shown.map((campaign) => {
            const state = campaignState(campaign, now);
            const from = index(campaign.startsAt.slice(0, 10)), to = index(campaign.endsAt.slice(0, 10));
            return (
              <div key={campaign.id} className="grid items-center" style={{ gridTemplateColumns: 'repeat(42, minmax(0, 1fr))' }}>
                <Link href={`/orderflow/sales/${campaign.id}`} style={{ gridColumn: `${from + 1} / ${to + 2}` }} className={`truncate rounded-md px-1.5 py-1 text-[11px] font-semibold ${STATE_STYLE[state]} hover:opacity-80`} title={`${campaign.name}: ${when(campaign.startsAt)} – ${when(campaign.endsAt)}`}>{campaign.name}</Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Sales() {
  const user = db.getCurrentUser();
  const canManage = canManageSales(user);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<SaleCampaign | null | 'new'>(null);
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => { const reload = () => setRevision((value) => value + 1); window.addEventListener('bb-db-updated', reload); return () => window.removeEventListener('bb-db-updated', reload); }, []);
  const now = nepalNow();
  const campaigns = useMemo(() => db.getCampaigns(), [revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const overlaps = useMemo(() => campaignOverlaps(campaigns.filter((campaign) => campaignState(campaign, now) !== 'Ended')), [campaigns, now]);
  const grouped = ORDER.map((state) => ({ state, list: campaigns.filter((campaign) => campaignState(campaign, now) === state) })).filter((group) => group.list.length);
  const brandName = (code: string) => db.getBrands('ALL').find((brand) => brand.code === code)?.name || code;
  const giftName = (id: string) => db.getProducts('ALL').find((product) => product.id === id)?.name || 'gift';

  const run = async (task: () => unknown, done: string) => {
    try { task(); try { await syncManager.forceSyncNow(); } catch { /* Queued. */ } toast.success(done); setRevision((value) => value + 1); }
    catch (error) { toast.error('Not changed', error instanceof Error ? error.message : undefined); }
  };
  const act = async (campaign: SaleCampaign, action: 'pause' | 'resume' | 'end' | 'duplicate' | 'template' | 'delete') => {
    setMenu(null);
    if (action === 'pause') return run(() => db.setCampaignStatus(campaign.id, 'PAUSED'), `${campaign.name} paused. New orders get normal prices until you resume it.`);
    if (action === 'resume') return run(() => db.setCampaignStatus(campaign.id, 'SCHEDULED'), `${campaign.name} resumed`);
    if (action === 'end') {
      if (!(await confirmAction({ title: `End ${campaign.name} now?`, message: 'New orders get normal prices from now. Orders already saved keep their sale prices, and its results stay in the reports.', confirmLabel: 'End sale', destructive: true }))) return;
      return run(() => db.setCampaignStatus(campaign.id, 'ENDED'), `${campaign.name} ended`);
    }
    if (action === 'duplicate') return run(() => db.duplicateCampaign(campaign.id), 'Copied as a draft. Set its dates and schedule it.');
    if (action === 'template') return run(() => db.duplicateCampaign(campaign.id, { asTemplate: true, name: `${campaign.name} (template)` }), 'Saved as a template for future sales');
    if (action === 'delete') {
      if (!(await confirmAction({ title: `Delete ${campaign.name}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', destructive: true }))) return;
      return run(() => db.deleteCampaign(campaign.id), 'Deleted');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-1.5 text-2xl font-bold text-slate-900">Sales &amp; Offers<InfoTip label="About sales and offers">A sale has dates, brands and channels, and holds any number of offers. While it is live, the WhatsApp extractor prices orders with its offers and records what each one took off. Offers can stack, let the best one win, or apply alone.</InfoTip></h1>
        {canManage && <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> New sale</button>}
      </div>

      {overlaps.length > 0 && (
        <div className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900" role="status">
          {overlaps.map((entry) => <p key={`${entry.a}-${entry.b}`} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{entry.message}</p>)}
        </div>
      )}

      <Timeline campaigns={campaigns} now={now} />

      {!campaigns.length && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <BadgePercent className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-900">No sales yet</p>
          <p className="mt-1 text-xs text-slate-500">{canManage ? 'Create one with its dates and offers. Orders in those dates are priced automatically.' : 'Sales appear here once someone with Settings or Marketing access creates one.'}</p>
        </div>
      )}

      {grouped.map(({ state, list }) => (
        <section key={state}>
          <h2 className="mb-2 text-xs font-semibold text-slate-500">{state === 'Template' ? 'Templates' : state === 'Live' ? 'Live now' : state}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((campaign) => (
              <article key={campaign.id} className="relative rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/orderflow/sales/${campaign.id}`} className="block truncate text-sm font-semibold text-slate-900 hover:text-blue-700">{campaign.name}</Link>
                    {!campaign.isTemplate && <p className="text-[11px] text-slate-500">{when(campaign.startsAt)} – {when(campaign.endsAt)}</p>}
                    <p className="text-[11px] text-slate-500">{campaign.brandCodes.length ? campaign.brandCodes.map(brandName).join(', ') : 'All brands'} · {campaign.channels.length ? campaign.channels.join(', ') : 'every channel'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATE_STYLE[state]}`}>{state}</span>
                </div>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {campaign.offers.map((offer) => <li key={offer.id} className={offer.enabled ? 'text-slate-700' : 'text-slate-400 line-through'}><span className="font-semibold">{offer.name}</span> · {describeReward(offer.reward, giftName)}</li>)}
                  {!campaign.offers.length && <li className="text-slate-500">No offers yet</li>}
                </ul>
                <div className="mt-3 flex items-center gap-2">
                  <Link href={`/orderflow/sales/${campaign.id}`} className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">{campaign.isTemplate || state === 'Draft' ? 'Open' : 'Results'}</Link>
                  {canManage && <button type="button" onClick={() => setEditing(campaign)} className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Edit</button>}
                  {canManage && <button type="button" aria-label={`More for ${campaign.name}`} aria-haspopup="menu" aria-expanded={menu === campaign.id} onClick={() => setMenu(menu === campaign.id ? null : campaign.id)} className="ml-auto rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4" /></button>}
                </div>
                {menu === campaign.id && (
                  <>
                    <div className="fixed inset-0 z-20" aria-hidden="true" onClick={() => setMenu(null)} />
                    <div role="menu" className="absolute bottom-12 right-3 z-30 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-xs shadow-lg">
                      {state === 'Live' || state === 'Scheduled' ? <button role="menuitem" type="button" onClick={() => act(campaign, 'pause')} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50"><Pause className="h-3.5 w-3.5" /> Pause</button> : null}
                      {state === 'Paused' && <button role="menuitem" type="button" onClick={() => act(campaign, 'resume')} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50"><Play className="h-3.5 w-3.5" /> Resume</button>}
                      {['Live', 'Scheduled', 'Paused'].includes(state) && <button role="menuitem" type="button" onClick={() => act(campaign, 'end')} className="flex w-full items-center gap-2 px-3 py-2 text-rose-700 hover:bg-rose-50"><Square className="h-3.5 w-3.5" /> End now</button>}
                      <button role="menuitem" type="button" onClick={() => act(campaign, 'duplicate')} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50"><Copy className="h-3.5 w-3.5" /> Duplicate as draft</button>
                      {!campaign.isTemplate && <button role="menuitem" type="button" onClick={() => act(campaign, 'template')} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50"><BadgePercent className="h-3.5 w-3.5" /> Save as template</button>}
                      {(state === 'Draft' || state === 'Template') && <button role="menuitem" type="button" onClick={() => act(campaign, 'delete')} className="flex w-full items-center gap-2 px-3 py-2 text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button>}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      {editing && <CampaignEditor campaign={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => setRevision((value) => value + 1)} />}
    </div>
  );
}

export default function SalesPage() { return <PageGuard feature={['orderflow', 'order_desk', 'marketing', 'settings']}><Sales /></PageGuard>; }
