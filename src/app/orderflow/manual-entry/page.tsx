'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { useOrderOptions } from '@/hooks/useOrderOptions';
import { activeOrderOptionNames, assertActiveOrderOption } from '@/lib/order-options';
import { BrandCode, OrderPlatform, DeliveryMethod, InfluencerPlatformType } from '@/lib/types';
import {
  getTodayAd,
  getTodayBs,
  adToBs,
  bsToAd,
  NEPALI_MONTHS,
} from '@/lib/nepali-calendar';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { toast } from '@/components/common/Toast';
import { validateRequired, validateNepaliPhone } from '@/lib/validation';
import InlinePhoneInput from '@/components/common/InlinePhoneInput';
import SmartDropdown from '@/components/common/SmartDropdown';
import DraftResumeBanner from '@/components/common/DraftResumeBanner';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import {
  ClipboardPen,
  CheckCircle,
  Plus,
  Trash2,
  Sparkles,
  ArrowRight,
  ExternalLink,
  RotateCcw,
  Check,
  X,
  Package,
  Calendar,
  Truck,
  User,
  Phone,
  MapPin,
  Tag,
  FileText,
  AlertTriangle,
  Gift,
  Search,
} from 'lucide-react';

const NEPAL_PROVINCES = [
  'Koshi Province',
  'Madhesh Province',
  'Bagmati Province',
  'Gandaki Province',
  'Lumbini Province',
  'Karnali Province',
  'Sudurpashchim Province',
];

interface OrderItemRow {
  productId: string;
  quantity: number;
  overridePrice?: number;
}

