'use client';

import { MapPin, Target, TrendingUp } from 'lucide-react';
import type { AreaSellingAnalysis } from '@/lib/area-selling';
import type { Promotion } from '@/lib/types';

export default function StoreUpsellPanel({ analysis, promotions }: { analysis: AreaSellingAnalysis; promotions: Promotion[] }) {
  return <div className="space-y-5">
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-3">
      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Target className="h-5 w-5 text-blue-600" />Area selling opportunities</h3>
      <p className="text-sm text-slate-600 flex items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0" />{analysis.areaLabel || 'Area not recorded'}</p>
      <p className="text-xs text-slate-600">{analysis.message}</p>
      {analysis.status === 'READY' && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        {[
          ['Opportunity score', `${analysis.opportunityScore}/100`],
          ['Delivered orders · 30d', analysis.recentOrderCount],
          ['Stores with deliveries', analysis.recentStoreCount],
          ['Evidence confidence', analysis.confidence.toLowerCase()],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-blue-100 bg-white p-3"><p className="text-[11px] text-slate-500">{label}</p><p className="font-bold text-lg text-slate-900 capitalize">{value}</p></div>)}
      </div>}
    </div>
    {analysis.status === 'READY' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Target className="h-4 w-4 text-blue-600" />What to pitch here</h4>
        {analysis.opportunities.length === 0 && <p className="text-xs text-slate-500">No recommendation yet. Record delivered orders and fresh shelf counts to improve the evidence.</p>}
        {analysis.opportunities.slice(0, 5).map(item => <div key={item.productId} className="rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-start justify-between gap-3"><p className="text-sm font-bold text-slate-900">{item.productName}</p><span className="text-xs font-bold text-blue-700 shrink-0">{item.score}/100</span></div>
          <span className="inline-block rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{item.kind === 'INTRODUCE' ? 'PITCH A TRIAL' : 'REVIEW REPLENISHMENT'}</span>
          <p className="text-xs leading-relaxed text-slate-600">{item.reason}</p>
        </div>)}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" />Area product demand</h4>
        <p className="text-xs text-slate-500">Latest 30 days versus the previous 30 days. Growth measures delivered unit volume.</p>
        {analysis.trends.map(item => <div key={item.productId} className="border-b border-slate-100 pb-3 last:border-0 space-y-1">
          <div className="flex justify-between gap-3 text-xs"><strong className="text-slate-900">{item.productName}</strong><span className="shrink-0 font-semibold text-slate-700">{item.recentUnits} units</span></div>
          <p className="text-[11px] text-slate-500">{item.purchasingStores} buying stores · {item.storeRecentUnits} units here · {item.growthPct === null ? 'No prior-period deliveries to compare' : `${item.growthPct > 0 ? '+' : ''}${item.growthPct}% vs prior 30 days (${item.previousUnits} units)`}</p>
        </div>)}
      </section>
    </div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <h4 className="text-sm font-bold text-slate-900">Current trade promotions · {promotions.length}</h4>
      {promotions.length === 0 && <p className="text-xs text-slate-500">No active, dated promotion applies to this store.</p>}
      {promotions.map(promotion => <div key={promotion.id} className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs space-y-1"><strong className="text-slate-900">{promotion.name}</strong><p className="text-slate-600">{promotion.description}</p><p className="text-[11px] text-slate-500">Valid: {promotion.validFromBs || promotion.validFromAd} – {promotion.validToBs || promotion.validToAd}</p></div>)}
    </section>
    <details className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
      <summary className="font-bold text-slate-800 cursor-pointer min-h-[24px]">How the rules work</summary>
      <div className="space-y-2 pt-3 leading-relaxed">
        <p>City and area must match after punctuation, spacing and case normalization. Only active catalog products in your permitted delivered secondary orders count. Pending, dispatched and cancelled orders, online customer addresses and warehouse dispatches are excluded; they do not prove a completed store purchase.</p>
        <p>A product needs at least three delivered orders across two other stores before it becomes a pitch. A trial prompt means no delivered purchase here in 60 days; it does not claim the shelf is empty. A fresh positive shelf count suppresses that prompt.</p>
        <p>Product score = 40% reach among other visible stores + 25% relative local unit volume + 20% positive growth (capped at 100%) + 15% store fit. No previous-period sales earns no growth points. The store score averages its top three opportunities. Scores rank sales conversations; they are not a revenue forecast or a probability.</p>
        <p>Confidence is low with the minimum sample, medium with at least five orders across three stores, and high with at least ten across five. Restricted access can make the sample smaller. Branches compare with branches and retail outlets with retail outlets. Record city and area on the store detail page before comparison.</p>
      </div>
    </details>
  </div>;
}
