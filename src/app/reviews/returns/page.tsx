'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { ReturnEntry, ReturnReason, BrandCode, OrderPlatform } from '@/lib/types';
import {
  getTodayAd,
  getTodayBs,
  adToBs,
  bsToAd,
  NEPALI_MONTHS,
} from '@/lib/nepali-calendar';
import DynamicCheckboxes from '@/components/common/DynamicCheckboxes';
import BulkActionBar from '@/components/common/BulkActionBar';
import { toast } from '@/components/common/Toast';
import {
  validateRequired,
  validateNepaliPhone,
  validateQuantity,
  validateNotFutureDate,
} from '@/lib/validation';
import {
  RotateCcw,
  Plus,
  Search,
  Filter,
  Package,
  AlertTriangle,
  Camera,
  Upload,
  X,
  ExternalLink,
  ArrowRight,
  Truck,
  CheckCircle,
  Calendar,
  User,
  Clock,
  Check,
  Eye,
} from 'lucide-react';

const ACTUAL_RETURN_REASONS: ReturnReason[] = [
  'Damage',
  'Wrong product sent',
  'Product not as described',
  'Allergic reaction',
  'Quality defect',
  'Size issue',
  'Color mismatch',
  'Changed mind',
];

const RESOLUTION_OPTIONS: Array<'Exchanged' | 'Refunded' | 'Pending' | 'Rejected'> = [
  'Exchanged',
  'Refunded',
  'Pending',
  'Rejected',
];

