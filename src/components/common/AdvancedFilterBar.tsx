'use client';

import React, { useState, useEffect } from 'react';
import { FilterCriteria, BrandCode, User } from '@/lib/types';
import { NEPALI_MONTHS, adToBs, bsToAd, BS_MONTH_DAYS } from '@/lib/nepali-calendar';
import { db } from '@/lib/db/db-service';
import {
  Calendar,
  MapPin,
  User as UserIcon,
  Filter,
  X,
  ChevronDown,
  RotateCcw,
  Sparkles,
  Check,
  Building2,
  SlidersHorizontal,
} from 'lucide-react';

interface AdvancedFilterBarProps {
  criteria: FilterCriteria;
  onChange: (criteria: FilterCriteria) => void;
  hideBrand?: boolean;
  hideOfficer?: boolean;
  hidePlaces?: boolean;
  hideDayOfWeek?: boolean;
  hideOutletType?: boolean;
  title?: string;
  drawerMode?: boolean;
}

const DAYS_OF_WEEK = [
  { key: 'Sunday', short: 'Sun', np: 'आइत' },
  { key: 'Monday', short: 'Mon', np: 'सोम' },
  { key: 'Tuesday', short: 'Tue', np: 'मंगल' },
  { key: 'Wednesday', short: 'Wed', np: 'बुध' },
  { key: 'Thursday', short: 'Thu', np: 'बिही' },
  { key: 'Friday', short: 'Fri', np: 'शुक्र' },
  { key: 'Saturday', short: 'Sat', np: 'शनि' },
];

const PROVINCES = [
  'Bagmati (Province 3)',
  'Gandaki (Province 4)',
  'Lumbini (Province 5)',
  'Koshi (Province 1)',
  'Madhesh (Province 2)',
  'Karnali (Province 6)',
  'Sudurpashchim (Province 7)',
];

const CITIES = [
  'Kathmandu',
  'Lalitpur',
  'Bhaktapur',
  'Pokhara',
  'Butwal',
  'Biratnagar',
  'Bharatpur',
  'Dharan',
  'Nepalgunj',
  'Hetauda',
];

const OUTLET_TYPES = [
  'Retail Chain / Supermarket',
  'GT (General Trade)',
  'Pharmacy',
  'Cosmetics',
  'Wholesale',
];

const BS_YEARS = ['2081', '2082', '2083', '2084', '2085'];
const AD_YEARS = ['2024', '2025', '2026', '2027'];

