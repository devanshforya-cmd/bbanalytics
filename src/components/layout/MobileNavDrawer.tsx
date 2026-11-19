'use client';

import BrandLogo from './BrandLogo';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ListChecks,
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
  BadgePercent,
  Settings,
  Package,
  Navigation,
} from 'lucide-react';
import { User, BrandCode } from '@/lib/types';
import { isSuperAdmin } from '@/lib/permissions';
import NavMenu from './NavMenu';
import { roleLabel } from '@/lib/roles';

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

  if (!isOpen) return null;

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
              <BrandLogo variant="full" className="h-7" />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition"
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
                placeholder="Search menu…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Navigation Items List */}
          <div className="flex-1 overflow-y-auto p-3">
            <NavMenu compact user={currentUser} pathname={pathname} query={searchQuery} onNavigate={onClose} />
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
                  {roleLabel(currentUser)}
                </div>
              </div>
              <span className="text-xs text-blue-600 font-bold">Profile</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
