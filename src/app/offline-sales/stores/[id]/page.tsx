'use client';

import { hasCreditLimit } from '@/lib/payment-terms';
import StoredPhoto from '@/components/common/StoredPhoto';
import PagedList from '@/components/common/PagedList';
import Portal from '@/components/common/Portal';
import Money, { canSeeMoney } from '@/components/common/Money';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { analyzeStoreArea, applicableStorePromotions } from '@/lib/area-selling';
import StoreUpsellPanel from '@/components/stores/StoreUpsellPanel';
import { canDownload } from '@/lib/download-access';
import { downloadStockCountWorkbook, downloadStoreOrderWorkbook } from '@/lib/export/record-downloads';
import { dispatchStatus, statusLabel } from '@/lib/dispatch-flow';
import StoreDeleteButton from '@/components/stores/StoreDeleteButton';
import SetLocationModal from '@/components/stores/SetLocationModal';
import StoreBrandsModal from '@/components/stores/StoreBrandsModal';
import StockBalanceSheet from '@/components/stock/StockBalanceSheet';
import StoreAreaEditor from '@/components/stores/StoreAreaEditor';
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
  Lightbulb,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Layers3,
  Activity,
  Download,
  Printer,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import { belongsToStore, orderCadenceDays, shelfForecast } from '@/lib/store-records';
import ShelfCountSheet from '@/components/stock/ShelfCountSheet';
import DownloadButton from '@/components/common/DownloadButton';
import { canPerform, getScope, hasAccess } from '@/lib/permissions';
import {
  BeatItem,
  Cheque,
  HandoverDocument,
  ShelfPhoto,
  SecondaryOrder,
  StockCount,
  StoreHealthScore,
} from '@/lib/types';

