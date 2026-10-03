'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { Notification } from '@/lib/types';
import {
  Bell,
  CheckCheck,
  Search,
  X,
  CreditCard,
  Truck,
  CheckSquare,
  AlertTriangle,
  Info,
  Clock,
  ExternalLink,
  Trash2,
  Filter,
} from 'lucide-react';

interface NotificationHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotificationsUpdated: () => void;
}

export default function NotificationHistoryModal({
  isOpen,
  onClose,
  onNotificationsUpdated,
}: NotificationHistoryModalProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'CHEQUE' | 'DELIVERY' | 'TASK' | 'STOCK'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');

  if (!isOpen) return null;

  const notifications = db.getNotifications();

  // Helper to categorize
  const getCategory = (n: Notification): 'CHEQUE' | 'DELIVERY' | 'TASK' | 'STOCK' | 'OTHER' => {
    const text = (n.title + ' ' + n.message).toLowerCase();
    if (text.includes('cheque') || text.includes('handover') || text.includes('bank')) return 'CHEQUE';
    if (text.includes('delivery') || text.includes('failed') || text.includes('dispatch') || text.includes('return')) return 'DELIVERY';
    if (text.includes('task') || text.includes('assigned') || text.includes('beat') || text.includes('todo')) return 'TASK';
    if (text.includes('stock') || text.includes('inventory') || text.includes('drop') || text.includes('low')) return 'STOCK';
    return 'OTHER';
  };

  const getTargetRoute = (n: Notification): string => {
    const cat = getCategory(n);
    if (cat === 'CHEQUE') return '/offline-sales/cheques';
    if (cat === 'DELIVERY') return '/orderflow/delivery-failures';
    if (cat === 'TASK') return '/opscore/calendar-tasks';
    if (cat === 'STOCK') return '/products';
    return '/dashboard';
  };

  const filteredNotifications = notifications.filter((n) => {
    const cat = getCategory(n);
    if (filterCategory !== 'ALL' && cat !== filterCategory) return false;
    if (filterStatus === 'UNREAD' && n.read) return false;
    if (filterStatus === 'READ' && !n.read) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q);
    }
    return true;
  });

  const handleMarkAllRead = () => {
    db.markAllNotificationsRead();
    onNotificationsUpdated();
  };

  const handleClickNotification = (n: Notification) => {
    db.markNotificationRead(n.id);
    onNotificationsUpdated();
    const route = getTargetRoute(n);
    onClose();
    router.push(route);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    db.deleteNotification(id);
    onNotificationsUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Notification &amp; Operational Audit Center</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Full timeline of system dispatch alerts, cheque warnings, and field activities
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
            >
              <CheckCheck className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Mark All as Read</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar: Search + Category Filters */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          {/* Search */}
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search notifications by keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category & Status Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                Category:
              </span>
              {(['ALL', 'CHEQUE', 'DELIVERY', 'TASK', 'STOCK'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    filterCategory === cat
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'ALL'
                    ? 'All Alerts'
                    : cat === 'CHEQUE'
                    ? 'Cheques'
                    : cat === 'DELIVERY'
                    ? 'Logistics'
                    : cat === 'TASK'
                    ? 'Beat Tasks'
                    : 'Inventory'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setFilterStatus('ALL')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                  filterStatus === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('UNREAD')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                  filterStatus === 'UNREAD' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Unread
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('READ')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                  filterStatus === 'READ' ? 'bg-white text-slate-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Read
              </button>
            </div>
          </div>
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-slate-100">
          {filteredNotifications.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Bell className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-semibold">No notifications match your current filter.</p>
            </div>
          ) : (
            filteredNotifications.map((n) => {
              const cat = getCategory(n);
              const isUnread = !n.read;

              return (
                <div
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={`pt-2.5 pb-2.5 px-3 rounded-xl cursor-pointer transition flex items-start justify-between gap-3 ${
                    isUnread ? 'bg-blue-50/40 hover:bg-blue-50/80 border border-blue-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        cat === 'CHEQUE'
                          ? 'bg-purple-100 text-purple-700'
                          : cat === 'DELIVERY'
                          ? 'bg-rose-100 text-rose-700'
                          : cat === 'TASK'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {cat === 'CHEQUE' && <CreditCard className="w-4 h-4" />}
                      {cat === 'DELIVERY' && <Truck className="w-4 h-4" />}
                      {cat === 'TASK' && <CheckSquare className="w-4 h-4" />}
                      {cat === 'STOCK' && <AlertTriangle className="w-4 h-4" />}
                      {cat === 'OTHER' && <Info className="w-4 h-4" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className={`text-xs font-bold ${isUnread ? 'text-blue-950' : 'text-slate-800'}`}>
                          {n.title}
                        </h4>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-snug">{n.message}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{n.createdAt || 'Today 10:30 AM'}</span>
                        </span>
                        <span>•</span>
                        <span className="font-semibold text-blue-600 hover:underline flex items-center gap-0.5">
                          <span>Action screen</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleDelete(n.id, e)}
                    className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                    title="Delete notification"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500">
          Showing {filteredNotifications.length} of {notifications.length} audit logs
        </div>
      </div>
    </div>
  );
}
