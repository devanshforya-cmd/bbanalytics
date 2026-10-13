'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Compass,
  Store,
  CreditCard,
  Award,
  Sparkles,
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
} from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { User } from '@/lib/types';
import { hasAccess, isSuperAdmin } from '@/lib/permissions';

interface MobileBottomTab {
  label: string;
  href: string;
  permKey: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CANDIDATE_BOTTOM_TABS: MobileBottomTab[] = [
  { label: 'Dashboard', href: '/dashboard', permKey: 'dashboard', icon: LayoutDashboard },
  { label: 'My Day', href: '/offline-sales/beat-plan', permKey: 'beat_plans', icon: Compass },
  { label: 'Stores', href: '/offline-sales/stores', permKey: 'stores', icon: Store },
  { label: 'Orders', href: '/orderflow/extractor', permKey: 'orderflow', icon: Sparkles },
  { label: 'Cheques', href: '/offline-sales/cheques', permKey: 'cheque_tracker', icon: CreditCard },
  { label: 'Tasks', href: '/opscore/tasks', permKey: 'tasks', icon: CheckSquare },
  { label: 'Feedback', href: '/reviews/feedback', permKey: 'reviews', icon: MessageSquareHeart },
  { label: 'Scorecard', href: '/offline-sales/scorecard', permKey: 'staff_scorecards', icon: Award },
  { label: 'Products', href: '/products', permKey: 'products', icon: Package },
  { label: 'Customers', href: '/customers', permKey: 'customers', icon: Users },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User>(() => getSessionUser() || db.getCurrentUser());
  const [showFabDrawer, setShowFabDrawer] = useState(false);

  useEffect(() => {
    const session = getSessionUser();
    if (session) setCurrentUser(session);
  }, [pathname]);

  const visibleBottomTabs = CANDIDATE_BOTTOM_TABS.filter((t) => hasAccess(currentUser, t.permKey)).slice(0, 5);

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
                  Quick Actions
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
            <div className="grid grid-cols-2 gap-2.5">
              {hasAccess(currentUser, 'beat_plans') && (
                <Link
                  href="/offline-sales/beat-plan"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Compass className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Beat Check-in</span>
                </Link>
              )}

              {hasAccess(currentUser, 'stores') && (
                <Link
                  href="/offline-sales/stores"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Store className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Stores &amp; Outlets</span>
                </Link>
              )}

              {hasAccess(currentUser, 'cheque_tracker') && (
                <Link
                  href="/offline-sales/cheques"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <CreditCard className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Cheque Custody</span>
                </Link>
              )}

              {hasAccess(currentUser, 'shelf_photos') && (
                <Link
                  href="/offline-sales/shelf-photos"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-pink-50 text-pink-800 border border-pink-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Camera className="w-4 h-4 text-pink-600 shrink-0" />
                  <span>Shelf Photos</span>
                </Link>
              )}

              {hasAccess(currentUser, 'call_tracker') && (
                <Link
                  href="/offline-sales/calls"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Phone className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Log Store Call</span>
                </Link>
              )}

              {hasAccess(currentUser, 'orderflow') && (
                <>
                  <Link
                    href="/orderflow/extractor"
                    onClick={() => setShowFabDrawer(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                  >
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>WhatsApp Extractor</span>
                  </Link>

                  <Link
                    href="/orderflow/manual-entry"
                    onClick={() => setShowFabDrawer(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                  >
                    <ClipboardPen className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Manual Order</span>
                  </Link>
                </>
              )}

              {hasAccess(currentUser, 'reviews') && (
                <Link
                  href="/reviews/feedback"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <MessageSquareHeart className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Log Feedback</span>
                </Link>
              )}

              {hasAccess(currentUser, 'tasks') && (
                <Link
                  href="/opscore/tasks"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-teal-50 text-teal-800 border border-teal-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <CheckSquare className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>My Tasks</span>
                </Link>
              )}

              {hasAccess(currentUser, 'products') && (
                <Link
                  href="/products"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 text-slate-800 border border-slate-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform col-span-2"
                >
                  <Package className="w-4 h-4 text-slate-700 shrink-0" />
                  <span>Products &amp; Pricing</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Primary Mobile Bottom Navigation Bar (Dynamic from user permissions) */}
      <nav
        className="fixed bottom-0 left-0 z-40 h-16 w-full items-center border-t border-slate-200 bg-white/95 backdrop-blur-md px-1 shadow-lg lg:hidden grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleBottomTabs.length)}, minmax(0, 1fr))` }}
      >
        {visibleBottomTabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                isActive ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
