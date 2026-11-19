'use client';

import Money from '@/components/common/Money';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { db, OrderRealtimeEvent } from '@/lib/db/db-service';
import { syncManager } from '@/lib/offline-sync';
import { canPerform, hasAccess } from '@/lib/permissions';
import { dayNumbers, displayDocumentId, matchesDocumentId } from '@/lib/document-ids';
import { phoneDigits } from '@/lib/customer-lookup';
import OrderStatusControl from '@/components/orders/OrderStatusControl';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { bsLabel } from '@/components/common/DualDateField';
import { getBrands } from '@/lib/db/brands-service';
import { Order, BrandCode } from '@/lib/types';
import {
  getTodayAd,
  shiftAdDate,
  getTodayBs,
  adToBs,
  bsToAd,
} from '@/lib/nepali-calendar';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { toast } from '@/components/common/Toast';
import {
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ShoppingBag,
  Gift,
  Pencil,
  Trash2,
  ExternalLink,
  Users,
  TrendingUp,
  Package,
  Layers,
  Clock,
  Radio,
  X,
  Check,
  AlertTriangle,
  FileSpreadsheet,
  Calendar,
  Search,
} from 'lucide-react';

export default function DailyOrdersPage() {
  const { preference } = useCalendarPreference();
  const [sortOrder, setSortOrder] = useState<'OLDEST' | 'NEWEST'>('OLDEST');
  const [selectedDateAd, setSelectedDateAd] = useState<string>(getTodayAd());
  const [brandFilter, setBrandFilter] = useState<BrandCode>('ALL');
  const [activeTab, setActiveTab] = useState<'ORDERS' | 'BREAKDOWN'>('ORDERS');
  // Find a row by short ID (0421, for0421, FOR-0421, or the old long ID), phone or name. Counts are not affected.
  const [findQuery, setFindQuery] = useState('');

  // Real-time order collection
  const [orders, setOrders] = useState<Order[]>([]);
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<string>>(new Set());
  const [recentlyInsertedIds, setRecentlyInsertedIds] = useState<Set<string>>(new Set());

  // Active online staff presence
  const onlineStaffCount = db.getUsers().filter((u) => u.dutyStatus === 'ONLINE').length;
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'OFFLINE'>('CONNECTED');

  // Delete modal state
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  // Active brands
  const brands = useMemo(() => db.getBrands('ACTIVE'), []);

  // The selected day, shown in the user's chosen calendar. Both calendars are stored on every order.
  const formattedDateAd = useMemo(() => {
    const [y, m, d] = selectedDateAd.split('-').map(Number);
    const ad = new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const bs = bsLabel(selectedDateAd);
    return preference === 'AD' ? ad : preference === 'BOTH' ? `${bs} (${ad})` : bs;
  }, [selectedDateAd, preference]);

  const isToday = selectedDateAd === getTodayAd();

  // Load orders for selected date
  const loadOrders = () => {
    const all = db.getOrders();
    const dayOrders = all.filter((o) => o.orderDateAd === selectedDateAd);
    setOrders(dayOrders);
  };

  useEffect(() => {
    loadOrders();
    window.addEventListener('bb-db-updated', loadOrders);
    return () => {
      window.removeEventListener('bb-db-updated', loadOrders);
    };
  }, [selectedDateAd]);

  // Real-time subscription (Fix 68b)
  useEffect(() => {
    // Only subscribe to real-time events when viewing today's date
    if (!isToday) return;

    const unsubscribe = db.subscribeToOrders((event: OrderRealtimeEvent) => {
      if (event.eventType === 'INSERT' && event.new) {
        if (event.new.orderDateAd === selectedDateAd) {
          const inserted = event.new;
          setOrders((prev) => [inserted, ...prev.filter((o) => o.id !== inserted.id)]);
          setRecentlyInsertedIds((prev) => new Set(prev).add(inserted.id));
          toast.info(
            `New order — ${inserted.customerName}`,
            `${inserted.brandCode} · ${inserted.items?.length || 1} item(s)`
          );
          setTimeout(() => {
            setRecentlyInsertedIds((prev) => {
              const next = new Set(prev);
              next.delete(inserted.id);
              return next;
            });
          }, 3000);
        }
      } else if (event.eventType === 'UPDATE' && event.new) {
        const updated = event.new;
        // An edited order whose date moved to another day leaves this list; one moved onto this day joins it.
        setOrders((prev) => updated.orderDateAd !== selectedDateAd
          ? prev.filter((o) => o.id !== updated.id)
          : prev.some((o) => o.id === updated.id) ? prev.map((o) => (o.id === updated.id ? updated : o)) : [updated, ...prev]);
        setRecentlyUpdatedIds((prev) => new Set(prev).add(updated.id));
        setTimeout(() => {
          setRecentlyUpdatedIds((prev) => {
            const next = new Set(prev);
            next.delete(updated.id);
            return next;
          });
        }, 3000);
      } else if (event.eventType === 'DELETE' && event.old) {
        setOrders((prev) => prev.filter((o) => o.id !== event.old?.id));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isToday, selectedDateAd]);

  // Quick Day Cycling [ ← ] [ → ]
  const handleShiftDay = (direction: -1 | 1) => {
    setSelectedDateAd(date => shiftAdDate(date, direction));
  };

  // Day numbers: 1 for the first order created that day, counted across every brand.
  // Display only, so the team can cross-check message by message against the order group.
  const dayNumberOf = useMemo(() => dayNumbers(orders), [orders]);

  // Filtered orders by brand, in day-number order.
  const filteredOrders = useMemo(() => {
    const list = brandFilter === 'ALL' ? orders : orders.filter((o) => o.brandCode === brandFilter);
    return [...list].sort((a, b) => ((dayNumberOf.get(a.id) || 0) - (dayNumberOf.get(b.id) || 0)) * (sortOrder === 'OLDEST' ? 1 : -1));
  }, [orders, brandFilter, dayNumberOf, sortOrder]);

  // Marketing sends are not orders and never reach this page (see db.getOrders).
  const commercialOrders = filteredOrders;
  const visibleOrders = useMemo(() => {
    const term = findQuery.trim();
    if (!term) return filteredOrders;
    const digits = phoneDigits(term);
    const text = term.toLowerCase();
    return filteredOrders.filter((o) => matchesDocumentId(term, o.orderNumber, o.legacyOrderNumber, o.id)
      || (digits.length >= 4 && /^[\d\s+()-]+$/.test(term) && phoneDigits(o.customerPhone).includes(digits))
      || (/[a-z]/i.test(text) && (o.customerName || '').toLowerCase().includes(text)));
  }, [filteredOrders, findQuery]);
  const comboIds = useMemo(() => new Set(db.getCombos('ALL').map((combo) => combo.id)), [orders]);

  // Brand count stats
  const brandStats = useMemo(() => {
    const stats: Record<string, number> = {};
    orders.forEach((o) => { stats[o.brandCode] = (stats[o.brandCode] || 0) + 1; });
    return stats;
  }, [orders]);

  // Quick stats footer metrics (Fix 68e)
  const statsFooter = useMemo(() => {
    const totalCommercial = commercialOrders.length;
    const totalUnits = commercialOrders.reduce(
      (sum, ord) => sum + ord.items.reduce((iSum, it) => iSum + (it.isGift ? 0 : it.quantity), 0),
      0
    );

    const brandCount = new Set(commercialOrders.map(order => order.brandCode)).size;

    const instaCount = commercialOrders.filter((o) => o.platform === 'Instagram').length;
    const instaPct = totalCommercial > 0 ? Math.round((instaCount / totalCommercial) * 100) : 0;

    const repeatCount = commercialOrders.filter((o) => o.orderType === 'REPEAT').length;
    const repeatPct = totalCommercial > 0 ? Math.round((repeatCount / totalCommercial) * 100) : 0;

    return {
      totalCommercial,
      totalUnits,
      brandCount,
      instaPct,
      repeatPct,
    };
  }, [commercialOrders]);

  // Product breakdown calculation (Fix 68f)
  const productBreakdown = useMemo(() => {
    const map = new Map<string, { product: string; brand: BrandCode; units: number; ordersCount: number }>();

    commercialOrders.forEach((ord) => {
      ord.items.forEach((it) => {
        // Free gifts are listed apart so they never look like units sold.
        const key = `${ord.brandCode}_${it.productName}${it.isGift ? '_gift' : ''}`;
        const existing = map.get(key) || {
          product: it.isGift ? `${it.productName} (free gift)` : it.productName,
          brand: ord.brandCode,
          units: 0,
          ordersCount: 0,
        };
        existing.units += it.quantity;
        existing.ordersCount += 1;
        map.set(key, existing);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.units - a.units);
  }, [commercialOrders]);

  // Combo breakdown calculation (Fix 68f)
  const comboBreakdown = useMemo(() => {
    const map = new Map<string, { combo: string; brand: BrandCode; units: number }>();
    let totalCombos = 0;

    commercialOrders.forEach((ord) => {
      ord.items.forEach((it) => {
        const isCombo = comboIds.has(it.productId);
        if (isCombo) {
          const key = `${ord.brandCode}_${it.productName}`;
          const existing = map.get(key) || {
            combo: it.productName,
            brand: ord.brandCode,
            units: 0,
          };
          existing.units += it.quantity;
          totalCombos += it.quantity;
          map.set(key, existing);
        }
      });
    });

    return Array.from(map.values()).map((c) => ({
      ...c,
      pctOfCombos: totalCombos > 0 ? Math.round((c.units / totalCombos) * 100) : 0,
    }));
  }, [commercialOrders, comboIds]);

  const [deleting, setDeleting] = useState(false);
  const handleDeleteConfirmed = async () => {
    if (!orderToDelete || deleting) return;
    setDeleting(true);
    try {
      db.deleteOrder(orderToDelete.id);
      try { await syncManager.forceSyncNow(); } catch { /* The deletion stays in the sync queue. */ }
      toast.info(`Deleted order ${displayDocumentId(orderToDelete.orderNumber)}`, 'Customer totals are recounted automatically.');
      setOrderToDelete(null);
      loadOrders();
    } finally { setDeleting(false); }
  };

  return (
    <PageGuard feature="orderflow">
      <div className="space-y-6 pb-24 max-w-7xl mx-auto">
        <Breadcrumbs
          items={[
            { label: 'Orderflow', href: '/orderflow/extractor' },
            { label: 'Daily Orders Cross-Check' },
          ]}
        />

        {/* Live Header & Date Switcher Bar (Fix 68b & 68c) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Daily Orders
                </h1>
                {/* Live indicator badge */}
                {isToday ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700" title="New orders appear as they are saved, and the list refreshes every minute">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    Today{onlineStaffCount > 0 ? ` · ${onlineStaffCount} online` : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                    <Clock className="h-3 w-3" /> Past day
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Real-time synchronized order stream for instant cross-checking against the WhatsApp group without refreshing.
              </p>
            </div>

            {/* Date cycling controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleShiftDay(-1)}
                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="relative flex min-h-[44px] items-center gap-2 px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer transition focus-within:ring-2 focus-within:ring-blue-500">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-bold text-slate-800">{formattedDateAd}</span>
                <input
                  type="date"
                  aria-label="Choose order date"
                  value={selectedDateAd}
                  onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* Native date input remains available. */ } }}
                  onChange={(e) => { if (e.target.value) setSelectedDateAd(e.target.value); }}
                  className="w-full h-full opacity-0 absolute inset-0 cursor-pointer"
                />
              </div>

              <button
                onClick={() => handleShiftDay(1)}
                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {!isToday && (
                <button
                  onClick={() => setSelectedDateAd(getTodayAd())}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold hover:bg-blue-100 transition"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {/* Brand & Tally Stats Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-3 border-t border-slate-100">
            {/* Brand Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold">
              <button
                onClick={() => setBrandFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition ${
                  brandFilter === 'ALL'
                    ? 'bg-slate-900 text-white font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Brands ({orders.length})
              </button>
              {brands.map((b) => (
                <button
                  key={b.code}
                  onClick={() => setBrandFilter(b.code)}
                  className={`px-3 py-1 rounded-lg transition ${
                    brandFilter === b.code
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {b.name} ({orders.filter((o) => o.brandCode === b.code).length})
                </button>
              ))}
            </div>

            {/* Counts Summary */}
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>
                <strong>Total Orders:</strong>{' '}
                <span className="font-bold text-slate-900">{commercialOrders.length}</span>
              </span>
              <span className="text-slate-300">|</span>
              {getBrands('ACTIVE').map((b) => (
                <span key={b.code}>
                  {b.name}: <strong>{brandStats[b.code] || 0}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* View Toggle Tabs: Orders Table vs Breakdown */}
        <div role="tablist" aria-label="Daily orders view" className="inline-flex items-center gap-1 rounded-xl bg-slate-200/70 p-1 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('ORDERS')}
            role="tab" aria-selected={activeTab === 'ORDERS'}
            className={`px-4 py-2 rounded-lg transition ${
              activeTab === 'ORDERS'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Order Cross-Check Table ({findQuery.trim() ? `${visibleOrders.length} of ${filteredOrders.length}` : filteredOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('BREAKDOWN')}
            role="tab" aria-selected={activeTab === 'BREAKDOWN'}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'BREAKDOWN'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Product &amp; Combo Breakdown ({productBreakdown.length})
          </button>
        </div>

        {activeTab === 'ORDERS' && filteredOrders.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
            <label className="relative w-full max-w-xs">
              <span className="sr-only">Find an order on this day</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input type="search" value={findQuery} onChange={(event) => setFindQuery(event.target.value)} placeholder="Find by order ID, phone or name"
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
            {filteredOrders.length > 1 && <div className="flex items-center gap-2">
            <span>Order of rows</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Order of rows">
              {([['OLDEST', 'Day # 1 first'], ['NEWEST', 'Newest first']] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={sortOrder === value} onClick={() => setSortOrder(value)} className={`rounded-md px-2.5 py-1 font-bold transition ${sortOrder === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>
              ))}
            </div>
            </div>}
          </div>
        )}

        {/* TAB 1: Real-Time Orders Cross-Check Table */}
        {activeTab === 'ORDERS' && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            {filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                No orders recorded for <strong className="font-mono text-slate-600">{selectedDateAd}</strong>. Use the date arrows above to inspect other dates.
              </div>
            ) : visibleOrders.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No order on this day matches <strong className="font-mono text-slate-700">{findQuery.trim()}</strong>.{' '}
                <button type="button" onClick={() => setFindQuery('')} className="font-bold text-blue-700 hover:underline">Clear</button>
                <span className="mt-1 block text-[11px] text-slate-500">To search every date, press Ctrl+K (⌘K on Mac) and type the order ID.</span>
              </div>
            ) : (
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                    <tr>
                      <th className="py-3 px-3" title="Day number: the order's position among today's orders">Day #</th>
                      <th className="py-3 px-3">Order ID</th>
                      <th className="py-3 px-3">Time</th>
                      <th className="py-3 px-3">Brand</th>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Phone</th>
                      <th className="py-3 px-3">Platform</th>
                      <th className="py-3 px-3">Products</th>
                      <th className="py-3 px-3 text-center">Qty</th>
                      <th className="py-3 px-3">Combo?</th>
                      <th className="py-3 px-3 text-right">Total MRP</th>
                      <th className="py-3 px-3 text-right">Stated</th>
                      <th className="py-3 px-3">Payment</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Source</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {visibleOrders.map((ord) => {
                      const isInserted = recentlyInsertedIds.has(ord.id);
                      const isUpdated = recentlyUpdatedIds.has(ord.id);
                      const totalQty = ord.items.reduce((sum, it) => sum + (it.isGift ? 0 : it.quantity), 0);

                      // Combos in this order (each listed once)
                      const comboNames = [...new Set(ord.items.filter((i) => comboIds.has(i.productId)).map((i) => i.productName))];

                      return (
                        <tr
                          key={ord.id}
                          className={`transition-colors duration-500 ${
                            isInserted
                              ? 'bg-emerald-50/80 animate-pulse'
                              : isUpdated
                              ? 'bg-amber-50/80'
                              : 'hover:bg-slate-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center text-sm font-black text-slate-900">{dayNumberOf.get(ord.id)}</td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <Link href={`/orderflow/orders/${ord.id}`} className="font-mono font-bold text-blue-700 hover:underline">{displayDocumentId(ord.orderNumber)}</Link>
                            {(ord.editHistory?.length || 0) > 0 && <span className="ml-1.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200" title="This order has been edited">Edited</span>}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] text-slate-500">
                            {ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              {ord.brandCode}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-slate-900 block">
                              {ord.customerName}
                            </span>
                            <span className="text-[10px] text-slate-500 block truncate max-w-[140px]">
                              {ord.address}
                            </span>
                            <span className="text-[10px] text-slate-500 block">{[ord.district, ord.province].filter(Boolean).join(', ') || 'City and province not added'}</span>
                            <span className="text-[10px] text-slate-500 block">Responsible: {ord.assignedToName || 'Not assigned'}</span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600">
                            {ord.customerPhone}
                            {ord.alternatePhone && <span className="block text-slate-500">Alt: {ord.alternatePhone}</span>}
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-slate-700">{ord.platform}</span>
                          </td>
                          <td className="py-3 px-3 max-w-xs">
                            {ord.items.map((it, i) => (
                              <div key={i} className="truncate text-slate-700">
                                {it.productName}{' '}
                                {it.quantity > 1 && (
                                  <span className="text-slate-500 font-bold">×{it.quantity}</span>
                                )}
                              </div>
                            ))}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-800">
                            {totalQty}
                          </td>
                          <td className="py-3 px-3 min-w-[9rem] max-w-[12rem]">
                            {comboNames.length ? (
                              <div className="flex flex-col items-start gap-1">
                                {comboNames.map((name) => (
                                  // A block badge wraps as one box, so a long combo name never breaks its border.
                                  <span key={name} title={name} className="inline-block max-w-full rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold leading-snug text-indigo-800 [overflow-wrap:anywhere]">
                                    {name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-500" aria-label="No combo">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-right font-bold text-slate-900">
                            <Money>{ord.totalAmount.toLocaleString()}</Money>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-right">
                            {ord.statedPrice ? (
                              <span
                                className={`font-semibold ${
                                  ord.statedPrice !== ord.totalAmount
                                    ? 'text-amber-600 font-bold'
                                    : 'text-slate-500'
                                }`}
                              >
                                <Money>{ord.statedPrice.toLocaleString()}</Money>
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                ord.paymentTerms === 'Prepaid' || ord.paymentTerms === 'Advance'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {ord.paymentTerms}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <OrderStatusControl order={ord} compact />
                          </td>
                          <td className="py-3 px-3 text-[11px] text-slate-500">
                            {ord.source === 'WHATSAPP_EXTRACTOR' ? 'Extractor' : ord.source === 'MANUAL' ? 'Manual' : 'Field'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {canPerform(db.getCurrentUser(), 'orderflow', 'EDIT') && <Link
                                href={`/orderflow/orders/${ord.id}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                                title="Edit every field of this order"
                                aria-label={`Edit order ${displayDocumentId(ord.orderNumber)}`}
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </Link>}
                              {hasAccess(db.getCurrentUser(), 'customers') && <Link
                                href={`/customers/${ord.customerPhone.replace(/\D/g, '')}`}
                                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                                title="Customer 360"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>}
                              {canPerform(db.getCurrentUser(), 'orderflow', 'DELETE') && <button
                                onClick={() => setOrderToDelete(ord)}
                                className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                                title="Delete Order"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Product & Combo Breakdown (Fix 68f) */}
        {activeTab === 'BREAKDOWN' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Product Breakdown Table */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                Product Breakdown ({productBreakdown.length} SKUs)
              </h2>

              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3">Brand</th>
                      <th className="py-2.5 px-3 text-right">Units</th>
                      <th className="py-2.5 px-3 text-right">Orders</th>
                      <th className="py-2.5 px-3 text-right">Avg/Order</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {productBreakdown.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{row.product}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {row.brand}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">{row.units}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{row.ordersCount}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {(row.units / row.ordersCount).toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Combo Breakdown Table */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600" />
                Combo &amp; Bundle Breakdown ({comboBreakdown.length} Combos)
              </h2>

              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Combo Name</th>
                      <th className="py-2.5 px-3">Brand</th>
                      <th className="py-2.5 px-3 text-right">Units Sold</th>
                      <th className="py-2.5 px-3 text-right">% of Combos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {comboBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          No promotional combos sold on this date.
                        </td>
                      </tr>
                    ) : (
                      comboBreakdown.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-semibold text-purple-900">{row.combo}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700">
                              {row.brand}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">{row.units}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-purple-700 font-bold">
                            {row.pctOfCombos}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Sticky Quick Stats Footer (Fix 68e) */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900 text-white border-t border-slate-800 px-4 py-2.5 shadow-xl text-xs">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <span>
                <strong>Day Tally:</strong> {statsFooter.totalCommercial} commercial orders ({statsFooter.totalUnits} units)
              </span>
              <span className="text-slate-600">|</span>
              <span>Brands represented: <strong>{statsFooter.brandCount}</strong></span>
              <span>Instagram: <strong>{statsFooter.instaPct}%</strong></span>
              <span>Repeat Customers: <strong>{statsFooter.repeatPct}%</strong></span>
            </div>

          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {orderToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-3 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">Delete Order?</h3>
              </div>
              <p className="text-xs text-slate-600">
                Are you sure you want to delete order{' '}
                <strong>{displayDocumentId(orderToDelete.orderNumber)}</strong> for {orderToDelete.customerName}? It leaves daily counts, the dashboard, the monthly sheet and this customer’s totals. This cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setOrderToDelete(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirmed}
                  disabled={deleting}
                  className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting…' : 'Delete Order'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageGuard>
  );
}
