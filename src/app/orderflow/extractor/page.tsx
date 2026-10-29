'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import {
  extractOrdersDynamically,
  ExtractedOrderResult,
  ExtractedProductItem,
  Confidence,
} from '@/lib/whatsapp-extractor';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { BrandCode, Influencer } from '@/lib/types';
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
  Gift,
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
  FORYA: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  PEE_SAFE: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  RENEE: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  MAMAEARTH: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  ALL: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
};

export default function ExtractorPage() {
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [chatText, setChatText] = useState('');
  const [extractedOrders, setExtractedOrders] = useState<ExtractedOrderResult[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Date controls (Fix 67h)
  const [dateMode, setDateMode] = useState<'AUTO' | 'OVERRIDE'>('AUTO');
  const [overrideDateAd, setOverrideDateAd] = useState(getTodayAd());

  // Template toggle (Fix 67i)
  const [showTemplate, setShowTemplate] = useState(false);

  // Catalog status
  const catalogStatus = useMemo(() => db.getLastCatalogUpdate(), []);

  // Influencers list for marketing tagging
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [activeCatalogProducts, setActiveCatalogProducts] = useState(db.getProducts().filter((p) => p.active !== false));

  // Push confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pushMode, setPushMode] = useState<'ALL' | 'SELECTED'>('ALL');
  const [pushedSummary, setPushedSummary] = useState<{ count: number; orderNumbers: string[] } | null>(null);

  // Extraction History
  const currentUser = db.getCurrentUser();
  const [history, setHistory] = useState<ExtractionHistoryItem[]>([]);

  useEffect(() => {
    setInfluencers(db.getInfluencers());
    setActiveCatalogProducts(db.getProducts().filter((p) => p.active !== false));
    try {
      const saved = localStorage.getItem('bb_wa_extraction_history_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const clean = parsed.filter(
            (item: ExtractionHistoryItem) =>
              item.id !== 'eh_1' &&
              item.id !== 'eh_2' &&
              !item.customerName?.includes('Sita Gurung') &&
              !item.customerName?.includes('Anjali Shrestha')
          );
          setHistory(clean);
          if (clean.length !== parsed.length) {
            localStorage.setItem('bb_wa_extraction_history_v2', JSON.stringify(clean));
          }
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const saveHistory = (items: ExtractionHistoryItem[]) => {
    setHistory(items);
    try {
      localStorage.setItem('bb_wa_extraction_history_v2', JSON.stringify(items));
    } catch {
      // ignore
    }
  };

  // Main Dynamic Extraction Handler (Fix 67d)
  const handleExtract = () => {
    if (!chatText.trim()) return;

    const products = db.getProducts().filter((p) => p.active !== false);
    const combos = db.getCombos().filter((c) => c.active !== false && c.isActive !== false);
    const brands = db.getBrands('ACTIVE');

    const results = extractOrdersDynamically(chatText, {
      products,
      combos,
      brands,
      dateOverride: dateMode === 'OVERRIDE' ? overrideDateAd : undefined,
    });

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

  // Update order field in batch state
  const handleUpdateOrderField = (orderId: string, field: string, value: any) => {
    setExtractedOrders((prev) =>
      prev.map((ord) => {
        if (ord.id !== orderId) return ord;
        return {
          ...ord,
          [field]: typeof ord[field as keyof ExtractedOrderResult] === 'object' && 'value' in (ord[field as keyof ExtractedOrderResult] as any)
            ? { ...(ord[field as keyof ExtractedOrderResult] as any), value }
            : value,
        };
      })
    );
  };

  // Update product quantities in an order
  const handleUpdateItemQty = (orderId: string, itemIdx: number, newQty: number) => {
    if (newQty < 1) return;
    setExtractedOrders((prev) =>
      prev.map((ord) => {
        if (ord.id !== orderId) return ord;
        const newItems = [...ord.products];
        newItems[itemIdx] = {
          ...newItems[itemIdx],
          quantity: newQty,
          totalPrice: newItems[itemIdx].unitPrice * newQty,
        };
        const newTotal = newItems.reduce((acc, it) => acc + it.totalPrice, 0);
        return {
          ...ord,
          products: newItems,
          totalAmount: { ...ord.totalAmount, value: newTotal },
        };
      })
    );
  };

  // Remove product from order
  const handleRemoveItem = (orderId: string, itemIdx: number) => {
    setExtractedOrders((prev) =>
      prev.map((ord) => {
        if (ord.id !== orderId) return ord;
        const newItems = ord.products.filter((_, i) => i !== itemIdx);
        const newTotal = newItems.reduce((acc, it) => acc + it.totalPrice, 0);
        return {
          ...ord,
          products: newItems,
          totalAmount: { ...ord.totalAmount, value: newTotal },
        };
      })
    );
  };

  // Add catalog product to order
  const handleAddItemToOrder = (orderId: string, productId: string) => {
    const prod = activeCatalogProducts.find((p) => p.id === productId);
    if (!prod) return;

    setExtractedOrders((prev) =>
      prev.map((ord) => {
        if (ord.id !== orderId) return ord;
        const newItem: ExtractedProductItem = {
          productId: prod.id,
          name: prod.name,
          brandCode: prod.brandCode,
          quantity: 1,
          unitPrice: prod.mrp,
          totalPrice: prod.mrp,
          confidence: 'HIGH',
        };
        const newItems = [...ord.products, newItem];
        const newTotal = newItems.reduce((acc, it) => acc + it.totalPrice, 0);
        return {
          ...ord,
          products: newItems,
          totalAmount: { ...ord.totalAmount, value: newTotal },
        };
      })
    );
  };

  // Toggle marketing send on an order (Fix 71b)
  const handleToggleMarketing = (orderId: string, isMarketing: boolean) => {
    setExtractedOrders((prev) =>
      prev.map((ord) => {
        if (ord.id !== orderId) return ord;
        return {
          ...ord,
          isMarketing,
          totalAmount: isMarketing ? { ...ord.totalAmount, value: 0 } : ord.totalAmount,
        };
      })
    );
  };

  const handleSelectInfluencer = (orderId: string, influencerId: string) => {
    const inf = influencers.find((i) => i.id === influencerId);
    setExtractedOrders((prev) =>
      prev.map((ord) => {
        if (ord.id !== orderId) return ord;
        return {
          ...ord,
          influencerId,
          influencerName: inf ? inf.name : '',
          customerName: inf ? { ...ord.customerName, value: `${inf.name} (PR)` } : ord.customerName,
          customerPhone: inf && inf.phone ? { ...ord.customerPhone, value: inf.phone } : ord.customerPhone,
        };
      })
    );
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
        rawText: target.rawText,
      };
      saveHistory([discarded, ...history.slice(0, 19)]);
    }
    setExtractedOrders((prev) => prev.filter((o) => o.id !== orderId));
    selectedOrderIds.delete(orderId);
  };

  const handleDiscardAll = () => {
    extractedOrders.forEach((target) => {
      const discarded: ExtractionHistoryItem = {
        id: `eh_${Date.now()}_${Math.random()}`,
        timestamp: 'Just now',
        customerName: target.customerName.value || 'Unidentified Customer',
        customerPhone: target.customerPhone.value || 'No Phone',
        brandCode: target.brandCode.value,
        productSummary: target.products.map((p) => `${p.name} (${p.quantity})`).join(', ') || 'No items',
        totalAmount: target.totalAmount.value,
        status: 'DISCARDED',
        rawText: target.rawText,
      };
      saveHistory([discarded, ...history.slice(0, 19)]);
    });
    setExtractedOrders([]);
    setSelectedOrderIds(new Set());
    toast.info('Discarded extracted orders.');
  };

  // Push Orders Execution
  const executePushOrders = (ordersToPush: ExtractedOrderResult[]) => {
    if (ordersToPush.length === 0) return;

    guardedSubmit(async () => {
      const pushedOrderNumbers: string[] = [];
      const newHistoryItems: ExtractionHistoryItem[] = [];

      ordersToPush.forEach((ord, index) => {
        const orderNumber = `BB-WA-${(Date.now() + index).toString().slice(-4)}`;
        pushedOrderNumbers.push(orderNumber);

        const custName = ord.customerName.value || (ord.isMarketing && ord.influencerName ? `${ord.influencerName} (PR)` : 'Customer');
        const custPhone = ord.customerPhone.value || '9800000000';
        const orderBrand = ord.brandCode.value;
        const orderCity = ord.city.value || 'Kathmandu';
        const orderAddress = ord.address.value || orderCity;
        const amount = ord.isMarketing ? 0 : ord.totalAmount.value;

        // 1. Add order to DB
        db.addOrder({
          orderNumber,
          brandCode: orderBrand,
          orderDateAd: ord.orderDateAd.value || getTodayAd(),
          orderDateBs: ord.orderDateBs.value || getTodayBs(),
          platform: 'WhatsApp',
          customerName: custName,
          customerPhone: custPhone,
          province: orderCity.toLowerCase().includes('pokhara') ? 'Gandaki Province' : 'Bagmati Province',
          district: orderCity,
          address: orderAddress,
          deliveryMethod: (ord.deliveryMethod.value as any) || 'Pathao',
          paymentTerms: ord.isMarketing ? 'Advance' : ((ord.paymentTerms.value as any) || 'COD'),
          orderType: 'NEW',
          totalAmount: amount,
          statedPrice: ord.statedPrice.value || undefined,
          status: 'PENDING',
          source: 'WHATSAPP_EXTRACTOR',
          notes: `Extracted via WhatsApp Extractor. ${ord.combo.value !== 'None (Standard SKU)' ? `Combo: ${ord.combo.value}` : ''}`,
          isMarketing: ord.isMarketing,
          influencerId: ord.influencerId,
          influencerHandle: ord.influencerName,
          items: ord.products.map((p) => ({
            productId: p.productId || 'prod_gen',
            productName: p.name,
            brandCode: p.brandCode,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            totalPrice: ord.isMarketing ? 0 : p.unitPrice * p.quantity,
          })),
        });

        // 2. Customer 360 profile update (skip if marketing)
        if (!ord.isMarketing) {
          const existingCust = db.getCustomerByPhone(custPhone);
          if (existingCust) {
            db.updateCustomer(existingCust.id, {
              name: custName,
              city: orderCity || existingCust.city,
              lastOrderDate: ord.orderDateAd.value || getTodayAd(),
              totalOrders: (existingCust.totalOrders || 0) + 1,
              karmaScore: Math.min(100, (existingCust.karmaScore || 85) + 1),
              brandsPurchased: Array.from(new Set([...existingCust.brandsPurchased, orderBrand])),
            });
          } else {
            db.addCustomer({
              phone: custPhone,
              name: custName,
              city: orderCity,
              province: 'Bagmati Province',
              firstOrderDate: ord.orderDateAd.value || getTodayAd(),
              lastOrderDate: ord.orderDateAd.value || getTodayAd(),
              totalOrders: 1,
              totalDelivered: 0,
              totalReturns: 0,
              totalDeliveryFailures: 0,
              totalCancellations: 0,
              totalComplaints: 0,
              totalReviews: 0,
              karmaScore: 85,
              segment: 'NEW',
              activeFlags: [],
              brandsPurchased: [orderBrand],
            });
          }
        }

        // History item
        newHistoryItems.push({
          id: `eh_${Date.now()}_${index}`,
          timestamp: 'Just now',
          customerName: custName,
          customerPhone: custPhone,
          brandCode: orderBrand,
          productSummary: ord.products.map((p) => `${p.name} (${p.quantity})`).join(', ') || 'Catalog SKU',
          totalAmount: amount,
          status: 'PUSHED',
          orderNumber,
          rawText: ord.rawText,
        });
      });

      saveHistory([...newHistoryItems, ...history.slice(0, 20)]);
      setPushedSummary({ count: ordersToPush.length, orderNumbers: pushedOrderNumbers });
      setExtractedOrders((prev) => prev.filter((o) => !ordersToPush.some((p) => p.id === o.id)));
      setSelectedOrderIds(new Set());
      setShowConfirmModal(false);
      toast.success(`Successfully pushed ${ordersToPush.length} order(s) into OrderFlow!`);
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
                <strong>Catalog Synced:</strong> {catalogStatus.activeProductsCount} active products · {catalogStatus.activeCombosCount} active combos across {catalogStatus.activeBrandsCount} brands
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Status: {catalogStatus.lastUpdatedText}</span>
              {catalogStatus.newProductsCount > 0 && (
                <span className="text-emerald-600 font-medium">({catalogStatus.newProductsCount} new items ready)</span>
              )}
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
              Suggested WhatsApp Order Format (Optional — for 99% accuracy)
            </span>
            {showTemplate ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {showTemplate && (
            <div className="px-5 pb-4 pt-1 bg-slate-50/50 border-t border-slate-100 text-xs text-slate-600 space-y-2">
              <p className="text-slate-500">
                The extractor recognizes freeform text automatically. However, sharing this template with your social media reps guarantees near-instant 99% parsing:
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
            placeholder="Paste WhatsApp chat message(s) here. E.g.:&#10;[11:32 AM] Sita: I want 2 bottles of Forya hair serum. Phone 9847890123...&#10;---&#10;Next order..."
            className="w-full rounded-xl border border-slate-200 p-4 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <span className="text-xs text-slate-400">
              Matches against {catalogStatus.activeProductsCount} active products &amp; {catalogStatus.activeCombosCount} combos in database.
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
                <button
                  onClick={handleDiscardAll}
                  className="px-3 py-1.5 border border-rose-200 bg-white rounded-lg text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Discard All
                </button>
                <button
                  onClick={() => {
                    setPushMode('SELECTED');
                    setShowConfirmModal(true);
                  }}
                  disabled={selectedOrderIds.size === 0}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Push Selected ({selectedOrderIds.size})
                </button>
                <button
                  onClick={() => {
                    setPushMode('ALL');
                    setShowConfirmModal(true);
                  }}
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-xs"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  Push All Orders ({extractedOrders.length})
                </button>
              </div>
            </div>

            {/* Individual Extracted Order Cards */}
            <div className="space-y-4">
              {extractedOrders.map((ord, ordIdx) => {
                const isSelected = selectedOrderIds.has(ord.id);
                const colors = BRAND_COLORS[ord.brandCode.value] || BRAND_COLORS.FORYA;

                return (
                  <div
                    key={ord.id}
                    className={`rounded-2xl border bg-white p-5 shadow-xs transition ${
                      ord.isMarketing
                        ? 'border-purple-300 ring-2 ring-purple-100'
                        : isSelected
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
                        {ord.isMarketing && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                            🎁 MARKETING SEND
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
                      </div>
                    )}

                    {/* Marketing Checkbox (Fix 71b) */}
                    <div className="mt-3 p-3 bg-purple-50/50 border border-purple-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!ord.isMarketing}
                          onChange={(e) => handleToggleMarketing(ord.id, e.target.checked)}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                          <Gift className="w-3.5 h-3.5 text-purple-600" />
                          Marketing / Influencer Send (Not a commercial order)
                        </span>
                      </label>

                      {ord.isMarketing && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-600 font-medium">Influencer:</span>
                          <select
                            value={ord.influencerId || ''}
                            onChange={(e) => handleSelectInfluencer(ord.id, e.target.value)}
                            className="px-2.5 py-1 border border-purple-300 rounded-lg bg-white text-xs font-semibold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          >
                            <option value="">-- Select from Directory --</option>
                            {influencers.map((inf) => (
                              <option key={inf.id} value={inf.id}>
                                {inf.name} ({inf.platforms[0]?.handle || inf.category})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

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

                      {/* City */}
                      <div>
                        <label className="font-semibold text-slate-500 mb-1 block">City</label>
                        <input
                          type="text"
                          value={ord.city.value}
                          onChange={(e) => handleUpdateOrderField(ord.id, 'city', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          placeholder="City"
                        />
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
                            {activeCatalogProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (₹{p.mrp})
                              </option>
                            ))}
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
                              <span className="text-slate-400">@ ₹{item.unitPrice.toLocaleString()}</span>
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
                                ₹{item.totalPrice.toLocaleString()}
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

                    {/* Order Footer: Stated vs Calculated Price & Action */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div>
                          <span className="text-slate-400">Catalog MRP Total: </span>
                          <span className="font-bold text-slate-900">₹{ord.totalAmount.value.toLocaleString()}</span>
                        </div>
                        {ord.statedPrice.value > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Stated in Message: </span>
                            <span className="font-bold text-blue-700">₹{ord.statedPrice.value.toLocaleString()}</span>
                            {ord.statedPrice.level === 'WARNING' && (
                              <span className="text-amber-600 font-semibold">({ord.statedPrice.differencePct}% diff)</span>
                            )}
                          </div>
                        )}
                        <div>
                          <span className="text-slate-400">Payment: </span>
                          <span className="font-semibold text-slate-800">{ord.paymentTerms.value}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Logistics: </span>
                          <span className="font-semibold text-slate-800">{ord.deliveryMethod.value}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {(!ord.customerPhone.value || ord.products.length === 0) ? (
                          <button
                            type="button"
                            onClick={() => {
                              toast.error(
                                'Cannot Push Incomplete Order',
                                `Please ensure a phone number and at least 1 product are provided before pushing to OrderFlow.`
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
                      </div>
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
                  localStorage.removeItem('bb_wa_extraction_history_v2');
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
                      <td className="py-2.5 px-3 font-bold text-slate-900">₹{item.totalAmount.toLocaleString()}</td>
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
                into the live database. Customer profiles will be created/updated and inventory allocations recorded.
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
