'use client';

import React from 'react';

export interface SkeletonLoaderProps {
  variant?: 'metric-card' | 'table' | 'card-grid' | 'cards' | 'card' | 'list' | 'page' | 'inline' | string;
  type?: 'metric-card' | 'table' | 'card-grid' | 'cards' | 'card' | 'list' | 'page' | 'inline' | string;
  rows?: number;
  cols?: number;
  columns?: number;
  className?: string;
}

function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-slate-200 rounded animate-pulse ${className}`} />
  );
}

function MetricCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <Shimmer className="h-3 w-24" />
      <Shimmer className="h-7 w-16" />
      <Shimmer className="h-2.5 w-32" />
      <Shimmer className="h-8 w-full rounded-xl" />
    </div>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 border-b border-slate-100 bg-slate-50">
        {[40, 24, 32, 20, 28].map((w, i) => (
          <Shimmer key={i} className={`h-3 w-${w}`} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center px-4 py-3.5 border-b border-slate-50">
          {[32, 20, 28, 16, 24].map((w, j) => (
            <Shimmer key={j} className={`h-3 w-${w}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function CardGridSkeleton({ cols = 3 }: { cols?: number }) {
  return (
    <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${cols === 3 ? 'lg:grid-cols-3' : ''}`}>
      {Array.from({ length: cols * 2 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
          <Shimmer className="h-3 w-20" />
          <Shimmer className="h-5 w-12" />
          <Shimmer className="h-2.5 w-full" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center gap-3">
          <Shimmer className="w-9 h-9 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-3 w-3/4" />
            <Shimmer className="h-2.5 w-1/2" />
          </div>
          <Shimmer className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Shimmer className="h-6 w-48" />
        <Shimmer className="h-8 w-24 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0,1,2,3].map(i => <MetricCardSkeleton key={i} />)}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}

export default function SkeletonLoader({
  variant,
  type,
  rows = 5,
  cols = 3,
  columns,
  className = '',
}: SkeletonLoaderProps) {
  const chosenVariant =
    variant ||
    (type === 'cards' || type === 'card' ? 'card-grid' : type) ||
    'page';

  const effectiveCols = columns || cols;

  const content = {
    'metric-card': <MetricCardSkeleton />,
    'table': <TableSkeleton rows={rows} />,
    'card-grid': <CardGridSkeleton cols={effectiveCols} />,
    'cards': <CardGridSkeleton cols={effectiveCols} />,
    'card': <CardGridSkeleton cols={effectiveCols} />,
    'list': <ListSkeleton rows={rows} />,
    'page': <PageSkeleton />,
    'inline': <Shimmer className="h-4 w-full" />,
  }[chosenVariant] || <PageSkeleton />;

  return <div className={className}>{content}</div>;
}
