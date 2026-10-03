'use client';

import React from 'react';
import Link from 'next/link';
import { X, Star, ThumbsUp, Image as ImageIcon, Sparkles, Globe } from 'lucide-react';
import { FeedbackEntry, Sentiment } from '@/lib/types';
import EmptyState from './EmptyState';

interface ReviewListModalProps {
  filterType: 'ALL' | 'USED_IN_DESIGN' | 'POSTED_ON_WEB' | null;
  selectedReview: FeedbackEntry | null;
  onClose: () => void;
  feedback: FeedbackEntry[];
  calendarMode: 'BS' | 'AD';
}

export default function ReviewListModal({
  filterType,
  selectedReview,
  onClose,
  feedback,
  calendarMode,
}: ReviewListModalProps) {
  if (!filterType && !selectedReview) return null;

  let title = 'Customer Reviews Collected';
  let subtitle = 'All authentic feedback received from social channels and direct messaging';
  let list = feedback.filter((f) => f.type === 'REVIEW' || f.type === 'FEEDBACK');

  if (selectedReview) {
    title = `Review Detail — ${selectedReview.customerName}`;
    subtitle = `Source: ${selectedReview.channel} • Product: ${selectedReview.productName}`;
    list = [selectedReview];
  } else if (filterType === 'USED_IN_DESIGN') {
    title = 'Marketing Assets: Used in Ad Designs';
    subtitle = 'Customer testimonials approved and formatted into graphic social creatives';
    list = list.filter((f) => f.usedInDesign);
  } else if (filterType === 'POSTED_ON_WEB') {
    title = 'Marketing Assets: Live on Website';
    subtitle = 'Verified buyer reviews published to Brand Bucket e-commerce PDP pages';
    list = list.filter((f) => f.postedOnWebsite);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 w-full md:w-[65vw] max-w-4xl bg-white shadow-2xl flex flex-col border-l border-slate-200 z-50">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200">
              <Star className="w-5 h-5 fill-emerald-500 text-emerald-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">{title}</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  {list.length}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/40">
          {list.length === 0 ? (
            <EmptyState type="generic" customMessage="No reviews match this specific marketing asset filter." />
          ) : (
            <div className="space-y-4">
              {list.map((r) => {
                const sentimentColor =
                  r.sentiment === 'POSITIVE'
                    ? 'bg-emerald-100 text-emerald-800'
                    : r.sentiment === 'NEGATIVE'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-700';

                return (
                  <div
                    key={r.id}
                    className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3 text-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{r.customerName}</span>
                          <span className="font-mono text-slate-400 text-[11px]">{r.customerPhone}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${sentimentColor}`}>
                            {r.sentiment}
                          </span>
                        </div>
                        <div className="text-slate-500 text-[11px] mt-0.5">
                          Product: <strong className="text-slate-800">{r.productName}</strong> ({r.brandCode})
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-2 self-start sm:self-auto">
                        <span className="text-slate-500 text-[11px]">
                          {calendarMode === 'BS' ? r.dateReceivedBs : r.dateReceivedAd}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-medium text-[10px]">
                          {r.channel}
                        </span>
                      </div>
                    </div>

                    <p className="text-slate-700 leading-relaxed text-xs italic bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                      &ldquo;{r.fullText}&rdquo;
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        {r.usedInDesign && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                            <Sparkles className="w-3 h-3" /> Used in Creative Design
                          </span>
                        )}
                        {r.postedOnWebsite && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            <Globe className="w-3 h-3" /> Live on Web PDP
                          </span>
                        )}
                        {r.hasScreenshot && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                            <ImageIcon className="w-3 h-3" /> Screenshot Attached
                          </span>
                        )}
                      </div>

                      <Link
                        href="/customers"
                        className="text-blue-600 font-bold hover:underline text-xs"
                      >
                        Open Customer Profile &rarr;
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
