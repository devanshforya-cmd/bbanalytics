'use client';

import React from 'react';
import { Sparkles, TrendingUp, CloudRain, Calendar, ShoppingBag, Lightbulb } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { SeasonalPattern } from '@/lib/types';

export default function SeasonalInsightsSection() {
  const patterns: SeasonalPattern[] = db.getSeasonalPatterns();

  const getIcon = (metric: SeasonalPattern['metric']) => {
    switch (metric) {
      case 'orders':
        return <TrendingUp className="w-5 h-5 text-emerald-600" />;
      case 'delivery_failures':
        return <CloudRain className="w-5 h-5 text-blue-600" />;
      case 'day_of_week':
        return <Calendar className="w-5 h-5 text-purple-600" />;
      case 'channel_volume':
      default:
        return <ShoppingBag className="w-5 h-5 text-amber-600" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
            <Sparkles className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">Seasonal Pattern Intelligence</h3>
        </div>
        <span className="text-xs text-slate-500 font-medium">Rolling 30-day comparison</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {patterns.slice(0, 3).map((pat) => (
          <div
            key={pat.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                  {getIcon(pat.metric)}
                </div>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    pat.direction === 'UP'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {pat.direction === 'UP' ? `+${pat.pct}%` : `-${pat.pct}%`} Delta
                </span>
              </div>

              <h4 className="text-sm font-bold text-slate-900 leading-snug">{pat.description}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{pat.evidence}</p>
            </div>

            <div className="pt-3 border-t border-slate-100 mt-2">
              <div className="flex items-start gap-2 bg-blue-50/70 p-2.5 rounded-xl border border-blue-100">
                <Lightbulb className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-blue-900 leading-relaxed">
                  <strong className="font-semibold text-blue-950">Action:</strong> {pat.suggestedAction}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
