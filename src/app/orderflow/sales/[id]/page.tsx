'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import InfoTip from '@/components/common/InfoTip';
import CampaignEditor from '@/components/sales/CampaignEditor';
import { db } from '@/lib/db/db-service';
import { canManageSales } from '@/lib/permissions';
import { campaignState, describeReward, nepalNow } from '@/lib/offers';
import { saleResults, type PeriodStats } from '@/lib/sale-results';

const npr = (cents: number) => `NPR ${(Math.round(cents) / 100).toLocaleString('en-NP', { maximumFractionDigits: 0 })}`;
const change = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value}%`;
const tone = (value: number | null) => value === null ? 'text-slate-500' : value >= 0 ? 'text-emerald-700' : 'text-rose-700';

function Tile({ title, value, sub, delta }: { title: string; value: string; sub?: string; delta?: number | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold text-slate-500">{title}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {(sub || delta !== undefined) && <p className="text-[11px] text-slate-500">{delta !== undefined && <span className={`font-semibold ${tone(delta)}`}>{change(delta)} </span>}{sub}</p>}
    </div>
  );
}

function Compare({ rows }: { rows: { label: string; during: string; before: string; after?: string }[] }) {
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-left text-slate-500"><th className="py-1 font-medium" /><th className="py-1 text-right font-medium">During</th><th className="py-1 text-right font-medium">Before</th>{rows[0]?.after !== undefined && <th className="py-1 text-right font-medium">After</th>}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.label} className="border-t border-slate-100"><td className="py-1.5 text-slate-700">{row.label}</td><td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">{row.during}</td><td className="py-1.5 text-right tabular-nums text-slate-600">{row.before}</td>{row.after !== undefined && <td className="py-1.5 text-right tabular-nums text-slate-600">{row.after}</td>}</tr>)}</tbody>
    </table>
  );
}

function SaleDetail() {
  const params = useParams<{ id: string }>();
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  useEffect(() => { const reload = () => setRevision((value) => value + 1); window.addEventListener('bb-db-updated', reload); return () => window.removeEventListener('bb-db-updated', reload); }, []);
  const campaign = useMemo(() => db.getCampaign(params.id), [params.id, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = nepalNow();
  const results = useMemo(() => campaign && !campaign.isTemplate ? saleResults(campaign, db.getOrders('ALL'), { today: now.slice(0, 10), failures: db.getDeliveryFailures('ALL'), returns: db.getReturns('ALL'), comboIds: db.getCombos('ALL').map((combo) => combo.id) }) : null, [campaign, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!campaign) return <main className="mx-auto max-w-5xl p-6"><Link href="/orderflow/sales" className="text-sm text-blue-700">← Sales &amp; Offers</Link><p className="mt-4 text-sm text-slate-600">This sale no longer exists.</p></main>;
  const state = campaignState(campaign, now);
  const giftName = (id: string) => db.getProducts('ALL').find((product) => product.id === id)?.name || 'gift';
  const row = (pick: (stats: PeriodStats) => string) => results ? { during: pick(results.during), before: pick(results.before), ...(results.after ? { after: pick(results.after) } : {}) } : { during: '', before: '' };
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <Link href="/orderflow/sales" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700"><ArrowLeft className="h-3.5 w-3.5" /> Sales &amp; Offers</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
          {!campaign.isTemplate && <p className="text-xs text-slate-500">{campaign.startsAt.replace('T', ' ')} – {campaign.endsAt.replace('T', ' ')} · {campaign.brandCodes.length ? campaign.brandCodes.join(', ') : 'All brands'} · {campaign.channels.length ? campaign.channels.join(', ') : 'every channel'} · {state}</p>}
        </div>
        {canManageSales(db.getCurrentUser()) && <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" /> Edit</button>}
      </div>

      {results && (results.during.orders > 0 || state === 'Live' || state === 'Ended') ? <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile title="Net sales" value={npr(results.during.netCents)} delta={results.lift.net} sub="per day vs before" />
          <Tile title="Orders" value={String(results.during.orders)} delta={results.lift.orders} sub="per day vs before" />
          <Tile title="Average order" value={npr(results.during.averageOrderCents)} delta={results.lift.averageOrder} sub="vs before" />
          <Tile title="Discount and gifts cost" value={npr(results.discountCostCents)} sub={results.during.mrpCents ? `${Math.round((results.discountCostCents / results.during.mrpCents) * 1000) / 10}% of MRP value` : undefined} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="flex items-center gap-1 text-sm font-semibold text-slate-900">During vs before<InfoTip label="About the comparison">“Before” is the same number of days just before the sale; “After” is the same number of days just after it, once they have passed. Only the brands and channels this sale covered are counted. Cancelled orders, exchanges and marketing sends are left out.</InfoTip></h2>
            <p className="mb-2 text-[11px] text-slate-500">{results.during.from} – {results.during.to} ({results.during.days} day{results.during.days === 1 ? '' : 's'}) vs {results.before.from} – {results.before.to}</p>
            <Compare rows={[
              { label: 'Orders per day', ...row((stats) => String(stats.perDayOrders)) },
              { label: 'Net sales per day', ...row((stats) => npr(stats.perDayNetCents)) },
              { label: 'Average order', ...row((stats) => npr(stats.averageOrderCents)) },
              { label: 'Units', ...row((stats) => String(stats.units)) },
              { label: 'Combos / single units', ...row((stats) => `${stats.comboUnits} / ${stats.singleUnits}`) },
              { label: 'New / returning customers', ...row((stats) => `${stats.newCustomers} / ${stats.returningCustomers}`) },
              { label: 'Offer discounts', ...row((stats) => npr(stats.offerCents)) },
              { label: 'Customer discounts', ...row((stats) => npr(stats.customerCents)) },
              { label: 'Free gifts', ...row((stats) => `${stats.giftUnits} (${npr(stats.giftCents)})`) },
            ]} />
            <p className="mt-2 text-[11px] text-slate-600">Net sales {results.extraNetCents >= 0 ? 'above' : 'below'} the usual pace: <strong className={results.extraNetCents >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{npr(Math.abs(results.extraNetCents))}</strong>, for {npr(results.discountCostCents)} in discounts and gifts.</p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Each offer</h2>
            <table className="mt-2 w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1 font-medium">Offer</th><th className="py-1 text-right font-medium">Orders</th><th className="py-1 text-right font-medium">Discount</th><th className="py-1 text-right font-medium">Net sales</th></tr></thead>
              <tbody>{results.offers.map((offer) => <tr key={offer.offerId} className="border-t border-slate-100"><td className="py-1.5"><span className="font-semibold text-slate-900">{offer.offerName}</span>
                {offer.giftUnits > 0 && <span className="block text-[11px] text-slate-500">{offer.giftUnits} gift{offer.giftUnits === 1 ? '' : 's'} · {npr(offer.giftCents)}</span>}
                {offer.nearThreshold > 0 && <span className="block text-[11px] text-slate-500">{offer.nearThreshold} order{offer.nearThreshold === 1 ? '' : 's'} just above the minimum spend</span>}</td>
                <td className="py-1.5 text-right tabular-nums">{offer.orders}</td><td className="py-1.5 text-right tabular-nums">{npr(offer.discountCents)}</td><td className="py-1.5 text-right tabular-nums">{npr(offer.netCents)}</td></tr>)}</tbody></table>
            <p className="mt-2 text-[11px] text-slate-500">{results.pricedOrders} order{results.pricedOrders === 1 ? '' : 's'} priced by this sale · {results.unpricedOrders} in the same days without an offer.</p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">By channel</h2>
            <ul className="mt-2 space-y-1 text-xs">{results.during.channels.map((entry) => <li key={entry.channel} className="flex justify-between border-t border-slate-100 pt-1"><span>{entry.channel} <span className="text-slate-500">· {entry.orders} order{entry.orders === 1 ? '' : 's'}</span></span><span className="tabular-nums">{npr(entry.netCents)}</span></li>)}
              {!results.during.channels.length && <li className="text-slate-500">No orders yet.</li>}</ul>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="flex items-center gap-1 text-sm font-semibold text-slate-900">Delivery and returns<InfoTip label="About this">Sale orders often fail or come back more. Compared with orders in the same days that no offer touched (or, if every order had an offer, the days before).</InfoTip></h2>
            <Compare rows={[
              { label: 'Delivery failed', during: results.saleFailureRate === null ? '—' : `${results.saleFailureRate}%`, before: results.otherFailureRate === null ? '—' : `${results.otherFailureRate}%` },
              { label: 'Returned', during: results.saleReturnRate === null ? '—' : `${results.saleReturnRate}%`, before: results.otherReturnRate === null ? '—' : `${results.otherReturnRate}%` },
            ]} />
            <p className="mt-1 text-[11px] text-slate-500">First column: orders this sale priced. Second: other orders.</p>
          </section>
        </div>
      </> : !campaign.isTemplate && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">{state === 'Draft' ? 'Schedule this sale to start pricing orders.' : 'Results appear once orders come in during the sale.'}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Offers</h2>
        <ul className="mt-2 space-y-1.5 text-xs">{campaign.offers.map((offer) => (
          <li key={offer.id} className={`border-t border-slate-100 pt-1.5 ${offer.enabled ? '' : 'text-slate-400'}`}><span className="font-semibold">{offer.name}</span> · {describeReward(offer.reward, giftName)}{offer.enabled ? '' : ' · switched off'}
            <span className="block text-[11px] text-slate-500">{[offer.target.mode === 'ALL' ? 'Everything' : offer.target.mode === 'COMBOS' ? 'Combos only' : offer.target.mode === 'SINGLES' ? 'Single products only' : offer.target.mode === 'CATEGORY' ? `Categories: ${(offer.target.categories || []).join(', ')}` : `${offer.target.mode === 'EXCEPT' ? 'All except' : 'Only'} ${(offer.target.itemIds || []).length} item(s)`,
              offer.condition.minOrderValue ? `order NPR ${offer.condition.minOrderValue}+` : '', offer.condition.minUnits ? `${offer.condition.minUnits}+ units` : '', offer.condition.codeWord ? `code ${offer.condition.codeWord}` : '',
              offer.condition.hours ? `${offer.condition.hours.from}–${offer.condition.hours.to}` : '', offer.condition.firstOrderOnly ? 'first order only' : '',
              offer.stacking === 'STACK' ? 'stacks' : offer.stacking === 'BEST' ? 'best one wins' : 'exclusive'].filter(Boolean).join(' · ')}</span></li>
        ))}</ul>
      </section>
      {editing && <CampaignEditor campaign={campaign} onClose={() => setEditing(false)} onSaved={() => setRevision((value) => value + 1)} />}
    </main>
  );
}

export default function SaleDetailPage() { return <PageGuard feature={['orderflow', 'order_desk', 'marketing', 'settings']}><SaleDetail /></PageGuard>; }