export default function ReturnsPage() {
  const [returnsList, setReturnsList] = useState<ReturnEntry[]>(db.getReturns());
  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [reasonFilter, setReasonFilter] = useState<string>('ALL');
  const [showLogModal, setShowLogModal] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((r) => r.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleBulkSetResolution = (
    newResolution: 'Exchanged' | 'Refunded' | 'Pending' | 'Rejected'
  ) => {
    if (selectedIds.length === 0) return;
    selectedIds.forEach((id) => {
      db.updateReturnResolution(id, newResolution);
    });
    toast.success(
      `✓ Updated resolution of ${selectedIds.length} return entries to ${newResolution}.`
    );
    setSelectedIds([]);
    setReturnsList([...db.getReturns()]);
  };

  // Success Notification State
  const [saveSuccess, setSaveSuccess] = useState<{
    customerName: string;
    customerPhone: string;
    productId: string;
    productName: string;
    isSerialReturner: boolean;
    timeToReturnDays: number;
  } | null>(null);

  // 11a: Separation Header Stats
  const totalOrdersCount = useMemo(() => {
    const orders = db.getOrders();
    return orders.length > 0 ? orders.length : 1420;
  }, []);

  const actualReturnsCount = returnsList.length;
  const actualReturnsPct = ((actualReturnsCount / Math.max(1, totalOrdersCount)) * 100).toFixed(1);

  const deliveryFailuresCount = useMemo(() => {
    return db.getDeliveryFailures().length;
  }, []);
  const deliveryFailuresPct = ((deliveryFailuresCount / Math.max(1, totalOrdersCount)) * 100).toFixed(1);

  // Form State (11b)
  const activeBrands = db.getBrands('ACTIVE');
  const products = db.getProducts();
  const [brandCode, setBrandCode] = useState<BrandCode>(activeBrands[0]?.code || 'FORYA');

  const filteredProducts = useMemo(() => {
    return products.filter((p) => brandCode === 'ALL' || p.brandCode === brandCode);
  }, [products, brandCode]);

  const [productId, setProductId] = useState(filteredProducts[0]?.id || products[0]?.id || '');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [quantity, setQuantity] = useState(1);

  // Return Date & Original Order Date (BS/AD)
  const [returnDateAd, setReturnDateAd] = useState(getTodayAd());
  const [returnDateBs, setReturnDateBs] = useState(getTodayBs());
  
  // Original Order Date defaults to 5 days ago
  const defaultOrderDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    return d.toISOString().split('T')[0];
  }, []);
  const [orderProcessedDateAd, setOrderProcessedDateAd] = useState(defaultOrderDate);
  const [orderProcessedDateBs, setOrderProcessedDateBs] = useState('Bhadra 21, 2083');

  const [platform, setPlatform] = useState<OrderPlatform>('Instagram');
  const [reasonCategory, setReasonCategory] = useState<ReturnReason>('Damage');
  const [orderStatus, setOrderStatus] = useState<'Exchanged' | 'Refunded' | 'Pending' | 'Rejected'>('Exchanged');
  const [valley, setValley] = useState<'Inside' | 'Outside'>('Outside');
  const [selectedIssueCategories, setSelectedIssueCategories] = useState<string[]>([
    'Damaged in Transit',
  ]);
  const [remarks, setRemarks] = useState('');
  const [evidencePreview, setEvidencePreview] = useState('');

  // Time-to-return calculation in days
  const timeToReturnDays = useMemo(() => {
    try {
      const d1 = new Date(returnDateAd).getTime();
      const d2 = new Date(orderProcessedDateAd).getTime();
      const diff = Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
      return Math.max(0, diff);
    } catch {
      return 0;
    }
  }, [returnDateAd, orderProcessedDateAd]);

  const handleBrandChange = (newBrand: BrandCode) => {
    setBrandCode(newBrand);
    const brandProds = products.filter((p) => p.brandCode === newBrand);
    if (brandProds.length > 0) {
      setProductId(brandProds[0].id);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setEvidencePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 11c: Save & Auto-update Customer Karma, Serial Returner Flag, and Product Metrics
  const handleSaveReturn = (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    const nameErr = validateRequired(customerName, 'Customer name');
    if (nameErr) errors.customerName = nameErr;

    const phoneErr = validateNepaliPhone(customerPhone);
    if (phoneErr) errors.customerPhone = phoneErr;

    const qtyErr = validateQuantity(quantity, 'Quantity');
    if (qtyErr) errors.quantity = qtyErr;

    const returnDateErr = validateNotFutureDate(returnDateAd, 'Return date');
    if (returnDateErr) errors.returnDate = returnDateErr;

    const orderDateErr = validateNotFutureDate(orderProcessedDateAd, 'Original order date');
    if (orderDateErr) errors.orderDate = orderDateErr;

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error('Please fix the highlighted errors before submitting.');
      return;
    }

    const prod = products.find((p) => p.id === productId);

    // Check if customer has 3+ returns in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const pastRecentReturns = returnsList.filter(
      (r) => r.customerPhone === customerPhone.trim() && r.dateAd >= thirtyDaysAgoStr
    );
    const isSerialReturner = pastRecentReturns.length + 1 >= 3;

    // 1. Add return to db
    const newReturn = db.addReturn({
      brandCode,
      productId,
      productName: prod?.name || 'Product',
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      dateAd: returnDateAd,
      dateBs: returnDateBs,
      orderProcessedDateAd,
      orderProcessedDateBs,
      platform,
      quantity,
      reasonCategory,
      orderStatus,
      valley,
      issueCategories: selectedIssueCategories,
      remarks,
      evidenceUrl:
        evidencePreview ||
        'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=60',
    });

    // 2. Auto-update customer in Customer 360 (-3 Karma points for actual return)
    const existingCust = db.getCustomerByPhone(customerPhone.trim());
    if (existingCust) {
      const newKarma = Math.max(0, (existingCust.karmaScore || 85) - 3);
      const flags = [...(existingCust.activeFlags || [])];
      if (isSerialReturner && !flags.includes('Serial Returner')) {
        flags.push('Serial Returner');
      }

      db.updateCustomer(existingCust.id, {
        name: customerName.trim(),
        karmaScore: newKarma,
        totalReturns: (existingCust.totalReturns || 0) + 1,
        activeFlags: flags,
        segment: isSerialReturner ? 'AT_RISK' : existingCust.segment,
      });
    } else {
      db.addCustomer({
        phone: customerPhone.trim(),
        name: customerName.trim(),
        city: valley === 'Inside' ? 'Kathmandu' : 'Pokhara',
        province: valley === 'Inside' ? 'Bagmati Province' : 'Gandaki Province',
        firstOrderDate: orderProcessedDateAd,
        lastOrderDate: returnDateAd,
        totalOrders: 1,
        totalDelivered: 1,
        totalReturns: 1,
        totalDeliveryFailures: 0,
        totalCancellations: 0,
        totalComplaints: 0,
        totalReviews: 0,
        karmaScore: 82, // 85 - 3
        segment: isSerialReturner ? 'AT_RISK' : 'REGULAR',
        activeFlags: isSerialReturner ? ['Serial Returner'] : [],
        brandsPurchased: [brandCode],
      });
    }

    setReturnsList([...db.getReturns()]);
    setShowLogModal(false);
    setSaveSuccess({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      productId,
      productName: prod?.name || 'Product',
      isSerialReturner,
      timeToReturnDays,
    });

    // Reset form
    setCustomerName('');
    setCustomerPhone('');
    setRemarks('');
    setEvidencePreview('');
    setSelectedIssueCategories(['Damaged in Transit']);
  };

  const filtered = useMemo(() => {
    return returnsList.filter((r) => {
      const matchesSearch =
        r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.reasonCategory.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerPhone.includes(searchTerm);
      const matchesBrand = brandFilter === 'ALL' || r.brandCode === brandFilter;
      const matchesReason = reasonFilter === 'ALL' || r.reasonCategory === reasonFilter;
      return matchesSearch && matchesBrand && matchesReason;
    });
  }, [returnsList, searchTerm, brandFilter, reasonFilter]);

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'DATA_ENTRY']}>
      <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* 7f: Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Reviews & Quality', href: '/reviews/feedback' },
          { label: 'Product Returns Register' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Actual Product Returns Register
            </h1>
            <span className="rounded-full bg-rose-100 text-rose-800 text-xs font-bold px-2.5 py-0.5">
              Quality & RMA Ledger
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Log and manage confirmed product returns (damaged goods, wrong shades, quality defects). Dispatched parcels rejected before delivery are recorded under Delivery Failures.
          </p>
        </div>

        <button
          onClick={() => {
            setShowLogModal(true);
            setSaveSuccess(null);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 self-start sm:self-auto transition-all"
        >
          <Plus className="h-4 w-4" />
          Log Product Return
        </button>
      </div>

      {/* 11a: Clear Separation Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Actual Product Returns */}
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/70 p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-emerald-200 text-emerald-900 font-bold px-2.5 py-0.5 text-[11px] uppercase tracking-wider">
              🟢 Genuine Quality Returns
            </span>
            <span className="text-[11px] font-semibold text-emerald-800">
              {actualReturnsPct}% of Dispatched Orders
            </span>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              Actual Product Returns: {actualReturnsCount}{' '}
              <span className="text-sm font-normal text-slate-600">({actualReturnsPct}%)</span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Items where the customer successfully received and unboxed the parcel, but initiated a return due to verified damage, wrong shade, leakage, or adverse reaction.
            </p>
          </div>
          <div className="text-[11px] text-emerald-800 font-medium pt-1">
            Impact: Manufacturer defect tracking, batch quarantine, replacement dispatch & customer karma penalty (-3).
          </div>
        </div>

        {/* Card 2: Delivery Failures (Separated with direct link) */}
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm space-y-3 relative">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 text-[11px] uppercase tracking-wider">
              🔴 Logistics Non-Deliveries
            </span>
            <span className="text-[11px] font-semibold text-rose-700">
              {deliveryFailuresPct}% of Dispatched Orders
            </span>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900">
              Delivery Failures: {deliveryFailuresCount}{' '}
              <span className="text-sm font-normal text-slate-600">({deliveryFailuresPct}%)</span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Dispatched parcels that were <strong>never delivered</strong> to the recipient (phone unreachable, invalid address, customer unavailable, rider RTS).
            </p>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500 italic">
              Tracked separately — does not taint product quality.
            </span>
            <Link
              href="/orderflow/delivery-failures"
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
            >
              Go to Delivery Failures Register →
            </Link>
          </div>
        </div>
      </div>

      {/* 11c: Post-Save Feedback Banner */}
      {saveSuccess && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm space-y-2 animate-in fade-in">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <span>Return Registered Successfully • Karma Penalized (-3 Points)</span>
            </div>
            <button
              onClick={() => setSaveSuccess(null)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-slate-700">
            Recorded product return of <strong>{saveSuccess.productName}</strong> for customer{' '}
            <strong>{saveSuccess.customerName}</strong> ({saveSuccess.customerPhone}). Time-to-return: <strong>{saveSuccess.timeToReturnDays} days</strong> after initial dispatch.
          </p>
          {saveSuccess.isSerialReturner && (
            <div className="rounded-xl border border-amber-300 bg-amber-100 p-2.5 text-xs text-amber-900 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
              <span>⚠️ Serial Returner Alert: This customer has logged 3+ product returns within 30 days. The &quot;Serial Returner&quot; security flag has been activated in Customer 360.</span>
            </div>
          )}
          <div className="flex items-center gap-3 pt-2 text-xs">
            <Link
              href={`/customers/${saveSuccess.customerPhone}`}
              className="font-bold text-blue-700 hover:underline flex items-center gap-1"
            >
              <User className="h-3.5 w-3.5" />
              View Customer in Customer 360 ↗
            </Link>
            <span className="text-slate-300">|</span>
            <Link
              href={`/products/${saveSuccess.productId}`}
              className="font-bold text-blue-700 hover:underline flex items-center gap-1"
            >
              <Package className="h-3.5 w-3.5" />
              View Product Quality Analytics ↗
            </Link>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search product, customer name, phone, or reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs bg-transparent outline-none text-slate-800"
            />
          </div>

          <div>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="ALL">All Brands (Forya, Pee Safe, Renee)</option>
              <option value="FORYA">Forya Catalog</option>
              <option value="PEE_SAFE">Pee Safe & FURR</option>
              <option value="RENEE">Renee Cosmetics</option>
            </select>
          </div>

          <div>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="ALL">All Return Reasons</option>
              {ACTUAL_RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[850px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Brand & Product</th>
                <th className="py-3 px-4">Customer & Karma</th>
                <th className="py-3 px-4">Return Reason</th>
                <th className="py-3 px-4">Resolution Status</th>
                <th className="py-3 px-4">Timeline (BS/AD)</th>
                <th className="py-3 px-4">Channel & Territory</th>
                <th className="py-3 px-4 text-center">Proof Photo</th>
                <th className="py-3 px-4">Issue Tags & Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No matching return entries found.
                  </td>
                </tr>
              ) : (
                filtered.map((ret) => {
                  // Time-to-return
                  const daysToReturn = ret.orderProcessedDateAd
                    ? Math.max(
                        0,
                        Math.round(
                          (new Date(ret.dateAd).getTime() -
                            new Date(ret.orderProcessedDateAd).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                      )
                    : 4;

                  const isSelected = selectedIds.includes(ret.id);

                  return (
                    <tr
                      key={ret.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-50/60 hover:bg-blue-50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3.5 px-4 w-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(e) => handleToggleSelect(ret.id, e)}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      {/* Product Link (7d) */}
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/products/${ret.productId || encodeURIComponent(ret.productName)}`}
                          className="font-bold text-slate-900 hover:text-blue-600 hover:underline block truncate max-w-[200px]"
                        >
                          {ret.productName} ↗
                        </Link>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span className="font-semibold text-slate-600">{ret.brandCode}</span>
                          <span>•</span>
                          <span>Qty: <strong>{ret.quantity}</strong></span>
                        </div>
                      </td>

                      {/* Customer Link (7a) */}
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/customers/${encodeURIComponent(ret.customerPhone)}`}
                          className="font-bold text-blue-600 hover:underline block"
                        >
                          {ret.customerName}
                        </Link>
                        <span className="text-[11px] font-mono text-slate-400 block">
                          {ret.customerPhone}
                        </span>
                      </td>

                      {/* Return Reason Category */}
                      <td className="py-3.5 px-4">
                        <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 inline-block">
                          {ret.reasonCategory}
                        </span>
                      </td>

                      {/* Resolution */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold inline-block ${
                            ret.orderStatus === 'Exchanged'
                              ? 'bg-blue-100 text-blue-800'
                              : ret.orderStatus === 'Refunded'
                              ? 'bg-purple-100 text-purple-800'
                              : ret.orderStatus === 'Pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {ret.orderStatus}
                        </span>
                      </td>

                      {/* Timeline */}
                      <td className="py-3.5 px-4 text-[11px]">
                        <div className="font-semibold text-slate-800 font-mono">{ret.dateAd}</div>
                        <div className="text-slate-400">{daysToReturn} days after delivery</div>
                      </td>

                      {/* Territory & Platform */}
                      <td className="py-3.5 px-4 text-[11px]">
                        <div className="font-semibold text-slate-800">{ret.platform}</div>
                        <div className="text-slate-400">{ret.valley} Valley</div>
                      </td>

                      {/* Evidence Photo Lightbox */}
                      <td className="py-3.5 px-4 text-center">
                        {ret.evidenceUrl ? (
                          <button
                            onClick={() => setLightboxImg(ret.evidenceUrl || null)}
                            className="group relative inline-block h-9 w-9 rounded-lg overflow-hidden border border-slate-200 shadow-xs hover:ring-2 hover:ring-blue-400"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={ret.evidenceUrl}
                              alt="Defect Proof"
                              className="h-full w-full object-cover group-hover:scale-110 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                              <Eye className="h-3 w-3" />
                            </div>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[11px]">None</span>
                        )}
                      </td>

                      {/* Remarks & Issue Tags */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1 mb-1">
                          {ret.issueCategories.map((cat, i) => (
                            <span
                              key={i}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                        <div className="text-slate-600 text-[11px] truncate" title={ret.remarks}>
                          {ret.remarks || '—'}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in cursor-zoom-out"
        >
          <div className="relative max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxImg} alt="Return defect" className="h-full w-full object-contain" />
            <button
              onClick={() => setLightboxImg(null)}
              className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white hover:bg-black"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* 11b: Complete Log Return Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-rose-100 p-2 text-rose-700">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Log Genuine Product Return</h3>
                  <p className="text-[11px] text-slate-500">
                    Product quality, defect, or RMA returns only. Delivery failures go to Orderflow.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLogModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReturn} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {/* Row 1: Brand & Product */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Brand <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={brandCode}
                    onChange={(e) => handleBrandChange(e.target.value as BrandCode)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-bold text-slate-900 focus:border-blue-500"
                  >
                    {activeBrands.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    Product SKU (from catalog) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-medium text-slate-800 focus:border-blue-500"
                  >
                    {filteredProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.brandCode}] {p.name} (NPR {p.mrp})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Customer Name, Phone & Quantity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Customer Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sita Gurung"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      if (formErrors.customerName) setFormErrors((p) => ({ ...p, customerName: '' }));
                    }}
                    className={`w-full rounded-xl border px-3 py-2 outline-none font-semibold text-slate-900 transition ${
                      formErrors.customerName
                        ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                        : 'border-slate-300 focus:border-blue-500'
                    }`}
                  />
                  {formErrors.customerName && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.customerName}</p>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+977-98XXXXXXXX"
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value);
                      if (formErrors.customerPhone) setFormErrors((p) => ({ ...p, customerPhone: '' }));
                    }}
                    className={`w-full rounded-xl border px-3 py-2 outline-none font-mono font-bold text-slate-900 transition ${
                      formErrors.customerPhone
                        ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                        : 'border-slate-300 focus:border-blue-500'
                    }`}
                  />
                  {formErrors.customerPhone && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.customerPhone}</p>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Quantity Returned <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => {
                      setQuantity(Math.max(1, parseInt(e.target.value) || 1));
                      if (formErrors.quantity) setFormErrors((p) => ({ ...p, quantity: '' }));
                    }}
                    className={`w-full rounded-xl border px-3 py-2 outline-none font-bold text-center text-slate-900 transition ${
                      formErrors.quantity
                        ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                        : 'border-slate-300 focus:border-blue-500'
                    }`}
                  />
                  {formErrors.quantity && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.quantity}</p>
                  )}
                </div>
              </div>

              {/* Row 3: Return Date & Original Order Date (BS/AD) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Return Date (Received Back)
                  </label>
                  <div className="space-y-1">
                    <input
                      type="date"
                      value={returnDateAd}
                      onChange={(e) => {
                        setReturnDateAd(e.target.value);
                        if (formErrors.returnDate) setFormErrors((p) => ({ ...p, returnDate: '' }));
                        try {
                          const bs = adToBs(new Date(e.target.value));
                          setReturnDateBs(`${bs.monthName} ${bs.day}, ${bs.year}`);
                        } catch {
                          // fallback
                        }
                      }}
                      className={`w-full rounded-lg border px-3 py-1.5 bg-white outline-none font-medium transition ${
                        formErrors.returnDate
                          ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                          : 'border-slate-300 focus:border-blue-500'
                      }`}
                    />
                    {formErrors.returnDate && (
                      <p className="text-[11px] text-rose-600 mt-0.5 font-medium">{formErrors.returnDate}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Original Order Date (For Time-to-Return)
                  </label>
                  <div className="space-y-1">
                    <input
                      type="date"
                      value={orderProcessedDateAd}
                      onChange={(e) => {
                        setOrderProcessedDateAd(e.target.value);
                        if (formErrors.orderDate) setFormErrors((p) => ({ ...p, orderDate: '' }));
                        try {
                          const bs = adToBs(new Date(e.target.value));
                          setOrderProcessedDateBs(`${bs.monthName} ${bs.day}, ${bs.year}`);
                        } catch {
                          // fallback
                        }
                      }}
                      className={`w-full rounded-lg border px-3 py-1.5 bg-white outline-none font-medium transition ${
                        formErrors.orderDate
                          ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                          : 'border-slate-300 focus:border-blue-500'
                      }`}
                    />
                    {formErrors.orderDate && (
                      <p className="text-[11px] text-rose-600 mt-0.5 font-medium">{formErrors.orderDate}</p>
                    )}
                    <span className="text-[10px] text-slate-500 block">
                      Time-to-return: <strong>{timeToReturnDays} days</strong> ({orderProcessedDateBs})
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 4: Return Reason Category & Platform */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Return Reason Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={reasonCategory}
                    onChange={(e) => setReasonCategory(e.target.value as ReturnReason)}
                    className="w-full rounded-xl border border-rose-300 bg-rose-50/40 px-3 py-2 outline-none font-bold text-rose-800 focus:border-rose-500"
                  >
                    {ACTUAL_RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Resolution Status</label>
                  <select
                    value={orderStatus}
                    onChange={(e) => setOrderStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-semibold text-slate-800"
                  >
                    {RESOLUTION_OPTIONS.map((res) => (
                      <option key={res} value={res}>
                        {res}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Territory Valley</label>
                  <select
                    value={valley}
                    onChange={(e) => setValley(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-semibold text-slate-800"
                  >
                    <option value="Inside">Inside Valley (Kathmandu/Lalitpur)</option>
                    <option value="Outside">Outside Valley (Provincial Hub)</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Checkboxes for specific sub-issues */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <DynamicCheckboxes
                  selectedCategories={selectedIssueCategories}
                  onChange={setSelectedIssueCategories}
                />
              </div>

              {/* Evidence Upload */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Upload Return Evidence (Defect Photo)
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 text-slate-700 font-bold bg-white shadow-xs">
                    <Camera className="h-4 w-4 text-slate-500" />
                    <span>{evidencePreview ? 'Change Photo' : 'Upload Evidence Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </label>
                  {evidencePreview && (
                    <div className="relative h-12 w-12 rounded-xl overflow-hidden border border-slate-300 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={evidencePreview}
                        alt="Defect evidence preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Remarks & Inspection Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Pump leaking upon receipt, replacement bottle dispatched"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none text-slate-900 focus:border-blue-500"
                />
              </div>

              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[11px] text-rose-900">
                ⚠️ <strong>Audit Policy</strong>: Submitting this form deducts <strong>-3 points</strong> from the customer&apos;s Karma ledger in Customer 360 and updates product defect rate metrics. If 3+ returns occur in 30 days, the customer will be automatically tagged as a Serial Returner.
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-6 py-2 font-bold text-white shadow-md hover:bg-blue-700 active:scale-[0.99]"
                >
                  Save & Deduct Karma (-3)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        totalCount={filtered.length}
        onClearSelection={handleClearSelection}
        onSelectAll={handleSelectAll}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-300 font-medium">Set Resolution:</span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleBulkSetResolution(
                  e.target.value as 'Exchanged' | 'Refunded' | 'Pending' | 'Rejected'
                );
                e.target.value = '';
              }
            }}
            className="rounded-lg bg-slate-800 border border-slate-700 text-white text-xs px-2.5 py-1.5 outline-none font-medium cursor-pointer"
          >
            <option value="" disabled>Resolution...</option>
            {RESOLUTION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </BulkActionBar>
      </div>
    </PageGuard>
  );
}
