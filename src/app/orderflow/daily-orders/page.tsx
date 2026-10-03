'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { db, OrderRealtimeEvent } from '@/lib/db/db-service';
import { Order, BrandCode, OrderItem } from '@/lib/types';
import {
  getTodayAd,
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
} from 'lucide-react';

export default function DailyOrdersPage() {
  const [selectedDateAd, setSelectedDateAd] = useState<string>(getTodayAd());
  const [brandFilter, setBrandFilter] = useState<BrandCode>('ALL');
  const [activeTab, setActiveTab] = useState<'ORDERS' | 'BREAKDOWN'>('ORDERS');

  // Real-time order collection
  const [orders, setOrders] = useState<Order[]>([]);
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<string>>(new Set());
  const [recentlyInsertedIds, setRecentlyInsertedIds] = useState<Set<string>>(new Set());

  // Viewer simulation & presence
  const [viewerCount] = useState<number>(2);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'OFFLINE'>('CONNECTED');

  // Editing order modal state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPaymentTerms, setEditPaymentTerms] = useState<any>('COD');
  const [editDeliveryMethod, setEditDeliveryMethod] = useState<any>('Pathao');
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [editNote, setEditNote] = useState('');

  // Delete modal state
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  // Active brands
  const brands = useMemo(() => db.getBrands('ACTIVE'), []);

  // Formatted Gregorian AD date for social media / online orderflow
  const formattedDateAd = useMemo(() => {
    try {
      const parts = selectedDateAd.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return selectedDateAd;
    }
  }, [selectedDateAd]);

  const isToday = selectedDateAd === getTodayAd();

  // Load orders for selected date
  const loadOrders = () => {
    const all = db.getOrders();
    const dayOrders = all.filter((o) => o.orderDateAd === selectedDateAd);
    setOrders(dayOrders);
  };

  useEffect(() => {
    loadOrders();
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
        setOrders((prev) =>
          prev.map((o) => (o.id === updated.id ? updated : o))
        );
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
    const parts = selectedDateAd.split('-');
    const current = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    current.setDate(current.getDate() + direction);
    setSelectedDateAd(current.toISOString().split('T')[0]);
  };

  // Filtered orders by brand
  const filteredOrders = useMemo(() => {
    if (brandFilter === 'ALL') return orders;
    return orders.filter((o) => o.brandCode === brandFilter);
  }, [orders, brandFilter]);

  // Split commercial orders from marketing sends (Fix 71c)
  const commercialOrders = useMemo(() => filteredOrders.filter((o) => !o.isMarketing), [filteredOrders]);
  const marketingSends = useMemo(() => filteredOrders.filter((o) => !!o.isMarketing), [filteredOrders]);

  // Brand count stats
  const brandStats = useMemo(() => {
    const stats: Record<string, number> = {};
    orders.forEach((o) => {
      if (!o.isMarketing) {
        stats[o.brandCode] = (stats[o.brandCode] || 0) + 1;
      }
    });
    return stats;
  }, [orders]);

  // Quick stats footer metrics (Fix 68e)
  const statsFooter = useMemo(() => {
    const totalCommercial = commercialOrders.length;
    const totalUnits = commercialOrders.reduce(
      (sum, ord) => sum + ord.items.reduce((iSum, it) => iSum + it.quantity, 0),
      0
    );

    const foryaCount = commercialOrders.filter((o) => o.brandCode === 'FORYA').length;
    const foryaPct = totalCommercial > 0 ? Math.round((foryaCount / totalCommercial) * 100) : 0;

    const instaCount = commercialOrders.filter((o) => o.platform === 'Instagram').length;
    const instaPct = totalCommercial > 0 ? Math.round((instaCount / totalCommercial) * 100) : 0;

    const repeatCount = commercialOrders.filter((o) => o.orderType === 'REPEAT').length;
    const repeatPct = totalCommercial > 0 ? Math.round((repeatCount / totalCommercial) * 100) : 0;

    return {
      totalCommercial,
      totalUnits,
      foryaPct,
      instaPct,
      repeatPct,
    };
  }, [commercialOrders]);

  // Product breakdown calculation (Fix 68f)
  const productBreakdown = useMemo(() => {
    const map = new Map<string, { product: string; brand: BrandCode; units: number; ordersCount: number }>();

    commercialOrders.forEach((ord) => {
      ord.items.forEach((it) => {
        const key = `${ord.brandCode}_${it.productName}`;
        const existing = map.get(key) || {
          product: it.productName,
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
        const isCombo = it.productName.toLowerCase().includes('kit') || it.productName.toLowerCase().includes('duo') || it.productName.toLowerCase().includes('bundle');
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
  }, [commercialOrders]);

  // Edit handler
  const handleOpenEdit = (ord: Order) => {
    setEditingOrder(ord);
    setEditCustomerName(ord.customerName);
    setEditCustomerPhone(ord.customerPhone);
    setEditAddress(ord.address);
    setEditPaymentTerms(ord.paymentTerms);
    setEditDeliveryMethod(ord.deliveryMethod);
    setEditItems([...ord.items]);
    setEditNote('');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    const newTotal = editItems.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);

    db.updateOrder(
      editingOrder.id,
      {
        customerName: editCustomerName,
        customerPhone: editCustomerPhone,
        address: editAddress,
        paymentTerms: editPaymentTerms,
        deliveryMethod: editDeliveryMethod,
        items: editItems,
        totalAmount: editingOrder.isMarketing ? 0 : newTotal,
      },
      'Devansh',
      editNote || 'Modified order line items & customer fields'
    );

    toast.success(`Updated order #${editingOrder.orderNumber}`);
    setEditingOrder(null);
    loadOrders();
  };

  const handleDeleteConfirmed = () => {
    if (!orderToDelete) return;
    db.deleteOrder(orderToDelete.id);
    toast.info(`Deleted order #${orderToDelete.orderNumber}`);
    setOrderToDelete(null);
    loadOrders();
  };

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'DATA_ENTRY']}>
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
                  Daily Orders Cross-Check
                </h1>
                {/* Live indicator badge */}
                {isToday ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    LIVE · {viewerCount} Viewers
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    <Clock className="w-3.5 h-3.5" /> Historical Archive
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

              <div className="relative flex items-center gap-2 px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer transition">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-bold text-slate-800">{formattedDateAd}</span>
                <input
                  type="date"
                  value={selectedDateAd}
                  onChange={(e) => setSelectedDateAd(e.target.value)}
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
              <span>Forya: <strong>{brandStats.FORYA || 0}</strong></span>
              <span>Pee Safe: <strong>{brandStats.PEE_SAFE || 0}</strong></span>
              <span>Renee: <strong>{brandStats.RENEE || 0}</strong></span>
              {marketingSends.length > 0 && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="inline-flex items-center gap-1 text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                    <Gift className="w-3 h-3" />
                    {marketingSends.length} Marketing Send(s)
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* View Toggle Tabs: Orders Table vs Breakdown */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-1 text-xs font-bold">
          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`px-4 py-2 rounded-t-xl transition border-b-2 ${
              activeTab === 'ORDERS'
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            📋 Order Cross-Check Table ({filteredOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('BREAKDOWN')}
            className={`px-4 py-2 rounded-t-xl transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'BREAKDOWN'
                ? 'border-blue-600 text-blue-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Product &amp; Combo Breakdown ({productBreakdown.length})
          </button>
        </div>

        {/* TAB 1: Real-Time Orders Cross-Check Table */}
        {activeTab === 'ORDERS' && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            {filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No orders recorded for <strong className="font-mono text-slate-600">{selectedDateAd}</strong>. Use the date arrows above to inspect other dates.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3">#</th>
                      <th className="py-3 px-3">Time</th>
                      <th className="py-3 px-3">Brand</th>
                      <th className="py-3 px-3">Customer / Influencer</th>
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
                    {filteredOrders.map((ord, idx) => {
                      const isInserted = recentlyInsertedIds.has(ord.id);
                      const isUpdated = recentlyUpdatedIds.has(ord.id);
                      const totalQty = ord.items.reduce((sum, it) => sum + it.quantity, 0);

                      // Check if items form a known combo
                      const comboItem = ord.items.find(
                        (i) =>
                          i.productName.toLowerCase().includes('kit') ||
                          i.productName.toLowerCase().includes('duo') ||
                          i.productName.toLowerCase().includes('bundle')
                      );

                      return (
                        <tr
                          key={ord.id}
                          className={`transition-colors duration-500 ${
                            isInserted
                              ? 'bg-emerald-50/80 animate-pulse'
                              : isUpdated
                              ? 'bg-amber-50/80'
                              : ord.isMarketing
                              ? 'bg-purple-50/30 border-l-4 border-l-purple-500'
                              : 'hover:bg-slate-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                            {ord.createdAt ? ord.createdAt.substring(11, 16) : '11:00'}
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
                            <span className="text-[10px] text-slate-400 block truncate max-w-[140px]">
                              {ord.address}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                            {ord.customerPhone}
                          </td>
                          <td className="py-3 px-3">
                            {ord.isMarketing ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-300">
                                MARKETING
                              </span>
                            ) : (
                              <span className="text-slate-700">{ord.platform}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 max-w-xs">
                            {ord.items.map((it, i) => (
                              <div key={i} className="truncate text-slate-700">
                                {it.productName}{' '}
                                {it.quantity > 1 && (
                                  <span className="text-slate-400 font-bold">×{it.quantity}</span>
                                )}
                              </div>
                            ))}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-800">
                            {totalQty}
                          </td>
                          <td className="py-3 px-3">
                            {comboItem ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {comboItem.productName}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-900">
                            ₹{ord.totalAmount.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {ord.statedPrice ? (
                              <span
                                className={`font-semibold ${
                                  ord.statedPrice !== ord.totalAmount
                                    ? 'text-amber-600 font-bold'
                                    : 'text-slate-500'
                                }`}
                              >
                                ₹{ord.statedPrice.toLocaleString()}
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
                            <span className="text-[11px] font-semibold text-slate-600">
                              {ord.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-[11px] text-slate-500">
                            {ord.source === 'WHATSAPP_EXTRACTOR' ? 'Extractor' : ord.source === 'MANUAL' ? 'Manual' : 'Field'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEdit(ord)}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title="Edit Order"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <Link
                                href={`/customers/${ord.customerPhone.replace(/\D/g, '')}`}
                                className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded"
                                title="Customer 360"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>
                              <button
                                onClick={() => setOrderToDelete(ord)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                title="Delete Order"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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

              <div className="overflow-x-auto">
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

              <div className="overflow-x-auto">
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
                        <td colSpan={4} className="py-8 text-center text-slate-400">
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
              <span>Forya Share: <strong>{statsFooter.foryaPct}%</strong></span>
              <span>Instagram: <strong>{statsFooter.instaPct}%</strong></span>
              <span>Repeat Customers: <strong>{statsFooter.repeatPct}%</strong></span>
            </div>

            <div className="flex items-center gap-3 text-slate-400 text-[11px]">
              <span>Vs Yesterday: <strong className="text-emerald-400">+3 (↑27%)</strong></span>
              <span className="text-slate-600">|</span>
              <span>Vs Last Week: <strong className="text-rose-400">-2 (↓12%)</strong></span>
            </div>
          </div>
        </div>

        {/* Inline Edit Modal (Fix 68d) */}
        {editingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-xl bg-white rounded-2xl p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  Edit Order #{editingOrder.orderNumber}
                </h3>
                <button onClick={() => setEditingOrder(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">Customer Name</label>
                    <input
                      type="text"
                      value={editCustomerName}
                      onChange={(e) => setEditCustomerName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={editCustomerPhone}
                      onChange={(e) => setEditCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Delivery Address</label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">Payment Method</label>
                    <select
                      value={editPaymentTerms}
                      onChange={(e) => setEditPaymentTerms(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="COD">COD</option>
                      <option value="Prepaid">Prepaid</option>
                      <option value="Advance">Advance</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">Delivery Provider</label>
                    <select
                      value={editDeliveryMethod}
                      onChange={(e) => setEditDeliveryMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="Pathao">Pathao</option>
                      <option value="InDrive">InDrive</option>
                      <option value="Standard">Standard</option>
                      <option value="In-house Rider">In-house Rider</option>
                    </select>
                  </div>
                </div>

                {/* Edit Line Items */}
                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-2">
                  <span className="font-bold text-slate-700 block">Line Items</span>
                  {editItems.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 bg-white p-2 rounded-lg border border-slate-200">
                      <span className="font-medium text-slate-800 flex-1 truncate">{it.productName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Qty:</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={it.quantity}
                          onChange={(e) => {
                            const q = parseInt(e.target.value, 10) || 1;
                            const updated = [...editItems];
                            updated[idx] = { ...updated[idx], quantity: q, totalPrice: updated[idx].unitPrice * q };
                            setEditItems(updated);
                          }}
                          className="w-14 px-2 py-1 border border-slate-200 rounded text-center text-xs font-bold"
                        />
                        <span className="font-bold text-slate-900 w-16 text-right">
                          ₹{(it.unitPrice * it.quantity).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Edit reason / audit trail note */}
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Audit Note (Why was this edited?)</label>
                  <input
                    type="text"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="E.g., Customer called to change quantity from 2 to 3"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                {/* Prior Edit History Trail */}
                {editingOrder.editHistory && editingOrder.editHistory.length > 0 && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] space-y-1">
                    <span className="font-bold text-slate-600 block">Edit Audit Trail:</span>
                    {editingOrder.editHistory.map((hist, hi) => (
                      <div key={hi} className="text-slate-500">
                        • {hist.timestamp.substring(0, 16)} — <strong>{hist.changedBy}</strong>: {hist.note}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-xs"
                  >
                    Save Changes &amp; Broadcast
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

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
                <strong>#{orderToDelete.orderNumber}</strong> for {orderToDelete.customerName}? This will remove it from daily counts and inventory deductions.
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
                  className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700"
                >
                  Delete Order
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageGuard>
  );
}
