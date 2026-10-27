'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { syncManager, SyncState } from '@/lib/offline-sync';
import { BrandCode, User, Notification } from '@/lib/types';
import BrandDropdown from './BrandDropdown';
import UserProfileDrawer from './UserProfileDrawer';
import MobileNavDrawer from './MobileNavDrawer';
import SyncStatusDropdown from './SyncStatusDropdown';
import NotificationHistoryModal from '@/components/common/NotificationHistoryModal';
import GlobalSearchModal from '@/components/common/GlobalSearchModal';
import { getSessionUser } from '@/lib/auth';
import { getTodayBs } from '@/lib/nepali-calendar';
import { useExperiment } from '@/hooks/useExperiment';
import {
  Menu,
  Bell,
  Search,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  ChevronDown,
  CheckCheck,
  CreditCard,
  Truck,
  CheckSquare,
  Info,
  Clock,
  ArrowRight,
  Sparkles,
  Calendar,
} from 'lucide-react';

export default function Header() {
  const router = useRouter();
  const { variant: navVariant } = useExperiment('premium-nav-style');
  const [todayBs, setTodayBs] = useState(() => getTodayBs());
  const [currentUser, setCurrentUser] = useState<User>(() => getSessionUser() || db.getCurrentUser());
  const [brandFilter, setBrandFilter] = useState<BrandCode>(db.getActiveBrandFilter());
  const [syncState, setSyncState] = useState<SyncState>('SYNCED');
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showNotifHistoryModal, setShowNotifHistoryModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [showMobileNavDrawer, setShowMobileNavDrawer] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifTab, setNotifTab] = useState<'UNREAD' | 'ALL'>('UNREAD');
  const notifMenuRef = useRef<HTMLDivElement>(null);

  // Global keyboard shortcut for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setShowSearchModal((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const refreshNotifs = () => {
    setNotifications(db.getNotifications());
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target as Node)) {
        setShowNotifMenu(false);
      }
    };
    if (showNotifMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showNotifMenu]);

  useEffect(() => {
    const session = getSessionUser();
    const user = session || db.getCurrentUser();
    setCurrentUser(user);
    refreshNotifs();

    const handleDbUpdate = () => {
      const session = getSessionUser();
      const user = session || db.getCurrentUser();
      setCurrentUser(user);
      setBrandFilter(db.getActiveBrandFilter());
      refreshNotifs();
    };
    window.addEventListener('bb-db-updated', handleDbUpdate);

    const unsub = syncManager.subscribe((state, count) => {
      setSyncState(state);
      setPendingSyncCount(count);
    });
    return () => {
      window.removeEventListener('bb-db-updated', handleDbUpdate);
      unsub();
    };
  }, []);

  const handleBrandChange = (brand: BrandCode) => {
    setBrandFilter(brand);
    db.setActiveBrandFilter(brand);
    window.location.reload();
  };

  const handleUserUpdate = () => {
    const session = getSessionUser();
    setCurrentUser(session || { ...db.getCurrentUser() });
  };

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    db.markAllNotificationsRead();
    refreshNotifs();
  };

  const handleNotificationClick = (n: Notification) => {
    db.markNotificationRead(n.id);
    refreshNotifs();
    setShowNotifMenu(false);

    // Deep link based on content
    const text = (n.title + ' ' + n.message).toLowerCase();
    if (text.includes('cheque') || text.includes('handover')) {
      router.push('/offline-sales/cheques');
    } else if (text.includes('delivery') || text.includes('failed')) {
      router.push('/orderflow/delivery-failures');
    } else if (text.includes('task') || text.includes('assigned') || text.includes('beat')) {
      router.push('/offline-sales/beat-plan');
    } else if (text.includes('stock')) {
      router.push('/products');
    } else {
      router.push('/dashboard');
    }
  };

  const unreadNotifs = notifications.filter((n) => !n.read);
  const displayedNotifs = notifTab === 'UNREAD' ? unreadNotifs : notifications;
  const duty = currentUser.dutyStatus || 'ONLINE';
  const isGlassVariant = navVariant === 'glass_premium';

  return (
    <>
      <header
        className={`sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b px-3 sm:px-6 transition-all duration-200 ${
          isGlassVariant
            ? 'border-slate-200/70 bg-white/85 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.04)] backdrop-blur-xl'
            : 'border-slate-200 bg-white/95 shadow-2xs backdrop-blur-md'
        }`}
      >
        {/* Left: Hamburger (mobile/tablet) + Clean Brand Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Hamburger Menu Trigger for <lg (touch target >= 44px on mobile) */}
          <button
            type="button"
            onClick={() => setShowMobileNavDrawer(true)}
            className="flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition lg:hidden shadow-2xs"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Clean Brand Selector Dropdown (No bulky BB square logo, no clutter) */}
          <BrandDropdown
            currentBrand={brandFilter}
            onBrandChange={handleBrandChange}
            isCompact={false}
          />
        </div>

        {/* Center: Global Search Input / Command Palette Trigger (Desktop & Tablet) */}
        <div className="flex-1 max-w-sm lg:max-w-md mx-2 sm:mx-4 hidden sm:flex items-center justify-center">
          <button
            type="button"
            onClick={() => setShowSearchModal(true)}
            className="flex w-full items-center gap-2.5 px-3.5 py-1.5 rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-white hover:border-blue-300 hover:shadow-xs text-slate-400 hover:text-slate-600 transition duration-150 shadow-2xs group cursor-pointer"
            aria-label="Search your workspace"
          >
            <Search className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition shrink-0" />
            <span className="text-xs text-slate-400 group-hover:text-slate-600 font-medium truncate">
              Search your workspace
            </span>
            <kbd className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-white border border-slate-200 rounded-md shadow-2xs shrink-0">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </div>

        {/* Right: Offline Sync Pill, Date Badge, Notification Center, Profile Drawer Button */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Dual Calendar Date Badge */}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 text-xs font-bold text-slate-700 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>{todayBs}</span>
          </div>

          {/* Mobile Search Button (<sm) */}
          <button
            type="button"
            onClick={() => setShowSearchModal(true)}
            className="flex h-11 w-11 sm:hidden items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition shadow-2xs"
            aria-label="Open search"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Offline Sync State (desktop & tablet) */}
          <SyncStatusDropdown />

          {/* Interactive Notifications Center */}
          <div ref={notifMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition shadow-2xs"
              aria-label="View notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifs.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white ring-2 ring-white animate-pulse">
                  {unreadNotifs.length}
                </span>
              )}
            </button>

            {/* Notification Popover */}
            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl z-50 animate-in fade-in overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Notifications
                    </span>
                    {unreadNotifs.length > 0 && (
                      <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-bold">
                        {unreadNotifs.length} unread
                      </span>
                    )}
                  </div>

                  {unreadNotifs.length > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Mark all read</span>
                    </button>
                  )}
                </div>

                {/* Sub-tabs: Unread vs All */}
                <div className="flex border-b border-slate-100 bg-white px-4 pt-2 gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setNotifTab('UNREAD')}
                    className={`pb-2 font-bold border-b-2 transition ${
                      notifTab === 'UNREAD'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Unread ({unreadNotifs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifTab('ALL')}
                    className={`pb-2 font-bold border-b-2 transition ${
                      notifTab === 'ALL'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    All ({notifications.length})
                  </button>
                </div>

                {/* Notification Items List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {displayedNotifs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      <Sparkles className="w-6 h-6 mx-auto text-slate-300 mb-1" />
                      <span>No {notifTab === 'UNREAD' ? 'unread ' : ''}notifications</span>
                    </div>
                  ) : (
                    displayedNotifs.map((n) => {
                      const text = (n.title + ' ' + n.message).toLowerCase();
                      const isCheque = text.includes('cheque');
                      const isLogistics = text.includes('delivery') || text.includes('failed');
                      const isTask = text.includes('task') || text.includes('beat');

                      return (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`p-3 text-xs transition cursor-pointer hover:bg-slate-50 flex items-start gap-2.5 ${
                            !n.read ? 'bg-blue-50/30' : ''
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
                              isCheque
                                ? 'bg-purple-100 text-purple-700'
                                : isLogistics
                                ? 'bg-rose-100 text-rose-700'
                                : isTask
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {isCheque && <CreditCard className="w-3.5 h-3.5" />}
                            {isLogistics && <Truck className="w-3.5 h-3.5" />}
                            {isTask && <CheckSquare className="w-3.5 h-3.5" />}
                            {!isCheque && !isLogistics && !isTask && <Info className="w-3.5 h-3.5" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className={`font-semibold truncate ${!n.read ? 'text-slate-900 font-bold' : 'text-slate-700'}`}>
                                {n.title}
                              </span>
                              {!n.read && (
                                <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                              )}
                            </div>
                            <p className="text-slate-500 mt-0.5 line-clamp-2 text-[11px] leading-snug">
                              {n.message}
                            </p>
                            <span className="text-[10px] text-slate-400 mt-1 block">
                              {n.createdAt || 'Today 10:30 AM'} • Click to view
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer: View Full Audit History */}
                <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotifMenu(false);
                      setShowNotifHistoryModal(true);
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 w-full py-1 hover:underline"
                  >
                    <span>View Notification &amp; Audit History</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Drawer Trigger Button */}
          <button
            type="button"
            onClick={() => setShowProfileDrawer(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs transition active:scale-98"
            aria-label="Open user profile and duty settings"
          >
            <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 font-black text-[11px] text-white">
              {currentUser?.fullName?.charAt(0) || 'U'}
              {/* Duty indicator dot */}
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-white ${
                  duty === 'ONLINE' || duty === 'IN_FIELD'
                    ? 'bg-emerald-500'
                    : duty === 'ON_BREAK'
                    ? 'bg-amber-500'
                    : duty === 'OFFLINE'
                    ? 'bg-slate-400'
                    : 'bg-rose-500'
                }`}
              />
            </div>

            <div className="text-left hidden sm:block">
              <div className="font-bold leading-none truncate max-w-[100px]">
                {(currentUser?.fullName || 'User').split(' ')[0]}
              </div>
              <div className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                {duty === 'ONLINE' ? 'Online' : duty.replace('_', ' ')}
              </div>
            </div>

            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>
      </header>

      {/* User Profile & Duty Control Slide-Over Drawer */}
      <UserProfileDrawer
        isOpen={showProfileDrawer}
        onClose={() => setShowProfileDrawer(false)}
        currentUser={currentUser}
        onUserUpdate={handleUserUpdate}
      />

      {/* Mobile Navigation Drawer (<lg) */}
      <MobileNavDrawer
        isOpen={showMobileNavDrawer}
        onClose={() => setShowMobileNavDrawer(false)}
        currentUser={currentUser}
        currentBrand={brandFilter}
        onBrandChange={handleBrandChange}
        onOpenProfile={() => setShowProfileDrawer(true)}
      />

      {/* Notification & Audit History Modal */}
      <NotificationHistoryModal
        isOpen={showNotifHistoryModal}
        onClose={() => setShowNotifHistoryModal(false)}
        onNotificationsUpdated={refreshNotifs}
      />

      {/* Global Command Palette Search Modal (Cmd+K / Ctrl+K) */}
      <GlobalSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
      />
    </>
  );
}
