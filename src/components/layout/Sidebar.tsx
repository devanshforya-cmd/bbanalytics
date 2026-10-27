'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { User } from '@/lib/types';
import { hasAccess, isSuperAdmin } from '@/lib/permissions';
import {
  LayoutDashboard,
  Compass,
  Store,
  Truck,
  Camera,
  Phone,
  CreditCard,
  FileText,
  Award,
  Sparkles,
  ClipboardPen,
  ClipboardCheck,
  TruckIcon,
  MessageSquareHeart,
  RotateCcw,
  Tags,
  Users,
  PieChart,
  CheckSquare,
  History,
  FileSpreadsheet,
  Navigation,
  Calendar,
  Settings,
  Package,
  Megaphone,
  Gift,
} from 'lucide-react';

interface MenuItem {
  label: string;
  href: string;
  permKey: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: 'OVERVIEW',
    items: [
      { label: 'Dashboard', href: '/dashboard', permKey: 'dashboard', icon: LayoutDashboard },
      { label: 'Products & Combos', href: '/products', permKey: 'products', icon: Package, badge: 'DTP/RPP' },
    ],
  },
  {
    title: 'OFFLINE SALES (GT/MT)',
    items: [
      { label: 'Beat Plans & Routes', href: '/offline-sales/beat-plan', permKey: 'beat_plans', icon: Compass },
      { label: 'Stores & Branches', href: '/offline-sales/stores', permKey: 'stores', icon: Store },
      { label: 'Distributor Dispatches', href: '/offline-sales/dispatch', permKey: 'dispatches', icon: Truck },
      { label: 'Live GPS Tracking', href: '/offline-sales/live-tracking', permKey: 'gps_tracking', icon: Navigation, badge: 'Live' },
      { label: 'Shelf Photos', href: '/offline-sales/shelf-photos', permKey: 'shelf_photos', icon: Camera },
      { label: 'Call Tracker', href: '/offline-sales/calls', permKey: 'call_tracker', icon: Phone },
      { label: 'Cheque Tracker', href: '/offline-sales/cheques', permKey: 'cheque_tracker', icon: CreditCard },
      { label: 'Document Handover', href: '/offline-sales/documents', permKey: 'document_handover', icon: FileText },
      { label: 'Staff Scorecards', href: '/offline-sales/scorecard', permKey: 'staff_scorecards', icon: Award },
    ],
  },
  {
    title: 'ORDERFLOW',
    items: [
      { label: 'WhatsApp Extractor', href: '/orderflow/extractor', permKey: 'orderflow', icon: Sparkles, badge: 'Rule-Engine' },
      { label: 'Manual Order Entry', href: '/orderflow/manual-entry', permKey: 'orderflow', icon: ClipboardPen },
      { label: 'Daily Orders', href: '/orderflow/daily-orders', permKey: 'orderflow', icon: ClipboardCheck, badge: 'Live' },
      { label: 'Delivery Failures', href: '/orderflow/delivery-failures', permKey: 'orderflow', icon: TruckIcon, badge: 'Separated' },
    ],
  },
  {
    title: 'REVIEWS & RETURNS',
    items: [
      { label: 'Feedback & Complaints', href: '/reviews/feedback', permKey: 'reviews', icon: MessageSquareHeart },
      { label: 'Separated Returns', href: '/reviews/returns', permKey: 'reviews', icon: RotateCcw },
      { label: 'Dynamic Categories', href: '/reviews/categories', permKey: 'reviews', icon: Tags },
    ],
  },
  {
    title: 'CUSTOMER INTELLIGENCE',
    items: [
      { label: 'Customer 360 Directory', href: '/customers', permKey: 'customers', icon: Users },
      { label: 'Cohort Insights', href: '/customers/insights', permKey: 'customers', icon: PieChart },
    ],
  },
  {
    title: 'MARKETING',
    items: [
      { label: 'Influencer Directory', href: '/marketing/influencers', permKey: 'marketing', icon: Megaphone },
      { label: 'Marketing Sends', href: '/marketing/sends', permKey: 'marketing', icon: Gift },
    ],
  },
  {
    title: 'OPSCORE',
    items: [
      { label: 'Calendar To-Do', href: '/opscore/calendar-tasks', permKey: 'tasks', icon: Calendar, badge: 'BS/AD' },
      { label: 'Task Management', href: '/opscore/tasks', permKey: 'tasks', icon: CheckSquare },
      { label: 'Activity Trail', href: '/opscore/activity', permKey: 'activity', icon: History },
      { label: 'Google Sheets Export', href: '/opscore/export', permKey: 'export', icon: FileSpreadsheet },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { label: 'System Settings', href: '/settings', permKey: 'settings', icon: Settings, badge: 'Staff/Rules' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User>(() => getSessionUser() || db.getCurrentUser());

  useEffect(() => {
    const refresh = () => { const session = getSessionUser(); if (session) setCurrentUser(session); };
    refresh();
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 bg-white text-slate-700">
      {/* Brand Header */}
      <div className="flex h-16 items-center px-5 border-b border-slate-200/80 bg-slate-50/40">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-500 shadow-xs shadow-blue-500/20 text-white font-black text-sm tracking-tight">
            BB
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold tracking-tight text-sm text-slate-900">Brand Bucket</span>
              <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[9px] font-black tracking-wide text-blue-700">PRO</span>
            </div>
            <p className="text-[10px] font-medium text-slate-500 tracking-wide">COMMAND CENTER</p>
          </div>
        </div>
      </div>

      {/* Nav List Filtered Strictly by Permissions */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {menuSections.map((section) => {
          const visibleItems = section.items.filter((item) => hasAccess(currentUser, item.permKey));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <div className="px-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                {section.title}
              </div>
              <div className="mt-1.5 space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center justify-between rounded-r-xl px-3 py-2 text-xs transition-all duration-150 ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-50 to-indigo-50/40 text-blue-700 font-bold border-l-[3px] border-blue-600 shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-[3px] border-transparent font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-105 ${
                            isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                          }`}
                        />
                        <span className={isActive ? 'text-blue-700 font-bold' : 'text-slate-600 group-hover:text-slate-900'}>
                          {item.label}
                        </span>
                      </div>
                      {item.badge && (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${
                            isActive
                              ? 'bg-blue-100/80 text-blue-700 border border-blue-200/60'
                              : 'bg-slate-100 text-slate-500 border border-slate-200/50'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer User Info */}
      <div className="border-t border-slate-200/80 p-3.5 bg-slate-50/30">
        <div className="flex items-center gap-3 p-2 rounded-xl border border-slate-200/60 bg-white shadow-2xs">
          <div className="relative">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 font-bold text-white text-xs shadow-2xs">
              {currentUser.fullName ? currentUser.fullName.charAt(0) : 'U'}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>
          <div className="overflow-hidden flex-1 min-w-0">
            <div className="truncate text-xs font-bold text-slate-900">{currentUser.fullName}</div>
            <div className="truncate text-[10px] font-medium text-slate-500">
              {isSuperAdmin(currentUser) ? 'Super Admin' : currentUser.role || 'Authorized User'}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
