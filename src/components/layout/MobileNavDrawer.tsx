'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  X,
  Search,
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
  Megaphone,
  Gift,
  Calendar,
  CheckSquare,
  History,
  FileSpreadsheet,
  Settings,
  Package,
  Navigation,
} from 'lucide-react';
import { User, BrandCode } from '@/lib/types';
import { hasAccess, isSuperAdmin } from '@/lib/permissions';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  currentBrand: BrandCode;
  onBrandChange: (brand: BrandCode) => void;
  onOpenProfile: () => void;
}

interface MenuItem {
  name: string;
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
    title: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard', permKey: 'dashboard', icon: LayoutDashboard },
      { name: 'Products & Combos', href: '/products', permKey: 'products', icon: Package, badge: 'DTP/RPP' },
    ],
  },
  {
    title: 'Offline Sales (GT/MT)',
    items: [
      { name: 'Beat Plans & Routes', href: '/offline-sales/beat-plan', permKey: 'beat_plans', icon: Compass },
      { name: 'Stores & Branches', href: '/offline-sales/stores', permKey: 'stores', icon: Store },
      { name: 'Distributor Dispatches', href: '/offline-sales/dispatch', permKey: 'dispatches', icon: Truck },
      { name: 'Live GPS Tracking', href: '/offline-sales/live-tracking', permKey: 'gps_tracking', icon: Navigation, badge: 'Live' },
      { name: 'Shelf Photos', href: '/offline-sales/shelf-photos', permKey: 'shelf_photos', icon: Camera },
      { name: 'Call Tracker', href: '/offline-sales/calls', permKey: 'call_tracker', icon: Phone },
      { name: 'Cheque Tracker', href: '/offline-sales/cheques', permKey: 'cheque_tracker', icon: CreditCard },
      { name: 'Document Handover', href: '/offline-sales/documents', permKey: 'document_handover', icon: FileText },
      { name: 'Staff Scorecards', href: '/offline-sales/scorecard', permKey: 'staff_scorecards', icon: Award },
    ],
  },
  {
    title: 'OrderFlow',
    items: [
      { name: 'WhatsApp Extractor', href: '/orderflow/extractor', permKey: 'orderflow', icon: Sparkles, badge: 'Rule-Engine' },
      { name: 'Manual Order Entry', href: '/orderflow/manual-entry', permKey: 'orderflow', icon: ClipboardPen },
      { name: 'Daily Orders', href: '/orderflow/daily-orders', permKey: 'orderflow', icon: ClipboardCheck, badge: 'Live' },
      { name: 'Delivery Failures', href: '/orderflow/delivery-failures', permKey: 'orderflow', icon: TruckIcon, badge: 'Separated' },
    ],
  },
  {
    title: 'Reviews & Returns',
    items: [
      { name: 'Feedback & Complaints', href: '/reviews/feedback', permKey: 'reviews', icon: MessageSquareHeart },
      { name: 'Separated Returns', href: '/reviews/returns', permKey: 'reviews', icon: RotateCcw },
      { name: 'Dynamic Categories', href: '/reviews/categories', permKey: 'reviews', icon: Tags },
    ],
  },
  {
    title: 'Customer Intelligence',
    items: [
      { name: 'Customer 360 Directory', href: '/customers', permKey: 'customers', icon: Users },
      { name: 'Cohort Insights', href: '/customers/insights', permKey: 'customers', icon: PieChart },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { name: 'Influencer Directory', href: '/marketing/influencers', permKey: 'marketing', icon: Megaphone },
      { name: 'Marketing Sends', href: '/marketing/sends', permKey: 'marketing', icon: Gift },
    ],
  },
  {
    title: 'OpsCore',
    items: [
      { name: 'Calendar To-Do', href: '/opscore/calendar-tasks', permKey: 'tasks', icon: Calendar, badge: 'BS/AD' },
      { name: 'Task Management', href: '/opscore/tasks', permKey: 'tasks', icon: CheckSquare },
      { name: 'Activity Trail', href: '/opscore/activity', permKey: 'activity', icon: History },
      { name: 'Google Sheets Export', href: '/opscore/export', permKey: 'export', icon: FileSpreadsheet },
    ],
  },
  {
    title: 'Administration',
    items: [
      { name: 'System Settings', href: '/settings', permKey: 'settings', icon: Settings, badge: 'Staff/Rules' },
    ],
  },
];

export default function MobileNavDrawer({
  isOpen,
  onClose,
  currentUser,
  currentBrand,
  onBrandChange,
  onOpenProfile,
}: MobileNavDrawerProps) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  // Filter sections by user permissions
  const permittedSections = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasAccess(currentUser, item.permKey)),
    }))
    .filter((section) => section.items.length > 0);

  // Filter sections by search query
  const q = searchQuery.toLowerCase().trim();
  const filteredSections = permittedSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.name.toLowerCase().includes(q)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 left-0 max-w-full flex">
        <div className="w-80 max-w-[85vw] bg-white flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
              <span className="font-bold text-slate-900 text-sm tracking-tight">Navigation</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition"
              aria-label="Close navigation drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Search */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Navigation Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {filteredSections.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No matching navigation items found.
              </div>
            ) : (
              filteredSections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {section.title}
                  </div>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onClose}
                          className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition ${
                            isActive
                              ? 'bg-blue-50 text-blue-700 font-bold'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-blue-600' : 'text-slate-400'
                              }`}
                            />
                            <span>{item.name}</span>
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
              ))
            )}
          </div>

          {/* User Profile Footer Strip */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenProfile();
              }}
              className="flex items-center gap-2.5 text-left w-full hover:opacity-80 transition"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 font-bold text-white text-xs shadow-xs">
                {currentUser.fullName ? currentUser.fullName.charAt(0) : 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-bold text-slate-900">
                  {currentUser.fullName}
                </div>
                <div className="truncate text-[10px] text-slate-500">
                  {isSuperAdmin(currentUser) ? 'Super Admin' : 'Authorized User'} • {currentUser.phone}
                </div>
              </div>
              <span className="text-xs text-blue-600 font-bold">Profile &rarr;</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
