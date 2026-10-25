'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/db/db-service';
import { User, DutyStatus, BrandCode } from '@/lib/types';
import { logout, getSessionUser } from '@/lib/auth';
import {
  X,
  Phone,
  MapPin,
  Shield,
  Layers,
  LogOut,
  Settings,
  CheckCircle2,
  Clock,
  Coffee,
  PowerOff,
  CalendarDays,
  UserCheck,
  ChevronRight,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { getScope, isSuperAdmin } from '@/lib/permissions';

interface UserProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUserUpdate?: () => void;
}

const DUTY_STATUS_CONFIG: Record<
  DutyStatus,
  { label: string; description: string; color: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }
> = {
  ONLINE: {
    label: 'Online & Active',
    description: 'Actively visiting stores, GPS tracking active',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  IN_FIELD: {
    label: 'In Field / Beat',
    description: 'On route to retail counters',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: TrendingUp,
  },
  ON_BREAK: {
    label: 'On Break',
    description: 'Lunch, tea break or transit pause',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: Coffee,
  },
  OFFLINE: {
    label: 'Offline (Day Concluded)',
    description: 'Shift ended, GPS broadcast suspended',
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    icon: PowerOff,
  },
  ON_LEAVE: {
    label: 'On Leave',
    description: 'Scheduled leave / off duty today',
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    icon: CalendarDays,
  },
};

export default function UserProfileDrawer({
  isOpen,
  onClose,
  currentUser,
  onUserUpdate,
}: UserProfileDrawerProps) {
  const [dutyStatus, setDutyStatus] = useState<DutyStatus>(currentUser.dutyStatus || 'ONLINE');
  const [users, setUsers] = useState<User[]>([]);
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const { preference: calendarPref, setPreference: setCalendarPref } = useCalendarPreference();

  useEffect(() => {
    setUsers(db.getUsers());
    setDutyStatus(currentUser.dutyStatus || 'ONLINE');
  }, [currentUser]);

  // Handle duty status change
  const handleStatusChange = (newStatus: DutyStatus) => {
    setDutyStatus(newStatus);
    db.setOfficerDutyStatus(currentUser.id, newStatus);
    db.setCurrentUser(currentUser.id);
    setStatusFeedback(`Duty status updated to ${DUTY_STATUS_CONFIG[newStatus].label}`);
    setTimeout(() => setStatusFeedback(null), 3000);
    if (onUserUpdate) onUserUpdate();
  };

  // Persona switch
  const handleUserSwitch = (userId: string) => {
    db.setCurrentUser(userId);
    window.location.reload();
  };

  if (!isOpen) return null;

  const isOfficer = getScope(currentUser, 'beat_plans') === 'OWN';
  const today = new Date().toISOString().split('T')[0];
  const todayBeats = isOfficer ? db.getTodayBeat(currentUser.id).filter((beat) => beat.dateAd === today) : [];
  const todayOrderAmount = isOfficer
    ? db.getSecondaryOrders({ officerId: currentUser.id })
        .filter((order) => order.orderDateAd === today)
        .reduce((total, order) => total + order.totalAmount, 0)
    : 0;
  const todayChequeCount = isOfficer
    ? db.getCheques().filter((cheque) => cheque.officerId === currentUser.id && cheque.receivedDateAd === today).length
    : 0;
  const dutyConfig = DUTY_STATUS_CONFIG[dutyStatus] || DUTY_STATUS_CONFIG.ONLINE;
  const DutyIcon = dutyConfig.icon;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-full sm:w-[480px] max-w-[480px] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out border-l border-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">User Profile & Duty Control</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
              aria-label="Close profile drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Identity Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-lg font-black text-white shadow">
                    {(currentUser?.fullName || 'User')
                      .split(' ')
                      .filter(Boolean)
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  {/* Status Ring Dot */}
                  <span
                    className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-white ${
                      dutyStatus === 'ONLINE' || dutyStatus === 'IN_FIELD'
                        ? 'bg-emerald-500'
                        : dutyStatus === 'ON_BREAK'
                        ? 'bg-amber-500'
                        : dutyStatus === 'OFFLINE'
                        ? 'bg-slate-400'
                        : 'bg-rose-500'
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-slate-900 truncate">
                    {currentUser.fullName}
                  </h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-100">
                      <Shield className="h-3 w-3" />
                      {isSuperAdmin(currentUser) ? 'Super Admin' : (currentUser.role ? currentUser.role.replace('_', ' ') : 'Staff')}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 font-mono">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <a
                      href={`tel:${currentUser.phone}`}
                      className="hover:text-blue-600 transition underline-offset-2 hover:underline"
                    >
                      {currentUser.phone}
                    </a>
                  </div>
                </div>
              </div>

              {/* Territory & Assigned Brands */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-1 gap-2 text-xs">
                {currentUser.territory && (
                  <div className="flex items-start gap-2 text-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-700">Territory: </span>
                      <span>{currentUser.territory}</span>
                    </div>
                  </div>
                )}

                {currentUser.assignedBrands && currentUser.assignedBrands.length > 0 && (
                  <div className="flex items-start gap-2 text-slate-600">
                    <Layers className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-700">Brands: </span>
                      {currentUser.assignedBrands.map((b) => (
                        <span
                          key={b}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Duty Status Selector (Key User Requirement) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Live Duty Status
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Controls field tracking &amp; operational dispatch visibility
                  </p>
                </div>
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${dutyConfig.bg} ${dutyConfig.color} ${dutyConfig.border}`}
                >
                  <DutyIcon className="h-3.5 w-3.5" />
                  <span>{dutyConfig.label}</span>
                </div>
              </div>

              {statusFeedback && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{statusFeedback}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                {(['ONLINE', 'IN_FIELD', 'ON_BREAK', 'OFFLINE', 'ON_LEAVE'] as DutyStatus[]).map(
                  (status) => {
                    const cfg = DUTY_STATUS_CONFIG[status];
                    const isSelected = dutyStatus === status;
                    const Icon = cfg.icon;

                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => handleStatusChange(status)}
                        className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? `${cfg.bg} ${cfg.border} ring-2 ring-blue-500/20 shadow-xs`
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            isSelected ? 'bg-white shadow-xs' : 'bg-slate-100'
                          } ${cfg.color}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-bold ${
                                isSelected ? cfg.color : 'text-slate-800'
                              }`}
                            >
                              {cfg.label}
                            </span>
                            {isSelected && (
                              <span className="h-2 w-2 rounded-full bg-blue-600" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            {cfg.description}
                          </p>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Field Performance Snapshot for Officers */}
            {isOfficer && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Today&apos;s Field Quick Stats
                  </span>
                  <Link
                    href="/offline-sales/scorecard"
                    onClick={onClose}
                    className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-0.5"
                  >
                    <span>Full Scorecard</span>
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200/80 shadow-xs">
                    <div className="text-base font-black text-slate-900">
                      {todayBeats.filter((beat) => beat.status === 'VISITED').length} / {todayBeats.length}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-500">Stores Visited</div>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200/80 shadow-xs">
                    <div className="text-base font-black text-emerald-600">Rs {todayOrderAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                    <div className="text-[10px] font-semibold text-slate-500">Orders Booked</div>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200/80 shadow-xs">
                    <div className="text-base font-black text-blue-600">{todayChequeCount}</div>
                    <div className="text-[10px] font-semibold text-slate-500">Cheques Picked</div>
                  </div>
                </div>
              </div>
            )}

            {/* Fix 64: Calendar Preference Selector */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-900">Default Calendar</span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">Persists across devices</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['BS', 'AD', 'BOTH'] as const).map((pref) => (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => setCalendarPref(pref)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition text-center ${
                      calendarPref === pref
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {pref === 'BS' ? 'BS (Nepali)' : pref === 'AD' ? 'AD (English)' : 'Both (Dual)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Simulate Persona (Tester switch) */}
            {process.env.NODE_ENV === 'development' && isSuperAdmin(currentUser) && <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
                className="flex items-center justify-between w-full p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">Switch Persona</div>
                    <div className="text-[10px] text-slate-500">
                      Simulate other staff roles &amp; permissions
                    </div>
                  </div>
                </div>
                <ChevronRight
                  className={`h-4 w-4 text-slate-400 transition-transform ${
                    showRoleSwitcher ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {showRoleSwitcher && (
                <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-1 shadow-sm max-h-60 overflow-y-auto animate-in fade-in">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleUserSwitch(u.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition ${
                        u.id === currentUser.id
                          ? 'bg-blue-50 text-blue-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{u.fullName}</div>
                        <div className="text-[10px] text-slate-500">
                          {u.is_super_admin || u.isSuperAdmin ? 'Super Admin' : (u.role ? u.role.replace('_', ' ') : 'Staff')} • {u.phone}
                        </div>
                      </div>
                      {u.id === currentUser.id && (
                        <span className="h-2 w-2 rounded-full bg-blue-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>}

            {/* System Settings Shortcut */}
            <Link
              href="/settings"
              onClick={onClose}
              className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Settings className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">System Settings</div>
                  <div className="text-[10px] text-slate-500">
                    Manage principal brands, staff users, rules
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </Link>
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center justify-center gap-2 w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition active:scale-98"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out of Command Center</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
