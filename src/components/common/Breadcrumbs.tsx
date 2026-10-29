'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { getRedirectPathForUser, getSessionUser } from '@/lib/auth';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center text-xs text-slate-500 ${className}`}>
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link
            href={getRedirectPathForUser(getSessionUser())}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <Home className="h-3.5 w-3.5" />
            <span className="sr-only">Home</span>
          </Link>
        </li>

        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={index} className="flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="font-medium text-slate-500 hover:text-slate-900 transition-colors truncate max-w-[160px] sm:max-w-[220px]"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="font-bold text-slate-900 truncate max-w-[180px] sm:max-w-[260px]"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