export default function AdvancedFilterBar({
  criteria,
  onChange,
  hideBrand = false,
  hideOfficer = false,
  hidePlaces = false,
  hideDayOfWeek = false,
  hideOutletType = false,
  title = 'Filters',
}: AdvancedFilterBarProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const calendarMode = criteria.calendarMode || 'BS';

  useEffect(() => {
    setUsers(db.getUsers());
  }, []);

  const updateCriteria = (updates: Partial<FilterCriteria>) => {
    onChange({ ...criteria, ...updates });
  };

  const clearAllFilters = () => {
    onChange({
      calendarMode,
    });
  };

  const toLocalDateStr = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const AD_MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Preset handlers
  const setPreset = (preset: 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'ALL_TIME') => {
    const today = new Date();
    const todayStr = toLocalDateStr(today);

    if (preset === 'ALL_TIME') {
      onChange({
        calendarMode,
        valley: criteria.valley,
        officerId: criteria.officerId,
        outletType: criteria.outletType,
        brand: criteria.brand,
      });
      return;
    }

    if (preset === 'TODAY') {
      onChange({
        ...criteria,
        dateExact: todayStr,
        dateFrom: undefined,
        dateTo: undefined,
        dayOfWeek: undefined,
        month: undefined,
      });
    } else if (preset === 'YESTERDAY') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      onChange({
        ...criteria,
        dateExact: toLocalDateStr(yesterday),
        dateFrom: undefined,
        dateTo: undefined,
        dayOfWeek: undefined,
        month: undefined,
      });
    } else if (preset === 'THIS_WEEK') {
      const firstDay = new Date(today);
      firstDay.setDate(today.getDate() - today.getDay());
      const lastDay = new Date(firstDay);
      lastDay.setDate(firstDay.getDate() + 6);
      onChange({
        ...criteria,
        dateExact: undefined,
        dateFrom: toLocalDateStr(firstDay),
        dateTo: toLocalDateStr(lastDay),
        dayOfWeek: undefined,
      });
    } else if (preset === 'THIS_MONTH') {
      if (calendarMode === 'BS') {
        const bsToday = adToBs(today);
        const daysInBsMonth =
          (BS_MONTH_DAYS[bsToday.year] && BS_MONTH_DAYS[bsToday.year][bsToday.month - 1]) || 30;
        const firstDayAd = bsToAd(bsToday.year, bsToday.month, 1);
        const lastDayAd = bsToAd(bsToday.year, bsToday.month, daysInBsMonth);
        onChange({
          ...criteria,
          dateExact: undefined,
          dateFrom: toLocalDateStr(firstDayAd),
          dateTo: toLocalDateStr(lastDayAd),
          month: bsToday.monthName,
          dayOfWeek: undefined,
        });
      } else {
        const y = today.getFullYear();
        const m = today.getMonth();
        const firstDay = new Date(y, m, 1);
        const lastDay = new Date(y, m + 1, 0);
        onChange({
          ...criteria,
          dateExact: undefined,
          dateFrom: toLocalDateStr(firstDay),
          dateTo: toLocalDateStr(lastDay),
          month: AD_MONTH_NAMES[m],
          dayOfWeek: undefined,
        });
      }
    }
  };

  // Active preset detection
  const todayStr = toLocalDateStr(new Date());
  const isToday = criteria.dateExact === todayStr;
  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const isYesterday = criteria.dateExact === toLocalDateStr(yesterdayObj);
  const currentBsToday = adToBs(new Date());
  const isThisMonth =
    criteria.month === (calendarMode === 'BS' ? currentBsToday.monthName : AD_MONTH_NAMES[new Date().getMonth()]);
  const isThisWeek = Boolean(criteria.dateFrom && criteria.dateTo && !criteria.dateExact && !criteria.month);

  // Active filters count
  const activeFilterCount = [
    criteria.dateExact,
    criteria.dayOfWeek,
    criteria.month,
    criteria.year,
    criteria.dateFrom || criteria.dateTo,
    criteria.province,
    criteria.valley && criteria.valley !== 'ALL' ? criteria.valley : null,
    criteria.city,
    criteria.brand && criteria.brand !== 'ALL' ? criteria.brand : null,
    criteria.officerId,
    criteria.outletType,
  ].filter(Boolean).length;

  const salesOfficers = users.filter((u) => u.role === 'SALES_OFFICER');

  return (
    <div className="mb-6 space-y-2">
      {/* ========================================================================= */}
      {/* 1. PRIMARY COMMAND TOOLBAR STRIP (DESKTOP & MOBILE RESPONSIVE) */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
        {/* Left Side: Period Segmented Control & Calendar System Pill */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Date Presets */}
          <div className="inline-flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPreset('ALL_TIME')}
              className={`rounded-lg px-2.5 py-1.5 transition ${
                !isToday && !isYesterday && !isThisWeek && !isThisMonth && !criteria.dateExact
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setPreset('TODAY')}
              className={`rounded-lg px-2.5 py-1.5 transition ${
                isToday
                  ? 'bg-white text-blue-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setPreset('YESTERDAY')}
              className={`rounded-lg px-2.5 py-1.5 transition ${
                isYesterday
                  ? 'bg-white text-blue-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => setPreset('THIS_WEEK')}
              className={`rounded-lg px-2.5 py-1.5 transition ${
                isThisWeek
                  ? 'bg-white text-blue-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setPreset('THIS_MONTH')}
              className={`rounded-lg px-2.5 py-1.5 transition ${
                isThisMonth
                  ? 'bg-white text-blue-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month
            </button>
          </div>

          {/* Calendar System Switch (BS vs AD) */}
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold shadow-2xs">
            <button
              type="button"
              onClick={() => updateCriteria({ calendarMode: 'BS' })}
              className={`rounded-lg px-2.5 py-1 transition ${
                calendarMode === 'BS'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              BS
            </button>
            <button
              type="button"
              onClick={() => updateCriteria({ calendarMode: 'AD' })}
              className={`rounded-lg px-2.5 py-1 transition ${
                calendarMode === 'AD'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              AD
            </button>
          </div>
        </div>

        {/* Right Side: Direct Filter Pills & More Filters Drawer Trigger */}
        <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
          {/* Territory Direct Dropdown */}
          {!hidePlaces && (
            <div className="relative">
              <select
                value={criteria.valley || 'ALL'}
                onChange={(e) =>
                  updateCriteria({
                    valley: e.target.value as 'ALL' | 'Inside' | 'Outside',
                  })
                }
                className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer appearance-none pr-7 ${
                  criteria.valley && criteria.valley !== 'ALL'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <option value="ALL">📍 Territory: All Nepal</option>
                <option value="Inside">📍 Inside Valley</option>
                <option value="Outside">📍 Outside Valley</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
          )}

          {/* Officer Direct Dropdown */}
          {!hideOfficer && (
            <div className="relative hidden sm:block">
              <select
                value={criteria.officerId || ''}
                onChange={(e) => updateCriteria({ officerId: e.target.value || undefined })}
                className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer appearance-none pr-7 ${
                  criteria.officerId
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <option value="">👤 Field Rep: All</option>
                {salesOfficers.map((o) => (
                  <option key={o.id} value={o.id}>
                    👤 {o.fullName}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
          )}

          {/* More Filters Drawer Button */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition shadow-2xs active:scale-98 ${
              activeFilterCount > 0
                ? 'border-blue-600 bg-blue-600 text-white shadow-blue-500/20'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 rounded-full bg-white text-blue-700 px-1.5 py-0.2 text-[10px] font-black">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Reset All Link */}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              title="Reset all filters"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ACTIVE FILTERS SUMMARY DISMISSIBLE CHIPS */}
      {/* ========================================================================= */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap px-1 text-xs">
          <span className="text-[11px] font-semibold text-slate-400">Active:</span>

          {criteria.valley && criteria.valley !== 'ALL' && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-bold text-blue-800">
              <span>Territory: {criteria.valley} Valley</span>
              <button
                type="button"
                onClick={() => updateCriteria({ valley: 'ALL' })}
                className="hover:text-blue-950 ml-0.5"
              >
                ✕
              </button>
            </span>
          )}

          {criteria.officerId && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-bold text-indigo-800">
              <span>
                Officer: {users.find((u) => u.id === criteria.officerId)?.fullName || 'Selected'}
              </span>
              <button
                type="button"
                onClick={() => updateCriteria({ officerId: undefined })}
                className="hover:text-indigo-950 ml-0.5"
              >
                ✕
              </button>
            </span>
          )}

          {criteria.outletType && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
              <span>Outlet: {criteria.outletType}</span>
              <button
                type="button"
                onClick={() => updateCriteria({ outletType: undefined })}
                className="hover:text-emerald-950 ml-0.5"
              >
                ✕
              </button>
            </span>
          )}

          {criteria.month && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-800">
              <span>Month: {criteria.month}</span>
              <button
                type="button"
                onClick={() => updateCriteria({ month: undefined })}
                className="hover:text-amber-950 ml-0.5"
              >
                ✕
              </button>
            </span>
          )}

          {criteria.dayOfWeek && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-purple-50 border border-purple-200 px-2 py-0.5 text-[11px] font-bold text-purple-800">
              <span>Day: {criteria.dayOfWeek}</span>
              <button
                type="button"
                onClick={() => updateCriteria({ dayOfWeek: undefined })}
                className="hover:text-purple-950 ml-0.5"
              >
                ✕
              </button>
            </span>
          )}

          {criteria.dateExact && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-800">
              <span>Date: {criteria.dateExact}</span>
              <button
                type="button"
                onClick={() => updateCriteria({ dateExact: undefined })}
                className="hover:text-slate-950 ml-0.5"
              >
                ✕
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={clearAllFilters}
            className="text-[11px] font-bold text-rose-600 hover:underline ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SPACIOUS SLIDE-OUT DRAWER (COMFORTABLE 1-COL & 2-COL LAYOUT) */}
      {/* ========================================================================= */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] md:w-[500px] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Multi-Dimensional Dashboard Slicer
                </h3>
                {activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                    {activeFilterCount} Active
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                aria-label="Close filter drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Filters Content */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 bg-white">
              {/* SECTION 1: DATE & CALENDAR DIMENSION */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    Date, Day &amp; Calendar Dimension
                  </span>
                  <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => updateCriteria({ calendarMode: 'BS' })}
                      className={`px-2 py-0.5 rounded transition ${
                        calendarMode === 'BS' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      Bikram Sambat (BS)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCriteria({ calendarMode: 'AD' })}
                      className={`px-2 py-0.5 rounded transition ${
                        calendarMode === 'AD' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      AD (Gregorian)
                    </button>
                  </div>
                </div>

                {/* Day of Week Selector */}
                {!hideDayOfWeek && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Day of Week (Beat Plan Route):
                    </label>
                    <div className="grid grid-cols-7 gap-1.5">
                      {DAYS_OF_WEEK.map((d) => {
                        const isSelected = criteria.dayOfWeek === d.key;
                        return (
                          <button
                            key={d.key}
                            type="button"
                            onClick={() =>
                              updateCriteria({
                                dayOfWeek: isSelected ? undefined : d.key,
                                dateExact: undefined,
                              })
                            }
                            className={`px-1.5 py-1.5 rounded-lg text-xs font-semibold border transition-all text-center ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <div className="leading-tight text-[11px] font-bold">{d.short}</div>
                            <div
                              className={`text-[9px] font-normal ${
                                isSelected ? 'text-blue-100' : 'text-slate-400'
                              }`}
                            >
                              {d.np}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Month & Year (Spacious 2-Col Grid) */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Month ({calendarMode}):
                    </label>
                    <select
                      value={criteria.month || ''}
                      onChange={(e) => updateCriteria({ month: e.target.value || undefined })}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">All Months</option>
                      {calendarMode === 'BS'
                        ? NEPALI_MONTHS.map((m) => (
                            <option key={m.en} value={m.en}>
                              {m.en} ({m.np})
                            </option>
                          ))
                        : [
                            'January',
                            'February',
                            'March',
                            'April',
                            'May',
                            'June',
                            'July',
                            'August',
                            'September',
                            'October',
                            'November',
                            'December',
                          ].map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Year ({calendarMode}):
                    </label>
                    <select
                      value={criteria.year || ''}
                      onChange={(e) => updateCriteria({ year: e.target.value || undefined })}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">All Years</option>
                      {(calendarMode === 'BS' ? BS_YEARS : AD_YEARS).map((y) => (
                        <option key={y} value={y}>
                          {y} {calendarMode === 'BS' ? 'BS' : 'AD'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Specific Date or Custom Date Range (Comfortable Inputs) */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Custom Range (From):
                    </label>
                    <input
                      type="date"
                      value={criteria.dateFrom || ''}
                      onChange={(e) =>
                        updateCriteria({
                          dateFrom: e.target.value || undefined,
                          dateExact: undefined,
                        })
                      }
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Custom Range (To):
                    </label>
                    <input
                      type="date"
                      value={criteria.dateTo || ''}
                      onChange={(e) =>
                        updateCriteria({
                          dateTo: e.target.value || undefined,
                          dateExact: undefined,
                        })
                      }
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: TERRITORY & GEOGRAPHY DIMENSION */}
              {!hidePlaces && (
                <div className="space-y-3.5 border-t border-slate-100 pt-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    Territory, Province &amp; City Dimension
                  </span>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Valley Scope:
                    </label>
                    <select
                      value={criteria.valley || 'ALL'}
                      onChange={(e) =>
                        updateCriteria({
                          valley: e.target.value as 'ALL' | 'Inside' | 'Outside',
                        })
                      }
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                    >
                      <option value="ALL">All Nepal (Inside &amp; Outside Valley)</option>
                      <option value="Inside">Inside Valley (Kathmandu Ring Road)</option>
                      <option value="Outside">Outside Valley (Outstation Hubs)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Province:
                      </label>
                      <select
                        value={criteria.province || ''}
                        onChange={(e) =>
                          updateCriteria({ province: e.target.value || undefined })
                        }
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                      >
                        <option value="">All Provinces</option>
                        {PROVINCES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        City / Hub:
                      </label>
                      <select
                        value={criteria.city || ''}
                        onChange={(e) =>
                          updateCriteria({ city: e.target.value || undefined })
                        }
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                      >
                        <option value="">All Cities</option>
                        {CITIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: OUTLET & ASSIGNED SALES PERSONNEL */}
              <div className="space-y-3.5 border-t border-slate-100 pt-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  Outlet Type &amp; Field Force Dimension
                </span>

                {!hideOutletType && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Outlet Classification:
                    </label>
                    <select
                      value={criteria.outletType || ''}
                      onChange={(e) =>
                        updateCriteria({ outletType: e.target.value || undefined })
                      }
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                    >
                      <option value="">All Outlet Types</option>
                      {OUTLET_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!hideOfficer && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Assigned Field Sales Officer:
                    </label>
                    <select
                      value={criteria.officerId || ''}
                      onChange={(e) =>
                        updateCriteria({ officerId: e.target.value || undefined })
                      }
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
                    >
                      <option value="">All Sales Officers</option>
                      {salesOfficers.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.fullName} ({o.territory || 'Field Rep'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Sticky Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                Reset All
              </button>

              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs transition active:scale-98"
              >
                Apply &amp; Close Slicer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