export default function ManualOrderEntryPage() {
  const options = useOrderOptions();
  const platformOptions = activeOrderOptionNames(options, 'channels');
  const deliveryMethods = activeOrderOptionNames(options, 'deliveryMethods');
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [currentUser] = useState(() => db.getCurrentUser());
  const assignedBrands = currentUser.assignedBrands || [];
  const hasBrandRestrictions = Boolean(assignedBrands.length > 0 && !assignedBrands.includes('ALL'));

  const products = db.getProducts();
  const allActiveBrands = db.getBrands('ACTIVE');
  const activeBrands = useMemo(() => {
    if (hasBrandRestrictions) {
      return allActiveBrands.filter(
        (b) =>
          assignedBrands.includes(b.code) ||
          (assignedBrands.includes('PEE_SAFE') && b.code === 'FURR')
      );
    }
    return allActiveBrands;
  }, [allActiveBrands, hasBrandRestrictions, assignedBrands]);

  // Form State
  const [brandCode, setBrandCode] = useState<BrandCode>(activeBrands[0]?.code || 'FORYA');
  const [orderDateAd, setOrderDateAd] = useState(getTodayAd());
  const [orderDateBs, setOrderDateBs] = useState(getTodayBs());

  const [platform, setPlatform] = useState<OrderPlatform>(() => platformOptions.includes('Instagram') ? 'Instagram' : platformOptions[0]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [province, setProvince] = useState('Bagmati Province');
  const [district, setDistrict] = useState('Kathmandu');
  const [address, setAddress] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(() => deliveryMethods.includes('Pathao') ? 'Pathao' : deliveryMethods[0]);
  useEffect(() => {
    const channels = activeOrderOptionNames(options, 'channels');
    const methods = activeOrderOptionNames(options, 'deliveryMethods');
    if (!channels.includes(platform)) setPlatform(channels[0]);
    if (!methods.includes(deliveryMethod)) setDeliveryMethod(methods[0]);
  }, [options, platform, deliveryMethod]);
  const [paymentTerms, setPaymentTerms] = useState<'COD' | 'Prepaid'>('COD');
  const [remarks, setRemarks] = useState('');
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  // FIX 60a: Marketing / Influencer Order Classification
  const [isMarketing, setIsMarketing] = useState(false);
  const [influencerId, setInfluencerId] = useState('');
  const [influencerName, setInfluencerName] = useState('');
  const [influencerPhone, setInfluencerPhone] = useState('');
  const [influencerPlatform, setInfluencerPlatform] = useState<InfluencerPlatformType>('Instagram');
  const [influencerHandle, setInfluencerHandle] = useState('');
  const [influencerNotes, setInfluencerNotes] = useState('');

  const [influencerSearchQuery, setInfluencerSearchQuery] = useState('');

  const existingInfluencers = useMemo(() => db.getInfluencers(), []);

  const filteredExistingInfluencers = useMemo(() => {
    if (!influencerSearchQuery.trim()) return existingInfluencers;
    const q = influencerSearchQuery.toLowerCase().trim();
    return existingInfluencers.filter(
      (inf) =>
        inf.name.toLowerCase().includes(q) ||
        inf.platforms.some((p) => p.handle.toLowerCase().includes(q)) ||
        inf.category.toLowerCase().includes(q)
    );
  }, [existingInfluencers, influencerSearchQuery]);

  const selectedInfluencerObj = useMemo(() => {
    if (!influencerId) return null;
    return existingInfluencers.find((inf) => inf.id === influencerId) || null;
  }, [existingInfluencers, influencerId]);

  const handleSelectExistingInfluencer = (selectedId: string) => {
    setInfluencerId(selectedId);
    if (!selectedId) {
      setInfluencerName('');
      setInfluencerPhone('');
      setInfluencerHandle('');
      return;
    }
    const found = existingInfluencers.find((inf) => inf.id === selectedId);
    if (found) {
      setInfluencerName(found.name);
      setInfluencerPhone(found.phone || '');
      setInfluencerPlatform(found.platforms[0]?.platform || 'Instagram');
      setInfluencerHandle(found.platforms[0]?.handle || '');
      if (!customerName) setCustomerName(`${found.name} (PR)`);
      if (!customerPhone && found.phone) setCustomerPhone(found.phone);
      if (found.city && !address) setAddress(found.city);
    }
  };

  // FIX 54d: Auto-save draft every 10s to localStorage
  const { hasDraft, draftTimestamp, resumeDraft, discardDraft, clearDraft } = useAutoSave('manual_order_entry', {
    brandCode,
    platform,
    customerName,
    customerPhone,
    province,
    district,
    address,
    deliveryMethod,
    paymentTerms,
    remarks,
  });

  const handleResumeDraft = () => {
    const draft = resumeDraft();
    if (draft) {
      if (draft.brandCode) setBrandCode(draft.brandCode);
      if (draft.platform) setPlatform(draft.platform);
      if (draft.customerName) setCustomerName(draft.customerName);
      if (draft.customerPhone) setCustomerPhone(draft.customerPhone);
      if (draft.province) setProvince(draft.province);
      if (draft.district) setDistrict(draft.district);
      if (draft.address) setAddress(draft.address);
      if (draft.deliveryMethod) setDeliveryMethod(draft.deliveryMethod);
      if (draft.paymentTerms) setPaymentTerms(draft.paymentTerms);
      if (draft.remarks) setRemarks(draft.remarks);
      toast.info('Draft Resumed', 'Restored previously unsaved form values.');
    }
  };

  // 10b: Review Step Toggle
  const [isReviewing, setIsReviewing] = useState(false);

  // 10c: Saved State & Order Modal
  const [savedOrder, setSavedOrder] = useState<{
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    brandCode: BrandCode;
    totalAmount: number;
    items: Array<{ name: string; quantity: number; unitPrice: number; totalPrice: number }>;
    deliveryMethod: string;
    paymentTerms: string;
    karmaAwarded: number;
  } | null>(null);

  const [showOrderModal, setShowOrderModal] = useState(false);

  // Products filtered by selected brand
  const filteredProducts = useMemo(() => {
    return products.filter((p) => brandCode === 'ALL' || p.brandCode === brandCode);
  }, [products, brandCode]);

  // Order line items
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([
    { productId: filteredProducts[0]?.id || products[0]?.id || '', quantity: 1 },
  ]);

  // If brand changes, update items to available brand product
  const handleBrandChange = (newBrand: BrandCode) => {
    setBrandCode(newBrand);
    const newBrandProds = products.filter((p) => newBrand === 'ALL' || p.brandCode === newBrand);
    if (newBrandProds.length > 0) {
      setOrderItems([{ productId: newBrandProds[0].id, quantity: 1 }]);
    }
    setComboApplied(null);
  };

  // 10a: Auto-check customer phone and return customer detection
  const existingCustomer = useMemo(() => {
    if (!customerPhone || customerPhone.trim().length < 7) return null;
    return db.getCustomerByPhone(customerPhone.trim());
  }, [customerPhone]);

  // Auto-fill customer details when phone matches
  const handlePhoneBlur = () => {
    if (existingCustomer) {
      if (!customerName && existingCustomer.name) {
        setCustomerName(existingCustomer.name);
      }
      if (existingCustomer.province) {
        setProvince(existingCustomer.province);
      }
      if (existingCustomer.city) {
        setDistrict(existingCustomer.city);
      }
    }
  };

  const handleAdDateChange = (adVal: string) => {
    setOrderDateAd(adVal);
    try {
      if (adVal) {
        const [y, m, d] = adVal.split('-').map(Number);
        const bsObj = adToBs(new Date(y, m - 1, d));
        setOrderDateBs(`${bsObj.monthName} ${bsObj.day}, ${bsObj.year}`);
      }
    } catch {
      // fallback
    }
  };

  // 10a: Combo Detection
  const [comboApplied, setComboApplied] = useState<{
    name: string;
    comboPrice: number;
    originalPrice: number;
    savings: number;
  } | null>(null);

  const detectedCombo = useMemo(() => {
    const itemNames = orderItems
      .map((it) => products.find((p) => p.id === it.productId)?.name.toLowerCase() || '')
      .filter(Boolean);

    // Forya Refresh & Glow Duo (Peach Roll-On + Body Wash)
    if (brandCode === 'FORYA') {
      const hasPeach = itemNames.some((n) => n.includes('peach') || n.includes('roll-on'));
      const hasBodyWash = itemNames.some((n) => n.includes('body wash') || n.includes('wash'));
      if (hasPeach && hasBodyWash) {
        return {
          name: 'Forya Refresh & Glow Duo',
          originalPrice: 1400,
          comboPrice: 1199,
          savings: 201,
        };
      }
    }

    // Pee Safe Daily Care Essentials (Toilet Seat Spray + Panty Liners)
    if (brandCode === 'PEE_SAFE') {
      const hasSpray = itemNames.some((n) => n.includes('toilet') || n.includes('spray'));
      const hasLiners = itemNames.some((n) => n.includes('liner') || n.includes('cotton'));
      if (hasSpray && hasLiners) {
        return {
          name: 'Pee Safe Daily Care Essentials',
          originalPrice: 750,
          comboPrice: 650,
          savings: 100,
        };
      }
    }

    // Renee Glam Starter Kit (Madness Lipstick + Kohl Kajal)
    if (brandCode === 'RENEE') {
      const hasLipstick = itemNames.some((n) => n.includes('madness') || n.includes('lipstick'));
      const hasKajal = itemNames.some((n) => n.includes('kajal') || n.includes('kohl'));
      if (hasLipstick && hasKajal) {
        return {
          name: 'Renee Glam Starter Kit',
          originalPrice: 1400,
          comboPrice: 1199,
          savings: 201,
        };
      }
    }

    return null;
  }, [orderItems, brandCode, products]);

  // Total amount calculation
  const totalAmount = useMemo(() => {
    if (isMarketing) return 0;
    if (comboApplied && detectedCombo && comboApplied.name === detectedCombo.name) {
      return comboApplied.comboPrice;
    }
    return orderItems.reduce((sum, item) => {
      const prod = products.find((p) => p.id === item.productId);
      const price = item.overridePrice ?? (prod?.mrp || 0);
      return sum + price * (item.quantity || 1);
    }, 0);
  }, [orderItems, products, comboApplied, detectedCombo, isMarketing]);

  const handleApplyCombo = () => {
    if (detectedCombo) {
      setComboApplied(detectedCombo);
    }
  };

  // Item Management
  const handleAddItem = () => {
    const available = filteredProducts[0] || products[0];
    if (available) {
      setOrderItems([...orderItems, { productId: available.id, quantity: 1 }]);
    }
  };

  const handleRemoveItem = (index: number) => {
    if (orderItems.length <= 1) return;
    setOrderItems(orderItems.filter((_, i) => i !== index));
    setComboApplied(null);
  };

  const handleUpdateItem = (index: number, field: 'productId' | 'quantity', value: any) => {
    const next = [...orderItems];
    next[index] = { ...next[index], [field]: value };
    setOrderItems(next);
    setComboApplied(null);
  };

  // Step 1: Trigger Review Mode
  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};
    const nameErr = validateRequired(customerName, 'Customer Name');
    if (nameErr) errors.customerName = nameErr;

    const phoneErr = validateNepaliPhone(customerPhone);
    if (phoneErr) errors.customerPhone = phoneErr;

    if (orderItems.length === 0) {
      errors.orderItems = 'Please add at least one product SKU.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error('Please fix the validation errors before proceeding.');
      return;
    }
    setFormErrors({});
    setIsReviewing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 2: Confirm & Save Order (10c)
  const handleConfirmAndSave = () => {
    try {
      assertActiveOrderOption(db.getOrderOptions(), 'channels', isMarketing ? influencerPlatform : platform);
      assertActiveOrderOption(db.getOrderOptions(), 'deliveryMethods', deliveryMethod);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Choose an active channel and delivery method.'); return; }
    guardedSubmit(async () => {
      const items = orderItems.map((item) => {
        const p = products.find((prod) => prod.id === item.productId);
        const unitPrice = item.overridePrice ?? (p?.mrp || 0);
        return {
          productId: item.productId,
          productName: p?.name || 'Product',
          brandCode: p?.brandCode || brandCode,
          quantity: item.quantity,
          unitPrice: isMarketing ? 0 : unitPrice,
          totalPrice: isMarketing ? 0 : unitPrice * item.quantity,
        };
      });

      const orderNumber = isMarketing ? `BB-MKT-${Date.now().toString().slice(-4)}` : `BB-MAN-${Date.now().toString().slice(-4)}`;

      // 1. Auto-create or resolve Influencer if marketing send
      let finalInfluencerId = influencerId;
      if (isMarketing) {
        if (!finalInfluencerId && influencerName.trim()) {
          const createdInf = db.createInfluencer({
            name: influencerName.trim(),
            phone: influencerPhone.trim() || undefined,
            platforms: [
              {
                platform: influencerPlatform,
                handle: influencerHandle.trim() || `@${influencerName.toLowerCase().replace(/\s+/g, '')}`,
              },
            ],
            city: district || 'Kathmandu',
            category: 'Beauty',
            qualityRating: 'NOT_RATED',
            notes: influencerNotes.trim() || 'Created from Manual Order Entry',
            isActive: true,
          });
          finalInfluencerId = createdInf.id;
        }
        // Increment total sends (Fix 71a)
        if (finalInfluencerId) {
          db.incrementInfluencerSends(finalInfluencerId);
        }
      }

      // 2. Add order to database
      db.addOrder({
        orderNumber,
        brandCode,
        orderDateAd,
        orderDateBs,
        platform: isMarketing ? influencerPlatform : platform,
        customerName: customerName.trim() || (isMarketing ? `${influencerName.trim()} (PR)` : 'Customer'),
        customerPhone: customerPhone.trim() || (isMarketing ? influencerPhone.trim() || '+977-9800000000' : '+977-9800000000'),
        province,
        district,
        address: address.trim() || district,
        deliveryMethod,
        paymentTerms: isMarketing ? 'Advance' : paymentTerms,
        orderType: existingCustomer ? 'REPEAT' : 'NEW',
        totalAmount: isMarketing ? 0 : totalAmount,
        status: 'PENDING',
        source: 'MANUAL',
        isMarketing,
        influencerId: finalInfluencerId || undefined,
        influencerHandle: influencerHandle.trim() || undefined,
        notes: `${remarks ? remarks + '. ' : ''}${comboApplied ? `Combo: ${comboApplied.name}. ` : ''}${
          isMarketing ? `[MARKETING SEND to ${influencerName} (${influencerHandle})] ${influencerNotes}` : ''
        }`,
        items,
      });

      // 2. Auto-update Customer 360 and Karma Score (+2 for order placed)
      const karmaBoost = 2;
      if (existingCustomer) {
        const newKarma = Math.min(100, (existingCustomer.karmaScore || 85) + karmaBoost);
        db.updateCustomer(existingCustomer.id, {
          name: customerName.trim(),
          city: district,
          province,
          lastOrderDate: orderDateAd,
          totalOrders: (existingCustomer.totalOrders || 0) + 1,
          karmaScore: newKarma,
          brandsPurchased: Array.from(new Set([...existingCustomer.brandsPurchased, brandCode])),
        });
      } else {
        db.addCustomer({
          phone: customerPhone.trim(),
          name: customerName.trim(),
          city: district || 'Kathmandu',
          province: province || 'Bagmati Province',
          firstOrderDate: orderDateAd,
          lastOrderDate: orderDateAd,
          totalOrders: 1,
          totalDelivered: 0,
          totalReturns: 0,
          totalDeliveryFailures: 0,
          totalCancellations: 0,
          totalComplaints: 0,
          totalReviews: 0,
          karmaScore: 85 + karmaBoost, // 87 karma points on first order!
          segment: 'NEW',
          activeFlags: [],
          brandsPurchased: [brandCode],
        });
      }

      // Save summary state for success UI
      setSavedOrder({
        orderNumber,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        brandCode,
        totalAmount: isMarketing ? 0 : totalAmount,
        items: items.map((i) => ({
          name: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
        })),
        deliveryMethod,
        paymentTerms: isMarketing ? 'Product Seeding (NPR 0)' : paymentTerms,
        karmaAwarded: karmaBoost,
      });

      toast.success(`Order ${orderNumber} created and confirmed successfully!`);
      clearDraft();
      setIsReviewing(false);
    });
  };

  const handleResetForNewOrder = () => {
    setSavedOrder(null);
    clearDraft();
    setIsReviewing(false);
    setCustomerName('');
    setCustomerPhone('');
    setAddress('');
    setRemarks('');
    setComboApplied(null);
    setIsMarketing(false);
    setInfluencerId('');
    setInfluencerName('');
    setInfluencerPhone('');
    setInfluencerHandle('');
    setInfluencerNotes('');
    const available = filteredProducts[0] || products[0];
    setOrderItems([{ productId: available?.id || '', quantity: 1 }]);
  };

  return (
    <PageGuard feature="orderflow">
      <div className="max-w-4xl space-y-6 pb-20 mx-auto">
      {/* 7f: Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Orderflow', href: '/orderflow/manual-entry' },
          { label: 'Manual Order Entry' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Manual Order Entry
            </h1>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              Master Order Entry (D2C)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Book omnichannel direct customer orders across Instagram, TikTok, WhatsApp, Walk-in, and Phone Calls with instant Customer 360 sync.
          </p>
        </div>

        {savedOrder && (
          <button
            onClick={handleResetForNewOrder}
            className="self-start sm:self-center flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Another Order
          </button>
        )}
      </div>

      {/* 10c: Post-Save Success View */}
      {savedOrder && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-6 text-slate-800 shadow-md space-y-5 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-emerald-600 p-2 text-white shrink-0 mt-0.5 shadow-sm">
                <Check className="h-6 w-6 stroke-[3]" />
              </div>
              <div>
                <span className="rounded bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  Order Successfully Created
                </span>
                <h2 className="text-xl font-black text-slate-900 mt-1">
                  Order #{savedOrder.orderNumber}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Registered for <strong>{savedOrder.customerName}</strong> ({savedOrder.customerPhone}) • Grand Total: <strong className="text-slate-900">NPR {savedOrder.totalAmount.toLocaleString()}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white p-3 border border-emerald-200 text-center shrink-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Karma Boost</span>
              <span className="text-lg font-black text-emerald-600">+{savedOrder.karmaAwarded} Points</span>
              <span className="text-[10px] text-slate-500 block">Auto-updated in 360</span>
            </div>
          </div>

          {/* Action Links */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-emerald-200/60">
            <button
              onClick={() => setShowOrderModal(true)}
              className="rounded-xl bg-white border border-emerald-300 px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 shadow-sm flex items-center gap-1.5"
            >
              <Package className="h-4 w-4" />
              View Order Invoice
            </button>
            <Link
              href={`/customers/${savedOrder.customerPhone}`}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm flex items-center gap-1.5"
            >
              <User className="h-4 w-4" />
              View Customer 360 Profile ↗
            </Link>
            <button
              onClick={handleResetForNewOrder}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Another Order
            </button>
          </div>
        </div>
      )}

      {/* 10b: Order Summary Card Before Save */}
      {isReviewing ? (
        <div className="rounded-2xl border-2 border-blue-500 bg-white p-6 shadow-xl space-y-6 animate-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-blue-100 p-2 text-blue-700">
                <ClipboardPen className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-base">Order Review & Confirmation</h2>
                <p className="text-xs text-slate-500">Please verify all order details before committing to database</p>
              </div>
            </div>
            <span className="rounded-full bg-blue-50 text-blue-700 font-bold px-3 py-1 text-xs border border-blue-200">
              Ready to Save
            </span>
          </div>

          {/* Review Card Specification (10b) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block">Brand:</span>
                <strong className="text-sm font-bold text-slate-900 uppercase">
                  {brandCode}
                </strong>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block">Customer:</span>
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>{customerName}</span>
                  {existingCustomer ? (
                    <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5">
                      Returning — Karma {existingCustomer.karmaScore}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-200 text-slate-700 text-[10px] font-medium px-2 py-0.5">
                      New Customer
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-slate-500">{customerPhone}</span>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3">
              <span className="text-[11px] font-semibold text-slate-500 block mb-2">Products:</span>
              <div className="space-y-1.5 bg-white p-3 rounded-lg border border-slate-200">
                {orderItems.map((it, idx) => {
                  const p = products.find((prod) => prod.id === it.productId);
                  const price = it.overridePrice ?? (p?.mrp || 0);
                  const lineTotal = isMarketing ? 0 : price * it.quantity;
                  return (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="text-slate-800 font-medium">
                        {it.quantity}× {p?.name || 'Item'} — {isMarketing ? 'Product seeding' : `NPR ${price.toLocaleString()} each`}
                      </span>
                      <strong className="font-mono text-slate-900">
                        NPR {lineTotal.toLocaleString()}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </div>

            {comboApplied && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900 flex items-center justify-between">
                <span>Promotional Combo Applied: <strong>{comboApplied.name}</strong></span>
                <span className="font-bold text-amber-800">Saves NPR {comboApplied.savings.toLocaleString()}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 pt-3">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block">Delivery & Payment:</span>
                  <strong className="text-slate-900">{deliveryMethod}</strong> • {isMarketing ? 'Product Seeding (NPR 0)' : paymentTerms}
                <div className="text-slate-600 text-[11px] mt-0.5">
                  {address || district}, {district}, {province}
                </div>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block">Platform & Date:</span>
                <strong className="text-slate-900">{isMarketing ? influencerPlatform : platform}</strong>
                <div className="text-slate-600 text-[11px] mt-0.5">
                  {orderDateAd}
                </div>
              </div>
            </div>

            {remarks && (
              <div className="border-t border-slate-200 pt-2 text-[11px]">
                <span className="font-semibold text-slate-500">Remarks:</span>{' '}
                <span className="text-slate-700 italic">{remarks}</span>
              </div>
            )}

            <div className="border-t-2 border-slate-300 pt-3 flex justify-between items-center">
              <span className="font-bold text-slate-900 text-sm">Total Order Value:</span>
              <span className="font-mono font-black text-xl text-slate-900">
                NPR {totalAmount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Action Buttons: "Confirm & Save" / "Go Back & Edit" */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={() => setIsReviewing(false)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              ← Go Back & Edit
            </button>
            <button
              type="button"
              onClick={handleConfirmAndSave}
              disabled={isSubmitting}
              className="rounded-xl bg-emerald-600 px-7 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-700 disabled:bg-emerald-300 active:scale-[0.99] flex items-center gap-2"
            >
              {isSubmitting ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
              ) : (
                <Check className="h-4 w-4 stroke-[3]" />
              )}
              {isSubmitting ? 'Saving Order...' : 'Confirm & Save'}
            </button>
          </div>
        </div>
      ) : (
        /* 10a: Complete Master Order Entry Form */
        !savedOrder && (
          <div className="space-y-4">
            <DraftResumeBanner
              hasDraft={hasDraft}
              draftTimestamp={draftTimestamp}
              onResume={handleResumeDraft}
              onDiscard={discardDraft}
            />

            <form
              onSubmit={handleProceedToReview}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6 text-xs"
            >
            {/* Section 1: Channel & Timing */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Brand Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Brand <span className="text-rose-500">*</span>
                </label>
                <select
                  value={brandCode}
                  onChange={(e) => handleBrandChange(e.target.value as BrandCode)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-bold text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {activeBrands.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Determines catalog filter
                </span>
              </div>

              {/* Platform Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Platform Channel <span className="text-rose-500">*</span>
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as OrderPlatform)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-semibold text-slate-900 focus:border-blue-500"
                >
                  {platformOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Origin of customer inquiry
                </span>
              </div>

              {/* Order Date: Standard AD Date for Social Media Order */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Order Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={orderDateAd}
                  onChange={(e) => handleAdDateChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-medium text-xs text-slate-800 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            {/* Section 2: Customer Information & Auto-Check Badge */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-[11px] text-slate-700 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  Customer Details & Karma Check
                </span>

                {/* 10a: Karma badge based on existing phone */}
                {existingCustomer ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 font-bold px-3 py-1 text-[11px] border border-emerald-200">
                    <span>🟢</span> Returning customer — Karma: {existingCustomer.karmaScore}
                  </span>
                ) : customerPhone.length >= 8 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 font-semibold px-2.5 py-0.5 text-[10px]">
                    New Customer (First Order)
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">
                    Enter phone to auto-verify customer karma
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Customer Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sita Gurung"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      if (formErrors.customerName) setFormErrors((prev) => ({ ...prev, customerName: '' }));
                    }}
                    className={`w-full rounded-xl border ${formErrors.customerName ? 'border-red-500 bg-red-50/20' : 'border-slate-300'} px-3 py-2 bg-white outline-none font-bold text-slate-900 focus:border-blue-500`}
                  />
                  {formErrors.customerName && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.customerName}</p>
                  )}
                </div>

                <div>
                  <InlinePhoneInput
                    value={customerPhone}
                    onChange={(val) => {
                      setCustomerPhone(val);
                      if (formErrors.customerPhone) setFormErrors((prev) => ({ ...prev, customerPhone: '' }));
                    }}
                    onCustomerFound={(c) => {
                      if (!customerName && c.name) setCustomerName(c.name);
                      if (c.province) setProvince(c.province);
                      if (c.city) setDistrict(c.city);
                    }}
                    label="Phone Number"
                    required
                  />
                  {formErrors.customerPhone && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.customerPhone}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Province <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-semibold text-slate-800"
                  >
                    {NEPAL_PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    District / City <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kathmandu, Pokhara, Lalitpur"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Street / Landmark Address
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Lakeside Ward 6, Near Hallanchowk"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Product(s) & Combo Detection */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-[11px] text-slate-700 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-slate-500" />
                  Order Products ({orderItems.length} SKU{orderItems.length > 1 ? 's' : ''})
                </span>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Product SKU
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-2.5">
                {orderItems.map((item, idx) => {
                  const prod = products.find((p) => p.id === item.productId);
                  const price = item.overridePrice ?? (prod?.mrp || 0);
                  const lineTotal = isMarketing ? 0 : price * item.quantity;

                  return (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs"
                    >
                      <div className="flex-1">
                        <label className="block sm:hidden text-[10px] font-semibold text-slate-500 mb-0.5">
                          Select Product SKU
                        </label>
                        <SmartDropdown
                          items={filteredProducts.map((p) => ({
                            id: p.id,
                            name: p.name,
                            group: p.brandCode,
                            price: p.mrp,
                            context: p.brandCode === 'FORYA' ? 'High Velocity SKU' : undefined,
                          }))}
                          value={item.productId}
                          onChange={(val) => handleUpdateItem(idx, 'productId', val)}
                          placeholder="Search product SKU..."
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Quantity Stepper */}
                        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 shadow-xs">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateItem(idx, 'quantity', Math.max(1, item.quantity - 1))
                            }
                            className="h-6 w-6 rounded flex items-center justify-center text-slate-500 hover:bg-white"
                            disabled={item.quantity <= 1}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))
                            }
                            className="w-10 text-center font-bold text-slate-900 bg-transparent text-xs outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(idx, 'quantity', item.quantity + 1)}
                            className="h-6 w-6 rounded flex items-center justify-center text-slate-500 hover:bg-white"
                          >
                            +
                          </button>
                        </div>

                        {/* Amount */}
                        <div className="w-24 text-right">
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            NPR {lineTotal.toLocaleString()}
                          </span>
                        </div>

                        {orderItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Remove SKU"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 10a: Combo Detection Banner */}
              {detectedCombo && !comboApplied && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-600 shrink-0" />
                    <span className="text-xs">
                      These items form the <strong>{detectedCombo.name}</strong> — apply combo price of{' '}
                      <strong>NPR {detectedCombo.comboPrice.toLocaleString()}</strong> (saves NPR{' '}
                      {detectedCombo.savings.toLocaleString()})?
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyCombo}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 shadow-sm shrink-0"
                  >
                    Apply Combo Price ✓
                  </button>
                </div>
              )}

              {comboApplied && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-emerald-900 text-xs flex items-center justify-between">
                  <span>
                    ✓ Combo pricing applied: <strong>{comboApplied.name}</strong> (NPR{' '}
                    {comboApplied.comboPrice.toLocaleString()})
                  </span>
                  <button
                    type="button"
                    onClick={() => setComboApplied(null)}
                    className="text-emerald-700 hover:text-rose-600 underline font-semibold text-[11px]"
                  >
                    Reset to individual prices
                  </button>
                </div>
              )}
            </div>

            {/* Section 4: Delivery, Payment & Remarks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Delivery Method <span className="text-rose-500">*</span>
                </label>
                <select
                  value={deliveryMethod}
                  onChange={(e) => setDeliveryMethod(e.target.value as DeliveryMethod)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-semibold text-slate-900 focus:border-blue-500"
                >
                  {deliveryMethods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Payment Terms <span className="text-rose-500">*</span>
                </label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-semibold text-slate-900 focus:border-blue-500"
                >
                  <option value="COD">Cash on Delivery (COD)</option>
                  <option value="Prepaid">Prepaid (eSewa / Khalti / FonePay)</option>
                </select>
              </div>
            </div>

            {/* FIX 60a & FIX 71a: ORDER CLASSIFICATION (Marketing / Influencer Send) */}
            <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isMarketing}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsMarketing(checked);
                      if (checked) {
                        setDeliveryMethod('Pick-up');
                      }
                    }}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5">
                    <Gift className="w-4 h-4 text-purple-600" />
                    <span className="font-bold text-xs sm:text-sm text-purple-900">
                      Marketing / Influencer Send
                    </span>
                  </div>
                </label>
                <span className="text-[10px] sm:text-[11px] font-semibold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-full self-start sm:self-center">
                  Product Seeding (Zero Revenue)
                </span>
              </div>

              {isMarketing && (
                <div className="space-y-3 pt-3 border-t border-purple-200/70 animate-in fade-in slide-in-from-top-1">
                  {/* Search Directory / Quick Select */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-purple-950 uppercase tracking-wider">
                      Search Directory / Select Influencer
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search directory by name, handle, or niche..."
                          value={influencerSearchQuery}
                          onChange={(e) => setInfluencerSearchQuery(e.target.value)}
                          className="w-full pl-8.5 pr-3 py-1.5 border border-purple-200 rounded-xl text-xs bg-white focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                      <select
                        value={influencerId}
                        onChange={(e) => handleSelectExistingInfluencer(e.target.value)}
                        className="rounded-xl border border-purple-200 px-3 py-1.5 bg-white text-xs font-medium text-slate-800 outline-none focus:border-purple-500 shadow-2xs sm:max-w-[240px]"
                      >
                        <option value="">-- Or Select from List ({filteredExistingInfluencers.length}) --</option>
                        {filteredExistingInfluencers.map((inf) => (
                          <option key={inf.id} value={inf.id}>
                            {inf.name} ({inf.platforms[0]?.handle || 'No handle'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Selected Influencer Rich Preview Card (Fix 71a) */}
                  {selectedInfluencerObj && (
                    <div className="p-3 bg-white border border-purple-200 rounded-xl shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-purple-950">
                            {selectedInfluencerObj.name}
                          </span>
                          <span className="text-[11px] font-mono text-purple-700 font-semibold">
                            {selectedInfluencerObj.platforms[0]?.handle}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            {selectedInfluencerObj.qualityRating === 'GREAT'
                              ? '⭐⭐⭐ Great'
                              : selectedInfluencerObj.qualityRating === 'AVERAGE'
                              ? '⭐⭐ Good'
                              : selectedInfluencerObj.qualityRating === 'POOR'
                              ? '⭐ Poor'
                              : 'Not Rated'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                          <span>
                            {selectedInfluencerObj.platforms[0]?.platform || 'Instagram'} &bull;{' '}
                            {selectedInfluencerObj.platforms[0]?.followers
                              ? `${(selectedInfluencerObj.platforms[0].followers / 1000).toFixed(1)}K followers`
                              : 'Creator'}
                          </span>
                          <span>&bull;</span>
                          <span>Category: <strong className="text-slate-700">{selectedInfluencerObj.category}</strong></span>
                          <span>&bull;</span>
                          <span>
                            Previous sends: <strong className="text-purple-900">{selectedInfluencerObj.totalSends || 0}</strong>
                          </span>
                          <span>&bull;</span>
                          <span>
                            Content: <strong className="text-purple-900">{selectedInfluencerObj.totalContent || 0} pieces</strong>
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectExistingInfluencer('')}
                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg border border-slate-200 transition self-start sm:self-center cursor-pointer"
                      >
                        Change / New
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Influencer Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Shristi Vaidya"
                        value={influencerName}
                        onChange={(e) => {
                          setInfluencerName(e.target.value);
                          if (!customerName || customerName.includes('(PR)')) setCustomerName(`${e.target.value} (PR)`);
                        }}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-xs font-medium outline-none focus:border-purple-500"
                        required={isMarketing}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Influencer Phone (Optional)
                      </label>
                      <input
                        type="tel"
                        placeholder="98XXXXXXXX"
                        value={influencerPhone}
                        onChange={(e) => {
                          setInfluencerPhone(e.target.value);
                          if (!customerPhone) setCustomerPhone(e.target.value);
                        }}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-xs font-medium outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Content Platform <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={influencerPlatform}
                        onChange={(e) => setInfluencerPlatform(e.target.value as any)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-xs font-medium outline-none focus:border-purple-500"
                      >
                        <option value="Instagram">Instagram</option>
                        <option value="TikTok">TikTok</option>
                        <option value="YouTube">YouTube</option>
                        <option value="Facebook">Facebook</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Handle / Username
                      </label>
                      <input
                        type="text"
                        placeholder="@username"
                        value={influencerHandle}
                        onChange={(e) => setInfluencerHandle(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-xs font-medium outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Campaign Seeding Notes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Send 2 Roll-On + 1 Serum for new launch PR review"
                      value={influencerNotes}
                      onChange={(e) => setInfluencerNotes(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-xs font-medium outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Remarks & Delivery Instructions
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Call before delivery, delicate packaging, gift wrapping requested..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 bg-white outline-none text-slate-900 focus:border-blue-500"
              />
            </div>

            {/* Order Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-200 pt-5">
              <div>
                <span className="text-slate-500 text-xs">Calculated Total:</span>{' '}
                <strong className="text-xl font-mono font-black text-slate-900 block sm:inline sm:ml-1">
                  NPR {totalAmount.toLocaleString()}
                </strong>
              </div>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-8 py-3 text-xs font-bold text-white shadow-md hover:bg-blue-700 active:scale-[0.99] flex items-center justify-center gap-2"
              >
                Proceed to Review
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
          </div>
        )
      )}

      {/* Invoice Details Modal */}
      {showOrderModal && savedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Order Invoice</span>
                <h3 className="text-lg font-black text-slate-900">#{savedOrder.orderNumber}</h3>
              </div>
              <button
                onClick={() => setShowOrderModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <strong className="text-slate-900">{savedOrder.customerName} ({savedOrder.customerPhone})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Brand & Courier:</span>
                <strong className="text-slate-900">{savedOrder.brandCode} • {savedOrder.deliveryMethod} ({savedOrder.paymentTerms})</strong>
              </div>
              <div className="border-t border-slate-200 pt-2 space-y-1">
                <span className="text-slate-500 font-semibold block">Itemized SKUs:</span>
                {savedOrder.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-[11px] text-slate-700">
                    <span>{it.quantity}x {it.name}</span>
                    <span className="font-mono font-semibold">NPR {it.totalPrice.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                <span className="font-bold text-slate-800 text-sm">Amount Payable:</span>
                <span className="font-mono font-black text-lg text-emerald-700">NPR {savedOrder.totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                href={`/customers/${savedOrder.customerPhone}`}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                Open in Customer 360 ↗
              </Link>
              <button
                onClick={() => setShowOrderModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PageGuard>
  );
}
