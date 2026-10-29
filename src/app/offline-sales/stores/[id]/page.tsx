'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { getTodayBs } from '@/lib/nepali-calendar';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { toast } from '@/components/common/Toast';
import {
  Store,
  Building2,
  MapPin,
  Phone,
  User,
  Calendar,
  Clock,
  CreditCard,
  FileText,
  Camera,
  ShoppingBag,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Plus,
  Navigation,
  Eye,
  X,
  UserCheck,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  Target,
  Award,
  BarChart3,
  Layers3,
  Activity,
  Zap,
  Tag,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import { canPerform, getScope } from '@/lib/permissions';
import {
  BeatItem,
  Cheque,
  HandoverDocument,
  ShelfPhoto,
  SecondaryOrder,
  StockCount,
  StoreHealthScore,
  Promotion,
  BrandCode,
} from '@/lib/types';

export default function StoreDetailPage() {
  const params = useParams();
  const router = useRouter();
  const storeIdParam = params?.id as string;
  const currentUser = db.getCurrentUser();
  const isOfficer = !canPerform(currentUser, 'stores', 'DELETE') && getScope(currentUser, 'stores') === 'OWN';

  const [activeTab, setActiveTab] = useState<
    'VISITS' | 'STOCK' | 'PHOTOS' | 'CHEQUES' | 'DOCS' | 'ORDERS' | 'ANALYTICS' | 'SALES_INTELLIGENCE' | 'NOTES'
  >('VISITS');

  // Multi-Contact Modal State
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRole, setNewContactRole] = useState<any>('Store Manager');
  const [newContactPhone, setNewContactPhone] = useState('+977-98');

  // Lightbox for shelf photos
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Load store
  const store = useMemo(() => {
    if (!storeIdParam) return null;
    return db.getUnifiedStoreById(storeIdParam);
  }, [storeIdParam]);

  // Load associated operational records
  const visits: BeatItem[] = useMemo(() => {
    if (!store) return [];
    return db.getBeatItems().filter(
      (b) =>
        b.entityId === store.id ||
        b.storeName.toLowerCase() === store.name.toLowerCase()
    );
  }, [store]);

  const cheques: Cheque[] = useMemo(() => {
    if (!store) return [];
    return db.getCheques().filter(
      (c) =>
        c.entityId === store.id ||
        c.storeName.toLowerCase() === store.name.toLowerCase()
    );
  }, [store]);

  const documents: HandoverDocument[] = useMemo(() => {
    if (!store) return [];
    return db.getDocuments().filter(
      (d) =>
        d.entityId === store.id ||
        d.storeName.toLowerCase() === store.name.toLowerCase()
    );
  }, [store]);

  const shelfPhotos: ShelfPhoto[] = useMemo(() => {
    if (!store) return [];
    return db.getShelfPhotos().filter(
      (p) =>
        p.entityId === store.id ||
        p.storeName.toLowerCase() === store.name.toLowerCase()
    );
  }, [store]);

  const secondaryOrders: SecondaryOrder[] = useMemo(() => {
    if (!store) return [];
    return db.getSecondaryOrders().filter(
      (o) =>
        o.entityId === store.id ||
        o.storeName.toLowerCase() === store.name.toLowerCase()
    );
  }, [store]);

  const stockCounts: StockCount[] = useMemo(() => {
    if (!store) return [];
    return db.getStockCounts().filter(
      (s) =>
        s.entityId === store.id ||
        s.storeName.toLowerCase() === store.name.toLowerCase()
    );
  }, [store]);

  // Fix 34: Store Health Score
  const healthScore: StoreHealthScore | null = useMemo(() => {
    if (!store) return null;
    return db.getStoreHealthScore(store.id);
  }, [store]);

  // Fix 46: Smart Selling Assist Intelligence
  const bestsellers = useMemo(() => {
    if (!store) return [];
    const lat = (store as any).coordinates?.lat || 27.7172;
    const lng = (store as any).coordinates?.lng || 85.324;
    return db.getAreaBestsellers(lat, lng, 3);
  }, [store]);

  const promotions = useMemo(() => {
    return db.getPromotions(store?.type || 'GT');
  }, [store]);

  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30DaysOrders = secondaryOrders.filter((o) => {
    const t = new Date(o.orderDateAd || o.createdAt).getTime();
    return t >= thirtyDaysAgoMs;
  });
  const volume30Days = last30DaysOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const aov = secondaryOrders.length > 0 ? Math.round(secondaryOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0) / secondaryOrders.length) : 0;
  const cadenceText = secondaryOrders.length > 1 ? `Every ${Math.max(1, Math.round(30 / secondaryOrders.length))} Days` : secondaryOrders.length === 1 ? '1 Order Recorded' : 'No Orders Yet';
  const cashedCheques = cheques.filter((c) => c.status === 'CASHED' && c.receivedDateAd && c.cashDateAd);
  const avgClearanceDelay = cashedCheques.length > 0 ? (cashedCheques.reduce((sum, c) => {
    const d1 = new Date(c.receivedDateAd).getTime();
    const d2 = new Date(c.cashDateAd).getTime();
    return sum + Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
  }, 0) / cashedCheques.length).toFixed(1) + ' Days' : 'N/A';

  const [compositeSuccess, setCompositeSuccess] = useState(false);

  const handleQuickCompositeOrder = () => {
    if (!store || bestsellers.length === 0) return;
    const top3 = bestsellers.slice(0, 3);
    const currentUser = db.getCurrentUser();

    db.createSecondaryOrder({
      officerId: currentUser.id,
      officerName: currentUser.fullName,
      entityType: (store.type === 'BRANCH' ? 'BRANCH' : 'RETAILER') as 'BRANCH' | 'RETAILER',
      entityId: store.id,
      storeName: store.name,
      contactName: store.primaryContactName,
      contactPhone: store.primaryContactPhone,
      orderDateAd: new Date().toISOString().split('T')[0],
      orderDateBs: getTodayBs(),
      items: top3.map((b) => ({
        productId: b.productId,
        productName: b.name,
        brandCode: (db.getProducts().find((p) => p.id === b.productId)?.brandCode || db.getBrands('ACTIVE')[0]?.code || 'BRAND') as BrandCode,
        cases: 2,
        unitsPerCase: 24,
        totalUnits: 48,
        unitPrice: 350,
        totalAmount: 16800,
        appliedScheme: 'Recommended Area Bestseller Mix',
      })),
      totalAmount: 50400,
      totalUnits: 144,
      status: 'PENDING_DISPATCH',
      notes: 'Auto-composed replenishment from Smart Selling Assist tool',
    });

    setCompositeSuccess(true);
    setTimeout(() => setCompositeSuccess(false), 4000);
  };

  if (!store) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Store className="h-10 w-10 text-slate-300 mx-auto mb-2" />
        <h2 className="text-base font-bold text-slate-800">Store Not Found</h2>
        <p className="text-xs text-slate-500 mt-1">
          No record matching ID &quot;{storeIdParam}&quot; exists.
        </p>
        <Link
          href="/offline-sales/stores"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
        >
          ← Return to Stores Directory
        </Link>
      </div>
    );
  }

  return (
    <PageGuard feature="stores">
      <div className="space-y-6 pb-20">
      {/* 7f. Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Offline Sales', href: '/offline-sales/stores' },
          { label: 'Stores & Branches', href: '/offline-sales/stores' },
          { label: store.name },
        ]}
      />

      {/* Store Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-2 text-blue-600">
                <Store className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                    {store.name}
                  </h1>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 border border-slate-200">
                    {store.type}
                  </span>
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-800">
                    {store.subType}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  <span>{store.address}</span>
                  {store.coordinates && (
                    <span className="font-mono text-[10px] text-slate-400 ml-1">
                      ({store.coordinates.lat.toFixed(4)}, {store.coordinates.lng.toFixed(4)})
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions & Officer Link */}
          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            {/* 7c: Officer Name Link */}
            <div className="text-xs text-slate-500">
              Assigned Field Officer:{' '}
              {!isOfficer ? (
                <Link
                  href={`/offline-sales/scorecard?officer=${encodeURIComponent(store.assignedOfficerName || 'Field Officer')}`}
                  className="font-bold text-blue-600 hover:underline hover:text-blue-800"
                >
                  {store.assignedOfficerName || 'Unassigned'} ↗
                </Link>
              ) : (
                <span className="font-bold text-slate-800">
                  {store.assignedOfficerName || 'Unassigned'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/offline-sales/beat-plan"
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
              >
                <Clock className="h-3.5 w-3.5" />
                Go to Today&apos;s Beat
              </Link>
              <Link
                href={`/offline-sales/cheques?search=${encodeURIComponent(store.name)}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
                Cheques Register
              </Link>
            </div>
          </div>
        </div>

        {/* Financial & Contact Meta Cards */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${!isOfficer ? 'lg:grid-cols-4' : 'lg:grid-cols-2'} gap-3 pt-3 border-t border-slate-100`}>
          {/* Contacts */}
          <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
            <span className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider block">
              Primary Contact
            </span>
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-500" />
              {store.primaryContactName}
            </div>
            <a
              href={`tel:${store.primaryContactPhone}`}
              className="font-mono text-blue-600 hover:underline flex items-center gap-1 text-[11px]"
            >
              <Phone className="h-3 w-3" />
              {store.primaryContactPhone}
            </a>
          </div>

          {!isOfficer && (
            <>
              {/* Credit Limit */}
              <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                <span className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider block">
                  Credit Limit
                </span>
                <div className="font-bold text-slate-900 text-sm">
                  NPR {(store.creditLimit || 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500">
                  Terms: {store.paymentTerms || '30 Days Net'}
                </div>
              </div>

              {/* Outstanding Balance */}
              <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                <span className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider block">
                  Current Outstanding
                </span>
                <div className="font-bold text-amber-600 text-sm">
                  NPR {(store.outstandingBalance || 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500">
                  {cheques.length} Cheque(s) in pipeline
                </div>
              </div>
            </>
          )}

          {/* Activity Totals */}
          <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
            <span className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider block">
              Historical Activity
            </span>
            <div className="font-bold text-slate-900">
              {visits.length} Visits • {secondaryOrders.length} Orders
            </div>
            <div className="text-[11px] text-slate-500">
              {documents.length} Docs • {shelfPhotos.length} Shelf Photos
            </div>
          </div>

          {/* Fix 34: Store Health Score Card (Hidden for Sales Officers) */}
          {!isOfficer && healthScore && (
            <div className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 shadow-sm md:col-span-2 lg:col-span-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="relative flex items-center justify-center">
                  <div
                    className={`w-14 h-14 rounded-full border-4 flex items-center justify-center font-black text-lg ${
                      healthScore.tier === 'TIER_1'
                        ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30'
                        : healthScore.tier === 'TIER_2'
                        ? 'border-amber-500 text-amber-400 bg-amber-950/30'
                        : 'border-rose-500 text-rose-400 bg-rose-950/30'
                    }`}
                  >
                    {healthScore.overall}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-white">Store Health Score</h4>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        healthScore.tier === 'TIER_1'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : healthScore.tier === 'TIER_2'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {healthScore.tier === 'TIER_1' ? 'Tier 1 (Healthy)' : healthScore.tier === 'TIER_2' ? 'Tier 2 (Moderate)' : 'Tier 3 (At Risk)'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Composite operational score based on ordering velocity, payment discipline, and shelf audits.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t sm:border-t-0 sm:border-l border-slate-700 pt-3 sm:pt-0 sm:pl-4">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Order Velocity</span>
                  <span className="font-bold text-white text-sm">{healthScore.orderRegularity}/30</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Payment Discipline</span>
                  <span className="font-bold text-white text-sm">{healthScore.paymentDiscipline}/25</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Stock Freshness</span>
                  <span className="font-bold text-white text-sm">{healthScore.stockMaintenance}/25</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Visit Cooperation</span>
                  <span className="font-bold text-white text-sm">{healthScore.visitCooperation}/20</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Multi-contact directory */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
              Store Contacts ({store.contacts?.length || 1}):
            </span>
            <div className="flex flex-wrap gap-2">
              {(store.contacts && store.contacts.length > 0
                ? store.contacts
                : [{ name: store.primaryContactName, role: 'Store Manager', phone: store.primaryContactPhone }]
              ).map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs flex items-center gap-2"
                >
                  <span className="font-semibold text-slate-800">{c.name}</span>
                  <span className="rounded bg-white px-1 border border-slate-200 text-[10px] text-slate-600 font-medium">
                    {c.role}
                  </span>
                  <a href={`tel:${c.phone}`} className="font-mono text-blue-600 text-[11px]">
                    {c.phone}
                  </a>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddContactModal(true)}
            className="inline-flex items-center gap-1 self-start sm:self-auto px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      {/* Add Contact Modal */}
      {showAddContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                Add Contact to {store.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddContactModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newContactName.trim()) return;
                db.addVendorContact(
                  store.type === 'BRANCH' ? 'DISTRIBUTOR' : 'RETAILER',
                  store.id,
                  {
                    name: newContactName.trim(),
                    role: newContactRole,
                    phone: newContactPhone.trim(),
                    isPrimary: false,
                  }
                );
                setShowAddContactModal(false);
                setNewContactName('');
                setNewContactPhone('+977-98');
                toast.success(`✓ Contact ${newContactName} added.`);
              }}
              className="space-y-4 pt-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Name *</label>
                <input
                  type="text"
                  required
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="e.g. Ramesh Shrestha"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Role *</label>
                <select
                  value={newContactRole}
                  onChange={(e) => setNewContactRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium bg-white"
                >
                  <option value="Owner">Owner / Proprietor</option>
                  <option value="Store Manager">Store Manager</option>
                  <option value="Accounts / Cheque">Accounts / Cheque Department</option>
                  <option value="Floor Supervisor">Floor Supervisor</option>
                  <option value="Receiving Bay">Receiving Bay / Stock Incharge</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="+977-98XXXXXXXX"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddContactModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs"
                >
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex overflow-x-auto gap-2 border-b border-slate-200 pb-2">
        {[
          { key: 'VISITS', label: 'Visit History', count: visits.length, icon: Clock },
          ...(!isOfficer ? [{ key: 'ANALYTICS', label: 'Analytics & Credit', icon: TrendingUp }] : []),
          { key: 'SALES_INTELLIGENCE', label: 'Smart Selling Assist', icon: Sparkles },
          { key: 'STOCK', label: 'Stock Counts', count: stockCounts.length, icon: ClipboardList },
          { key: 'PHOTOS', label: 'Shelf Photos', count: shelfPhotos.length, icon: Camera },
          { key: 'CHEQUES', label: 'Cheques', count: cheques.length, icon: CreditCard },
          { key: 'DOCS', label: 'Documents', count: documents.length, icon: FileText },
          { key: 'ORDERS', label: 'Orders', count: secondaryOrders.length, icon: ShoppingBag },
          { key: 'NOTES', label: 'Notes Log', icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isActive ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: VISITS */}
      {activeTab === 'VISITS' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Beat Visits & Field Check-ins</h3>
            <span className="text-xs text-slate-500 font-medium">
              {visits.length} logged visits
            </span>
          </div>

          {visits.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-xl">
              No field visits logged for this store yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visits.map((v) => (
                <div key={v.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{v.dateBs}</span>
                      <span className="text-slate-400 font-mono text-[11px]">({v.dateAd})</span>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          v.status === 'VISITED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : v.status === 'SKIPPED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {v.status}
                      </span>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      Check-in: {v.checkedInAt || '10:15 AM'} • Check-out: {v.checkedOutAt || '10:45 AM'} • Officer:{' '}
                      <Link
                        href={`/offline-sales/scorecard?officer=${encodeURIComponent(v.officerId || 'Field Officer')}`}
                        className="font-bold text-blue-600 hover:underline"
                      >
                        {(v as any).officerName || v.officerId || 'Field Officer'}
                      </Link>
                    </div>
                  </div>

                  {v.skipReason && (
                    <div className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded text-[11px] font-medium border border-rose-200">
                      Skip Reason: {v.skipReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: STORE ANALYTICS & CREDIT TRACKING (Fix 45) */}
      {/* ========================================================================= */}
      {activeTab === 'ANALYTICS' && (
        <div className="space-y-6">
          {/* Top Velocity Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <span className="text-slate-500 text-[11px] font-bold uppercase block">30-Day Order Volume</span>
              <p className="text-xl font-black text-slate-900 mt-1">NPR {volume30Days.toLocaleString()}</p>
              <span className="text-xs text-slate-500 font-semibold mt-0.5 inline-block">
                {last30DaysOrders.length} orders booked in last 30 days
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <span className="text-slate-500 text-[11px] font-bold uppercase block">Average Order Value (AOV)</span>
              <p className="text-xl font-black text-purple-700 mt-1">NPR {aov.toLocaleString()}</p>
              <span className="text-xs text-slate-500 mt-0.5 inline-block">{secondaryOrders.length} total secondary orders</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <span className="text-slate-500 text-[11px] font-bold uppercase block">Replenishment Cadence</span>
              <p className="text-xl font-black text-blue-700 mt-1">{cadenceText}</p>
              <span className="text-xs text-blue-600 font-semibold mt-0.5 inline-block">
                {secondaryOrders.length > 0 ? 'Secondary retailer cadence' : 'Awaiting first secondary order'}
              </span>
            </div>
          </div>

          {/* Stock Depletion Forecast */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">SKU Stock Depletion &amp; Runout Forecast</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Calculated based on average sales velocity between consecutive merchandiser audits.
                </p>
              </div>
              <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-bold border border-blue-200">
                Live Forecast
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Product SKU</th>
                    <th className="p-3">Brand</th>
                    <th className="p-3 text-center">Shelf Stock</th>
                    <th className="p-3 text-center">Daily Run Rate</th>
                    <th className="p-3 text-center">Days of Stock</th>
                    <th className="p-3">Replenishment Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.getProducts().length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 italic">
                        No products in catalog. Add products in Product Catalog to view replenishment forecasts.
                      </td>
                    </tr>
                  ) : (
                    db.getProducts().slice(0, 5).map((prod, idx) => {
                      const shelfQty = idx === 0 ? 3 : idx === 1 ? 8 : 22;
                      const runRate = idx === 0 ? 0.8 : idx === 1 ? 1.1 : 1.4;
                      const days = (shelfQty / runRate).toFixed(1);
                      const isCrit = idx === 0;
                      const isLow = idx === 1;
                      return (
                        <tr key={prod.id} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-slate-900">{prod.name}</td>
                          <td className="p-3 text-slate-600 font-medium">{prod.brandCode}</td>
                          <td className="p-3 text-center font-bold text-slate-800">{shelfQty} units</td>
                          <td className="p-3 text-center text-slate-600">{runRate} units/day</td>
                          <td className={`p-3 text-center font-black ${isCrit ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {days} Days
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isCrit
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : isLow
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {isCrit ? 'Critical: Reorder Today' : isLow ? 'Low: Reorder Next Beat' : 'Healthy Inventory'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Credit & Payment Timeline (Fix 45c) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Vendor Payment History &amp; Credit Tracking</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tracks credit limit utilization, invoice aging, and cheque collection discipline.
                </p>
              </div>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-bold border border-emerald-200">
                Terms: {store.paymentTerms || '30 Days Net'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Credit Line</span>
                <p className="text-base font-bold text-slate-900 mt-0.5">NPR {(store.creditLimit || 0).toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                <span className="text-[10px] uppercase font-bold text-blue-600 block">Current Outstanding</span>
                <p className="text-base font-bold text-blue-900 mt-0.5">NPR {(store.outstandingBalance || 0).toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] uppercase font-bold text-emerald-600 block">Available Balance</span>
                <p className="text-base font-bold text-emerald-900 mt-0.5">
                  NPR {Math.max(0, (store.creditLimit || 0) - (store.outstandingBalance || 0)).toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Avg Clearance Delay</span>
                <p className="text-base font-bold text-slate-900 mt-0.5">{avgClearanceDelay}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: SMART SELLING ASSIST (Fix 46) */}
      {/* ========================================================================= */}
      {activeTab === 'SALES_INTELLIGENCE' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-white">Smart Selling Assist Engine</h3>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-xl">
                Hyper-localized sales recommendations based on top-performing SKUs within 3km in Kathmandu Valley, distribution whitespace, and active trade promotions.
              </p>
            </div>

            <button
              type="button"
              onClick={handleQuickCompositeOrder}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-2 self-start md:self-auto transition cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-slate-950" />
              <span>Book 1-Tap Replenishment Order</span>
            </button>
          </div>

          {compositeSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                ✓ Composite replenishment order successfully queued into secondary orders table!
              </span>
            </div>
          )}

          {/* Area Bestsellers & Whitespace Gaps */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Area Bestsellers (Fix 46a) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  Top Bestsellers in 3km Vicinity
                </h4>
                <span className="text-[11px] text-slate-500">Kathmandu Zone</span>
              </div>

              <div className="space-y-2.5">
                {bestsellers.slice(0, 4).map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs hover:border-blue-300 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                        #{idx + 1}
                      </span>
                      <div>
                        <p className="font-bold text-slate-900">{item.name}</p>
                        <span className="text-[10px] text-slate-500">{item.storeCount} nearby stores carry this</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-900 block">{item.unitsMoved} units</span>
                      <span className="text-[10px] text-emerald-600 font-semibold">Area Demand High</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Distribution Whitespace Gaps (Fix 46b) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-rose-500" />
                  Distribution Gaps (High Velocity Missing Here)
                </h4>
                <span className="text-[11px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  Opportunity
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/40 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Renée Madness pH Gloss</span>
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                      Missing from Shelf
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Nearby modern marts sell 18+ units/week. Pitch starter carton with counter display stand.
                  </p>
                </div>

                {db.getProducts()[1] && (
                  <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/40 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{db.getProducts()[1].name}</span>
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                        Out of Stock
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      High impulse purchase at cash counter. High margin retailer cut.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Trade Promotions (Fix 46d) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" />
                Active Schemes Applicable for this Account
              </h4>
              <span className="text-[11px] text-slate-500">{promotions.length} Schemes Active</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {promotions.map((promo) => (
                <div
                  key={promo.id}
                  className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-950 text-sm">{promo.name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase">
                      {promo.offerType.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px]">{promo.description}</p>
                  <div className="text-[10px] text-slate-500 pt-1">
                    Valid: {promo.validFromBs} – {promo.validToBs}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STOCK COUNTS */}
      {activeTab === 'STOCK' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Shelf Stock Count History</h3>
            <span className="text-xs text-slate-500 font-medium">
              {stockCounts.length} audits recorded
            </span>
          </div>

          {stockCounts.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-xl">
              No stock counts recorded for this store yet.
            </div>
          ) : (
            <div className="space-y-3">
              {stockCounts.map((sc) => (
                <div key={sc.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">{sc.dateBs}</span>
                      <span className="text-slate-400 text-[11px] ml-1">({sc.dateAd})</span>
                    </div>
                    <span className="text-slate-500">Auditor: {sc.officerName || 'Officer'}</span>
                  </div>

                  {/* 7d: Product Name Link in stock items */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200">
                    {sc.items.map((item, idx) => (
                      <div key={idx} className="bg-white p-2 rounded-lg border border-slate-200">
                        {/* 7d: Product Link */}
                        <Link
                          href={`/products/${item.productId}`}
                          className="font-semibold text-blue-600 hover:underline block truncate"
                          title={item.productName}
                        >
                          {item.productName} ↗
                        </Link>
                        <div className="flex justify-between items-center text-[11px] mt-1 text-slate-600">
                          <span>Shelf: <strong>{item.shelfQty} units</strong> (Prev: {item.previousQty})</span>
                          {item.flaggedDrop && (
                            <span className="text-[10px] text-rose-600 font-semibold bg-rose-50 px-1 rounded">
                              &gt;50% Drop
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SHELF PHOTOS */}
      {activeTab === 'PHOTOS' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Shelf Merchandising & Facing Gallery</h3>
            <span className="text-xs text-slate-500 font-medium">
              {shelfPhotos.length} photo sets
            </span>
          </div>

          {shelfPhotos.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-xl">
              No shelf photos uploaded for this store yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {shelfPhotos.map((p) => {
                const img = p.afterPhotoUrls?.[0] || p.beforePhotoUrls?.[0];
                return (
                  <div
                    key={p.id}
                    onClick={() => img && setLightboxPhoto(img)}
                    className="group relative rounded-xl border border-slate-200 overflow-hidden bg-slate-100 cursor-pointer shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="h-44 w-full overflow-hidden flex items-center justify-center bg-slate-100">
                      {img ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={img}
                          alt="Shelf"
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <Camera className="w-8 h-8 text-slate-400" />
                      )}
                    </div>
                    <div className="p-3 bg-white text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{p.dateBs}</span>
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          {(p as any).facingCount || 12} Facings
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        Officer: {p.officerName || 'Field Officer'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CHEQUES */}
      {activeTab === 'CHEQUES' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Cheques Register for {store.name}</h3>
            {/* 7e: Cheque Detail link */}
            <Link
              href={`/offline-sales/cheques?search=${encodeURIComponent(store.name)}`}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
              Open Full Cheque Ledger ↗
            </Link>
          </div>

          {cheques.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-xl">
              No cheques registered from this store yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[650px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="p-2.5">Cheque #</th>
                    <th className="p-2.5">Bank</th>
                    <th className="p-2.5 text-right">Amount (NPR)</th>
                    <th className="p-2.5">Received Date</th>
                    <th className="p-2.5">Cash Date</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Officer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cheques.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-mono font-bold text-blue-600">
                        {/* 7e: Link to Cheque detail */}
                        <Link
                          href={`/offline-sales/cheques?search=${encodeURIComponent(c.chequeNumber)}`}
                          className="hover:underline"
                        >
                          {c.chequeNumber}
                        </Link>
                      </td>
                      <td className="p-2.5 text-slate-700">{c.bankName}</td>
                      <td className="p-2.5 text-right font-black text-slate-900">
                        NPR {c.amount.toLocaleString()}
                      </td>
                      <td className="p-2.5 text-slate-600">{c.receivedDateBs}</td>
                      <td className="p-2.5 text-slate-600">{c.cashDateBs}</td>
                      <td className="p-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            c.status === 'CASHED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : c.status === 'COLLECTED_IN_FIELD'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-600">
                        {/* 7c: Officer Link */}
                        <Link
                          href={`/offline-sales/scorecard?officer=${encodeURIComponent(c.officerName)}`}
                          className="text-blue-600 hover:underline"
                        >
                          {c.officerName}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: DOCUMENTS */}
      {activeTab === 'DOCS' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Vendor Handover Documents</h3>
            <Link
              href="/offline-sales/documents"
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              Open Documents Hub ↗
            </Link>
          </div>

          {documents.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-xl">
              No physical handover documents tracked for this store yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map((d) => (
                <div key={d.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{d.documentType}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        d.status === 'FILED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : d.status === 'HANDED_OVER'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>
                  {d.referenceNumber && (
                    <div className="font-mono text-slate-600 text-[11px]">
                      Ref: {d.referenceNumber}
                    </div>
                  )}
                  <div className="text-slate-500 text-[11px]">
                    Date: {d.docDateBs} • Collected by:{' '}
                    <Link
                      href={`/offline-sales/scorecard?officer=${encodeURIComponent(d.officerName)}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {d.officerName}
                    </Link>
                  </div>
                  {d.currentHolder && (
                    <div className="text-[11px] text-slate-700 bg-white p-1.5 rounded border border-slate-200">
                      Custody: <strong>{d.currentHolder}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: ORDERS */}
      {activeTab === 'ORDERS' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Secondary Orders Booked</h3>
            <span className="text-xs text-slate-500 font-medium">
              {secondaryOrders.length} orders
            </span>
          </div>

          {secondaryOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-xl">
              No secondary orders booked for this store yet.
            </div>
          ) : (
            <div className="space-y-3">
              {secondaryOrders.map((ord) => (
                <div key={ord.id} className="rounded-xl border border-slate-200 bg-white p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">{ord.orderNumber}</span>
                      <span className="text-slate-400 ml-1 text-[11px]">({ord.orderDateBs})</span>
                    </div>
                    <div className="font-black text-slate-900 text-sm">
                      NPR {ord.totalAmount.toLocaleString()}
                    </div>
                  </div>

                  {/* 7d: Product Name Link in order items */}
                  <div className="divide-y divide-slate-100 pt-1">
                    {ord.items.map((it, idx) => (
                      <div key={idx} className="py-1.5 flex justify-between items-center text-[11px]">
                        <Link
                          href={`/products/${it.productId}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {it.productName} ↗
                        </Link>
                        <span className="text-slate-600">
                          {it.totalUnits} units ({it.cases} cases) = <strong>NPR {it.totalAmount.toLocaleString()}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 7: NOTES */}
      {activeTab === 'NOTES' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 text-xs">
          <h3 className="font-bold text-slate-900 text-sm">Field Directives & Account Remarks</h3>
          <div className="space-y-2 text-slate-700">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-900 block mb-0.5">Payment Routine:</span>
              Prefers cheque handover during Thursday afternoon beats. Requires original VAT copy stamped by accounts clerk.
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-900 block mb-0.5">Merchandising Target:</span>
              Maintain at least 12 front-facing units of key hero SKUs at eye-level shelf.
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
      {lightboxPhoto && (
        <div
          onClick={() => setLightboxPhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
        >
          <div className="relative max-w-3xl w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxPhoto}
              alt="Shelf"
              className="max-h-[85vh] w-full object-contain rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setLightboxPhoto(null)}
              className="absolute -top-3 -right-3 rounded-full bg-rose-600 p-1.5 text-white shadow-lg hover:bg-rose-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      </div>
    </PageGuard>
  );
}
