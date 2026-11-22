'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Compass,
  Store,
  CreditCard,
  Award,
  ScanText,
  Lightbulb,
  Navigation,
  Phone,
  X,
  Package,
  LayoutDashboard,
  ClipboardPen,
  TruckIcon,
  MessageSquareHeart,
  Users,
  Camera,
  CheckSquare,
  FileSpreadsheet,
  RotateCcw,
  ListChecks,
} from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { User } from '@/lib/types';
import { hasAccess, isSuperAdmin } from '@/lib/permissions';
import type { PageKey } from '@/lib/access-catalog';

interface MobileBottomTab {
  label: string;
  href: string;
  permKey: PageKey;
  icon: React.ComponentType<{ className?: string }>;
}

const CANDIDATE_BOTTOM_TABS: MobileBottomTab[] = [
  { label: 'Dashboard', href: '/dashboard', permKey: 'p.dashboard', icon: LayoutDashboard },
  { label: 'My day', href: '/offline-sales/beat-plan', permKey: 'p.beat_plan', icon: Compass },
  { label: 'Stores', href: '/offline-sales/stores', permKey: 'p.stores', icon: Store },
  { label: 'Orders', href: '/orderflow/extractor', permKey: 'p.orders_extractor', icon: ScanText },
  { label: 'Orders', href: '/orderflow/orders', permKey: 'p.orders_all', icon: ListChecks },
  { label: 'Cheques', href: '/offline-sales/cheques', permKey: 'p.cheques', icon: CreditCard },
  { label: 'Tasks', href: '/opscore/tasks', permKey: 'p.tasks', icon: CheckSquare },
  { label: 'Feedback', href: '/reviews/feedback', permKey: 'p.feedback', icon: MessageSquareHeart },
  { label: 'Scorecard', href: '/offline-sales/scorecard', permKey: 'p.scorecards', icon: Award },
  { label: 'Products', href: '/products', permKey: 'p.products', icon: Package },
  { label: 'Customers', href: '/customers', permKey: 'p.customers', icon: Users },
];

export default function MobileNav({ pending = false }: { pending?: boolean }) {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User>(() => getSessionUser() || db.getCurrentUser());
  const [showFabDrawer, setShowFabDrawer] = useState(false);

  useEffect(() => {
    const refresh = () => { const session = getSessionUser(); if (session) setCurrentUser(session); };
    refresh();
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, [pathname]);

  // One tab per destination label: someone with the extractor gets it, someone with only All orders gets that.
  const visibleBottomTabs = pending ? [] : CANDIDATE_BOTTOM_TABS.filter((t) => hasAccess(currentUser, t.permKey))
    .filter((tab, index, list) => list.findIndex((other) => other.label === tab.label) === index).slice(0, 5);

  return (
    <>
      {/* Floating Action Drawer for Mobile Quick Actions */}
      {showFabDrawer && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end lg:hidden animate-fade-in"
          onClick={() => setShowFabDrawer(false)}
        >
          <div
            className="bg-white rounded-t-3xl p-5 space-y-4 border-t border-slate-200 shadow-2xl max-w-lg mx-auto w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab Bar */}
            <div className="w-12 h-1.5 rounded-full bg-slate-300 mx-auto -mt-1 mb-2" />

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-bold text-slate-900 text-sm">
                  Quick actions
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {currentUser.fullName} ({isSuperAdmin(currentUser) ? 'Super Admin' : 'Authorized User'})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFabDrawer(false)}
                className="p-2 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Close action menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Permission-Filtered Speed Actions */}
            <div className="bb-stagger grid grid-cols-2 gap-2.5">
              {hasAccess(currentUser, 'p.beat_plan') && (
                <Link
                  href="/offline-sales/beat-plan"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Compass className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Beat check-in</span>
                </Link>
              )}

              {hasAccess(currentUser, 'p.stores') && (
                <Link
                  href="/offline-sales/stores"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Store className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Stores &amp; outlets</span>
                </Link>
              )}

              {hasAccess(currentUser, 'p.cheques') && (
                <Link
                  href="/offline-sales/cheques"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <CreditCard className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Cheque custody</span>
                </Link>
              )}

              {hasAccess(currentUser, 'p.shelf_photos') && (
                <Link
                  href="/offline-sales/shelf-photos"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-pink-50 text-pink-800 border border-pink-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Camera className="w-4 h-4 text-pink-600 shrink-0" />
                  <span>Shelf photos</span>
                </Link>
              )}

              {hasAccess(currentUser, 'p.calls') && (
                <Link
                  href="/offline-sales/calls"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Phone className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Log store call</span>
                </Link>
              )}

              {hasAccess(currentUser, 'p.orders_extractor') && (
                  <Link
                    href="/orderflow/extractor"
                    onClick={() => setShowFabDrawer(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                  >
                    <ScanText className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>WhatsApp extractor</span>
                  </Link>
              )}

              {hasAccess(currentUser, 'p.orders_manual') && (
                  <Link
                    href="/orderflow/manual-entry"
                    onClick={() => setShowFabDrawer(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                  >
                    <ClipboardPen className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Manual order</span>
                  </Link>
              )}

              {hasAccess(currentUser, 'p.feedback') && (
                <Link
                  href="/reviews/feedback"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <MessageSquareHeart className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Log feedback</span>
                </Link>
              )}

              {hasAccess(currentUser, 'p.tasks') && (
                <Link
                  href="/opscore/tasks"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-teal-50 text-teal-800 border border-teal-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <CheckSquare className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>My tasks</span>
                </Link>
              )}

              {hasAccess(currentUser, 'products') && (
                <Link
                  href="/products"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 text-slate-800 border border-slate-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform col-span-2"
                >
                  <Package className="w-4 h-4 text-slate-700 shrink-0" />
                  <span>Products &amp; pricing</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Primary Mobile Bottom Navigation Bar (Dynamic from user permissions) */}
      {(() => {
        const activeIndex = visibleBottomTabs.findIndex((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`));
        const count = Math.max(1, visibleBottomTabs.length);
        return (
          <nav
            aria-label="Main"
            className="mobile-bottom-nav fixed bottom-0 left-0 z-40 grid w-full items-center bg-white/90 px-1 backdrop-blur-md lg:hidden"
            style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
          >
            <span aria-hidden="true" className="bb-brand-line pointer-events-none absolute inset-x-0 top-0 h-[2px]" />
            {/* The pill slides to the open tab */}
            {activeIndex >= 0 && (
              <span aria-hidden="true" className="bb-tab-pill pointer-events-none absolute left-1 top-[6px] h-[52px]"
                style={{ width: `calc((100% - 0.5rem) / ${count})`, transform: `translateX(${activeIndex * 100}%)` }}>
                <span className="mx-auto block h-full w-[calc(100%-8px)] rounded-2xl bg-blue-50 shadow-[inset_0_0_0_1px_rgba(12,121,181,0.12)]" />
              </span>
            )}
            {visibleBottomTabs.map((tab) => {
              const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`bb-tab relative flex min-h-[52px] flex-col items-center justify-center px-1 text-[11px] transition-colors duration-200 ${
                    isActive ? 'font-medium text-blue-700' : 'text-slate-500'
                  }`}
                >
                  <Icon className="bb-tab-icon h-5 w-5" />
                  <span className="mt-1 truncate leading-tight">{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        );
      })()}
    </>
  );
}
