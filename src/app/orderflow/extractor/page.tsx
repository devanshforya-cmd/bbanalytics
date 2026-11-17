'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { isSellableCombo } from '@/lib/product-catalog';
import { db } from '@/lib/db/db-service';
import NepalLocationFields from '@/components/common/NepalLocationFields';
import { canPerform, d2cAssignees } from '@/lib/permissions';
import { useOrderOptions } from '@/hooks/useOrderOptions';
import { extractorCSV, followUpDates } from '@/lib/extractor-export';
import { downloadCSV } from '@/lib/csv';
import { activeOrderOptionNames, assertActiveOrderOption } from '@/lib/order-options';
import {
  extractOrdersDynamically,
  validateExtractedOrder,
  extractedOrderTotal,
  splitMessageBlocks,
  ExtractedOrderResult,
  ExtractedProductItem,
  Confidence,
} from '@/lib/whatsapp-extractor';
import { getTodayAd } from '@/lib/nepali-calendar';
import { BrandCode } from '@/lib/types';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { toast } from '@/components/common/Toast';
import {
  Sparkles,
  Pencil,
  CheckCircle,
  AlertCircle,
  XCircle,
  Trash2,
  ExternalLink,
  Plus,
  Minus,
  ArrowRight,
  RefreshCw,
  Clock,
  UserCheck,
  ShoppingBag,
  Check,
  X,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';

export interface ExtractionHistoryItem {
  id: string;
  timestamp: string;
  customerName: string;
  customerPhone: string;
  brandCode: BrandCode;
  productSummary: string;
  totalAmount: number;
  status: 'PUSHED' | 'DISCARDED';
  orderNumber?: string;
  rawText?: string;
}

const BRAND_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ALL: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
};

