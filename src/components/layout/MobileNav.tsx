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
  Plus,
  Calendar,
  Navigation,
  Settings,
  PhoneCall,
  CheckCircle,
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

export default function MobileNav() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User>(() => getSessionUser() || db.getCurrentUser());
  const [showFabDrawer, setShowFabDrawer] = useState(false);

  useEffect(() => {
    const session = getSessionUser();
    if (session) setCurrentUser(session);
  }, [pathname]);

  const role = currentUser.role;
  const isOfficer = role === 'SALES_OFFICER';
  const isDataEntry = role === 'DATA_ENTRY';

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
                  {isOfficer ? 'Field Sales Quick Actions' : 'Command Center Speed Dial'}
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {currentUser.fullName} ({role.replace('_', ' ')})
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

            {/* Role-Specific Speed Actions */}
            {isOfficer ? (
              <div className="grid grid-cols-2 gap-2.5">
                <Link
                  href="/offline-sales/beat-plan"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Compass className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>GPS Check-in</span>
                </Link>

                <Link
                  href="/offline-sales/beat-plan"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Secondary Order</span>
                </Link>

                <Link
                  href="/offline-sales/cheques"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <CreditCard className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Collect Cheque</span>
                </Link>

                <Link
                  href="/offline-sales/calls"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <PhoneCall className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Log Store Call</span>
                </Link>

                <Link
                  href="/offline-sales/shelf-photos"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-pink-50 text-pink-800 border border-pink-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Camera className="w-4 h-4 text-pink-600 shrink-0" />
                  <span>Shelf Photos</span>
                </Link>

                <Link
                  href="/offline-sales/stores"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Store className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Quick Add Store</span>
                </Link>

                <Link
                  href="/products"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 text-slate-800 border border-slate-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform col-span-2"
                >
                  <Package className="w-4 h-4 text-slate-700 shrink-0" />
                  <span>SKUs, Combos &amp; Wholesale Pricing</span>
                </Link>
              </div>
            ) : isDataEntry ? (
              <div className="grid grid-cols-2 gap-2.5">
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
                  <span>Manual Entry</span>
                </Link>

                <Link
                  href="/orderflow/delivery-failures"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <TruckIcon className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Log Failure</span>
                </Link>

                <Link
                  href="/reviews/feedback"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <MessageSquareHeart className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Log Review</span>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <Link
                  href="/offline-sales/live-tracking"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Navigation className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Live GPS Tracking</span>
                </Link>

                <Link
                  href="/offline-sales/cheques"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <CreditCard className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Cheque Custody</span>
                </Link>

                <Link
                  href="/opscore/tasks"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Dispatch Task</span>
                </Link>

                <Link
                  href="/customers"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Customer 360</span>
                </Link>

                <Link
                  href="/products"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <Package className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Products &amp; Combos</span>
                </Link>

                <Link
                  href="/opscore/export"
                  onClick={() => setShowFabDrawer(false)}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 text-slate-800 border border-slate-200 min-h-[48px] font-semibold text-xs active:scale-98 transition-transform"
                >
                  <FileSpreadsheet className="w-4 h-4 text-slate-600 shrink-0" />
                  <span>Sheets Sync</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Primary Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 z-40 grid grid-cols-5 h-16 w-full items-center border-t border-slate-200 bg-white/95 backdrop-blur-md px-1 shadow-lg lg:hidden">
        {isOfficer ? (
          <>
            {/* 1. My Day */}
            <Link
              href="/offline-sales/beat-plan"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname === '/offline-sales/beat-plan' ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <Compass className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">My Day</span>
            </Link>

            {/* 2. My Stores */}
            <Link
              href="/offline-sales/stores"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/stores') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <Store className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">My Stores</span>
            </Link>

            {/* 3. My Cheques */}
            <Link
              href="/offline-sales/cheques"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/cheques') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <CreditCard className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">My Cheques</span>
            </Link>

            {/* 4. Scorecard */}
            <Link
              href="/offline-sales/scorecard"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/scorecard') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <Award className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Scorecard</span>
            </Link>

            {/* 5. Tasks */}
            <Link
              href="/opscore/tasks"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/tasks') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <CheckSquare className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Tasks</span>
            </Link>
          </>
        ) : isDataEntry ? (
          <>
            {/* 1. Extractor */}
            <Link
              href="/orderflow/extractor"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/extractor') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <Sparkles className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Extractor</span>
            </Link>

            {/* 2. Manual Entry */}
            <Link
              href="/orderflow/manual-entry"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/manual-entry') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <ClipboardPen className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Manual Entry</span>
            </Link>

            {/* 3. Feedback */}
            <Link
              href="/reviews/feedback"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/feedback') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <MessageSquareHeart className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Feedback</span>
            </Link>

            {/* 4. Returns */}
            <Link
              href="/reviews/returns"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/returns') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <RotateCcw className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Returns</span>
            </Link>

            {/* 5. Failures */}
            <Link
              href="/orderflow/delivery-failures"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/delivery-failures') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <TruckIcon className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Failures</span>
            </Link>
          </>
        ) : (
          <>
            {/* 1. Dashboard */}
            <Link
              href="/dashboard"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname === '/dashboard' || pathname === '/' ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <LayoutDashboard className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Dashboard</span>
            </Link>

            {/* 2. Stores */}
            <Link
              href="/offline-sales/stores"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/stores') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <Store className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Stores</span>
            </Link>

            {/* 3. Cheques */}
            <Link
              href="/offline-sales/cheques"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/cheques') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <CreditCard className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Cheques</span>
            </Link>

            {/* 4. Feedback */}
            <Link
              href="/reviews/feedback"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/feedback') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <MessageSquareHeart className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Feedback</span>
            </Link>

            {/* 5. Tasks */}
            <Link
              href="/opscore/tasks"
              className={`flex flex-col items-center justify-center min-h-[44px] px-1 text-[10px] font-medium transition ${
                pathname.includes('/tasks') ? 'text-blue-600 font-bold' : 'text-slate-500'
              }`}
            >
              <CheckSquare className="h-5 w-5" />
              <span className="leading-tight mt-1 truncate">Tasks</span>
            </Link>
          </>
        )}
      </nav>
    </>
  );
}
