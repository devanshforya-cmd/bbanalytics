'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { User } from '@/lib/types';
import { hasFeatureAccess, isSuperAdmin } from '@/lib/permissions';
import {
  LayoutDashboard,
  Compass,
  Store,
  Truck,
  Camera,
  PhoneCall,
  CreditCard,
  FileCheck2,
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

export default function Sidebar() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User>(() => getSessionUser() || db.getCurrentUser());

  useEffect(() => {
    const session = getSessionUser();
    if (session) setCurrentUser(session);
  }, []);

  const role = currentUser.role;

  interface NavItem {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }

  interface NavSection {
    title: string;
    items: NavItem[];
  }

  const sections: NavSection[] = [];

  // 1. Overview Section
  const overviewItems: NavItem[] = [];
  if (hasFeatureAccess(currentUser, 'dashboard')) {
    overviewItems.push({ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard });
  }
  overviewItems.push({ name: 'Products & Combos', href: '/products', icon: Package, badge: 'DTP/RPP' });
  sections.push({
    title: 'Overview',
    items: overviewItems,
  });

  // 2. Offline Sales (Field Ops)
  const fieldItems: NavItem[] = [];
  if (hasFeatureAccess(currentUser, 'beat_plans')) {
    fieldItems.push({
      name: role === 'SALES_OFFICER' ? 'My Day (Beat Plan)' : 'Beat Plans & Routes',
      href: '/offline-sales/beat-plan',
      icon: Compass,
      badge: role === 'SALES_OFFICER' ? 'Active' : undefined,
    });
  }
  if (hasFeatureAccess(currentUser, 'stores')) {
    fieldItems.push({
      name: role === 'SALES_OFFICER' ? 'My Stores' : 'Stores & Branches',
      href: '/offline-sales/stores',
      icon: Store,
    });
  }
  if (hasFeatureAccess(currentUser, 'dispatches')) {
    fieldItems.push({ name: 'Distributor Dispatches', href: '/offline-sales/dispatch', icon: Truck });
  }
  if (hasFeatureAccess(currentUser, 'gps_tracking')) {
    fieldItems.push({ name: 'Live GPS Tracking', href: '/offline-sales/live-tracking', icon: Navigation, badge: 'Live' });
  }
  if (hasFeatureAccess(currentUser, 'shelf_photos')) {
    fieldItems.push({ name: 'Shelf Photos', href: '/offline-sales/shelf-photos', icon: Camera });
  }
  if (hasFeatureAccess(currentUser, 'call_tracker')) {
    fieldItems.push({ name: 'Call Tracker', href: '/offline-sales/calls', icon: PhoneCall });
  }
  if (hasFeatureAccess(currentUser, 'cheque_tracker')) {
    fieldItems.push({
      name: role === 'SALES_OFFICER' ? 'My Cheques' : 'Cheque Tracker',
      href: '/offline-sales/cheques',
      icon: CreditCard,
    });
  }
  if (hasFeatureAccess(currentUser, 'document_handover')) {
    fieldItems.push({ name: 'Document Handover', href: '/offline-sales/documents', icon: FileCheck2 });
  }
  if (hasFeatureAccess(currentUser, 'staff_scorecards')) {
    fieldItems.push({ name: 'Staff Scorecards', href: '/offline-sales/scorecard', icon: Award });
  }
  if (fieldItems.length > 0) {
    sections.push({
      title: role === 'SALES_OFFICER' ? 'Field Operations' : 'Offline Sales (GT/MT)',
      items: fieldItems,
    });
  }

  // 3. OrderFlow (Online Orders)
  if (hasFeatureAccess(currentUser, 'orderflow')) {
    sections.push({
      title: 'OrderFlow',
      items: [
        { name: 'WhatsApp Extractor', href: '/orderflow/extractor', icon: Sparkles, badge: 'Rule-Engine' },
        { name: 'Manual Order Entry', href: '/orderflow/manual-entry', icon: ClipboardPen },
        { name: 'Daily Orders', href: '/orderflow/daily-orders', icon: ClipboardCheck, badge: 'Live' },
        { name: 'Delivery Failures', href: '/orderflow/delivery-failures', icon: TruckIcon, badge: 'Separated' },
      ],
    });
  }

  // 4. Customer Reviews & Operational Health
  if (hasFeatureAccess(currentUser, 'reviews')) {
    const reviewItems: NavItem[] = [
      { name: 'Feedback & Complaints', href: '/reviews/feedback', icon: MessageSquareHeart },
      { name: 'Separated Returns', href: '/reviews/returns', icon: RotateCcw },
    ];
    if (isSuperAdmin(currentUser) || role === 'ADMIN') {
      reviewItems.push({ name: 'Dynamic Categories', href: '/reviews/categories', icon: Tags });
    }
    sections.push({
      title: 'Reviews & Returns',
      items: reviewItems,
    });
  }

  // 5. Customer 360 & Intelligence
  if (hasFeatureAccess(currentUser, 'customers')) {
    sections.push({
      title: 'Customer Intelligence',
      items: [
        { name: 'Customer 360 Directory', href: '/customers', icon: Users },
        { name: 'Cohort Insights', href: '/customers/insights', icon: PieChart },
      ],
    });
  }

  // 6. Marketing & Influencers
  if (hasFeatureAccess(currentUser, 'marketing')) {
    sections.push({
      title: 'Marketing',
      items: [
        { name: 'Influencer Directory', href: '/marketing/influencers', icon: Megaphone },
        { name: 'Marketing Sends', href: '/marketing/sends', icon: Gift },
      ],
    });
  }

  // 7. OpsCore (Shared Layer)
  if (hasFeatureAccess(currentUser, 'beat_plans') || isSuperAdmin(currentUser) || role === 'ADMIN') {
    const opsItems: NavItem[] = [
      { name: 'Calendar To-Do', href: '/opscore/calendar-tasks', icon: Calendar, badge: 'BS/AD' },
      { name: role === 'SALES_OFFICER' ? 'My Tasks' : 'Task Management', href: '/opscore/tasks', icon: CheckSquare },
    ];
    if (isSuperAdmin(currentUser) || role === 'ADMIN') {
      opsItems.push(
        { name: 'Activity Trail', href: '/opscore/activity', icon: History },
        { name: 'Google Sheets Export', href: '/opscore/export', icon: FileSpreadsheet }
      );
    }
    sections.push({
      title: 'OpsCore',
      items: opsItems,
    });
  }

  // 8. Administration & Settings
  if (hasFeatureAccess(currentUser, 'settings')) {
    sections.push({
      title: 'Administration',
      items: [
        { name: 'System Settings', href: '/settings', icon: Settings, badge: 'Staff/Rules' },
      ],
    });
  }

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 bg-white text-slate-700">
      {/* Brand Header */}
      <div className="flex h-16 items-center px-6 border-b border-slate-200">
        <div className="flex items-center gap-2 text-slate-900">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse"></span>
          <span className="font-bold tracking-tight text-base">Brand Bucket</span>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {section.title}
            </div>
            <div className="mt-2 space-y-1">
              {section.items.map((item) => {
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
                        {item.name}
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
        ))}
      </div>

      {/* Footer User Info */}
      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 font-bold text-white text-xs">
            {currentUser.fullName.charAt(0)}
          </div>
          <div className="overflow-hidden">
            <div className="truncate text-xs font-semibold text-slate-900">{currentUser.fullName}</div>
            <div className="truncate text-[10px] font-medium text-slate-500">
              {currentUser.role.replace('_', ' ')}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
