'use client';

import BankSelect from '@/components/common/BankSelect';

import NumberInput from '@/components/common/NumberInput';
import StoredPhoto from '@/components/common/StoredPhoto';
import Portal from '@/components/common/Portal';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  CheckSquare,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Lightbulb,
  Camera,
  CreditCard,
  X,
  Navigation,
  UserCheck,
  Users,
  Search,
  Filter,
  Check,
} from 'lucide-react';
import {
  BeatItem,
  Task,
  DutyStatus,
  SkipReason,
  FieldOfficerDailySummary,
} from '@/lib/types';
import { db } from '@/lib/db/db-service';
import { recordGpsPing } from '@/lib/db/gps-service';
import { freshGpsFix, geolocationMessage, type GpsFix } from '@/lib/gps-validation';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { canPerform, getScope, hasAccess, isSuperAdmin } from '@/lib/permissions';
import { toast } from '@/components/common/Toast';
import { capturePhoto } from '@/lib/photo-capture';
import { usePhotoUploads } from '@/hooks/usePhotoUploads';
import { Loader2 } from 'lucide-react';

// 58a. Modular Beat Plan Sub-components
import BeatRouteList from './components/BeatRouteList';
import CheckInFlow from './components/CheckInFlow';
import CheckOutSummary from './components/CheckOutSummary';
import ShelfCountSheet from '@/components/stock/ShelfCountSheet';
import InlineOrderForm, { MultiProductOrderData } from './components/InlineOrderForm';
import EndOfDayModal from './components/EndOfDayModal';
import WeeklyRoutesBoard from './components/WeeklyRoutesBoard';
import { AssignJobPanel, DayJobsList } from './components/DayJobs';
import { getTodayAd } from '@/lib/nepali-calendar';

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
  const [currentGpsCoords, setCurrentGpsCoords] = useState<GpsFix | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  // A stop with no pinned store location has no distance to check: the check-in is recorded where it happened.
  const targetPinned = !!targetBeat && targetBeat.lat !== undefined && targetBeat.lng !== undefined;
  const calculatedDistance = currentGpsCoords && targetBeat && targetPinned ? Math.round(db.calculateDistance(currentGpsCoords.lat, currentGpsCoords.lng, targetBeat.lat!, targetBeat.lng!)) : 0;

  // Slide-up Form States
  const [activeActionModal, setActiveActionModal] = useState<
    'NONE' | 'STOCK_COUNT' | 'SECONDARY_ORDER' | 'COLLECT_CHEQUE' | 'SHELF_PHOTOS'
  >('NONE');

  // Stock count form state

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
  const [chequeBank, setChequeBank] = useState('');
  const [chequeCashDate, setChequeCashDate] = useState('');
  const [chequePhotoUrl, setChequePhotoUrl] = useState('');
  const [chequeNotes, setChequeNotes] = useState('');

  // In-Store Shelf Photos Form State
  const [shelfRackSection, setShelfRackSection] = useState('Main Eye-Level Rack');
  const [beforePhotoUrls, setBeforePhotoUrls] = useState<string[]>([]);
  const shelfUploading = usePhotoUploads('shelf_photos');
  const chequeUploading = usePhotoUploads('cheque_tracker');
  const [uploadingSide, setUploadingSide] = useState<{ before: number; after: number }>({ before: 0, after: 0 });
  const takeShelfPhoto = (side: 'before' | 'after', file?: File | null) => {
    if (!file) return;
    setUploadingSide((c) => ({ ...c, [side]: c[side] + 1 }));
    void capturePhoto(file, 'shelf_photos', (url) => (side === 'before' ? setBeforePhotoUrls : setAfterPhotoUrls)((prev) => [...prev, url]))
      .finally(() => setUploadingSide((c) => ({ ...c, [side]: Math.max(0, c[side] - 1) })));
  };
  const [afterPhotoUrls, setAfterPhotoUrls] = useState<string[]>([]);

  // End Day Modal
  const [showEndDayModal, setShowEndDayModal] = useState(false);
  const [skipReasons, setSkipReasons] = useState<Record<string, SkipReason>>({});
  const [dailySummary, setDailySummary] = useState<FieldOfficerDailySummary | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Admin Beat Route Planning & Leave Coverage
  const isAdmin = isSuperAdmin(currentUser)
    || (currentUser.role === 'ADMIN' && canPerform(currentUser, 'beat_plans', 'CREATE') && getScope(currentUser, 'beat_plans') !== 'OWN');
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('ALL');
  const [pageView, setPageView] = useState<'today' | 'weekly'>('today');
  const [showAssignJob, setShowAssignJob] = useState(false);

  // One-Time Beat Override State (Section 7)
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideOfficerId, setOverrideOfficerId] = useState(currentUser.id);
  const [overrideStoreId, setOverrideStoreId] = useState('');
  const [overridePriority, setOverridePriority] = useState<'HIGH' | 'MEDIUM' | 'ROUTINE'>('HIGH');
  const [overrideNote, setOverrideNote] = useState('');

  // Assign Beat Route Modal State
  const [showAssignRouteModal, setShowAssignRouteModal] = useState(false);
  const [routeOfficerId, setRouteOfficerId] = useState(currentUser.id);
  const [routeDate, setRouteDate] = useState(() => getTodayAd());
  const [routePriority, setRoutePriority] = useState<'HIGH' | 'MEDIUM' | 'ROUTINE'>('HIGH');
  const [routeNotes, setRouteNotes] = useState('');
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set());
  const [storeSearchTerm, setStoreSearchTerm] = useState('');
  const [storeAreaFilter, setStoreAreaFilter] = useState('ALL');

  // Staff Leave & Relief Coverage Modal State
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveFromOfficerId, setLeaveFromOfficerId] = useState(currentUser.id);
  const [leaveStartDate, setLeaveStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [leaveEndDate, setLeaveEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [leaveReason, setLeaveReason] = useState('Sick Leave');
  const [leaveToOfficerId, setLeaveToOfficerId] = useState('');

  const allStores = useMemo(() => db.getStoresUnified(), []);
  const availableAreas = useMemo(() => {
    const areas = new Set<string>();
    allStores.forEach((s) => {
      if (s.area) areas.add(s.area);
      else if (s.city) areas.add(s.city);
    });
    return Array.from(areas);
  }, [allStores]);

  const filteredStoresForRoute = useMemo(() => {
    return allStores.filter((s) => {
      const q = storeSearchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        (s.area && s.area.toLowerCase().includes(q));
      const matchArea = storeAreaFilter === 'ALL' || s.area === storeAreaFilter || s.city === storeAreaFilter;
      return matchSearch && matchArea;
    });
  }, [allStores, storeSearchTerm, storeAreaFilter]);

  const reloadBeatData = (targetStaff?: string) => {
    const filter = targetStaff !== undefined ? targetStaff : selectedStaffFilter;
    if (isAdmin && filter !== 'ALL') {
      setBeatItems([...db.getTodayBeat(filter)]);
    } else {
      setBeatItems([...db.getTodayBeat()]);
    }
  };

  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideStoreId) {
      toast.error('Please select a target store.');
      return;
    }
    const today = getTodayAd();
    try { db.addOneTimeBeatOverride(
      overrideOfficerId,
      overrideStoreId,
      today,
      overridePriority,
      overrideNote || undefined
    ); } catch (error) { toast.error(error instanceof Error ? error.message : 'Beat stop could not be assigned.'); return; }
    setShowOverrideModal(false);
    setOverrideNote('');
    reloadBeatData();
    toast.success('Store added to today’s beat plan as an admin priority stop.');
  };

  const handleAssignBeatRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStoreIds.size === 0) {
      toast.error('Please select at least 1 retail store for this beat route.');
      return;
    }
    const targetUser = db.getUsers().find((u) => u.id === routeOfficerId);
    try { db.createAndAssignBeatRoute({
      officerId: routeOfficerId,
      dateAd: routeDate,
      storeIds: Array.from(selectedStoreIds),
      priority: routePriority,
      managerNotes: routeNotes || undefined,
    }); } catch (error) { toast.error(error instanceof Error ? error.message : 'Beat route could not be assigned.'); return; }
    setShowAssignRouteModal(false);
    setSelectedStoreIds(new Set());
    setRouteNotes('');
    reloadBeatData();
    toast.success(
      `Assigned beat route with ${selectedStoreIds.size} stops to ${targetUser?.fullName || 'Sales Staff'}!`
    );
  };

  const handleConfirmLeaveReassign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveToOfficerId) {
      toast.error('Please select a covering/reliever sales staff member.');
      return;
    }
    if (leaveFromOfficerId === leaveToOfficerId) {
      toast.error('Covering staff member cannot be the same person on leave.');
      return;
    }
    const fromUser = db.getUsers().find((u) => u.id === leaveFromOfficerId);
    const toUser = db.getUsers().find((u) => u.id === leaveToOfficerId);
    const result = db.reassignOfficerBeatsAndTasks({
      fromOfficerId: leaveFromOfficerId,
      toOfficerId: leaveToOfficerId,
      leaveStartDateAd: leaveStartDate,
      leaveEndDateAd: leaveEndDate,
      reason: leaveReason,
    });
    setShowLeaveModal(false);
    reloadBeatData();
    refreshTasks();
    toast.success(
      `Leave registered for ${fromUser?.fullName || 'Staff'}. Reassigned ${result.reassignedBeatsCount} beat stops and ${result.reassignedTasksCount} tasks to ${toUser?.fullName || 'Covering Staff'}.`
    );
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

    // Today's standing weekly stops join the route once (a manager adds them for the team, a rider for themselves).
    const addWeekly = () => { try { const me = db.getCurrentUser(); const manager = isSuperAdmin(me) || getScope(me, 'beat_plans') !== 'OWN'; db.ensureWeeklyBeats(getTodayAd(), manager ? undefined : [me.id]); } catch { /* planning is best effort */ } };
    addWeekly();
    refreshData();
    if (typeof window !== 'undefined') {
      db.syncWithSupabase().catch(() => {}).then(() => { addWeekly(); refreshData(); });
      db.syncTasksFromSupabase().then(() => refreshTasks()).catch(() => {});
    }
    window.addEventListener('bb-db-updated', refreshData);
    return () => {
      window.removeEventListener('bb-db-updated', refreshData);
    };
  }, []);

  const [gpsError, setGpsError] = useState<string | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const fix = (event as CustomEvent<GpsFix & { userId: string }>).detail;
      if (fix?.userId === currentUser.id && freshGpsFix(fix)) { setCurrentGpsCoords(fix); setGpsError(null); }
    };
    window.addEventListener('bb-gps-fix', receive);
    return () => window.removeEventListener('bb-gps-fix', receive);
  }, [currentUser.id]);

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
    setCurrentGpsCoords(null); setGpsError('Finding a fresh device location…'); setOverrideReason('');

    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setCurrentGpsCoords({ lat, lng, capturedAt: new Date(position.timestamp).toISOString(), accuracy: position.coords.accuracy });
          setGpsError(null);
        },
        (error) => {
          setGpsError(geolocationMessage(error.code));
          setCurrentGpsCoords(null);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setGpsError('This browser does not support device GPS.');
    }
  };

  const handleConfirmArrival = (photoUrl?: string) => {
    if (!targetBeat) return;
    if (!freshGpsFix(currentGpsCoords)) { toast.error('A fresh device GPS fix is required. Retry check-in after allowing location.'); return; }
    if (currentGpsCoords.accuracy !== undefined && currentGpsCoords.accuracy > 200) { toast.error('GPS accuracy is too low for check-in. Move outdoors and retry.'); return; }
    if (calculatedDistance > 150 && !overrideReason.trim()) { toast.error('Enter why you are checking in away from the store.'); return; }
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setActiveCheckInTime(timeStr);

    const { lat, lng } = currentGpsCoords;

    db.checkInBeat(
      targetBeat.id,
      lat,
      lng,
      targetPinned ? calculatedDistance : undefined,
      calculatedDistance > 150,
      calculatedDistance > 150 ? overrideReason : undefined,
      photoUrl
    );

    void recordGpsPing(
      currentUser.id,
      currentUser.fullName,
      lat,
      lng,
      'AT_STORE',
      targetBeat.storeName,
      undefined, currentGpsCoords.capturedAt, currentGpsCoords.accuracy
    );

    setBeatItems(db.getTodayBeat());
    setShowCheckInModal(false);
    setShowStoreActionDashboard(true);
    toast.success(`Checked in at ${targetBeat.storeName} (${timeStr}).`);
  };

  const handleActionComplete = (actionKey: string) => {
    setCompletedActions((prev) => new Set(prev).add(actionKey));
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
    toast.success(`Order saved: ${orderData.totalUnits} units, ${orderData.items.length} ${orderData.items.length === 1 ? 'product' : 'products'}. It is now on Orders & dispatch as Order received.`);
  };

  // Cheque Collection submit
  const handleSaveCheque = () => {
    if (!targetBeat) return;
    if (!chequeNumber.trim() || !chequeAmount || !chequeCashDate) {
      toast.error('Please enter Cheque Number, Amount, and Expected Deposit Date.');
      return;
    }
    if (!chequeBank.trim()) { toast.error('Choose the bank the cheque is drawn on.'); return; }

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
      photoUrl: chequePhotoUrl || '',
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
      beforePhotoUrls,
      afterPhotoUrls,
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
    if (!targetBeat) return;
    db.checkOutBeat(
      targetBeat.id,
      undefined,
      freshGpsFix(currentGpsCoords) ? currentGpsCoords.lat : undefined,
      freshGpsFix(currentGpsCoords) ? currentGpsCoords.lng : undefined
    );
    const completedBeat = db.getTodayBeat(currentUser.id).find((beat) => beat.id === targetBeat.id) || targetBeat;
    setTargetBeat(completedBeat);
    setBeatItems(db.getTodayBeat(currentUser.id));
    setShowStoreActionDashboard(false);
    setShowCheckOutSummary(true);
  };

  const handleProceedNextStore = () => {
    setShowCheckOutSummary(false);
    setTargetBeat(null);
    setCompletedActions(new Set());
    const updatedBeats = db.getTodayBeat(currentUser.id);
    const nextStop = updatedBeats.find((beat) => beat.status === 'PENDING');
    setActiveBeatId(nextStop?.id || null);
    setBeatItems(updatedBeats);
    toast.info(nextStop ? `Next stop selected: ${nextStop.storeName}.` : 'All planned stops are complete.');
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

  // The day's plan for the rider being shown: stops with their jobs, and the other jobs in priority order.
  const planOfficerId = isAdmin && selectedStaffFilter !== 'ALL' ? selectedStaffFilter : currentUser.id;
  const plan = db.getDayPlan(planOfficerId);
  const jobsByBeat = Object.fromEntries(plan.stops.map((stop) => [stop.beat.id, stop.jobs]));
  const today = getTodayAd();
  const laterTasks = db.getTasks().filter((t) => t.assignedTo === planOfficerId && t.status !== 'COMPLETED' && t.dueDateAd > today).length;
  const pendingTasksCount = plan.errands.length;
  const pendingBeatCount = beatItems.filter((b) => b.status === 'PENDING').length;

  return (
    <PageGuard feature="beat_plans">
      <div className="space-y-6 pb-36 sm:pb-12">
        {gpsError && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{gpsError}</p>}
        <Breadcrumbs
          items={[
            { label: 'Offline sales', href: '/offline-sales/stores' },
            { label: 'Beat plan' },
          ]}
        />

        {/* Page header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1>Beat plan</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              {hasAccess(currentUser, 'staff_scorecards') ? <Link href={`/offline-sales/scorecard?officer=${encodeURIComponent(currentUser.fullName)}`} className="text-slate-700 hover:underline">{currentUser.fullName}</Link> : <span className="text-slate-700">{currentUser.fullName}</span>}
              {' · '}{currentUser.territory || 'Kathmandu Central Beat'}{' · '}stores, tasks and cheques for today
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <>
                <button type="button" onClick={() => setShowLeaveModal(true)} className="btn btn-secondary">
                  <UserCheck />Staff leave
                </button>
                <button type="button" onClick={() => {
                    const stores = db.getStoresUnified();
                    if (stores[0]) setOverrideStoreId(stores[0].id);
                    setShowOverrideModal(true);
                  }} className="btn btn-secondary">
                  <MapPin />Add one-time stop
                </button>
                <button type="button" onClick={() => setShowAssignJob(true)} className="btn btn-secondary">
                  <CheckSquare />Give a job
                </button>
                <button type="button" onClick={() => setShowAssignRouteModal(true)} className="btn btn-primary">
                  <Navigation />Assign beat route
                </button>
              </>
            )}

            <button type="button" onClick={handleToggleDuty} className="btn btn-secondary" aria-pressed={officerDuty === 'ONLINE'}>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${officerDuty === 'ONLINE' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {officerDuty === 'ONLINE' ? 'On duty' : 'Off duty'}
            </button>

            <button type="button" onClick={() => setShowEndDayModal(true)} disabled={officerDuty === 'OFFLINE'} className={`btn ${officerDuty === 'OFFLINE' ? 'btn-secondary opacity-60' : pendingBeatCount === 0 ? 'btn-primary' : 'btn-secondary'}`}>
              {officerDuty === 'OFFLINE' ? 'Shift ended' : 'End my day'}
            </button>
          </div>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Beat plan view">
            {([['today', 'Today'], ['weekly', 'Weekly routes']] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={pageView === key} onClick={() => setPageView(key)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${pageView === key ? 'bg-slate-900 text-white' : 'border border-black/[0.08] bg-white text-slate-700 hover:border-slate-400'}`}>{label}</button>
            ))}
          </div>
        )}
        {isAdmin && pageView === 'weekly' && <WeeklyRoutesBoard initialOfficerId={selectedStaffFilter !== 'ALL' ? selectedStaffFilter : undefined} />}
        {(!isAdmin || pageView === 'today') && <>
        {/* Manager/Admin Staff Filter Banner */}
        {isAdmin && db.getUsers().length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2.5">
              <label htmlFor="beat-staff" className="text-slate-500">Showing</label>
              <select
                value={selectedStaffFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedStaffFilter(val);
                  reloadBeatData(val);
                }}
                id="beat-staff"
                className="h-9 rounded-lg border border-black/[0.08] bg-white px-3 text-slate-800"
              >
                <option value="ALL">All field staff</option>
                {db.getUsers().map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.territory || u.role})
                  </option>
                ))}
              </select>
            </div>
            <div className="text-slate-500 text-xs font-medium">
              Showing <span className="font-bold text-slate-800">{beatItems.length}</span> planned stop{beatItems.length === 1 ? '' : 's'}
            </div>
          </div>
        )}

        {/* The day's other jobs: cash clearing, document deposits, deliveries, tasks */}
        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 sm:p-5 space-y-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-medium text-slate-900">Today&apos;s jobs</h2>
              {pendingTasksCount > 0 && <span className="font-mono text-xs text-slate-500">{pendingTasksCount} open</span>}
            </div>
            <p className="mt-0.5 text-[13px] text-slate-500">{isAdmin ? <>For <strong className="font-medium text-slate-700">{db.getUsers().find((u) => u.id === planOfficerId)?.fullName || 'you'}</strong>{selectedStaffFilter === 'ALL' ? ' (choose a rider above to see theirs)' : ''}. </> : null}Jobs that are not at one of today&apos;s stops, highest priority first. Jobs at a store on the route show on that stop.</p>
          </div>
          <DayJobsList jobs={plan.errands} laterCount={laterTasks} onToggleTask={(taskId) => { const task = db.getTasks().find((t) => t.id === taskId); if (task) handleToggleTask(task); }} />
        </div>

        {/* 58a. Modular Beat Route List */}
        <BeatRouteList
          beatItems={beatItems}
          jobsByBeat={jobsByBeat}
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
        </>}
        {showAssignJob && <AssignJobPanel defaultOfficerId={selectedStaffFilter !== 'ALL' ? selectedStaffFilter : undefined} onClose={() => setShowAssignJob(false)} onSaved={() => { setShowAssignJob(false); refreshTasks(); }} />}

        {/* Modular Flows and Modals */}
        <CheckInFlow
          showCheckInModal={showCheckInModal}
          showCheckInOverlay={showCheckInOverlay}
          showStoreActionDashboard={showStoreActionDashboard}
          targetBeat={targetBeat}
          calculatedDistance={calculatedDistance}
          storePinned={targetPinned}
          gpsReady={freshGpsFix(currentGpsCoords) && (currentGpsCoords.accuracy === undefined || currentGpsCoords.accuracy <= 200)}
          gpsMessage={gpsError || (currentGpsCoords ? `GPS accuracy ±${Math.round(currentGpsCoords.accuracy || 0)} m` : 'Waiting for location.')}
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
          hasNextStop={beatItems.some((beat) => beat.status === 'PENDING')}
          onProceedNextStore={handleProceedNextStore}
          onClose={() => setShowCheckOutSummary(false)}
        />

        <ShelfCountSheet
          target={activeActionModal === 'STOCK_COUNT' && targetBeat ? { storeId: targetBeat.entityId, storeName: targetBeat.storeName, entityType: targetBeat.entityType, dateAd: targetBeat.dateAd, dateBs: targetBeat.dateBs } : null}
          onSaved={() => handleActionComplete('STOCK_COUNT')}
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
          <Portal><div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
            <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Collect physical cheque</h2>
                    <p className="text-xs text-slate-500">{targetBeat.storeName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveActionModal('NONE')}
                  className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="beat-plan-cheque-number" className="block font-semibold text-slate-700 mb-1">Cheque number *</label>
                    <input id="beat-plan-cheque-number"
                      type="text"
                      placeholder="e.g. 0049281"
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="beat-plan-cheque-amount-npr" className="block font-semibold text-slate-700 mb-1">Cheque amount (NPR) *</label>
                    <NumberInput id="beat-plan-cheque-amount-npr"
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
                  <div className="col-span-2">
                    <BankSelect id="beat-plan-bank-name" label="Bank name *" value={chequeBank} onChange={setChequeBank} />
                  </div>
                  <div>
                    <label htmlFor="beat-plan-deposit-date" className="block font-semibold text-slate-700 mb-1">Deposit date *</label>
                    <input id="beat-plan-deposit-date"
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
                  <label className="block font-semibold text-slate-700 mb-1">Cheque photo (front face)</label>
                  {chequePhotoUrl ? (
                    <div className="relative rounded-xl border border-slate-200 p-2 bg-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StoredPhoto src={chequePhotoUrl} alt="Cheque" className="w-14 h-10 rounded-lg border border-slate-200" imgClassName="h-full w-full object-cover rounded-lg border border-slate-200" />
                        <span className="text-xs text-slate-700 font-medium">Cheque photo captured</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setChequePhotoUrl('')}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : chequeUploading > 0 ? (
                    <div className="flex items-center justify-center gap-2 w-full p-3 rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-800" aria-busy="true"><Loader2 className="h-4 w-4 animate-spin" />Uploading cheque photo…</div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 w-full p-3 border border-dashed border-slate-300 hover:border-amber-500 hover:bg-amber-50/40 rounded-xl cursor-pointer transition text-slate-600 font-medium text-xs">
                      <Camera className="w-4 h-4 text-amber-600" />
                      <span>Take photo of cheque</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => { void capturePhoto(e.target.files?.[0], 'cheque_tracker', setChequePhotoUrl); e.target.value = ''; }}
                      />
                    </label>
                  )}
                </div>

                <div>
                  <label htmlFor="beat-plan-notes-remarks" className="block font-semibold text-slate-700 mb-1">Notes / remarks</label>
                  <input id="beat-plan-notes-remarks"
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
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition"
                >
                  Save &amp; queue cheque
                </button>
              </div>
            </div>
          </div></Portal>
        )}

        {/* In-Store Shelf Photos Modal */}
        {activeActionModal === 'SHELF_PHOTOS' && targetBeat && (
          <Portal><div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
            <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Capture shelf photos</h2>
                    <p className="text-xs text-slate-500">{targetBeat.storeName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveActionModal('NONE')}
                  className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs overflow-y-auto">
                <div>
                  <label htmlFor="beat-plan-rack-gondola-section" className="block font-semibold text-slate-700 mb-1">Rack / gondola section</label>
                  <input id="beat-plan-rack-gondola-section"
                    type="text"
                    value={shelfRackSection}
                    onChange={(e) => setShelfRackSection(e.target.value)}
                    placeholder="e.g. Main Eye-Level Rack, Cosmetic Bay, Countertop"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Before Photos */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Before arranging photo</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {beforePhotoUrls.map((url, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200">
                        <StoredPhoto src={url} alt="Before shelf" imgClassName="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setBeforePhotoUrls(beforePhotoUrls.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {Array.from({ length: uploadingSide.before }, (_, i) => (
                      <div key={`up-before-${i}`} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-800" aria-busy="true">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />Uploading…
                      </div>
                    ))}
                    <label className="w-20 h-20 flex flex-col items-center justify-center border border-dashed border-slate-300 hover:border-blue-500 rounded-xl cursor-pointer text-slate-500 text-[11px] gap-1 hover:bg-blue-50/30">
                      <Camera className="w-4 h-4 text-blue-600" />
                      <span>+ Before</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => { takeShelfPhoto('before', e.target.files?.[0]); e.target.value = ''; }}
                      />
                    </label>
                  </div>
                </div>

                {/* After Photos */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">After merchandising photo</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {afterPhotoUrls.map((url, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200">
                        <StoredPhoto src={url} alt="After shelf" imgClassName="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setAfterPhotoUrls(afterPhotoUrls.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {Array.from({ length: uploadingSide.after }, (_, i) => (
                      <div key={`up-after-${i}`} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-800" aria-busy="true">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />Uploading…
                      </div>
                    ))}
                    <label className="w-20 h-20 flex flex-col items-center justify-center border border-dashed border-slate-300 hover:border-emerald-500 rounded-xl cursor-pointer text-slate-500 text-[11px] gap-1 hover:bg-emerald-50/30">
                      <Camera className="w-4 h-4 text-emerald-600" />
                      <span>+ After</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => { takeShelfPhoto('after', e.target.files?.[0]); e.target.value = ''; }}
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
                  disabled={shelfUploading > 0}
                  className="btn btn-primary disabled:opacity-60"
                >
                  {shelfUploading > 0 ? <><Loader2 className="animate-spin" />Uploading photos…</> : 'Save shelf photos'}
                </button>
              </div>
            </div>
          </div></Portal>
        )}

        {/* Admin One-Time Beat Override Modal (Section 7) */}
        {showOverrideModal && (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-blue-600" />
                  <h2 className="font-bold text-slate-900 text-base">Add one-time beat stop</h2>
                </div>
                <button
                  onClick={() => setShowOverrideModal(false)}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveOverride} className="space-y-3.5 text-xs">
                <div>
                  <label htmlFor="beat-plan-assign-to-officer" className="block font-bold text-slate-700 mb-1">Assign to officer</label>
                  <select id="beat-plan-assign-to-officer"
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
                  <label className="block font-bold text-slate-700 mb-1">Target store</label>
                  <select aria-label="Target store"
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
                  <label className="block font-bold text-slate-700 mb-1">Stop priority</label>
                  <select aria-label="Stop priority"
                    value={overridePriority}
                    onChange={(e) => setOverridePriority(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="HIGH">High (visit today)</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="ROUTINE">Routine</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Manager note / instructions</label>
                  <input aria-label="Manager note / instructions"
                    type="text"
                    value={overrideNote}
                    onChange={(e) => setOverrideNote(e.target.value)}
                    placeholder="e.g. New Hair Serum launch pitch, collect overdue cheque…"
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
                    className="btn btn-primary"
                  >
                    Add to today&apos;s beat
                  </button>
                </div>
              </form>
            </div>
          </div></Portal>
        )}

        {/* Manager Create & Assign Beat Route Modal */}
        {showAssignRouteModal && (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Navigation className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-base">Create &amp; assign beat route</h2>
                    <p className="text-xs text-slate-500">Assign targeted store visits and priorities to sales officers</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAssignRouteModal(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAssignBeatRoute} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="beat-plan-assign-to-sales-staff" className="block font-bold text-slate-700 mb-1">Assign to sales staff</label>
                    <select id="beat-plan-assign-to-sales-staff"
                      value={routeOfficerId}
                      onChange={(e) => setRouteOfficerId(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500"
                    >
                      {db.getUsers().map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} ({u.territory || u.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Beat route date</label>
                    <input aria-label="Beat route date"
                      type="date"
                      value={routeDate}
                      onChange={(e) => setRouteDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Route priority</label>
                    <select aria-label="Route priority"
                      value={routePriority}
                      onChange={(e) => setRoutePriority(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    >
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="ROUTINE">Routine</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="beat-plan-manager-directives-note-opti" className="block font-bold text-slate-700 mb-1">Manager directives / note (optional)</label>
                    <input id="beat-plan-manager-directives-note-opti"
                      type="text"
                      value={routeNotes}
                      onChange={(e) => setRouteNotes(e.target.value)}
                      placeholder="e.g. Focus on stocking new summer SKUs…"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                {/* Retail Store Multi-Selection */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-bold text-slate-800">
                      Select Retail Outlets ({selectedStoreIds.size} selected)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(selectedStoreIds);
                          filteredStoresForRoute.forEach((s) => next.add(s.id));
                          setSelectedStoreIds(next);
                        }}
                        className="text-[11px] font-bold text-blue-600 hover:underline"
                      >
                        Select all filtered
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedStoreIds(new Set())}
                        className="text-[11px] font-bold text-slate-500 hover:underline"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                      <input
                        type="text"
                        value={storeSearchTerm}
                        onChange={(e) => setStoreSearchTerm(e.target.value)}
                        placeholder="Search outlet by name or street…"
                        className="w-full pl-8 pr-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      />
                    </div>
                    {availableAreas.length > 0 && (
                      <select
                        value={storeAreaFilter}
                        onChange={(e) => setStoreAreaFilter(e.target.value)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      >
                        <option value="ALL">All areas / zones</option>
                        {availableAreas.map((area) => (
                          <option key={area} value={area}>
                            {area}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="border border-slate-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-slate-100 bg-white">
                    {filteredStoresForRoute.length === 0 ? (
                      <div className="p-6 text-center text-slate-500">
                        No stores found matching your search.
                      </div>
                    ) : (
                      filteredStoresForRoute.map((store) => {
                        const isChecked = selectedStoreIds.has(store.id);
                        return (
                          <label
                            key={store.id}
                            className={`flex items-start gap-3 p-2.5 hover:bg-slate-50 cursor-pointer transition ${
                              isChecked ? 'bg-blue-50/50' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = new Set(selectedStoreIds);
                                if (e.target.checked) {
                                  next.add(store.id);
                                } else {
                                  next.delete(store.id);
                                }
                                setSelectedStoreIds(next);
                              }}
                              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-900 truncate">{store.name}</p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {store.address} {store.area ? `• ${store.area}` : ''}
                              </p>
                            </div>
                            <span className="text-[11px] font-semibold text-slate-500 px-1.5 py-0.5 bg-slate-100 rounded-md">
                              {store.storeType || store.category || 'STORE'}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-500">
                    {selectedStoreIds.size} outlet{selectedStoreIds.size === 1 ? '' : 's'} staged
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAssignRouteModal(false)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={selectedStoreIds.size === 0}
                      className="btn btn-primary disabled:opacity-50"
                    >
                      Assign beat plan
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div></Portal>
        )}

        {/* Staff Leave & Relief Coverage Reassignment Modal */}
        {showLeaveModal && (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-amber-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-base">Staff leave &amp; relief coverage</h2>
                    <p className="text-xs text-slate-500">Reassign pending beat stops &amp; tasks to covering sales staff</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmLeaveReassign} className="p-5 space-y-4 text-xs">
                <div>
                  <label htmlFor="beat-plan-staff-officer-taking-leave" className="block font-bold text-slate-700 mb-1">Staff officer taking leave</label>
                  <select id="beat-plan-staff-officer-taking-leave"
                    value={leaveFromOfficerId}
                    onChange={(e) => setLeaveFromOfficerId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500"
                  >
                    {db.getUsers().map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.territory || u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Leave start date</label>
                    <input aria-label="Leave start date"
                      type="date"
                      value={leaveStartDate}
                      onChange={(e) => setLeaveStartDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Leave end date</label>
                    <input aria-label="Leave end date"
                      type="date"
                      value={leaveEndDate}
                      onChange={(e) => setLeaveEndDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reason for Leave</label>
                  <select aria-label="Reason for Leave"
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  >
                    <option value="Sick Leave">Sick leave</option>
                    <option value="Emergency Leave">Emergency leave</option>
                    <option value="Annual Leave">Annual leave</option>
                    <option value="Casual Leave">Casual leave</option>
                    <option value="Festival / Holiday Leave">Festival / holiday leave</option>
                    <option value="Official Off-Duty / Travel">Official off-duty / travel</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="beat-plan-select-covering-reliever-sal" className="block font-bold text-slate-700 mb-1">
                    Select covering / reliever sales staff
                  </label>
                  <select id="beat-plan-select-covering-reliever-sal"
                    value={leaveToOfficerId}
                    onChange={(e) => setLeaveToOfficerId(e.target.value)}
                    className="w-full p-2.5 bg-amber-50/50 border border-amber-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-amber-500"
                    required
                  >
                    <option value="">-- Choose covering staff member --</option>
                    {db
                      .getUsers()
                      .filter((u) => u.id !== leaveFromOfficerId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} ({u.territory || u.role})
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    The chosen reliever will immediately take ownership of all pending beat routes and to-do items.
                  </p>
                </div>

                {/* Live Preview Box */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-700 block">Pending assignments impacted:</span>
                    <span className="text-slate-500 text-[11px]">
                      {beatItems.filter((b) => b.officerId === leaveFromOfficerId && b.status === 'PENDING').length} store stops •{' '}
                      {db.getTasks().filter((t) => t.assignedTo === leaveFromOfficerId && t.status !== 'COMPLETED').length} active tasks
                    </span>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-bold rounded-lg text-[11px]">
                    Auto-reassigned
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowLeaveModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs transition"
                  >
                    Confirm leave &amp; reassign
                  </button>
                </div>
              </form>
            </div>
          </div></Portal>
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