export default function StoreDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [refreshTick, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(value => value + 1);
    window.addEventListener('bb-db-updated', update);
    void db.syncWithSupabase().catch(() => {}).then(update);
    return () => window.removeEventListener('bb-db-updated', update);
  }, []);
  const storeIdParam = params?.id as string;
  const currentUser = db.getCurrentUser();
  const isOfficer = !canPerform(currentUser, 'stores', 'DELETE') && getScope(currentUser, 'stores') === 'OWN';
  const canViewSelling = hasAccess(currentUser, 'beat_plans');

  const [activeTab, setActiveTab] = useState<
    'VISITS' | 'STOCK' | 'LEDGER' | 'PHOTOS' | 'CHEQUES' | 'DOCS' | 'ORDERS' | 'ANALYTICS' | 'SALES_INTELLIGENCE' | 'NOTES'
  >(searchParams.get('tab') === 'selling' && canViewSelling ? 'SALES_INTELLIGENCE' : searchParams.get('tab') === 'stock' ? 'STOCK' : 'VISITS');
  const requestedSelling = searchParams.get('tab') === 'selling';
  useEffect(() => {
    if (requestedSelling && canViewSelling) setActiveTab('SALES_INTELLIGENCE');
    if (!canViewSelling) setActiveTab(tab => tab === 'SALES_INTELLIGENCE' ? 'VISITS' : tab);
  }, [requestedSelling, canViewSelling]);

  // Multi-Contact Modal State
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRole, setNewContactRole] = useState<any>('Store Manager');
  const [newContactPhone, setNewContactPhone] = useState('+977-98');

  // Lightbox for shelf photos
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [countOpen, setCountOpen] = useState<false | 'COUNT' | 'SALES'>(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
  /** For an MT chain: which outlet's records to show ('ALL' combines every outlet and the head office). */
  const [outletFilter, setOutletFilter] = useState('ALL');

  // Load store
  const store = storeIdParam && [...db.getRetailers(), ...db.getBranches(), ...db.getDistributors()].some(row => row.id === storeIdParam) ? db.getUnifiedStoreById(storeIdParam) : null;

  // An MT chain's history is every outlet's plus the head office's.
  const chainOutlets = store?.type === 'DISTRIBUTOR' ? db.getBranches().filter((b) => b.distributorId === store.id) : [];
  const isChain = chainOutlets.length > 0;
  const scope: { id: string; name: string }[] = !store ? [] : !isChain ? [store]
    : outletFilter === 'ALL' ? [store, ...chainOutlets]
    : outletFilter === store.id ? [store]
    : chainOutlets.filter((b) => b.id === outletFilter);
  const scopeKey = scope.map((s) => s.id).join('|');
  const inScope = (record: { entityId?: string; storeName?: string }) => scope.some((s) => belongsToStore(record, s));
  const suppliedStores = store?.type === 'DISTRIBUTOR' && !isChain ? db.getRetailers().filter((r) => r.distributorId === store.id) : [];

  // Load associated operational records
  const visits: BeatItem[] = useMemo(() => {
    if (!store) return [];
    return db.getBeatItems().filter(inScope);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, scopeKey]);

  const cheques: Cheque[] = useMemo(() => {
    if (!store) return [];
    return db.getCheques().filter(inScope);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, scopeKey]);

  const documents: HandoverDocument[] = useMemo(() => {
    if (!store) return [];
    return db.getDocuments().filter(inScope);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, scopeKey]);

  const shelfPhotos: ShelfPhoto[] = useMemo(() => {
    if (!store) return [];
    return db.getShelfPhotos().filter(inScope);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, scopeKey]);

  const secondaryOrders: SecondaryOrder[] = useMemo(() => {
    if (!store) return [];
    return db.getSecondaryOrders().filter(inScope);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, scopeKey]);

  const stockCounts: StockCount[] = useMemo(() => {
    if (!store) return [];
    return db.getStockCounts().filter(inScope)
      .sort((a, b) => (b.dateAd || b.createdAt).localeCompare(a.dateAd || a.createdAt));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, scopeKey]);

  // Fix 34: Store Health Score
  const healthScore: StoreHealthScore | null = useMemo(() => {
    if (!store) return null;
    // A chain's score is the average of its outlets (or the chosen outlet).
    const ids = isChain ? scope.filter((s) => s.id !== store.id).map((s) => s.id) : [store.id];
    if (ids.length <= 1) return db.getStoreHealthScore(ids[0] || store.id);
    const scores = ids.map((id) => db.getStoreHealthScore(id));
    const avg = (pick: (h: StoreHealthScore) => number) => Math.round(scores.reduce((sum, h) => sum + (pick(h) || 0), 0) / scores.length);
    const overall = avg((h) => h.overall);
    return {
      ...scores[0], overall, tier: overall >= 70 ? 'TIER_1' : overall >= 40 ? 'TIER_2' : 'TIER_3',
      orderRegularity: avg((h) => h.orderRegularity), paymentDiscipline: avg((h) => h.paymentDiscipline), stockMaintenance: avg((h) => h.stockMaintenance), visitCooperation: avg((h) => h.visitCooperation), issueRate: avg((h) => h.issueRate),
      breakdown: scores[0].breakdown ? { orderVelocityScore: avg((h) => h.breakdown?.orderVelocityScore || 0), paymentScore: avg((h) => h.breakdown?.paymentScore || 0), visitFrequencyScore: avg((h) => h.breakdown?.visitFrequencyScore || 0), stockFreshnessScore: avg((h) => h.breakdown?.stockFreshnessScore || 0) } : undefined,
    } as StoreHealthScore;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, scopeKey]);

  const areaStores = [...db.getRetailers().map(row => ({ ...row, entityType: 'RETAILER' as const })), ...db.getBranches().map(row => ({ ...row, entityType: 'BRANCH' as const }))];
  const storeRecord = store?.type === 'BRANCH' ? db.getBranches().find(row => row.id === store.id) : store?.type === 'RETAILER' ? db.getRetailers().find(row => row.id === store.id) : undefined;
  const areaAnalysis = analyzeStoreArea(store?.id || '', areaStores, canViewSelling ? db.getSecondaryOrders() : [], db.getProducts(), canViewSelling ? db.getStockCounts() : [], new Date(), store?.type === 'BRANCH' ? 'BRANCH' : 'RETAILER');
  const promotions = canViewSelling && store ? applicableStorePromotions(db.getPromotions(), store.id, store.type === 'RETAILER' ? 'GT' : store.type === 'BRANCH' ? 'MT' : null) : [];

  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  // Cancelled orders are not sales: leave them out of volume, order value and cadence.
  const liveOrders = secondaryOrders.filter((o) => o.status !== 'CANCELLED');
  const last30DaysOrders = liveOrders.filter((o) => {
    const t = new Date(o.orderDateAd || o.createdAt).getTime();
    return t >= thirtyDaysAgoMs;
  });
  const volume30Days = last30DaysOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const aov = liveOrders.length > 0 ? Math.round(liveOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0) / liveOrders.length) : 0;
  const cadenceDays = orderCadenceDays(liveOrders.map((o) => o.orderDateAd || o.createdAt));
  const cadenceText = cadenceDays !== null ? `Every ${cadenceDays} ${cadenceDays === 1 ? 'day' : 'days'}` : liveOrders.length === 1 ? '1 order so far' : 'No orders yet';
  const forecastRows = shelfForecast(stockCounts, liveOrders);
  const cashedCheques = cheques.filter((c) => c.status === 'CASHED' && c.receivedDateAd && c.cashDateAd);
  const avgClearanceDelay = cashedCheques.length > 0 ? (cashedCheques.reduce((sum, c) => {
    const d1 = new Date(c.receivedDateAd).getTime();
    const d2 = new Date(c.cashDateAd).getTime();
    return sum + Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
  }, 0) / cashedCheques.length).toFixed(1) + ' Days' : 'N/A';

  if (!store) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Store className="h-10 w-10 text-slate-300 mx-auto mb-2" />
        <h2 className="text-base font-bold text-slate-800">Store not found</h2>
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
          { label: 'Offline sales', href: '/offline-sales/stores' },
          { label: 'Stores & branches', href: '/offline-sales/stores' },
          { label: store.name },
        ]}
      />

      {/* Store Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 p-2 text-blue-600">
                <Store className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-2xl">{store.name}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">{store.subType}</span>
                      {store.type === 'BRANCH' && store.distributorId && <Link href={`/offline-sales/stores/${store.distributorId}`} className="text-[11px] font-semibold text-blue-700 hover:underline">Whole chain →</Link>}
                    </div>
                  </div>
                  <div className="-mt-2 shrink-0"><StoreDeleteButton id={store.id} name={store.name} onDeleted={() => router.push('/offline-sales/stores')} /></div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  <span>{store.address}</span>
                  {store.coordinates ? (
                    <span className="font-mono text-[11px] text-slate-500 ml-1">
                      ({store.coordinates.lat.toFixed(4)}, {store.coordinates.lng.toFixed(4)})
                    </span>
                  ) : <span className="ml-1 font-semibold text-amber-700">No location</span>}
                  {(canPerform(currentUser, 'stores', 'EDIT') || canPerform(currentUser, 'distributors', 'EDIT') || (canPerform(currentUser, 'stores', 'CREATE') && store.assignedOfficerId === currentUser.id)) && (
                    <button type="button" onClick={() => setLocationOpen(true)} className="ml-1 font-semibold text-blue-700 hover:underline">{store.coordinates ? 'Edit location' : 'Add location'}</button>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Brands: <span className="font-semibold text-slate-800">{store.brandCodes?.length ? store.brandCodes.map((code) => db.getBrands('ALL').find((b) => b.code === code)?.name || code).join(', ') : 'All brands'}</span>
                  {(canPerform(currentUser, 'stores', 'EDIT') || canPerform(currentUser, 'distributors', 'EDIT') || (canPerform(currentUser, 'stores', 'CREATE') && store.assignedOfficerId === currentUser.id)) && (
                    <button type="button" onClick={() => setBrandsOpen(true)} className="ml-1 font-semibold text-blue-700 hover:underline">Edit brands</button>
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
                  href={`/offline-sales/scorecard?officer=${encodeURIComponent(store.assignedOfficerName || '')}`}
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
                className="btn btn-primary"
              >
                <Clock className="h-3.5 w-3.5" />
                Go to today&apos;s beat
              </Link>
              <Link
                href={`/offline-sales/cheques?search=${encodeURIComponent(store.name)}`}
                className="btn btn-secondary"
              >
                <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
                Cheques register
              </Link>
              {(store.type === 'RETAILER' || store.type === 'BRANCH') && (
                <button type="button" onClick={() => setCountOpen('COUNT')}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                  <ClipboardList className="h-3.5 w-3.5 text-blue-600" />
                  Update stock
                </button>
              )}
              <DownloadButton label="Download store file" fileLabel={store.name}
                datasets={['stores', 'store_orders', 'store_order_lines', 'visits', 'stock_counts', 'shelf_photos', 'shelf_share', 'cheques', 'dispatch_orders', 'dispatch_lines', 'calls', 'documents']}
                filters={{ storeId: store.id }} className="py-1.5" />
            </div>
          </div>
        </div>

        {/* Financial & Contact Meta Cards */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${!isOfficer ? 'lg:grid-cols-4' : 'lg:grid-cols-2'} gap-3 pt-3 border-t border-slate-100`}>
          {/* Contacts */}
          <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
            <span className="font-semibold text-slate-500 text-[11px] block">
              Primary contact
            </span>
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-500" />
              {store.primaryContactName || 'No contact saved'}
            </div>
            {store.primaryContactPhone && <a
              href={`tel:${store.primaryContactPhone}`}
              className="font-mono text-blue-600 hover:underline flex items-center gap-1 text-[11px]"
            >
              <Phone className="h-3 w-3" />
              {store.primaryContactPhone}
            </a>}
          </div>

          {!isOfficer && (
            <>
              {/* Credit Limit */}
              <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                <span className="font-semibold text-slate-500 text-[11px] block">
                  Credit limit
                </span>
                <div className="font-bold text-slate-900 text-sm">
                  {hasCreditLimit(store.creditLimit) ? <Money>{store.creditLimit.toLocaleString()}</Money> : 'No limit'}
                </div>
                <div className="text-[11px] text-slate-500">
                  Terms: {store.paymentTerms || 'Not set'}
                </div>
              </div>

              {/* Outstanding Balance */}
              <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                <span className="font-semibold text-slate-500 text-[11px] block">
                  Current outstanding
                </span>
                <div className="font-bold text-amber-600 text-sm">
                  <Money>{(store.outstandingBalance || 0).toLocaleString()}</Money>
                </div>
                <div className="text-[11px] text-slate-500">
                  {cheques.length} Cheque(s) in pipeline
                </div>
              </div>
            </>
          )}

          {/* Activity Totals */}
          <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
            <span className="font-semibold text-slate-500 text-[11px] block">
              Historical activity
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
            <div className="rounded-xl bg-slate-900 text-white p-4 md:col-span-2 lg:col-span-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                    <h4 className="font-bold text-sm text-white">Store health score</h4>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold   ${
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
                    Orders in the last 90 days, cheque record, latest shelf count and visits completed.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t sm:border-t-0 sm:border-l border-slate-700 pt-3 sm:pt-0 sm:pl-4">
                <div>
                  <span className="text-slate-500 text-[11px] font-bold block">Order velocity</span>
                  <span className="font-bold text-white text-sm">{healthScore.orderRegularity}/30</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] font-bold block">Payment discipline</span>
                  <span className="font-bold text-white text-sm">{healthScore.paymentDiscipline}/25</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] font-bold block">Stock freshness</span>
                  <span className="font-bold text-white text-sm">{healthScore.stockMaintenance}/25</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] font-bold block">Visit cooperation</span>
                  <span className="font-bold text-white text-sm">{healthScore.visitCooperation}/20</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Multi-contact directory */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block mb-1">
              Store contacts ({store.contacts?.length || 0}):
            </span>
            <div className="flex flex-wrap gap-2">
              {(store.contacts && store.contacts.length > 0
                ? store.contacts
                : store.primaryContactName || store.primaryContactPhone ? [{ name: store.primaryContactName, role: '', phone: store.primaryContactPhone }] : []
              ).map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs flex items-center gap-2"
                >
                  <span className="font-semibold text-slate-800">{c.name}</span>
                  <span className="rounded bg-white px-1 border border-slate-200 text-[11px] text-slate-600 font-medium">
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
            <span>Add contact</span>
          </button>
        </div>
      </div>

      {/* Add Contact Modal */}
      {showAddContactModal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                Add Contact to {store.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddContactModal(false)}
                className="text-slate-500 hover:text-slate-600 p-1"
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
                toast.success(`Contact ${newContactName} added.`);
              }}
              className="space-y-4 pt-4 text-xs"
            >
              <div>
                <label htmlFor="-id--contact-name" className="block font-bold text-slate-700 mb-1">Contact name *</label>
                <input id="-id--contact-name"
                  type="text"
                  required
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="e.g. Ramesh Shrestha"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div>
                <label htmlFor="-id--contact-role" className="block font-bold text-slate-700 mb-1">Contact role *</label>
                <select id="-id--contact-role"
                  value={newContactRole}
                  onChange={(e) => setNewContactRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium bg-white"
                >
                  <option value="Owner">Owner / proprietor</option>
                  <option value="Store Manager">Store manager</option>
                  <option value="Accounts / Cheque">Accounts / cheque department</option>
                  <option value="Floor Supervisor">Floor supervisor</option>
                  <option value="Receiving Bay">Receiving bay / stock incharge</option>
                </select>
              </div>

              <div>
                <label htmlFor="-id--phone-number" className="block font-bold text-slate-700 mb-1">Phone number *</label>
                <input id="-id--phone-number"
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
                  className="btn btn-primary"
                >
                  Save contact
                </button>
              </div>
            </form>
          </div>
        </div></Portal>
      )}

      {storeRecord && <StoreAreaEditor key={`${store.type}:${store.id}`} record={storeRecord} entityType={store.type === 'BRANCH' ? 'BRANCH' : 'RETAILER'} />}

      {isChain && (
        <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4" aria-labelledby="chain-outlets-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="chain-outlets-title" className="text-sm font-bold text-slate-900">Whole chain: {chainOutlets.length} {chainOutlets.length === 1 ? 'outlet' : 'outlets'}</h2>
              <p className="text-xs text-slate-600">The tabs below show {outletFilter === 'ALL' ? 'every outlet combined' : `only ${scope[0]?.name || 'this outlet'}`}.</p>
            </div>
            <label className="text-xs font-semibold text-slate-700">Show
              <select value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
                <option value="ALL">All outlets combined</option>
                <option value={store.id}>Head office only</option>
                {chainOutlets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Outlet</th><th className="px-3 py-2 text-right">Orders</th>{!isOfficer && <th className="px-3 py-2 text-right">Order value</th>}<th className="px-3 py-2 text-right">Units</th><th className="px-3 py-2">Last visit</th><th className="px-3 py-2">Last count</th></tr></thead>
              <tbody>
                {[{ id: store.id, name: 'Head office' }, ...chainOutlets].map((outlet) => {
                  const orders = db.getSecondaryOrders().filter((o) => o.status !== 'CANCELLED' && belongsToStore(o, outlet.id === store.id ? store : outlet));
                  const lastVisit = db.getBeatItems().filter((b) => belongsToStore(b, outlet.id === store.id ? store : outlet) && b.status === 'VISITED').map((b) => b.dateAd).sort().at(-1);
                  const lastCount = db.getStockCounts().filter((c) => belongsToStore(c, outlet.id === store.id ? store : outlet)).map((c) => c.dateAd || c.createdAt.slice(0, 10)).sort().at(-1);
                  if (outlet.id === store.id && !orders.length && !lastVisit && !lastCount) return null;
                  return (
                    <tr key={outlet.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold">{outlet.id === store.id ? 'Head office' : <Link href={`/offline-sales/stores/${outlet.id}`} className="text-blue-700 hover:underline">{outlet.name}</Link>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{orders.length}</td>
                      {!isOfficer && <td className="px-3 py-2 text-right tabular-nums"><Money>{orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toLocaleString()}</Money></td>}
                      <td className="px-3 py-2 text-right tabular-nums">{orders.reduce((sum, o) => sum + (o.totalUnits || 0), 0).toLocaleString()}</td>
                      <td className="px-3 py-2">{lastVisit || '—'}</td>
                      <td className="px-3 py-2">{lastCount || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {suppliedStores.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="supplied-stores-title">
          <h2 id="supplied-stores-title" className="text-sm font-bold text-slate-900">Stores this distributor supplies ({suppliedStores.length})</h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {<PagedList items={suppliedStores} label="stores" pageSize={25} asItem render={(pageRows) => pageRows.map((r) => <li key={r.id}><Link href={`/offline-sales/stores/${r.id}`} className="inline-block rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-blue-700 hover:bg-blue-50">{r.name}<span className="ml-1 font-normal text-slate-500">{r.area}</span></Link></li>)} />}
          </ul>
        </section>
      )}

      {/* Tabs Navigation */}
      <div className="flex overflow-x-auto gap-2 border-b border-slate-200 pb-2">
        {[
          { key: 'VISITS', label: 'Visit history', count: visits.length, icon: Clock },
          ...(!isOfficer ? [{ key: 'ANALYTICS', label: 'Analytics & credit', icon: TrendingUp }] : []),
          ...(canViewSelling ? [{ key: 'SALES_INTELLIGENCE', label: 'Area selling assist', icon: TrendingUp }] : []),
          { key: 'STOCK', label: 'Stock', count: stockCounts.length, icon: ClipboardList },
          { key: 'PHOTOS', label: 'Shelf photos', count: shelfPhotos.length, icon: Camera },
          { key: 'CHEQUES', label: 'Cheques', count: cheques.length, icon: CreditCard },
          { key: 'DOCS', label: 'Documents', count: documents.length, icon: FileText },
          { key: 'ORDERS', label: 'Orders', count: secondaryOrders.length, icon: ShoppingBag },
          { key: 'NOTES', label: 'Notes log', icon: Lightbulb },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[11px] font-bold ${
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
            <h3 className="font-bold text-slate-900 text-sm">Beat visits & field check-ins</h3>
            <span className="text-xs text-slate-500 font-medium">
              {visits.length} logged visits
            </span>
          </div>

          {visits.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed rounded-xl">
              No field visits logged for this store yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {<PagedList items={visits} label="visits" pageSize={10} render={(pageRows) => pageRows.map((v) => (
                <div key={v.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{v.dateBs}</span>
                      <span className="text-slate-500 font-mono text-[11px]">({v.dateAd})</span>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                          v.status === 'VISITED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : v.status === 'SKIPPED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-600'
                        } enum-label`}
                      >
                        {v.status}
                      </span>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      Check-in: {v.checkedInAt || '10:15 AM'} • Check-out: {v.checkedOutAt || '10:45 AM'} • Officer:{' '}
                      <Link
                        href={`/offline-sales/scorecard?officer=${encodeURIComponent((v as any).officerName || v.officerId || '')}`}
                        className="font-bold text-blue-600 hover:underline"
                      >
                        {(v as any).officerName || 'Officer not recorded'}
                      </Link>
                    </div>
                  </div>

                  {v.skipReason && (
                    <div className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded text-[11px] font-medium border border-rose-200">
                      Skip Reason: {v.skipReason}
                    </div>
                  )}
                </div>
              ))} />}
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
              <span className="text-slate-500 text-[11px] font-bold block">30-Day order volume</span>
              <p className="text-xl font-black text-slate-900 mt-1"><Money>{volume30Days.toLocaleString()}</Money></p>
              <span className="text-xs text-slate-500 font-semibold mt-0.5 inline-block">
                {last30DaysOrders.length} {last30DaysOrders.length === 1 ? 'order' : 'orders'} in the last 30 days
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <span className="text-slate-500 text-[11px] font-bold block">Average order value (AOV)</span>
              <p className="text-xl font-black text-slate-900 mt-1"><Money>{aov.toLocaleString()}</Money></p>
              <span className="text-xs text-slate-500 mt-0.5 inline-block">{liveOrders.length} orders, cancelled left out</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <span className="text-slate-500 text-[11px] font-bold block">Replenishment cadence</span>
              <p className="text-xl font-black text-slate-900 mt-1">{cadenceText}</p>
              <span className="text-xs text-blue-600 font-semibold mt-0.5 inline-block">
                {liveOrders.length > 1 ? 'Typical gap between orders' : 'Awaiting more orders'}
              </span>
            </div>
          </div>

          {/* Stock Depletion Forecast */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">SKU stock depletion &amp; runout forecast</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  From this store&apos;s last two shelf counts and the units it ordered between them.
                </p>
              </div>
              <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-bold border border-blue-200">
                {forecastRows.length} products counted
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl" tabIndex={0}>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Product SKU</th>
                    <th className="p-3">Brand</th>
                    <th className="p-3 text-center">Shelf stock</th>
                    <th className="p-3 text-center">Daily run rate</th>
                    <th className="p-3 text-center">Days of stock</th>
                    <th className="p-3">Replenishment status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {forecastRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        No stock counts for this store yet. Count the shelf on a visit to start the forecast.
                      </td>
                    </tr>
                  ) : (
                    forecastRows.map((row) => {
                      const tone = row.status === 'OUT' || row.status === 'CRITICAL'
                        ? { text: 'text-rose-600', chip: 'bg-rose-50 text-rose-700 border-rose-200' }
                        : row.status === 'LOW' ? { text: 'text-amber-600', chip: 'bg-amber-50 text-amber-700 border-amber-200' }
                        : row.status === 'OK' ? { text: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                        : { text: 'text-slate-500', chip: 'bg-slate-50 text-slate-600 border-slate-200' };
                      const label = { OUT: 'Out of stock', CRITICAL: 'Reorder today', LOW: 'Reorder next visit', OK: 'Enough stock', UNKNOWN: 'Needs a second count' }[row.status];
                      return (
                        <tr key={row.productId} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-slate-900"><Link href={`/products/${row.productId}`} className="hover:text-blue-600 hover:underline">{row.productName}</Link></td>
                          <td className="p-3 text-slate-600 font-medium">{row.brandCode}</td>
                          <td className="p-3 text-center font-bold text-slate-800">{row.shelfQty} units<div className="text-[11px] font-normal text-slate-500">counted {row.countedOn}</div></td>
                          <td className="p-3 text-center text-slate-600">{row.perDay === null ? '—' : `${row.perDay} a day`}</td>
                          <td className={`p-3 text-center font-black ${tone.text}`}>{row.daysLeft === null ? '—' : `${row.daysLeft} days`}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${tone.chip}`}>{label}</span>
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
                <h3 className="font-bold text-slate-900 text-sm">Vendor payment history &amp; credit tracking</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tracks credit limit utilization, invoice aging, and cheque collection discipline.
                </p>
              </div>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-bold border border-emerald-200">
                Terms: {store.paymentTerms || 'Not set'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 block">Total credit line</span>
                <p className="text-base font-bold text-slate-900 mt-0.5">{hasCreditLimit(store.creditLimit) ? <Money>{store.creditLimit.toLocaleString()}</Money> : 'No limit'}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                <span className="text-[11px] font-bold text-blue-600 block">Current outstanding</span>
                <p className="text-base font-bold text-blue-900 mt-0.5"><Money>{(store.outstandingBalance || 0).toLocaleString()}</Money></p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-600 block">Available balance</span>
                <p className="text-base font-bold text-emerald-900 mt-0.5">
                  {hasCreditLimit(store.creditLimit) ? <Money>{Math.max(0, store.creditLimit - (store.outstandingBalance || 0)).toLocaleString()}</Money> : 'No limit'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 block">Avg clearance delay</span>
                <p className="text-base font-bold text-slate-900 mt-0.5">{avgClearanceDelay}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'SALES_INTELLIGENCE' && canViewSelling && <StoreUpsellPanel analysis={areaAnalysis} promotions={promotions} />}

      {/* TAB 2: STOCK COUNTS */}

      {activeTab === 'STOCK' && (
        <StockBalanceSheet storeIds={scope.map((s) => s.id)} fileLabel={store.name} version={refreshTick * 1000 + stockCounts.length}
          title={isChain ? (outletFilter === 'ALL' ? 'Stock balance sheet: all outlets' : 'Stock balance sheet') : 'Stock balance sheet'}
          onCount={(store.type === 'RETAILER' || store.type === 'BRANCH') ? () => setCountOpen('COUNT') : undefined} onSales={(store.type === 'RETAILER' || store.type === 'BRANCH') ? () => setCountOpen('SALES') : undefined} />
      )}

      {activeTab === 'STOCK' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Counts and sales entries</h3>
            <span className="text-xs text-slate-500 font-medium">{stockCounts.length} {stockCounts.length === 1 ? 'entry' : 'entries'}</span>
          </div>

          {stockCounts.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed rounded-xl">
              No counts or sales entries yet. Use “Stock on shelf now” to set the opening stock.
            </div>
          ) : (
            <div className="space-y-3">
              {<PagedList items={stockCounts} label="stock counts" pageSize={10} render={(pageRows) => pageRows.map((sc) => (
                <div key={sc.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">{sc.dateBs}</span>
                      <span className="text-slate-500 text-[11px] ml-1">({sc.dateAd})</span>
                    </div>
                    <span className="flex items-center gap-2 text-slate-500"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${sc.mode === 'SALES' ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-800'}`}>{sc.mode === 'SALES' ? 'Sold' : 'Count'}</span>{sc.mode === 'SALES' ? 'Entered' : 'Counted'} by {sc.officerName || 'not recorded'}{isChain && sc.entityId !== store.id ? ` · ${sc.storeName}` : ''}
                      {canDownload(currentUser) && <button type="button" onClick={() => downloadStockCountWorkbook(sc, db.getProducts('ALL'), db.getBrands('ALL'))} aria-label={`Download the count of ${sc.dateBs}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3 w-3" /> Excel</button>}
                    </span>
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
                          {sc.mode === 'SALES'
                            ? <span>Sold: <strong>{item.soldQty || 0}</strong> (stock {item.previousQty} → {item.shelfQty})</span>
                            : <span>Shelf: <strong>{item.shelfQty}</strong> (before: {item.previousQty})</span>}
                          {item.flaggedDrop && (
                            <span className="text-[11px] text-rose-600 font-semibold bg-rose-50 px-1 rounded">
                              &gt;50% Drop
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))} />}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SHELF PHOTOS */}
      {activeTab === 'PHOTOS' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Shelf merchandising & facing gallery</h3>
            <span className="text-xs text-slate-500 font-medium">
              {shelfPhotos.length} photo sets
            </span>
          </div>

          {shelfPhotos.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed rounded-xl">
              No shelf photos uploaded for this store yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {<PagedList items={shelfPhotos} label="photos" pageSize={12} render={(pageRows) => pageRows.map((p) => {
                const img = p.afterPhotoUrls?.[0] || p.beforePhotoUrls?.[0];
                return (
                  <div
                    key={p.id}
                    onClick={() => img && setLightboxPhoto(img)}
                    className="group relative rounded-xl border border-slate-200 overflow-hidden bg-slate-100 cursor-pointer shadow-sm hover:shadow-md transition"
                  >
                    <div className="h-44 w-full overflow-hidden flex items-center justify-center bg-slate-100">
                      {img ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <StoredPhoto src={img} alt="Shelf" imgClassName="h-full w-full object-cover transition-transform duration-300" />
                      ) : (
                        <Camera className="w-8 h-8 text-slate-400" />
                      )}
                    </div>
                    <div className="p-3 bg-white text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{p.dateBs}</span>
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">
                          {(p as any).facingCount || 12} Facings
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        Officer: {p.officerName || 'Not recorded'}
                      </p>
                    </div>
                  </div>
                );
              })} />}
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
              Open full cheque ledger ↗
            </Link>
          </div>

          {cheques.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed rounded-xl">
              No cheques registered from this store yet.
            </div>
          ) : (
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full text-left text-xs min-w-[650px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-bold">
                  <tr>
                    <th className="p-2.5">Cheque #</th>
                    <th className="p-2.5">Bank</th>
                    <th className="p-2.5 text-right">Amount (NPR)</th>
                    <th className="p-2.5">Received date</th>
                    <th className="p-2.5">Cash date</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Officer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {<PagedList items={cheques} label="cheques" pageSize={10} asRow render={(pageRows) => pageRows.map((c) => (
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
                        <Money>{c.amount.toLocaleString()}</Money>
                      </td>
                      <td className="p-2.5 text-slate-600">{c.receivedDateBs}</td>
                      <td className="p-2.5 text-slate-600">{c.cashDateBs}</td>
                      <td className="p-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            c.status === 'CASHED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : c.status === 'COLLECTED_IN_FIELD'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          } enum-label`}
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
                  ))} />}
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
            <h3 className="font-bold text-slate-900 text-sm">Vendor handover documents</h3>
            <Link
              href="/offline-sales/documents"
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              Open documents hub ↗
            </Link>
          </div>

          {documents.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed rounded-xl">
              No physical handover documents tracked for this store yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {<PagedList items={documents} label="documents" pageSize={10} render={(pageRows) => pageRows.map((d) => (
                <div key={d.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{d.documentType}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                        d.status === 'FILED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : d.status === 'HANDED_OVER'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      } enum-label`}
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
              ))} />}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: ORDERS */}
      {activeTab === 'ORDERS' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Store orders</h3>
            <span className="text-xs text-slate-500 font-medium">
              {secondaryOrders.length} orders
            </span>
          </div>

          {secondaryOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed rounded-xl">
              No secondary orders booked for this store yet.
            </div>
          ) : (
            <div className="space-y-3">
              {<PagedList items={secondaryOrders} label="orders" pageSize={10} render={(pageRows) => pageRows.map((ord) => (
                <div key={ord.id} className="rounded-xl border border-slate-200 bg-white p-4 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{/^PENDING-/i.test(ord.orderNumber) ? 'Awaiting ID' : ord.orderNumber}</span>
                      <span className="text-slate-500 text-[11px]">{ord.orderDateBs}{isChain && ord.entityId !== store.id ? ` · ${ord.storeName}` : ''}</span>
                      {(() => {
                        const dispatch = db.getDispatches().find((d) => d.orderId === ord.id);
                        const label = dispatch ? statusLabel(dispatchStatus(dispatch)) : ord.status === 'CANCELLED' ? 'Cancelled' : ord.status === 'DELIVERED' ? 'Delivered' : ord.status === 'DISPATCHED' ? 'Dispatched' : 'Order received';
                        return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{label}{dispatch?.dispatchNumber ? ` · ${dispatch.dispatchNumber}` : ''}</span>;
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      {canDownload(currentUser) && <button type="button" onClick={() => downloadStoreOrderWorkbook(ord, db.getProducts('ALL'), db.getBrands('ALL'), canSeeMoney())} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50" aria-label={`Download order ${ord.orderNumber}`}><Download className="h-3 w-3" /> Excel</button>}
                      {(() => { const dispatch = db.getDispatches().find((d) => d.orderId === ord.id); return dispatch && hasAccess(currentUser, 'dispatches') ? <Link href={`/offline-sales/dispatch/challan/${encodeURIComponent(dispatch.id)}`} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Printer className="h-3 w-3" /> Challan</Link> : null; })()}
                      <span className="font-black text-slate-900 text-sm"><Money>{ord.totalAmount.toLocaleString()}</Money></span>
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
                          {it.totalUnits} units ({it.cases} cases) = <strong><Money>{it.totalAmount.toLocaleString()}</Money></strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))} />}
            </div>
          )}
        </div>
      )}

      {/* TAB 7: NOTES */}
      {activeTab === 'NOTES' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 text-xs">
          <h3 className="font-bold text-slate-900 text-sm">Field directives & account remarks</h3>
          <div className="space-y-2 text-slate-700">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-900 block mb-0.5">Payment routine:</span>
              Prefers cheque handover during Thursday afternoon beats. Requires original VAT copy stamped by accounts clerk.
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-900 block mb-0.5">Merchandising target:</span>
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
      {brandsOpen && <StoreBrandsModal target={{ type: store.type === 'BRANCH' ? 'BRANCH' : store.type === 'DISTRIBUTOR' ? 'DISTRIBUTOR' : 'RETAILER', id: store.id, name: store.name, codes: store.brandCodes || [], outletCount: chainOutlets.length }} onClose={() => setBrandsOpen(false)} onSaved={() => refresh((v) => v + 1)} />}
      {locationOpen && <SetLocationModal type={store.type === 'BRANCH' ? 'BRANCH' : store.type === 'DISTRIBUTOR' ? 'DISTRIBUTOR' : 'RETAILER'} id={store.id} name={store.name} lat={store.coordinates?.lat} lng={store.coordinates?.lng} onClose={() => setLocationOpen(false)} onSaved={() => refresh((v) => v + 1)} />}
      <ShelfCountSheet
        target={countOpen && store && (store.type === 'RETAILER' || store.type === 'BRANCH') ? { storeId: store.id, storeName: store.name, entityType: store.type as 'RETAILER' | 'BRANCH', mode: countOpen } : null}
        onSaved={() => { setActiveTab('STOCK'); refresh((n) => n + 1); }}
        onClose={() => setCountOpen(false)}
      />
    </PageGuard>
  );
}
