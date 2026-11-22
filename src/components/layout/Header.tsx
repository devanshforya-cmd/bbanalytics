'use client';

import BrandLogo from './BrandLogo';
import SavingBar from './SavingBar';
import Link from 'next/link';
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
import { canPerform, isSuperAdmin } from '@/lib/permissions';
import { isMessage, notificationTarget } from '@/lib/notification-open';
import MessageModal from '@/components/notifications/MessageModal';
import ComposeMessage from '@/components/notifications/ComposeMessage';
import { toast } from '@/components/common/Toast';
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
  Calendar,
  Mail,
  Send,
} from 'lucide-react';

export default function Header() {
  const router = useRouter();
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
  const [openMessage, setOpenMessage] = useState<Notification | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const seenNotifIds = useRef<Set<string> | null>(null);
  const canSendMessages = isSuperAdmin(currentUser) || canPerform(currentUser, 'p.settings_alerts', 'EDIT');

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
    const list = db.getNotifications();
    // Pop up anything new that arrived since the last look (not old ones arriving with a first sync).
    if (seenNotifIds.current) {
      const recent = Date.now() - 15 * 60 * 1000;
      const fresh = list.filter((n) => !n.read && !seenNotifIds.current!.has(n.id) && Date.parse(n.createdAt) > recent).slice(0, 3);
      for (const n of fresh) {
        toast.info(n.title, isMessage(n) ? `Message from ${n.senderName || 'the office'}` : n.message.slice(0, 120), { label: 'Open', onClick: () => openNotificationRef.current(n) });
      }
    }
    seenNotifIds.current = new Set(list.map((n) => n.id));
    setNotifications(list);
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

  const handleBrandChange = (brand: BrandCode, subBrandId = '') => {
    setBrandFilter(brand);
    db.setActiveBrandFilter(brand, subBrandId);
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
    if (isMessage(n)) setOpenMessage(n);
    else router.push(notificationTarget(n));
  };
  const openNotificationRef = useRef(handleNotificationClick);
  openNotificationRef.current = handleNotificationClick;

  const unreadNotifs = notifications.filter((n) => !n.read);
  const displayedNotifs = notifTab === 'UNREAD' ? unreadNotifs : notifications;
  const duty = currentUser.dutyStatus || 'ONLINE';

  return (
    <>
      <header
        className={`sticky top-0 z-30 flex h-14 sm:h-16 w-full items-center justify-between gap-2 px-2.5 sm:px-6 transition duration-200 bg-white/90 backdrop-blur-md`}
      >
        <span aria-hidden="true" className="bb-brand-line pointer-events-none absolute inset-x-0 bottom-0 h-[2px]" />
        <SavingBar />
        {/* Left: Hamburger (mobile/tablet) + Clean Brand Dropdown */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none sm:gap-3">
          {/* Hamburger Menu Trigger for <lg (touch target >= 44px on mobile) */}
          <button
            type="button"
            onClick={() => setShowMobileNavDrawer(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-800 hover:bg-black/[0.05] transition sm:h-9 sm:w-9 sm:rounded-lg sm:border sm:border-black/[0.08] sm:bg-white lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/dashboard" aria-label="Brand Bucket home" className="hidden shrink-0 sm:block lg:hidden"><BrandLogo variant="mark" className="h-8 w-8" /></Link>

          {/* Clean Brand Selector Dropdown (No bulky BB square logo, no clutter) */}
          <BrandDropdown
            currentBrand={brandFilter}
            onBrandChange={handleBrandChange}
            isCompact={false}
            className="min-w-0 flex-1 sm:flex-none"
          />
        </div>

        {/* Center: Global Search Input / Command Palette Trigger (Desktop & Tablet) */}
        <div className="flex-1 max-w-sm lg:max-w-md mx-2 sm:mx-4 hidden sm:flex items-center justify-center">
          <button
            type="button"
            onClick={() => setShowSearchModal(true)}
            className="group flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-black/[0.08] bg-white px-3 text-slate-500 transition-colors hover:border-black/[0.14]"
            aria-label="Search your workspace"
          >
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate text-[13px] text-slate-500">
              Search
            </span>
            <kbd className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded border border-black/[0.08] bg-slate-50 px-1.5 py-px font-mono text-[11px] text-slate-500">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </div>

        {/* Right: Offline Sync Pill, Date Badge, Notification Center, Profile Drawer Button */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-2.5">
          {/* Dual Calendar Date Badge */}
          <div className="hidden items-center gap-1.5 px-2 text-[13px] text-slate-600 xl:flex">
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
            <span>{todayBs}</span>
          </div>

          {/* Mobile Search Button (<sm) */}
          <button
            type="button"
            onClick={() => setShowSearchModal(true)}
            className="flex h-10 w-10 sm:hidden items-center justify-center rounded-full text-slate-700 hover:bg-black/[0.05] transition"
            aria-label="Open search"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>

          {/* Offline Sync State (desktop & tablet) */}
          <SyncStatusDropdown />

          {/* Interactive Notifications Center */}
          <div ref={notifMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              key={unreadNotifs.length}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-black/[0.05] transition sm:h-9 sm:w-9 sm:rounded-lg sm:border sm:border-black/[0.08] sm:bg-white"
              aria-label={unreadNotifs.length ? `View notifications, ${unreadNotifs.length} unread` : 'View notifications'}
              data-ring={unreadNotifs.length > 0 || undefined}
            >
              <Bell className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
              {unreadNotifs.length > 0 && (
                <span className="absolute top-1 right-1 sm:-top-1 sm:-right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[11px] text-white ring-2 ring-white">
                  {unreadNotifs.length}
                </span>
              )}
            </button>

            {/* Notification Popover */}
            {showNotifMenu && (
              <div className="fixed inset-x-3 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96 rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl z-50 animate-in fade-in overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Notifications
                    </span>
                    {unreadNotifs.length > 0 && (
                      <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-[11px] font-bold">
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
                    <div className="p-6 text-center text-xs text-slate-500">
                      <Bell className="mx-auto mb-1 h-6 w-6 text-slate-300" />
                      <span>No {notifTab === 'UNREAD' ? 'unread ' : ''}notifications</span>
                    </div>
                  ) : (
                    displayedNotifs.map((n) => {
                      const text = (n.title + ' ' + n.message).toLowerCase();
                      const isCheque = text.includes('cheque');
                      const isLogistics = text.includes('delivery') || text.includes('failed');
                      const isTask = text.includes('task') || text.includes('beat');
                      const isMsg = isMessage(n);

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
                              isMsg
                                ? 'bg-emerald-100 text-emerald-700'
                                : isCheque
                                ? 'bg-purple-100 text-purple-700'
                                : isLogistics
                                ? 'bg-rose-100 text-rose-700'
                                : isTask
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {isMsg ? <Mail className="w-3.5 h-3.5" /> : isCheque ? <CreditCard className="w-3.5 h-3.5" /> : isLogistics ? <Truck className="w-3.5 h-3.5" /> : isTask ? <CheckSquare className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
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
                            <span className="text-[11px] text-slate-500 mt-1 block">
                              {isMsg ? `From ${n.senderName || 'the office'} · ` : ''}{n.createdAt ? new Date(n.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer: View Full Audit History */}
                <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
                  {canSendMessages && (
                    <button
                      type="button"
                      onClick={() => { setShowNotifMenu(false); setShowCompose(true); }}
                      className="mb-1 flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Send className="w-3.5 h-3.5" /> Send a message
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotifMenu(false);
                      setShowNotifHistoryModal(true);
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 w-full py-1 hover:underline"
                  >
                    <span>View notification &amp; audit history</span>
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
            className="flex h-10 w-10 items-center justify-center gap-2 rounded-full text-xs font-semibold text-slate-800 transition hover:bg-black/[0.05] sm:h-auto sm:w-auto sm:rounded-lg sm:border sm:border-slate-200 sm:bg-slate-50 sm:px-2.5 sm:py-1.5 sm:shadow-2xs sm:hover:bg-slate-100"
            aria-label="Open user profile and duty settings"
          >
            <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[image:var(--bb-logo-grad)] font-semibold text-xs text-white sm:h-6 sm:w-6 sm:text-[11px]">
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
              <div className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
                {duty === 'ONLINE' ? 'Online' : duty.replace('_', ' ')}
              </div>
            </div>

            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
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

      {openMessage && <MessageModal message={openMessage} onClose={() => setOpenMessage(null)} />}
      {showCompose && <ComposeMessage onClose={() => setShowCompose(false)} />}

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
