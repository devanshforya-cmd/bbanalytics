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
    const session = getSessionUser();
    if (session) setCurrentUser(session);
  }, []);

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 bg-white text-slate-700">
      {/* Brand Header */}
      <div className="flex h-16 items-center px-6 border-b border-slate-200">
        <div className="flex items-center gap-2 text-slate-900">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse"></span>
          <span className="font-bold tracking-tight text-base">Brand Bucket</span>
        </div>
      </div>

      {/* Nav List Filtered Strictly by Permissions */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {menuSections.map((section) => {
          const visibleItems = section.items.filter((item) => hasAccess(currentUser, item.permKey));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {section.title}
              </div>
              <div className="mt-2 space-y-1">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center justify-between rounded-r-md px-3 py-2 text-xs font-medium transition ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-semibold border-l-2 border-blue-600'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-l-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                          }`}
                        />
                        <span className={isActive ? 'text-blue-700 font-semibold' : 'text-slate-600 group-hover:text-slate-900'}>
                          {item.label}
                        </span>
                      </div>
                      {item.badge && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            isActive
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-500'
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
      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 font-bold text-white text-xs">
            {currentUser.fullName ? currentUser.fullName.charAt(0) : 'U'}
          </div>
          <div className="overflow-hidden">
            <div className="truncate text-xs font-semibold text-slate-900">{currentUser.fullName}</div>
            <div className="truncate text-[10px] font-medium text-slate-500">
              {isSuperAdmin(currentUser) ? 'Super Admin' : 'Authorized User'}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
