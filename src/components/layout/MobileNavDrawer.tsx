'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { BrandCode, DutyStatus, User } from '@/lib/types';
import BrandDropdown from './BrandDropdown';
import {
  X,
  Search,
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
  CheckCircle2,
  Coffee,
  PowerOff,
  CalendarDays,
  TrendingUp,
  User as UserIcon,
} from 'lucide-react';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  currentBrand: BrandCode;
  onBrandChange: (brand: BrandCode) => void;
  onOpenProfile: () => void;
}

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
  const role = currentUser.role;

  if (!isOpen) return null;

  const isOfficer = role === 'SALES_OFFICER';
  const isDataEntry = role === 'DATA_ENTRY';
  const isAdminOrSuper = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const isBrandManager = role === 'BRAND_MANAGER';

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

  // Overview
  if (!isOfficer && !isDataEntry) {
    sections.push({
      title: 'Overview',
      items: [
        { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { name: 'Products & Combos', href: '/products', icon: Package, badge: 'DTP/RPP' },
      ],
    });
  } else {
    sections.push({
      title: 'Catalog',
      items: [{ name: 'Products & Combos', href: '/products', icon: Package }],
    });
  }

  // Offline Sales
  if (isOfficer || isAdminOrSuper) {
    const fieldItems: NavItem[] = [
      {
        name: isOfficer ? 'My Day (Beat Plan)' : 'Beat Plans & Routes',
        href: '/offline-sales/beat-plan',
        icon: Compass,
        badge: isOfficer ? 'Active' : undefined,
      },
      { name: isOfficer ? 'My Stores' : 'Stores & Branches', href: '/offline-sales/stores', icon: Store },
    ];

    if (isAdminOrSuper) {
      fieldItems.push({ name: 'Distributor Dispatches', href: '/offline-sales/dispatch', icon: Truck });
    }

    if (!isOfficer) {
      fieldItems.push({ name: 'Live GPS Tracking', href: '/offline-sales/live-tracking', icon: Navigation, badge: 'Live' });
    }

    fieldItems.push(
      { name: 'Shelf Photos', href: '/offline-sales/shelf-photos', icon: Camera },
      { name: 'Call Tracker', href: '/offline-sales/calls', icon: PhoneCall },
      { name: isOfficer ? 'My Cheques' : 'Cheque Tracker', href: '/offline-sales/cheques', icon: CreditCard },
      { name: 'Document Handover', href: '/offline-sales/documents', icon: FileCheck2 }
    );

    if (!isOfficer) {
      fieldItems.push({ name: 'Staff Scorecards', href: '/offline-sales/scorecard', icon: Award });
    }

    sections.push({
      title: isOfficer ? 'Field Operations' : 'Offline Sales (GT/MT)',
      items: fieldItems,
    });
  }

  // OrderFlow
  if (isDataEntry || isAdminOrSuper || isBrandManager) {
    sections.push({
      title: 'OrderFlow',
      items: [
        { name: 'WhatsApp Extractor', href: '/orderflow/extractor', icon: Sparkles, badge: 'AI/Rules' },
        { name: 'Manual Order Entry', href: '/orderflow/manual-entry', icon: ClipboardPen },
        { name: 'Daily Orders', href: '/orderflow/daily-orders', icon: ClipboardCheck, badge: 'Live' },
        { name: 'Delivery Failures', href: '/orderflow/delivery-failures', icon: TruckIcon, badge: 'Separated' },
      ],
    });
  }

  // Reviews & Returns
  if (isDataEntry || isAdminOrSuper || isBrandManager) {
    const reviewItems: NavItem[] = [
      { name: 'Feedback & Complaints', href: '/reviews/feedback', icon: MessageSquareHeart },
      { name: 'Separated Returns', href: '/reviews/returns', icon: RotateCcw },
    ];
    if (isAdminOrSuper) {
      reviewItems.push({ name: 'Dynamic Categories', href: '/reviews/categories', icon: Tags });
    }
    sections.push({
      title: 'Reviews & Returns',
      items: reviewItems,
    });
  }

  // Customer Intelligence
  if (isAdminOrSuper || isBrandManager) {
    sections.push({
      title: 'Customer Intelligence',
      items: [
        { name: 'Customer 360 Directory', href: '/customers', icon: Users },
        { name: 'Cohort Insights', href: '/customers/insights', icon: PieChart },
      ],
    });
  }

  // Marketing & Influencers (Fix 66)
  if (isAdminOrSuper || isBrandManager) {
    sections.push({
      title: 'Marketing',
      items: [
        { name: 'Influencer Directory', href: '/marketing/influencers', icon: Megaphone },
        { name: 'Marketing Sends', href: '/marketing/sends', icon: Gift, badge: 'Fix 66' },
      ],
    });
  }

  // OpsCore
  if (isOfficer || isAdminOrSuper) {
    const opsItems: NavItem[] = [
      { name: 'Calendar To-Do', href: '/opscore/calendar-tasks', icon: Calendar, badge: 'BS/AD' },
      { name: isOfficer ? 'My Tasks' : 'Task Management', href: '/opscore/tasks', icon: CheckSquare },
    ];
    if (isAdminOrSuper) {
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

  // Administration
  if (isAdminOrSuper) {
    sections.push({
      title: 'Administration',
      items: [{ name: 'System Settings', href: '/settings', icon: Settings, badge: 'Brands/Staff' }],
    });
  }

  // Filter sections by search query
  const q = searchQuery.toLowerCase().trim();
  const filteredSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.name.toLowerCase().includes(q)),
    }))
    .filter((section) => section.items.length > 0);

  const currentDuty = currentUser.dutyStatus || 'ONLINE';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 max-w-full flex pr-10">
        <div className="w-full sm:w-[480px] max-w-[480px] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out border-r border-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-900 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white shadow">
                BB
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Brand Bucket
                </div>
                <div className="text-sm font-bold text-white">Command Center</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close menu drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Brand Switcher & Duty Strip */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Principal Brand
              </span>
              <BrandDropdown
                currentBrand={currentBrand}
                onBrandChange={(b) => {
                  onBrandChange(b);
                  onClose();
                }}
                isCompact
              />
            </div>

            {/* Officer Duty Quick Bar */}
            <div
              onClick={() => {
                onClose();
                onOpenProfile();
              }}
              className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/80 shadow-2xs cursor-pointer hover:border-slate-300 transition"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                    currentDuty === 'ONLINE' || currentDuty === 'IN_FIELD'
                      ? 'bg-emerald-500'
                      : currentDuty === 'ON_BREAK'
                      ? 'bg-amber-500'
                      : currentDuty === 'OFFLINE'
                      ? 'bg-slate-400'
                      : 'bg-rose-500'
                  }`}
                />
                <span className="text-xs font-bold text-slate-800">
                  Duty: {currentDuty.replace('_', ' ')}
                </span>
              </div>
              <span className="text-[10px] font-semibold text-blue-600">Change &rarr;</span>
            </div>
          </div>

          {/* Route Search Box */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Find screen (e.g. cheques, beat, whatsapp)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg bg-slate-100 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 border border-slate-200/80 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-[10px] text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Nav List */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
            {filteredSections.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No matching navigation screens
              </div>
            ) : (
              filteredSections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {section.title}
                  </div>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const isActive =
                        pathname === item.href || pathname.startsWith(`${item.href}/`);
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onClose}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                            isActive
                              ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200/60'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`flex h-6 w-6 items-center justify-center rounded ${
                                isActive
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="truncate">{item.name}</span>
                          </div>

                          {item.badge && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                isActive
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-600'
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
                {currentUser.fullName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-bold text-slate-900">
                  {currentUser.fullName}
                </div>
                <div className="truncate text-[10px] text-slate-500">
                  {currentUser.role.replace('_', ' ')} • {currentUser.phone}
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
