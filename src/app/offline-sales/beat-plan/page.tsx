'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  CheckSquare,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Sparkles,
  Camera,
  CreditCard,
  X,
} from 'lucide-react';
import {
  BeatItem,
  Task,
  DutyStatus,
  SkipReason,
  FieldOfficerDailySummary,
} from '@/lib/types';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { canPerform, isSuperAdmin } from '@/lib/permissions';
import { toast } from '@/components/common/Toast';

// 58a. Modular Beat Plan Sub-components
import BeatRouteList from './components/BeatRouteList';
import CheckInFlow from './components/CheckInFlow';
import CheckOutSummary from './components/CheckOutSummary';
import StockCountForm from './components/StockCountForm';
import InlineOrderForm, { MultiProductOrderData } from './components/InlineOrderForm';
import EndOfDayModal from './components/EndOfDayModal';

export default function BeatPlanPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(db.getCurrentUser());
  const [beatItems, setBeatItems] = useState<BeatItem[]>([]);
  const [activeBeatId, setActiveBeatId] = useState<string | null>(null);
  const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
  const [officerDuty, setOfficerDuty] = useState<DutyStatus>('ONLINE');

  // Modals & Flows State
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCheckInOverlay, setShowCheckInOverlay] = useState(false);
  const [showStoreActionDashboard, setShowStoreActionDashboard] = useState(false);
  const [showCheckOutSummary, setShowCheckOutSummary] = useState(false);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
  const [activeCheckInTime, setActiveCheckInTime] = useState<string>('');
  const [targetBeat, setTargetBeat] = useState<BeatItem | null>(null);
  const [calculatedDistance, setCalculatedDistance] = useState<number>(0);
  const [currentGpsCoords, setCurrentGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // Slide-up Form States
  const [activeActionModal, setActiveActionModal] = useState<
    'NONE' | 'STOCK_COUNT' | 'SECONDARY_ORDER' | 'COLLECT_CHEQUE' | 'SHELF_PHOTOS'
  >('NONE');

  // Stock count form state
  const [stockCounts, setStockCounts] = useState<Record<string, number>>({});

  // Secondary order form state
  const [orderProductId, setOrderProductId] = useState('');
  const [orderUnitType, setOrderUnitType] = useState<'CASES' | 'PIECES'>('CASES');
  const [orderCases, setOrderCases] = useState(1);
  const [orderPieces, setOrderPieces] = useState(12);
  const [orderScheme, setOrderScheme] = useState('NONE');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderPhotoUrl, setOrderPhotoUrl] = useState('');

  // In-Store Cheque Collection Form State
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeAmount, setChequeAmount] = useState('');
  const [chequeBank, setChequeBank] = useState('Nabil Bank');
  const [chequeCashDate, setChequeCashDate] = useState('');
  const [chequePhotoUrl, setChequePhotoUrl] = useState('');
  const [chequeNotes, setChequeNotes] = useState('');

  // In-Store Shelf Photos Form State
  const [shelfRackSection, setShelfRackSection] = useState('Main Eye-Level Rack');
  const [beforePhotoUrls, setBeforePhotoUrls] = useState<string[]>([]);
  const [afterPhotoUrls, setAfterPhotoUrls] = useState<string[]>([]);

  // End Day Modal
  const [showEndDayModal, setShowEndDayModal] = useState(false);
  const [skipReasons, setSkipReasons] = useState<Record<string, SkipReason>>({});
  const [dailySummary, setDailySummary] = useState<FieldOfficerDailySummary | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Admin One-Time Beat Override State (Section 7)
  const isAdmin = isSuperAdmin(currentUser) || canPerform(currentUser, 'beat_plans', 'EDIT');
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideOfficerId, setOverrideOfficerId] = useState(currentUser.id);
  const [overrideStoreId, setOverrideStoreId] = useState('');
  const [overridePriority, setOverridePriority] = useState<'HIGH' | 'MEDIUM' | 'ROUTINE'>('HIGH');
  const [overrideNote, setOverrideNote] = useState('');

  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideStoreId) {
      toast.error('Please select a target store.');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    db.addOneTimeBeatOverride(
      overrideOfficerId,
      overrideStoreId,
      today,
      overridePriority,
      overrideNote || undefined
    );
    setShowOverrideModal(false);
    setOverrideNote('');
    setBeatItems([...db.getTodayBeat()]);
    toast.success('Store added to today’s beat plan as an admin priority stop.');
  };

  const refreshTasks = () => {
    const user = db.getCurrentUser();
    const all = db.getTasks();
    const uName = (user.fullName || '').toLowerCase();
    const uFirst = uName.split(' ')[0] || '';
    const myTasks = all.filter(
      (t) =>
        t.assignedTo === user.id ||
        (t.assignedToName &&
          (t.assignedToName.toLowerCase() === uName ||
            (uFirst.length > 2 && t.assignedToName.toLowerCase().includes(uFirst))))
    );
    setAssignedTasks(myTasks);
    setOfficerDuty(db.getOfficerDutyStatus(user.id) || 'ONLINE');
  };

  useEffect(() => {
    const refreshData = () => {
      const user = db.getCurrentUser();
      setCurrentUser(user);
      const todayBeats = db.getTodayBeat();
      setBeatItems(todayBeats);
      refreshTasks();
    };

    refreshData();
    if (typeof window !== 'undefined') {
      db.syncTasksFromSupabase().then(() => refreshTasks()).catch(() => {});
    }
    window.addEventListener('bb-db-updated', refreshData);
    return () => {
      window.removeEventListener('bb-db-updated', refreshData);
    };
  }, []);

  // Rule 5: 60-second real GPS ping in background when on-duty
  useEffect(() => {
    if (officerDuty === 'OFFLINE' || officerDuty === 'ON_LEAVE') return;

    const sendGpsPing = () => {
      if (typeof window === 'undefined' || !navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentGpsCoords({ lat: latitude, lng: longitude });
          const status = activeBeatId ? 'AT_STORE' : 'IN_TRANSIT';
          const activeStore = activeBeatId ? beatItems.find((b) => b.id === activeBeatId)?.storeName : undefined;

          db.updateStaffPing(
            currentUser.id,
            latitude,
            longitude,
            status,
            activeStore
          );
        },
        (error) => {
          console.warn('Geolocation ping info:', error.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    };

    sendGpsPing();
    const interval = setInterval(sendGpsPing, 60000);
    return () => clearInterval(interval);
  }, [officerDuty, currentUser.id, activeBeatId, beatItems]);

  const handleToggleDuty = () => {
    const nextStatus: DutyStatus =
      officerDuty === 'ONLINE' ? 'OFFLINE' : officerDuty === 'OFFLINE' ? 'ONLINE' : 'ONLINE';
    db.setOfficerDutyStatus(currentUser.id, nextStatus);
    setOfficerDuty(nextStatus);
    toast.info(`Duty status updated to ${nextStatus}.`);
  };

  const handleToggleTask = (task: Task) => {
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    db.updateTaskStatus(task.id, newStatus);
    refreshTasks();
    toast.success(newStatus === 'COMPLETED' ? 'Task marked complete.' : 'Task reopened.');
  };

  // GPS Check-in with real Geolocation
  const handleOpenCheckIn = (beat: BeatItem) => {
    setTargetBeat(beat);
    setShowCheckInModal(true);

    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setCurrentGpsCoords({ lat, lng });
          const dist = Math.round(db.calculateDistance(lat, lng, beat.lat, beat.lng));
          setCalculatedDistance(dist);
        },
        (error) => {
          console.warn('Geolocation check-in info:', error.message);
          setCalculatedDistance(0);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setCalculatedDistance(0);
    }
  };

  const handleConfirmArrival = (photoUrl?: string) => {
    if (!targetBeat) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setActiveCheckInTime(timeStr);

    const lat = currentGpsCoords?.lat ?? targetBeat.lat;
    const lng = currentGpsCoords?.lng ?? targetBeat.lng;

    db.checkInBeat(
      targetBeat.id,
      lat,
      lng,
      calculatedDistance,
      calculatedDistance > 150,
      calculatedDistance > 150 ? overrideReason : undefined,
      photoUrl
    );

    db.updateStaffPing(
      currentUser.id,
      lat,
      lng,
      'AT_STORE',
      targetBeat.storeName
    );

    setBeatItems(db.getTodayBeat());
    setShowCheckInModal(false);
    setShowStoreActionDashboard(true);
    toast.success(`Checked in at ${targetBeat.storeName} (${timeStr}).`);
  };

  const handleActionComplete = (actionKey: string) => {
    setCompletedActions((prev) => new Set(prev).add(actionKey));
  };

  // Stock count submit
  const handleSaveStockCount = () => {
    if (!targetBeat) return;
    const allProducts = db.getProducts();
    const items = Object.entries(stockCounts).map(([productId, shelfQty]) => {
      const prod = allProducts.find((p) => p.id === productId);
      return {
        productId,
        productName: prod?.name || 'Product',
        brandCode: prod?.brandCode || (db.getBrands('ACTIVE')[0]?.code || 'BRAND'),
        shelfQty,
        previousQty: shelfQty,
        flaggedDrop: false,
      };
    });

    db.recordStockCount({
      storeName: targetBeat.storeName,
      entityType: targetBeat.entityType,
      entityId: targetBeat.entityId,
      items,
      dateAd: targetBeat.dateAd,
      dateBs: targetBeat.dateBs,
    });

    setActiveActionModal('NONE');
    handleActionComplete('STOCK_COUNT');
    toast.success(`Stock count recorded for ${items.length} SKUs.`);
  };

  // Secondary order submit (Multi-product with live margins)
  const handleSaveSecondaryOrder = (orderData: MultiProductOrderData) => {
    if (!targetBeat) return;

    db.createSecondaryOrder({
      officerId: currentUser.id,
      officerName: currentUser.fullName,
      entityType: targetBeat.entityType,
      entityId: targetBeat.entityId,
      storeName: targetBeat.storeName,
      contactName: targetBeat.contactName,
      contactPhone: targetBeat.contactPhone,
      orderDateAd: targetBeat.dateAd,
      orderDateBs: targetBeat.dateBs,
      items: orderData.items,
      totalAmount: orderData.totalAmount,
      totalUnits: orderData.totalUnits,
      status: 'PENDING_DISPATCH',
      paymentTerms: orderData.paymentTerms,
      brandMargins: orderData.brandMargins,
      notes: orderData.notes,
      orderPhotoUrl: orderData.orderPhotoUrl,
    });

    setActiveActionModal('NONE');
    handleActionComplete('SECONDARY_ORDER');
    toast.success(`Secondary order booked: ${orderData.totalUnits} units (${orderData.items.length} SKUs) queued for distributor dispatch.`);
  };

  // Cheque Collection submit
  const handleSaveCheque = () => {
    if (!targetBeat) return;
    if (!chequeNumber.trim() || !chequeAmount || !chequeCashDate) {
      toast.error('Please enter Cheque Number, Amount, and Expected Deposit Date.');
      return;
    }

    db.addCheque({
      entityType: targetBeat.entityType,
      entityId: targetBeat.entityId,
      storeName: targetBeat.storeName,
      chequeNumber: chequeNumber.trim(),
      amount: parseFloat(chequeAmount) || 0,
      bankName: chequeBank,
      receivedDateAd: targetBeat.dateAd,
      receivedDateBs: targetBeat.dateBs,
      cashDateAd: chequeCashDate,
      cashDateBs: chequeCashDate,
      photoUrl:
        chequePhotoUrl ||
        'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=60',
      status: 'COLLECTED_IN_FIELD',
      notes: chequeNotes || undefined,
    });

    setActiveActionModal('NONE');
    setChequeNumber('');
    setChequeAmount('');
    setChequeCashDate('');
    setChequePhotoUrl('');
    setChequeNotes('');
    handleActionComplete('COLLECT_CHEQUE');
    toast.success(`Cheque recorded for ${targetBeat.storeName}. Handover to office pending.`);
  };

  // Shelf Photos submit
  const handleSaveShelfPhotos = () => {
    if (!targetBeat) return;
    if (beforePhotoUrls.length === 0 && afterPhotoUrls.length === 0) {
      toast.error('Please capture or upload at least one Before or After shelf photo.');
      return;
    }

    db.recordShelfPhotos({
      storeName: targetBeat.storeName,
      entityType: targetBeat.entityType,
      entityId: targetBeat.entityId,
      rackSection: shelfRackSection,
      beforePhotoUrls:
        beforePhotoUrls.length > 0
          ? beforePhotoUrls
          : ['https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=60'],
      afterPhotoUrls:
        afterPhotoUrls.length > 0
          ? afterPhotoUrls
          : ['https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=800&auto=format&fit=crop&q=60'],
      dateAd: targetBeat.dateAd,
      dateBs: targetBeat.dateBs,
    });

    setActiveActionModal('NONE');
    setBeforePhotoUrls([]);
    setAfterPhotoUrls([]);
    handleActionComplete('SHELF_PHOTOS');
    toast.success(`Shelf photos saved for ${targetBeat.storeName}.`);
  };

  // Route Optimization (Haversine heuristic)
  const handleOptimizeRoute = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      // Sort: High priority first, then medium, then routine
      const sorted = [...beatItems].sort((a, b) => {
        const pOrder: Record<string, number> = { HIGH: 1, MEDIUM: 2, ROUTINE: 3 };
        return (pOrder[a.priority || 'ROUTINE'] || 3) - (pOrder[b.priority || 'ROUTINE'] || 3);
      });
      setBeatItems(sorted);
      setIsOptimizing(false);
      toast.success('Route sequence optimized by priority tiers.');
    }, 400);
  };

  // Conclude store stop
  const handleConcludeStoreVisit = () => {
    setShowStoreActionDashboard(false);
    setShowCheckOutSummary(true);
  };

  const handleProceedNextStore = () => {
    setShowCheckOutSummary(false);
    setTargetBeat(null);
    setCompletedActions(new Set());
    setBeatItems(db.getTodayBeat());
    toast.info('Proceeding to next stop on route.');
  };

  // End Day submit
  const handleEndMyDay = () => {
    const unvisited = beatItems.filter((b) => b.status === 'PENDING');
    unvisited.forEach((item) => {
      const reason = skipReasons[item.id] || 'Other task assigned';
      db.skipBeatItem(item.id, 'Other task assigned', reason);
    });

    const summary = db.generateEndOfDaySummary(currentUser.id);
    setDailySummary(summary);
    setBeatItems(db.getTodayBeat());
    setShowEndDayModal(false);
    setShowSummaryModal(true);
    db.setOfficerDutyStatus(currentUser.id, 'OFFLINE');
    setOfficerDuty('OFFLINE');
    toast.success('Day concluded. Field operations summary generated.');
  };

  const pendingTasksCount = assignedTasks.filter((t) => t.status === 'PENDING').length;
  const pendingBeatCount = beatItems.filter((b) => b.status === 'PENDING').length;

  return (
    <PageGuard feature="beat_plans">
      <div className="space-y-6 pb-36 sm:pb-12">
        <Breadcrumbs
          items={[
            { label: 'Offline Sales', href: '/offline-sales/stores' },
            { label: 'Beat Plan & Field Tasks' },
          ]}
        />

        {/* Top Header Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-black text-slate-900">
                Namaste,{' '}
                <Link
                  href={`/offline-sales/scorecard?officer=${encodeURIComponent(
                    currentUser.fullName
                  )}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {currentUser.fullName}
                </Link>
                !
              </span>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                {currentUser.territory || 'Kathmandu Central Beat'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Your daily field action dashboard • Stores, task directives, and cheque collections
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  const stores = db.getStoresUnified();
                  if (stores[0]) setOverrideStoreId(stores[0].id);
                  setShowOverrideModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>+ One-Time Beat Stop</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleDuty}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs ${
                officerDuty === 'ONLINE'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  officerDuty === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span>Duty: {officerDuty}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowEndDayModal(true);
              }}
              className={`rounded-xl px-4 py-2 text-xs font-bold shadow-xs transition ${
                officerDuty === 'OFFLINE'
                  ? 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'
                  : pendingBeatCount === 0
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {officerDuty === 'OFFLINE'
                ? 'Shift Concluded (Offline)'
                : pendingBeatCount === 0
                ? '✓ Conclude Shift & End Day'
                : 'End My Day'}
            </button>
          </div>
        </div>

        {/* Assigned Directives & Tasks */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
                <CheckSquare className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Today&apos;s Assigned Directives &amp; To-Do List
                  </h3>
                  {pendingTasksCount > 0 && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                      {pendingTasksCount} Pending
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Priority directives dispatched by HQ Admin for your beat today
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {assignedTasks.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <CheckSquare className="w-5 h-5 mx-auto mb-1 text-slate-300" />
                <p className="font-medium text-slate-600">No directives assigned for today.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Tasks assigned to your account will appear here.</p>
              </div>
            ) : (
              assignedTasks.map((task) => {
                const isDone = task.status === 'COMPLETED';
                return (
                  <div
                    key={task.id}
                    onClick={() => handleToggleTask(task)}
                    className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition cursor-pointer ${
                      isDone
                        ? 'bg-slate-50/70 border-slate-200 text-slate-400'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => handleToggleTask(task)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{task.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 58a. Modular Beat Route List */}
        <BeatRouteList
          beatItems={beatItems}
          activeBeatId={activeBeatId}
          onSelectBeat={(item) => setActiveBeatId(item.id)}
          onOpenCheckIn={handleOpenCheckIn}
          onResumeWorkspace={(item) => {
            setTargetBeat(item);
            setShowStoreActionDashboard(true);
          }}
          onOptimizeRoute={handleOptimizeRoute}
          isOptimizing={isOptimizing}
        />

        {/* Modular Flows and Modals */}
        <CheckInFlow
          showCheckInModal={showCheckInModal}
          showCheckInOverlay={showCheckInOverlay}
          showStoreActionDashboard={showStoreActionDashboard}
          targetBeat={targetBeat}
          calculatedDistance={calculatedDistance}
          overrideReason={overrideReason}
          setOverrideReason={setOverrideReason}
          completedActions={completedActions}
          onConfirmArrival={handleConfirmArrival}
          onDismissCheckIn={() => setShowCheckInModal(false)}
          onOpenAction={(actionKey) => setActiveActionModal(actionKey)}
          onConcludeStoreVisit={handleConcludeStoreVisit}
        />

        <CheckOutSummary
          isOpen={showCheckOutSummary}
          targetBeat={targetBeat}
          checkInTime={activeCheckInTime}
          completedActions={completedActions}
          onProceedNextStore={handleProceedNextStore}
          onClose={() => setShowCheckOutSummary(false)}
        />

        <StockCountForm
          isOpen={activeActionModal === 'STOCK_COUNT'}
          targetBeat={targetBeat}
          stockCounts={stockCounts}
          onStockChange={(prodId, qty) =>
            setStockCounts((prev) => ({ ...prev, [prodId]: qty }))
          }
          onSubmit={handleSaveStockCount}
          onClose={() => setActiveActionModal('NONE')}
        />

        <InlineOrderForm
          isOpen={activeActionModal === 'SECONDARY_ORDER'}
          targetBeat={targetBeat}
          onSaveOrder={handleSaveSecondaryOrder}
          onClose={() => setActiveActionModal('NONE')}
        />

        {/* In-Store Cheque Collection Modal */}
        {activeActionModal === 'COLLECT_CHEQUE' && targetBeat && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
            <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Collect Physical Cheque</h3>
                    <p className="text-xs text-slate-500">{targetBeat.storeName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveActionModal('NONE')}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Cheque Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. 0049281"
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Cheque Amount (NPR) *</label>
                    <input
                      type="number"
                      placeholder="25000"
                      value={chequeAmount}
                      onChange={(e) => setChequeAmount(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Bank Name *</label>
                    <select
                      value={chequeBank}
                      onChange={(e) => setChequeBank(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Nabil Bank">Nabil Bank</option>
                      <option value="Global IME Bank">Global IME Bank</option>
                      <option value="NIC Asia Bank">NIC Asia Bank</option>
                      <option value="Nepal Investment Mega Bank">Nepal Investment Mega Bank</option>
                      <option value="Standard Chartered">Standard Chartered</option>
                      <option value="Siddhartha Bank">Siddhartha Bank</option>
                      <option value="Other Commercial Bank">Other Commercial Bank</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Deposit Date *</label>
                    <input
                      type="date"
                      value={chequeCashDate}
                      onChange={(e) => setChequeCashDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                {/* Photo upload */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cheque Photo (Front Face)</label>
                  {chequePhotoUrl ? (
                    <div className="relative rounded-xl border border-slate-200 p-2 bg-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img
                          src={chequePhotoUrl}
                          alt="Cheque"
                          className="w-14 h-10 object-cover rounded-lg border border-slate-200"
                        />
                        <span className="text-xs text-slate-700 font-medium">Cheque photo captured</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setChequePhotoUrl('')}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 w-full p-3 border border-dashed border-slate-300 hover:border-amber-500 hover:bg-amber-50/40 rounded-xl cursor-pointer transition text-slate-600 font-medium text-xs">
                      <Camera className="w-4 h-4 text-amber-600" />
                      <span>Take Photo of Cheque</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              if (ev.target?.result) setChequePhotoUrl(ev.target.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Notes / Remarks</label>
                  <input
                    type="text"
                    placeholder="e.g. Against Invoice #9022"
                    value={chequeNotes}
                    onChange={(e) => setChequeNotes(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setActiveActionModal('NONE')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCheque}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition"
                >
                  Save &amp; Queue Cheque
                </button>
              </div>
            </div>
          </div>
        )}

        {/* In-Store Shelf Photos Modal */}
        {activeActionModal === 'SHELF_PHOTOS' && targetBeat && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
            <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Capture Shelf Photos</h3>
                    <p className="text-xs text-slate-500">{targetBeat.storeName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveActionModal('NONE')}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs overflow-y-auto">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Rack / Gondola Section</label>
                  <input
                    type="text"
                    value={shelfRackSection}
                    onChange={(e) => setShelfRackSection(e.target.value)}
                    placeholder="e.g. Main Eye-Level Rack, Cosmetic Bay, Countertop"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Before Photos */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Before Arranging Photo</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {beforePhotoUrls.map((url, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200">
                        <img src={url} alt="Before shelf" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setBeforePhotoUrls(beforePhotoUrls.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <label className="w-20 h-20 flex flex-col items-center justify-center border border-dashed border-slate-300 hover:border-blue-500 rounded-xl cursor-pointer text-slate-500 text-[10px] gap-1 hover:bg-blue-50/30">
                      <Camera className="w-4 h-4 text-blue-600" />
                      <span>+ Before</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              if (ev.target?.result) {
                                setBeforePhotoUrls((prev) => [...prev, ev.target!.result as string]);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* After Photos */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">After Merchandising Photo</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {afterPhotoUrls.map((url, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200">
                        <img src={url} alt="After shelf" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setAfterPhotoUrls(afterPhotoUrls.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <label className="w-20 h-20 flex flex-col items-center justify-center border border-dashed border-slate-300 hover:border-emerald-500 rounded-xl cursor-pointer text-slate-500 text-[10px] gap-1 hover:bg-emerald-50/30">
                      <Camera className="w-4 h-4 text-emerald-600" />
                      <span>+ After</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              if (ev.target?.result) {
                                setAfterPhotoUrls((prev) => [...prev, ev.target!.result as string]);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setActiveActionModal('NONE')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveShelfPhotos}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition"
                >
                  Save Shelf Photos
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Admin One-Time Beat Override Modal (Section 7) */}
        {showOverrideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-base">Add One-Time Beat Stop</h3>
                </div>
                <button
                  onClick={() => setShowOverrideModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveOverride} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Assign to Officer</label>
                  <select
                    value={overrideOfficerId}
                    onChange={(e) => setOverrideOfficerId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    {db.getUsers().map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.territory || 'Field Team'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Store</label>
                  <select
                    value={overrideStoreId}
                    onChange={(e) => setOverrideStoreId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    {db.getStoresUnified().map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.address})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Stop Priority</label>
                  <select
                    value={overridePriority}
                    onChange={(e) => setOverridePriority(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="HIGH">★★★ High Priority (Must Visit Today)</option>
                    <option value="MEDIUM">★★ Medium Priority</option>
                    <option value="ROUTINE">★ Routine Check</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Manager Note / Instructions</label>
                  <input
                    type="text"
                    value={overrideNote}
                    onChange={(e) => setOverrideNote(e.target.value)}
                    placeholder="e.g. New Hair Serum launch pitch, collect overdue cheque..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowOverrideModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-2xs"
                  >
                    Add to Today&apos;s Beat
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <EndOfDayModal
          isOpen={showEndDayModal}
          beatItems={beatItems}
          skipReasons={skipReasons}
          onSkipReasonChange={(storeId, reason) =>
            setSkipReasons((prev) => ({ ...prev, [storeId]: reason }))
          }
          onConfirmEndDay={handleEndMyDay}
          onClose={() => setShowEndDayModal(false)}
          dailySummary={dailySummary}
          showSummaryModal={showSummaryModal}
          onCloseSummaryModal={() => setShowSummaryModal(false)}
        />
      </div>
    </PageGuard>
  );
}
