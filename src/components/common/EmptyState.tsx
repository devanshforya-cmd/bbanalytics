'use client';

import React from 'react';
import Link from 'next/link';
import {
  PackageOpen,
  CheckCircle2,
  ShieldCheck,
  Inbox,
  ShoppingBag,
  CreditCard,
  MapPin,
  MessageSquareHeart,
  Boxes,
  Camera,
  FileText,
  CheckSquare,
  Clock,
  ArrowRight,
  Lightbulb,
  Search,
} from 'lucide-react';

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  type?:
    | 'orders'
    | 'returns'
    | 'cheques'
    | 'visits'
    | 'feedback'
    | 'stocks'
    | 'photos'
    | 'documents'
    | 'tasks'
    | 'timeline'
    | 'failures'
    | 'complaints'
    | 'search'
    | 'generic';
  customMessage?: string;
  searchQuery?: string;
  isCelebration?: boolean;
}

export default function EmptyState({
  icon: CustomIcon,
  title: customTitle,
  description: customDescription,
  action,
  secondaryAction,
  type = 'generic',
  customMessage,
  searchQuery,
  isCelebration,
}: EmptyStateProps) {
  let DefaultIcon: React.ComponentType<{ className?: string }> = Inbox;
  let title = 'No data available';
  let description = 'No data matches these filters. Try widening your date range or removing a filter.';
  let isCelebrate = isCelebration ?? false;
  let defaultAction = action;
  let defaultSecondaryAction = secondaryAction;

  switch (type) {
    case 'orders':
      DefaultIcon = ShoppingBag;
      title = 'No orders yet today';
      description =
        customMessage ||
        customDescription ||
        'Orders come in via WhatsApp, Instagram, and field visits. Morning rush usually starts by 10 AM.';
      if (!defaultAction) {
        defaultAction = { label: 'Enter order manually', href: '/orderflow/manual-entry' };
      }
      if (!defaultSecondaryAction) {
        defaultSecondaryAction = { label: 'Open WhatsApp extractor', href: '/orderflow/extractor' };
      }
      break;

    case 'returns':
      DefaultIcon = ShieldCheck;
      title = 'No returns recorded';
      description =
        customMessage ||
        customDescription ||
        "No returns recorded. When returns are logged, they'll appear here separated from delivery failures.";
      break;

    case 'cheques':
      DefaultIcon = CreditCard;
      title = 'No pending cheques';
      description =
        customMessage ||
        customDescription ||
        'No pending cheques. All collected cheques have been cashed.';
      break;

    case 'visits':
      DefaultIcon = MapPin;
      title = 'No GPS check-ins today';
      description =
        customMessage ||
        customDescription ||
        'No GPS check-ins today. Officers may not have started their beat yet.';
      break;

    case 'complaints':
      DefaultIcon = Lightbulb;
      title = 'Zero complaints this week ';
      description =
        customMessage ||
        customDescription ||
        'No complaints in this period.';
      isCelebrate = true;
      break;

    case 'feedback':
      DefaultIcon = MessageSquareHeart;
      title = 'No feedback received yet';
      description =
        customMessage ||
        customDescription ||
        'Customer reviews, complaints, and feedback will appear here.';
      break;

    case 'stocks':
      DefaultIcon = Boxes;
      title = 'No stock counts recorded';
      description =
        customMessage ||
        customDescription ||
        'No stock counts recorded for this store. Officers count stock daily on their beat route.';
      break;

    case 'photos':
      DefaultIcon = Camera;
      title = 'No shelf photos yet';
      description =
        customMessage ||
        customDescription ||
        'Photos are captured during store visits. The next visit for this store is scheduled for tomorrow.';
      break;

    case 'documents':
      DefaultIcon = FileText;
      title = 'No documents uploaded';
      description =
        customMessage ||
        customDescription ||
        'Field-collected purchase orders and delivery receipts appear here.';
      break;

    case 'tasks':
      DefaultIcon = CheckSquare;
      title = 'No tasks assigned';
      description =
        customMessage ||
        customDescription ||
        'Tasks are auto-created from cheque overdue alerts and follow-up call outcomes.';
      break;

    case 'timeline':
      DefaultIcon = Clock;
      title = 'No interactions yet';
      description =
        customMessage ||
        customDescription ||
        "This customer's orders, returns, complaints, and reviews will build their timeline.";
      break;

    case 'failures':
      DefaultIcon = CheckCircle2;
      title = 'No delivery failures';
      description =
        customMessage ||
        customDescription ||
        'Zero delivery failures — all orders in this period reached customers successfully.';
      isCelebrate = true;
      break;

    case 'search':
      DefaultIcon = Search;
      title = searchQuery ? `No results for "${searchQuery}"` : 'No search results';
      description =
        customMessage ||
        customDescription ||
        'Try a different spelling, or search by phone number instead of name.';
      break;

    case 'generic':
    default:
      DefaultIcon = Inbox;
      title = 'No matching records';
      description =
        customMessage ||
        customDescription ||
        'No data matches the selected criteria. Try adjusting your search or filters.';
      break;
  }

  const FinalIcon = CustomIcon || DefaultIcon;
  const finalTitle = customTitle || title;
  const finalDescription = customMessage || customDescription || description;

  const renderActionButton = (btn: EmptyStateAction, isPrimary = true) => {
    const cls = isPrimary
      ? 'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition active:scale-[0.98]'
      : 'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs transition';

    if (btn.href) {
      return (
        <Link key={btn.label} href={btn.href} className={cls}>
          <span>{btn.label}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      );
    }
    return (
      <button key={btn.label} type="button" onClick={btn.onClick} className={cls}>
        <span>{btn.label}</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    );
  };

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border ${
        isCelebrate
          ? 'border-black/[0.06] bg-white'
          : 'border-dashed border-black/[0.1] bg-transparent'
      }`}
    >
      <div
        className={`p-3 rounded-xl border mb-3 ${
          isCelebrate
            ? 'bg-white border-black/[0.08] text-emerald-700'
            : 'bg-white border-slate-200/80 text-slate-500'
        }`}
      >
        <FinalIcon className="h-6 w-6" />
      </div>
      <h2 className="text-[15px] font-medium text-slate-900">
        {finalTitle}
      </h2>
      <p className="mt-1 max-w-md text-[13px] leading-5 text-slate-500">
        {finalDescription}
      </p>

      {(defaultAction || defaultSecondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {defaultAction && renderActionButton(defaultAction, true)}
          {defaultSecondaryAction && renderActionButton(defaultSecondaryAction, false)}
        </div>
      )}
    </div>
  );
}