export default function ExtractorPage() {
  const orderOptions = useOrderOptions();
  const channels = activeOrderOptionNames(orderOptions, 'channels');
  const deliveryMethods = activeOrderOptionNames(orderOptions, 'deliveryMethods');
  const sourceChannel = channels.find(channel => channel.toLowerCase() === 'instagram') || '';
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [chatText, setChatText] = useState('');
  const [extractedOrders, setExtractedOrders] = useState<ExtractedOrderResult[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Date controls (Fix 67h)
  const [dateMode, setDateMode] = useState<'AUTO' | 'OVERRIDE'>('AUTO');
  const [overrideDateAd, setOverrideDateAd] = useState(getTodayAd());

  // Template toggle (Fix 67i)
  const [showTemplate, setShowTemplate] = useState(false);

  const [catalogRevision, setCatalogRevision] = useState(0);
  const catalogStatus = useMemo(() => ({ brands: db.getBrands('ACTIVE').length }), [catalogRevision]);

  const [activeCatalogProducts, setActiveCatalogProducts] = useState(db.getProducts().filter((p) => p.active !== false));
  const [activeCatalogCombos, setActiveCatalogCombos] = useState(db.getCombos().filter(combo => isSellableCombo(combo, db.getProducts())));

  // Push confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pushMode, setPushMode] = useState<'ALL' | 'SELECTED'>('ALL');
  const [pushedSummary, setPushedSummary] = useState<{ count: number; orderNumbers: string[] } | null>(null);

  // Extraction History
  const currentUser = db.getCurrentUser();
  const canCreateOrders = canPerform(currentUser, 'orderflow', 'CREATE');
  const historyKey = `bb_wa_extraction_history_v3:${currentUser.id}`;
  const [history, setHistory] = useState<ExtractionHistoryItem[]>([]);

  useEffect(() => {
    const refreshCatalog = () => {
      const products = db.getProducts().filter(product => product.active !== false);
      setActiveCatalogProducts(products); setActiveCatalogCombos(db.getCombos().filter(combo => isSellableCombo(combo, products)));
      setCatalogRevision(value => value + 1);
    };
    refreshCatalog(); window.addEventListener('bb-db-updated', refreshCatalog);
    void db.syncWithSupabase().catch(() => {});
    try {
      setHistory([]);
      const saved = currentUser.id ? localStorage.getItem(historyKey) : null;
      if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) setHistory(parsed); }
    } catch { /* Ignore malformed local history. */ }
    return () => window.removeEventListener('bb-db-updated', refreshCatalog);
  }, [currentUser.id, historyKey]);

  const saveHistory = (items: ExtractionHistoryItem[]) => {
    setHistory(items);
    try {
      if (currentUser.id) localStorage.setItem(historyKey, JSON.stringify(items));
    } catch {
      // ignore
    }
  };

  // Main Dynamic Extraction Handler (Fix 67d)
  const handleExtract = async () => {
    if (!chatText.trim()) return;
    if (chatText.length > 150000 || splitMessageBlocks(chatText).length > 50) { toast.error('Extract up to 50 messages or 150,000 characters at a time.'); return; }
    const sync = await db.syncWithSupabase();
    if (!sync.success) toast.info('Using the catalogue saved on this device. Reconnect before saving orders.');

    const products = db.getProducts().filter((p) => p.active !== false);
    const combos = db.getCombos().filter((c) => isSellableCombo(c, products));
    const brands = db.getBrands('ACTIVE');

    const results = extractOrdersDynamically(chatText, {
      products,
      combos,
      brands,
      channels,
      deliveryMethods,
      dateOverride: dateMode === 'OVERRIDE' ? overrideDateAd : undefined,
    });

    for (const result of results) {
      if (result.salesChannel && !channels.includes(result.salesChannel)) { result.flags.push(`The detected ${result.salesChannel} channel is unavailable; choose an active channel.`); result.salesChannel = ''; }
      if (result.deliveryMethod.value && !deliveryMethods.includes(result.deliveryMethod.value)) { result.flags.push(`The detected ${result.deliveryMethod.value} logistics option is unavailable; choose an active option.`); result.deliveryMethod.value = ''; }
    }
    setExtractedOrders(results);
    setSelectedOrderIds(new Set(results.map((r) => r.id)));
    setPushedSummary(null);

    const totalErrors = results.reduce((sum, r) => sum + (r.extractionErrors?.length || 0), 0);
    const ordersWithErrors = results.filter((r) => (r.extractionErrors?.length || 0) > 0);

    if (ordersWithErrors.length > 0) {
      toast.error(
        `Extraction Alert: ${ordersWithErrors.length} order(s) have missing details!`,
        `Review the red alert banners: check for missing phone, catalog products, or delivery address.`
      );
    } else if (results.length === 1) {
      toast.success('Extracted 1 order with dynamic catalog matching!');
    } else {
      toast.success(`Batch extracted ${results.length} orders successfully!`);
    }
  };

  const refreshOrder = (order: ExtractedOrderResult): ExtractedOrderResult => {
    const catalogTotal = order.products.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const brandCodes = [...new Set(order.products.map(item => item.brandCode))];
    const combos = order.products.filter(item => item.isCombo).map(item => item.name);
    const amount = extractedOrderTotal(order);
    const updated = { ...order, brandCode: { ...order.brandCode, value: brandCodes.length === 1 ? brandCodes[0] : 'ALL' },
      combo: { ...order.combo, value: combos.join(', ') || 'None (Standard SKU)' }, totalAmount: { ...order.totalAmount, value: amount },
      flags: order.flags.filter(flag => !flag.startsWith('Stated total NPR') && !flag.startsWith('No catalogue item recognized') && !(order.statedPrice.value > 0 && flag.startsWith('The message states a zero total'))) };
    return { ...updated, extractionErrors: validateExtractedOrder(updated) };
  };
  const handleUpdateOrderField = (orderId: string, field: string, value: any) => {
    setExtractedOrders(previous => previous.map(order => {
      if (order.id !== orderId) return order;
      const current = order[field as keyof ExtractedOrderResult];
      return refreshOrder({ ...order, [field]: current && typeof current === 'object' && 'value' in current ? { ...current, value } : value });
    }));
  };
  const handleUpdateItemQty = (orderId: string, itemIdx: number, newQty: number) => {
    if (newQty < 1 || newQty > 10000) return;
    setExtractedOrders(previous => previous.map(order => {
      if (order.id !== orderId) return order;
      const items = [...order.products]; items[itemIdx] = { ...items[itemIdx], quantity: newQty, totalPrice: (items[itemIdx].saleUnitPrice ?? items[itemIdx].unitPrice) * newQty };
      return refreshOrder({ ...order, products: items });
    }));
  };
  const handleUpdateItemPrice = (orderId: string, itemIdx: number, value: string) => setExtractedOrders(previous => previous.map(order => {
    if (order.id !== orderId) return order;
    const items = [...order.products]; const item = items[itemIdx]; const saleUnitPrice = value === '' ? undefined : Number(value);
    items[itemIdx] = { ...item, saleUnitPrice, totalPrice: (saleUnitPrice ?? item.unitPrice) * item.quantity };
    return refreshOrder({ ...order, products: items });
  }));
  const handleRemoveItem = (orderId: string, itemIdx: number) => setExtractedOrders(previous => previous.map(order => order.id === orderId ? refreshOrder({ ...order, products: order.products.filter((_, index) => index !== itemIdx) }) : order));
  const handleAddItemToOrder = (orderId: string, value: string) => {
    const [kind, productId] = value.split(':');
    const product = kind === 'product' ? activeCatalogProducts.find(item => item.id === productId) : undefined;
    const combo = kind === 'combo' ? activeCatalogCombos.find(item => item.id === productId) : undefined;
    const selected = product || combo; if (!selected) return;
    const price = product ? product.mrp : combo!.comboPrice || combo!.comboMrp || 0;
    setExtractedOrders(previous => previous.map(order => {
      if (order.id !== orderId) return order;
      const existing = order.products.find(item => item.productId === productId);
      const products = existing ? order.products.map(item => item.productId === productId ? { ...item, quantity: Math.min(item.quantity + 1, 10000), totalPrice: (item.saleUnitPrice ?? item.unitPrice) * Math.min(item.quantity + 1, 10000) } : item)
        : [...order.products, { productId, name: selected.name, brandCode: selected.brandCode, quantity: 1, unitPrice: price, totalPrice: price, confidence: 'HIGH' as Confidence, ...(combo ? { isCombo: true } : {}) }];
      return refreshOrder({ ...order, products });
    }));
  };

  // Discard single or batch
  const handleDiscardOrder = (orderId: string) => {
    const target = extractedOrders.find((o) => o.id === orderId);
    if (target) {
      const discarded: ExtractionHistoryItem = {
        id: `eh_${Date.now()}`,
        timestamp: 'Just now',
        customerName: target.customerName.value || 'Unidentified Customer',
        customerPhone: target.customerPhone.value || 'No Phone',
        brandCode: target.brandCode.value,
        productSummary: target.products.map((p) => `${p.name} (${p.quantity})`).join(', ') || 'No items',
        totalAmount: target.totalAmount.value,
        status: 'DISCARDED',
      };
      saveHistory([discarded, ...history.slice(0, 19)]);
    }
    setExtractedOrders((prev) => prev.filter((o) => o.id !== orderId));
    setSelectedOrderIds(previous => { const next = new Set(previous); next.delete(orderId); return next; });
  };

  const handleDiscardAll = () => {
    const discarded: ExtractionHistoryItem[] = extractedOrders.map((order, index) => ({ id: `eh_${Date.now()}_${index}`, timestamp: 'Just now', customerName: order.customerName.value || 'Unidentified Customer', customerPhone: order.customerPhone.value || 'No Phone', brandCode: order.brandCode.value, productSummary: order.products.map(item => `${item.name} (${item.quantity})`).join(', ') || 'No items', totalAmount: order.totalAmount.value, status: 'DISCARDED' }));
    saveHistory([...discarded, ...history].slice(0, 20)); setExtractedOrders([]); setSelectedOrderIds(new Set()); toast.info('Discarded extracted orders.');
  };

  const executePushOrders = (ordersToPush: ExtractedOrderResult[]) => {
    if (!ordersToPush.length) return;
    const invalid = ordersToPush.map(order => ({ order, errors: validateExtractedOrder(order) })).find(item => item.errors.length);
    if (invalid) { toast.error('Review the order before saving', invalid.errors[0]); return; }
    try {
      for (const order of ordersToPush) {
        assertActiveOrderOption(db.getOrderOptions(), 'channels', order.salesChannel ?? sourceChannel);
        assertActiveOrderOption(db.getOrderOptions(), 'deliveryMethods', order.deliveryMethod.value || deliveryMethods[0]);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Choose an active channel and delivery method.'); return; }
    void guardedSubmit(async () => {
      try {
        const response = await fetch('/api/extractor/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-User': currentUser.id }, body: JSON.stringify({ orders: ordersToPush.map(order => ({
          clientId: order.id, customerName: order.customerName.value, customerPhone: order.customerPhone.value, alternatePhone: order.alternatePhone.value,
          city: order.city.value, province: order.province.value, address: order.address.value, orderDateAd: order.orderDateAd.value,
          platform: order.salesChannel ?? sourceChannel, deliveryMethod: order.deliveryMethod.value || deliveryMethods[0], paymentTerms: order.paymentTerms.value, assignedToId: order.assignedToId || currentUser.id,
          statedPrice: order.statedPrice.provided ? order.statedPrice.value : null, discountPercent: order.discountPercent?.provided ? order.discountPercent.value : null,
          items: order.products.map(item => ({ productId: item.productId, quantity: item.quantity, expectedUnitPrice: item.unitPrice, ...(item.saleUnitPrice !== undefined ? { saleUnitPrice: item.saleUnitPrice } : {}) })),
        })) }) });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success || !Array.isArray(result.orderNumbers)) throw new Error(result?.error || 'Could not save orders. Your review stays here for retry.');
        const numbers = result.orderNumbers as string[];
        const entries: ExtractionHistoryItem[] = ordersToPush.map((order, index) => ({ id: `eh_${order.id}`, timestamp: 'Just now', customerName: order.customerName.value, customerPhone: order.customerPhone.value, brandCode: order.brandCode.value, productSummary: order.products.map(item => `${item.name} (${item.quantity})`).join(', '), totalAmount: order.totalAmount.value, status: 'PUSHED', orderNumber: numbers[index] }));
        saveHistory([...entries, ...history].slice(0, 20)); setPushedSummary({ count: numbers.length, orderNumbers: numbers });
        setExtractedOrders(previous => previous.filter(order => !ordersToPush.some(saved => saved.id === order.id)));
        setSelectedOrderIds(new Set()); setShowConfirmModal(false);
        const sync = await db.syncWithSupabase();
        toast.success(`${numbers.length} order(s) saved to OrderFlow.`);
        if (!sync.success) toast.info('Orders were saved. Refresh the app to see the latest data.');
      } catch (error) { toast.error(error instanceof Error ? error.message : 'Orders could not be saved.'); }
    });
  };

  const renderConfidenceBadge = (confidence?: Confidence) => {
    switch (confidence) {
      case 'HIGH':
      case 'AUTO':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
            <span>🟢</span> Confident
          </span>
        );
      case 'REVIEW':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
            <span>🟡</span> Needs Review
          </span>
        );
      case 'FAILED':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
            <span>🔴</span> Incomplete
          </span>
        );
    }
  };

  return (
    <PageGuard feature="orderflow">
      <div className="space-y-6 pb-20 max-w-7xl mx-auto">
        {/* Breadcrumbs */}
        <Breadcrumbs
          items={[
            { label: 'Orderflow', href: '/orderflow/extractor' },
            { label: 'WhatsApp Order Extractor' },
          ]}
        />

        {/* Header with Catalog Sync Indicator (Fix 67g & 72e) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  WhatsApp Order Extractor
                </h1>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                  Dynamic Catalog Engine
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Reads products, combos, keywords, and prices directly from catalog. Adapts automatically to catalog updates with zero code changes.
              </p>
            </div>
          </div>

          {/* Catalog Synced Status Bar (Fix 67g, 72e) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="text-sm">📚</span>
              <span>
                <strong>Available catalogue:</strong> {activeCatalogProducts.length} active products · {activeCatalogCombos.length} active combos across {catalogStatus.brands} brands
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Refreshes before extraction</span>
            </div>
          </div>
        </div>

        {/* Suggested Order Format Collapsible (Fix 67i) */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          <button
            onClick={() => setShowTemplate(!showTemplate)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            <span className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600" />
              Suggested WhatsApp Order Format
            </span>
            {showTemplate ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {showTemplate && (
            <div className="px-5 pb-4 pt-1 bg-slate-50/50 border-t border-slate-100 text-xs text-slate-600 space-y-2">
              <p className="text-slate-500">
                Use this format to make messages easier to review. Product names and aliases come from the current catalogue:
              </p>
              <pre className="p-3 bg-white rounded-xl border border-slate-200 font-mono text-[11px] text-slate-800 select-all overflow-x-auto">
{`Name: [Customer Name]
Phone: [98XXXXXXXX]
Address: [Full address & landmark, City]
Product: [Product name or Combo name] x [Qty]
Total: Rs. [Amount]
Payment: [Paid / COD]
Platform: [Instagram / TikTok / WhatsApp / Website / Messenger]`}
              </pre>
            </div>
          )}
        </div>

        {/* Input & Control Section */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Paste WhatsApp Messages</h2>
              <span className="text-[11px] text-slate-400">
                (Paste 1 chat or separate multiple orders with &quot;---&quot;)
              </span>
            </div>

            {/* Date Mode Toggle (Fix 67h) */}
            <div className="flex items-center gap-3 text-xs">
              <span className="font-semibold text-slate-600">Order Date:</span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="dateMode"
                  checked={dateMode === 'AUTO'}
                  onChange={() => setDateMode('AUTO')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-700">Auto from message</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="dateMode"
                  checked={dateMode === 'OVERRIDE'}
                  onChange={() => setDateMode('OVERRIDE')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-slate-700">Override:</span>
              </label>
              {dateMode === 'OVERRIDE' && (
                <input
                  type="date"
                  value={overrideDateAd}
                  onChange={(e) => setOverrideDateAd(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          </div>

          <textarea
            rows={6}
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="Paste WhatsApp chat message(s) here. E.g.:&#10;[11:32 AM] Sita: I want 2 bottles of the selected product. Phone 9847890123...&#10;---&#10;Next order..."
            className="w-full rounded-xl border border-slate-200 p-4 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <span className="text-xs text-slate-400">
              Matches against {activeCatalogProducts.length} active products &amp; {activeCatalogCombos.length} combos in database.
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setChatText('')}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Clear Text
              </button>
              <button
                onClick={handleExtract}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
                Extract Order(s)
              </button>
            </div>
          </div>
        </div>

        {/* Extracted Orders Batch List */}
        {extractedOrders.length > 0 && (
          <div className="space-y-4">
            {/* Batch Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/70 border border-blue-200/80 p-4 rounded-2xl">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-blue-950">
                  {extractedOrders.length} Order(s) Extracted
                </span>
                <span className="text-xs text-blue-700">
                  ({selectedOrderIds.size} selected for push)
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    const allSelected = selectedOrderIds.size === extractedOrders.length;
                    setSelectedOrderIds(allSelected ? new Set() : new Set(extractedOrders.map((o) => o.id)));
                  }}
                  className="px-3 py-1.5 border border-blue-300 bg-white rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-50"
                >
                  {selectedOrderIds.size === extractedOrders.length ? 'Deselect All' : 'Select All'}
                </button>
                <button type="button" onClick={() => downloadCSV('\uFEFF' + extractorCSV(extractedOrders, activeCatalogProducts, sourceChannel), `extracted-orders-${getTodayAd()}.csv`)} className="px-3 py-1.5 border border-blue-300 bg-white rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-50">Download CSV</button>
                <button
                  onClick={handleDiscardAll}
                  className="px-3 py-1.5 border border-rose-200 bg-white rounded-lg text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Discard All
                </button>
                {canCreateOrders && <button
                  onClick={() => {
                    setPushMode('SELECTED');
                    setShowConfirmModal(true);
                  }}
                  disabled={selectedOrderIds.size === 0}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Push Selected ({selectedOrderIds.size})
                </button>}
                {canCreateOrders && <button
                  onClick={() => {
                    setPushMode('ALL');
                    setShowConfirmModal(true);
                  }}
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-xs"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  Push All Orders ({extractedOrders.length})
                </button>}
              </div>
            </div>

            {/* Individual Extracted Order Cards */}
            <div className="space-y-4">
              {extractedOrders.map((ord, ordIdx) => {
                const isSelected = selectedOrderIds.has(ord.id);
                const colors = BRAND_COLORS[ord.brandCode.value] || BRAND_COLORS.ALL;

                return (
                  <div
                    key={ord.id}
                    className={`rounded-2xl border bg-white p-5 shadow-xs transition ${
                      isSelected
                        ? 'border-blue-300 ring-1 ring-blue-100'
                        : 'border-slate-200'
                    }`}
                  >
                    {/* Order Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const next = new Set(selectedOrderIds);
                            if (e.target.checked) next.add(ord.id);
                            else next.delete(ord.id);
                            setSelectedOrderIds(next);
                          }}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-bold text-slate-400">#{ordIdx + 1}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${colors.bg} ${colors.text} ${colors.border}`}>
                          {ord.brandCode.value}
                        </span>
                        {ord.combo.value !== 'None (Standard SKU)' && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            🎁 Combo: {ord.combo.value}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {renderConfidenceBadge(ord.customerName.confidence)}
                        <button
                          onClick={() => handleDiscardOrder(ord.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Discard order"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Critical Extraction Errors Banner */}
                    {ord.extractionErrors && ord.extractionErrors.length > 0 && (
                      <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-800">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>Extraction Error: Missing critical order details!</span>
                        </div>
                        <ul className="text-xs text-rose-700 list-disc list-inside space-y-0.5 pl-1">
                          {ord.extractionErrors.map((err, ei) => (
                            <li key={ei} className="font-medium">{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Order Flags / Warnings (Fix 67f Price conflict & multi-brand) */}
                    {ord.flags && ord.flags.length > 0 && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                        {ord.flags.map((flag, fi) => (
                          <div key={fi} className="flex items-start gap-2 text-xs text-amber-900 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                            <span>{flag}</span>
                          </div>
                        ))}
                        {ord.flags.some(flag => flag.includes('matches multiple catalogue items') || flag.startsWith('Multiple combos match') || flag.startsWith('Unrecognized order item:')) && <button type="button" className="mt-2 rounded-lg border border-amber-400 bg-white px-3 py-2 font-semibold text-amber-900" onClick={() => setExtractedOrders(previous => previous.map(order => order.id === ord.id ? refreshOrder({ ...order, flags: order.flags.filter(flag => !flag.includes('matches multiple catalogue items') && !flag.startsWith('Multiple combos match') && !flag.startsWith('Unrecognized order item:')) }) : order))}>I reviewed and selected the correct items</button>}
                        {ord.flags.some(flag => flag.startsWith('Price needs review:')) && <button type="button" className="mt-2 rounded-lg border border-amber-400 bg-white px-3 py-2 font-semibold text-amber-900" onClick={() => setExtractedOrders(previous => previous.map(order => order.id === ord.id ? refreshOrder({ ...order, flags: order.flags.filter(flag => !flag.startsWith('Price needs review:')) }) : order))}>I reviewed the price</button>}
                      </div>
                    )}

                    {/* Editable Fields Grid */}
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      {/* Customer Name */}
                      <div>
                        <label className="font-semibold text-slate-500 mb-1 block flex items-center justify-between">
                          <span>Customer Name</span>
                          {!ord.customerName.value && <span className="text-rose-600 font-bold text-[10px]">Required</span>}
                        </label>
                        <input
                          type="text"
                          value={ord.customerName.value}
                          onChange={(e) => handleUpdateOrderField(ord.id, 'customerName', e.target.value)}
                          className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-medium focus:outline-none ${
                            !ord.customerName.value ? 'border-rose-300 bg-rose-50/30 ring-1 ring-rose-200' : 'border-slate-200 focus:ring-2 focus:ring-blue-500'
                          }`}
                          placeholder="Customer Name"
                        />
                      </div>

                      {/* Phone */}
                      <div>
                        <label className="font-semibold text-slate-500 mb-1 block flex items-center justify-between">
                          <span>Phone Number</span>
                          {!ord.customerPhone.value && <span className="text-rose-600 font-bold text-[10px]">Required</span>}
                        </label>
                        <input
                          type="text"
                          value={ord.customerPhone.value}
                          onChange={(e) => handleUpdateOrderField(ord.id, 'customerPhone', e.target.value)}
                          className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-medium focus:outline-none ${
                            !ord.customerPhone.value ? 'border-rose-300 bg-rose-50/30 ring-1 ring-rose-200' : 'border-slate-200 focus:ring-2 focus:ring-blue-500'
                          }`}
                          placeholder="Phone (98XXXXXXXX)"
                        />
                      </div>

                      <div>
                        <label className="font-semibold text-slate-500 mb-1 block" htmlFor={`alt_${ord.id}`}>Alternate phone</label>
                        <input id={`alt_${ord.id}`} type="tel" value={ord.alternatePhone.value} onChange={event => handleUpdateOrderField(ord.id, 'alternatePhone', event.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" placeholder="Optional second phone" />
                      </div>
                      <NepalLocationFields idPrefix={`location_${ord.id}`} province={ord.province.value} city={ord.city.value} onChange={next => setExtractedOrders(previous => previous.map(order => order.id === ord.id ? refreshOrder({ ...order, province: { ...order.province, value: next.province }, city: { ...order.city, value: next.city } }) : order))} />
                      <div>
                        <label className="font-semibold text-slate-500 mb-1 block" htmlFor={`date_${ord.id}`}>Order date</label>
                        <input id={`date_${ord.id}`} type="date" value={ord.orderDateAd.value} onChange={event => handleUpdateOrderField(ord.id, 'orderDateAd', event.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
                      </div>
                      {/* Address (Exact message address preserved) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-semibold text-slate-500 block">Exact Address / Landmark</label>
                          {ord.rawAddress && ord.rawAddress !== ord.address.value && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderField(ord.id, 'address', ord.rawAddress)}
                              className="text-[10px] text-blue-600 hover:underline font-semibold"
                            >
                              Reset to verbatim
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          maxLength={500}
                          value={ord.address.value}
                          onChange={(e) => handleUpdateOrderField(ord.id, 'address', e.target.value)}
                          className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-medium focus:outline-none ${
                            !ord.address.value ? 'border-rose-300 bg-rose-50/30 ring-1 ring-rose-200' : 'border-slate-200 focus:ring-2 focus:ring-blue-500'
                          }`}
                          placeholder="Exact address from message"
                        />
                        {ord.rawAddress && (
                          <div className="text-[10px] text-slate-400 mt-1 truncate" title={ord.rawAddress}>
                            Exact text: <span className="font-mono text-slate-600 font-semibold">{ord.rawAddress}</span>
                          </div>
                        )}
                        {ord.address.value && ord.address.confidence === 'REVIEW' && <p className="text-[10px] text-amber-700 mt-1">Address copied from the message; its location has not been verified. Please review.</p>}
                        {ord.address.value && !ord.city.value && !ord.province.value && <p className="text-[10px] text-amber-700 mt-1">City and province are empty. You can add them later in Daily Orders.</p>}
                      </div>
                    </div>

                    {/* Products & Combo Breakdown Table */}
                    <div className="mt-4 border border-slate-100 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-3 py-2 flex items-center justify-between text-xs font-bold text-slate-700">
                        <span>Extracted Line Items ({ord.products.length})</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 font-normal">Add product:</span>
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAddItemToOrder(ord.id, e.target.value);
                                e.target.value = '';
                              }
                            }}
                            className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs font-normal"
                          >
                            <option value="">+ Add from catalog...</option>
                            <optgroup label="Products">{activeCatalogProducts.map(product => <option key={product.id} value={`product:${product.id}`}>{product.name} (NPR {product.mrp})</option>)}</optgroup>
                            <optgroup label="Combos">{activeCatalogCombos.map(combo => <option key={combo.id} value={`combo:${combo.id}`}>{combo.name} (NPR {combo.comboPrice || combo.comboMrp})</option>)}</optgroup>
                          </select>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100 text-xs">
                        {ord.products.map((item, itIdx) => (
                          <div key={itIdx} className="p-3 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              {item.isCombo ? (
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded">
                                  COMBO
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">
                                  SKU
                                </span>
                              )}
                              <span className="font-semibold text-slate-900">{item.name}</span>
                              <span className="text-slate-400">Catalogue NPR {item.unitPrice.toLocaleString()}</span>
                              <label className="text-slate-600">Selling price per unit (NPR)<input aria-label={`Selling price per unit for ${item.name}`} type="number" min="0" max={item.unitPrice} step="0.01" value={item.saleUnitPrice ?? ''} placeholder={String(item.unitPrice)} onChange={event => handleUpdateItemPrice(ord.id, itIdx, event.target.value)} className="ml-2 w-24 rounded-lg border border-slate-200 p-1" /></label>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Quantity Stepper */}
                              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                                <button
                                  onClick={() => handleUpdateItemQty(ord.id, itIdx, item.quantity - 1)}
                                  className="px-2 py-1 hover:bg-slate-100 text-slate-500"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="px-2.5 py-1 font-bold text-slate-800 text-xs">
                                  {item.quantity}
                                </span>
                                <button
                                  onClick={() => handleUpdateItemQty(ord.id, itIdx, item.quantity + 1)}
                                  className="px-2 py-1 hover:bg-slate-100 text-slate-500"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>

                              <span className="font-bold text-slate-900 w-20 text-right">
                                NPR {item.totalPrice.toLocaleString()}
                              </span>

                              <button
                                onClick={() => handleRemoveItem(ord.id, itIdx)}
                                className="text-slate-300 hover:text-rose-600 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-slate-500">Follow-ups: {followUpDates(ord.orderDateAd.value)[0] || '—'} (21 days) · {followUpDates(ord.orderDateAd.value)[1] || '—'} (2 months)</p>

                    {/* Order Footer: Stated vs Calculated Price & Action */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div>
                          <span className="text-slate-400">Catalogue total: </span>
                          <span className="font-bold text-slate-900">NPR {ord.products.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toLocaleString()}</span>
                        </div>
                        <div>
                          <label className="text-slate-500" htmlFor={`amount_${ord.id}`}>Stated total (NPR)</label>
                          <input id={`amount_${ord.id}`} type="number" min="0" step="0.01" value={ord.statedPrice.provided ? ord.statedPrice.value : ''} onChange={event => { const value = event.target.value; setExtractedOrders(previous => previous.map(order => order.id === ord.id ? refreshOrder({ ...order, statedPrice: { ...order.statedPrice, provided: value !== '', value: Number(value) } }) : order)); }} className="ml-2 w-28 rounded-lg border border-slate-200 p-1" placeholder="Optional" />
                        </div>
                        <div><label className="text-slate-500" htmlFor={`discount_${ord.id}`}>Order discount (%)</label><input id={`discount_${ord.id}`} type="number" min="0" max="100" step="0.01" value={ord.discountPercent?.provided ? ord.discountPercent.value : ''} onChange={event => { const value = event.target.value; setExtractedOrders(previous => previous.map(order => order.id === ord.id ? refreshOrder({ ...order, discountPercent: { confidence: 'HIGH', provided: value !== '', value: Number(value) } }) : order)); }} className="ml-2 w-20 rounded-lg border border-slate-200 p-1" placeholder="Optional" /></div>
                        <div><span className="text-slate-400">Order total: </span><span className="font-bold text-slate-900">NPR {ord.totalAmount.value.toLocaleString()}</span></div>
                        <div><label className="text-slate-500" htmlFor={`assignee_${ord.id}`}>Responsible person</label><select id={`assignee_${ord.id}`} value={ord.assignedToId || currentUser.id} onChange={event => handleUpdateOrderField(ord.id, 'assignedToId', event.target.value)} className="ml-2 rounded-lg border border-slate-200 p-1">{d2cAssignees(currentUser, db.getUsers(), ord.brandCode.value).map(user => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></div>
                        <div>
                          <label className="text-slate-500" htmlFor={`payment_${ord.id}`}>Payment</label>
                          <select id={`payment_${ord.id}`} value={ord.paymentTerms.value} onChange={event => handleUpdateOrderField(ord.id, 'paymentTerms', event.target.value)} className="ml-2 rounded-lg border border-slate-200 p-1"><option value="COD">COD</option><option value="Prepaid">Prepaid</option></select>
                        </div>
                        <div>
                          <label className="text-slate-500" htmlFor={`channel_${ord.id}`}>Sales channel</label>
                          <select id={`channel_${ord.id}`} value={ord.salesChannel ?? sourceChannel} onChange={event => handleUpdateOrderField(ord.id, 'salesChannel', event.target.value)} className="ml-2 rounded-lg border border-slate-200 p-1 text-slate-800">{(!sourceChannel || ord.salesChannel === '') && <option value="">Choose channel</option>}{channels.map(channel => <option key={channel} value={channel}>{channel}</option>)}</select>
                        </div>
                        <div>
                          <label className="text-slate-500" htmlFor={`delivery_${ord.id}`}>Logistics</label>
                          <select id={`delivery_${ord.id}`} value={ord.deliveryMethod.value || deliveryMethods[0]} onChange={event => handleUpdateOrderField(ord.id, 'deliveryMethod', event.target.value)} className="ml-2 rounded-lg border border-slate-200 p-1 text-slate-800">{activeOrderOptionNames(orderOptions, 'deliveryMethods', ord.deliveryMethod.value).map(method => <option key={method} value={method}>{method}{deliveryMethods.includes(method) ? '' : ' (archived — choose another)'}</option>)}</select>
                        </div>
                      </div>

                      {canCreateOrders && <div className="flex items-center gap-2">
                        {ord.extractionErrors.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              toast.error(
                                'Cannot Push Incomplete Order',
                                ord.extractionErrors[0]
                              );
                            }}
                            className="px-4 py-1.5 bg-rose-100 text-rose-800 font-bold rounded-xl hover:bg-rose-200 transition flex items-center gap-1.5 shadow-xs text-xs border border-rose-300"
                          >
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                            Fix Errors to Push
                          </button>
                        ) : (
                          <button
                            onClick={() => executePushOrders([ord])}
                            disabled={isSubmitting}
                            className="px-4 py-1.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:bg-blue-300 transition flex items-center gap-1.5 shadow-xs"
                          >
                            {isSubmitting ? (
                              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            {isSubmitting ? 'Pushing...' : 'Push This Order'}
                          </button>
                        )}
                      </div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pushed Success Notification */}
        {pushedSummary && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-xs font-bold text-emerald-950">
                  {pushedSummary.count} Order(s) Pushed Successfully!
                </h3>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Assigned numbers: {pushedSummary.orderNumbers.join(', ')}. View on Daily Orders or Dashboard.
                </p>
              </div>
            </div>
            <Link
              href="/orderflow/daily-orders"
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition"
            >
              View Daily Orders →
            </Link>
          </div>
        )}

        {/* Extraction History Table (9d) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              Recent Extraction Trail
            </h2>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setHistory([]);
                  localStorage.removeItem(historyKey);
                }}
                className="text-[11px] text-slate-400 hover:text-rose-600 font-semibold"
              >
                Clear History
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No recent extractions yet. Paste customer WhatsApp/social media chats above to extract orders.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Brand</th>
                    <th className="py-2.5 px-3">Products</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Order #</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {history.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 text-slate-400">{item.timestamp}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {item.customerName}
                        <span className="block text-[10px] text-slate-400 font-normal">{item.customerPhone}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {item.brandCode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 max-w-xs truncate text-slate-700">{item.productSummary}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">NPR {item.totalAmount.toLocaleString()}</td>
                      <td className="py-2.5 px-3">
                        {item.status === 'PUSHED' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <Check className="w-3 h-3" /> PUSHED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 font-bold text-[10px] bg-slate-100 px-2 py-0.5 rounded-full">
                            DISCARDED
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                        {item.orderNumber || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">Confirm Batch Push</h3>
                <button onClick={() => setShowConfirmModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-600">
                You are about to push{' '}
                <strong>
                  {pushMode === 'ALL' ? extractedOrders.length : selectedOrderIds.size} order(s)
                </strong>{' '}
                into the live database. Customer profiles will be created or updated for commercial orders.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const targets =
                      pushMode === 'ALL'
                        ? extractedOrders
                        : extractedOrders.filter((o) => selectedOrderIds.has(o.id));
                    executePushOrders(targets);
                  }}
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:bg-emerald-300 shadow-xs flex items-center gap-1.5"
                >
                  {isSubmitting && (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  )}
                  {isSubmitting ? 'Pushing Orders...' : 'Confirm & Push Orders'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageGuard>
  );
}
