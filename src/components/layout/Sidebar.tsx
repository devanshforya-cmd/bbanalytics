'use client';

import BrandLogo from './BrandLogo';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { User } from '@/lib/types';
import { hasAccess, isSuperAdmin } from '@/lib/permissions';
import {
  ListChecks,
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
  BadgePercent,
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
  /** Also shown to people with this permission. */
  alsoPermKey?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', permKey: 'dashboard', icon: LayoutDashboard },
      { label: 'Products & Combos', href: '/products', permKey: 'products', icon: Package },
    ],
  },
  {
    title: 'Offline sales',
    items: [
      { label: 'Beat Plans & Routes', href: '/offline-sales/beat-plan', permKey: 'beat_plans', icon: Compass },
      { label: 'Stores & Branches', href: '/offline-sales/stores', permKey: 'stores', icon: Store },
      { label: 'Distributor Dispatches', href: '/offline-sales/dispatch', permKey: 'dispatches', icon: Truck },
      { label: 'Live GPS Tracking', href: '/offline-sales/live-tracking', permKey: 'gps_tracking', icon: Navigation },
      { label: 'Shelf Photos', href: '/offline-sales/shelf-photos', permKey: 'shelf_photos', icon: Camera },
      { label: 'Call Tracker', href: '/offline-sales/calls', permKey: 'call_tracker', icon: Phone },
      { label: 'Cheque Tracker', href: '/offline-sales/cheques', permKey: 'cheque_tracker', icon: CreditCard },
      { label: 'Document Handover', href: '/offline-sales/documents', permKey: 'document_handover', icon: FileText },
      { label: 'Staff Scorecards', href: '/offline-sales/scorecard', permKey: 'staff_scorecards', icon: Award },
    ],
  },
  {
    title: 'Online orders',
    items: [
      { label: 'WhatsApp Extractor', href: '/orderflow/extractor', permKey: 'orderflow', icon: Sparkles },
      { label: 'Manual Order Entry', href: '/orderflow/manual-entry', permKey: 'orderflow', icon: ClipboardPen },
      { label: 'All Orders', href: '/orderflow/orders', permKey: 'orderflow', alsoPermKey: 'order_desk', icon: ListChecks },
      { label: 'Daily Orders', href: '/orderflow/daily-orders', permKey: 'orderflow', icon: ClipboardCheck },
      { label: 'Monthly Sales Sheet', href: '/orderflow/monthly-sales', permKey: 'orderflow', icon: FileSpreadsheet },
      { label: 'Sales & Offers', href: '/orderflow/sales', permKey: 'orderflow', alsoPermKey: 'marketing', icon: BadgePercent },
      { label: 'Delivery Failures', href: '/orderflow/delivery-failures', permKey: 'orderflow', icon: TruckIcon },
    ],
  },
  {
    title: 'Reviews & returns',
    items: [
      { label: 'Feedback & Complaints', href: '/reviews/feedback', permKey: 'reviews', icon: MessageSquareHeart },
      { label: 'Returns', href: '/reviews/returns', permKey: 'reviews', icon: RotateCcw },
      { label: 'Issue Categories', href: '/reviews/categories', permKey: 'reviews', icon: Tags },
    ],
  },
  {
    title: 'Customers',
    items: [
      { label: 'Customer 360 Directory', href: '/customers', permKey: 'customers', icon: Users },
      { label: 'Cohort Insights', href: '/customers/insights', permKey: 'customers', icon: PieChart },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { label: 'Influencer Directory', href: '/marketing/influencers', permKey: 'marketing', icon: Megaphone },
      { label: 'Marketing Sends', href: '/marketing/sends', permKey: 'marketing', icon: Gift },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Calendar To-Do', href: '/opscore/calendar-tasks', permKey: 'tasks', icon: Calendar, badge: 'BS/AD' },
      { label: 'Task Management', href: '/opscore/tasks', permKey: 'tasks', icon: CheckSquare },
      { label: 'Activity Trail', href: '/opscore/activity', permKey: 'activity', icon: History },
      { label: 'Google Sheets Export', href: '/opscore/export', permKey: 'export', icon: FileSpreadsheet },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'System Settings', href: '/settings', permKey: 'settings', icon: Settings },
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
    <aside className="hidden w-64 flex-col border-r border-black/[0.06] bg-white/80 text-slate-700 backdrop-blur-xl lg:flex">
      {/* Brand Header */}
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" aria-label="Brand Bucket home" className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500">
          <BrandLogo variant="full" priority className="h-8" />
        </Link>
      </div>

      {/* Nav List Filtered Strictly by Permissions */}
      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-1">
        {menuSections.map((section) => {
          const visibleItems = section.items.filter((item) => (hasAccess(currentUser, item.permKey) || (!!item.alsoPermKey && hasAccess(currentUser, item.alsoPermKey))));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <div className="px-2.5 text-[11px] font-semibold text-slate-500">
                {section.title}
              </div>
              <div className="mt-1 space-y-px">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group flex items-center justify-between rounded-lg px-2.5 py-[7px] text-[13px] transition-colors duration-150 ${
                        isActive
                          ? 'bg-blue-600/10 font-semibold text-blue-700'
                          : 'font-medium text-slate-700 hover:bg-black/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`h-[18px] w-[18px] shrink-0 ${
                            isActive ? 'text-blue-600' : 'text-slate-500'
                          }`}
                        />
                        <span>
                          {item.label}
                        </span>
                      </div>
                      {item.badge && (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold  ${
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
      </nav>

      {/* Footer User Info */}
      <div className="border-t border-black/[0.06] p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <div className="relative">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
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
