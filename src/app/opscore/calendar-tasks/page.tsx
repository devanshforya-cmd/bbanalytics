'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { Task, BeatItem, Cheque, User, Priority, TaskStatus } from '@/lib/types';
import { NEPALI_MONTHS, BS_MONTH_DAYS, bsToAd, adToBs, getTodayBs } from '@/lib/nepali-calendar';
import { toast } from '@/components/common/Toast';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Plus,
  AlertCircle,
  Building2,
  CreditCard,
  User as UserIcon,
  Check,
  X,
  Sparkles,
  ChevronRight as ChevronRightIcon,
  Flag,
  PhoneCall,
  MessageSquareHeart,
  Edit3,
  Bot,
  Zap,
  Filter,
  CheckSquare,
  Square,
  ArrowRight,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';

interface CalendarEvent {
  id: string;
  type: 'TASK' | 'STORE_VISIT' | 'CHEQUE_DUE';
  title: string;
  description?: string;
  assignedToName: string;
  assignedToId: string;
  priority?: Priority;
  status: TaskStatus;
  dateAd: string;
  dateBs: string;
  dayNumberBs: number;
  dayNumberAd: number;
  storeName?: string;
  amount?: number;
  autoCreated?: boolean;
  autoTriggerType?: 'CHEQUE_OVERDUE' | 'STORE_DORMANT' | 'CALL_FOLLOWUP' | 'COMPLAINT_ASSIGNED' | 'MANUAL';
  relatedEntityType?: 'STORE' | 'CHEQUE' | 'COMPLAINT' | 'CALL';
  relatedId?: string;
  taskRef?: Task;
}

export default function CalendarTasksPage() {
  const { preference: userCalendarPref } = useCalendarPreference();

  // 16a & Fix 64. BS/AD Calendar Mode based on User Preference
  const [calendarMode, setCalendarMode] = useState<'BS' | 'AD'>('BS');
  const [viewType, setViewType] = useState<'MONTH' | 'LIST'>('MONTH');
  const [weekOffset, setWeekOffset] = useState(0);
  const [currentBsYear, setCurrentBsYear] = useState(2083);
  const [currentBsMonth, setCurrentBsMonth] = useState(5); // Bhadra (index 5)
  const [currentAdYear, setCurrentAdYear] = useState(2026);
  const [currentAdMonth, setCurrentAdMonth] = useState(8); // September (0-indexed: 8 = Sep)

  // Sync calendar mode with user preference
  useEffect(() => {
    if (userCalendarPref === 'AD') {
      setCalendarMode('AD');
    } else {
      setCalendarMode('BS');
    }
  }, [userCalendarPref]);

  // Fix 65: Mobile view defaults to Agenda List view (< 640px)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setViewType('LIST');
    }
  }, []);

  // Fix 65: Compute 7 days of the active week
  const getWeekDays = () => {
    const baseDate = new Date(2026, 8, 9); // Sep 9, 2026 / Bhadra 24, 2083
    const dayOfWeek = baseDate.getDay();
    const startOfWeek = new Date(baseDate);
    startOfWeek.setDate(baseDate.getDate() - dayOfWeek + weekOffset * 7);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const adStr = d.toISOString().split('T')[0];
      const bsObj = adToBs(adStr);
      const bsStr = `${bsObj.monthName} ${bsObj.day}, ${bsObj.year}`;
      const isToday = d.getDate() === 9 && d.getMonth() === 8 && d.getFullYear() === 2026;
      days.push({
        dateAd: adStr,
        dateBs: bsStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNumberAd: d.getDate(),
        isToday,
      });
    }
    return days;
  };

  // Filters
  const [selectedStaffId, setSelectedStaffId] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'AUTO' | 'MANUAL' | 'BEATS' | 'CHEQUES'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | TaskStatus>('ALL');

  // Day Drawer
  const [selectedDayEvents, setSelectedDayEvents] = useState<CalendarEvent[] | null>(null);
  const [selectedDateLabel, setSelectedDateLabel] = useState<string>('');

  // Collections from DB
  const [users, setUsers] = useState<User[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allBeats, setAllBeats] = useState<BeatItem[]>([]);
  const [allCheques, setAllCheques] = useState<Cheque[]>([]);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // 16c. Task Creation & Editing Modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalDesc, setModalDesc] = useState('');
  const [modalAssigneeId, setModalAssigneeId] = useState('');
  const [modalPriority, setModalPriority] = useState<Priority>('MEDIUM');
  const [modalDateBs, setModalDateBs] = useState('Bhadra 24, 2083');
  const [modalDateAd, setModalDateAd] = useState('2026-09-09');
  const [modalRelatedTo, setModalRelatedTo] = useState('');
  const [modalEntityType, setModalEntityType] = useState<'STORE' | 'CHEQUE' | 'COMPLAINT' | 'CALL'>('STORE');
  const [modalStatus, setModalStatus] = useState<TaskStatus>('OPEN');

  const refreshData = () => {
    const user = db.getCurrentUser();
    setUsers(db.getUsers());
    if (user.role === 'SALES_OFFICER') {
      setAllTasks(db.getTasks().filter((t) => t.assignedTo === user.id || t.assignedTo === 'user_ravi'));
      setAllBeats(db.getTodayBeat(user.id));
      setAllCheques(db.getCheques().filter((c) => c.officerId === user.id));
    } else {
      setAllTasks(db.getTasks());
      setAllBeats(db.getTodayBeat());
      setAllCheques(db.getCheques());
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const triggerToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Compile calendar events from Tasks, Visits & Cheques
  const events: CalendarEvent[] = [
    ...allTasks.map((t) => {
      const bsDayMatch = t.dueDateBs.match(/\d+/);
      const bsDay = bsDayMatch ? parseInt(bsDayMatch[0]) : 15;
      const adDay = t.dueDateAd ? parseInt(t.dueDateAd.split('-')[2]) : 15;

      return {
        id: t.id,
        type: 'TASK' as const,
        title: t.title,
        description: t.description,
        assignedToName: t.assignedToName,
        assignedToId: t.assignedTo,
        priority: t.priority,
        status: t.status,
        dateAd: t.dueDateAd,
        dateBs: t.dueDateBs,
        dayNumberBs: bsDay,
        dayNumberAd: adDay,
        storeName: t.relatedTo,
        autoCreated: t.autoCreated,
        autoTriggerType: t.autoTriggerType,
        relatedEntityType: t.relatedEntityType,
        relatedId: t.relatedId,
        taskRef: t,
      };
    }),
    ...allBeats.map((b) => {
      const bsDayMatch = b.dateBs.match(/\d+/);
      const bsDay = bsDayMatch ? parseInt(bsDayMatch[0]) : 23;
      const adDay = b.dateAd ? parseInt(b.dateAd.split('-')[2]) : 8;

      return {
        id: b.id,
        type: 'STORE_VISIT' as const,
        title: `Store Beat: ${b.storeName}`,
        description: `Scheduled GT/MT retail store beat stop in ${b.address}`,
        assignedToName: (b as any).officerName || 'Field Officer',
        assignedToId: b.officerId,
        priority: 'MEDIUM' as Priority,
        status: (b.status === 'VISITED' ? 'COMPLETED' : 'OPEN') as TaskStatus,
        dateAd: b.dateAd,
        dateBs: b.dateBs,
        dayNumberBs: bsDay,
        dayNumberAd: adDay,
        storeName: b.storeName,
        relatedEntityType: 'STORE' as const,
        autoCreated: false,
      };
    }),
    ...allCheques.map((c) => {
      const bsDayMatch = c.cashDateBs ? c.cashDateBs.match(/\d+/) : null;
      const bsDay = bsDayMatch ? parseInt(bsDayMatch[0]) : 25;
      const adDay = c.cashDateAd ? parseInt(c.cashDateAd.split('-')[2]) : 10;

      return {
        id: c.id,
        type: 'CHEQUE_DUE' as const,
        title: `Cheque Clearance: NPR ${c.amount.toLocaleString()} (${c.bankName})`,
        description: `Cheque #${c.chequeNumber} from ${c.storeName}. Current holder: ${c.handedOverTo || c.officerName}`,
        assignedToName: c.officerName,
        assignedToId: c.officerId,
        priority: 'HIGH' as Priority,
        status: (c.status === 'CASHED' ? 'COMPLETED' : c.status === 'DELAYED' ? 'OVERDUE' : 'OPEN') as TaskStatus,
        dateAd: c.cashDateAd,
        dateBs: c.cashDateBs || c.receivedDateBs,
        dayNumberBs: bsDay,
        dayNumberAd: adDay,
        storeName: c.storeName,
        amount: c.amount,
        relatedEntityType: 'CHEQUE' as const,
        autoCreated: false,
      };
    }),
  ];

  // Filter events by staff, category & status
  const filteredEvents = events.filter((e) => {
    if (selectedStaffId !== 'ALL' && e.assignedToId !== selectedStaffId) return false;

    if (selectedCategory === 'AUTO') {
      if (!e.autoCreated) return false;
    } else if (selectedCategory === 'MANUAL') {
      if (e.type !== 'TASK' || e.autoCreated) return false;
    } else if (selectedCategory === 'BEATS') {
      if (e.type !== 'STORE_VISIT') return false;
    } else if (selectedCategory === 'CHEQUES') {
      if (e.type !== 'CHEQUE_DUE') return false;
    }

    if (selectedStatus !== 'ALL' && e.status !== selectedStatus) return false;

    return true;
  });

  // Calculate days in current month
  const daysInMonth =
    calendarMode === 'BS'
      ? (BS_MONTH_DAYS[currentBsYear] && BS_MONTH_DAYS[currentBsYear][currentBsMonth - 1]) || 31
      : new Date(currentAdYear, currentAdMonth + 1, 0).getDate();

  // Calculate starting day of week for 1st of month (0 = Sun, 1 = Mon, ..., 6 = Sat)
  const firstDayOfWeek =
    calendarMode === 'BS'
      ? bsToAd(currentBsYear, currentBsMonth, 1).getDay()
      : new Date(currentAdYear, currentAdMonth, 1).getDay();

  // Navigation handlers (16a)
  const handlePrevMonth = () => {
    if (calendarMode === 'BS') {
      if (currentBsMonth === 1) {
        setCurrentBsMonth(12);
        setCurrentBsYear(currentBsYear - 1);
      } else {
        setCurrentBsMonth(currentBsMonth - 1);
      }
    } else {
      if (currentAdMonth === 0) {
        setCurrentAdMonth(11);
        setCurrentAdYear(currentAdYear - 1);
      } else {
        setCurrentAdMonth(currentAdMonth - 1);
      }
    }
  };

  const handleNextMonth = () => {
    if (calendarMode === 'BS') {
      if (currentBsMonth === 12) {
        setCurrentBsMonth(1);
        setCurrentBsYear(currentBsYear + 1);
      } else {
        setCurrentBsMonth(currentBsMonth + 1);
      }
    } else {
      if (currentAdMonth === 11) {
        setCurrentAdMonth(0);
        setCurrentAdYear(currentAdYear + 1);
      } else {
        setCurrentAdMonth(currentAdMonth + 1);
      }
    }
  };

  const getMonthTitle = () => {
    if (calendarMode === 'BS') {
      const monthObj = NEPALI_MONTHS[currentBsMonth - 1];
      const approxAdMonth = currentBsMonth === 5 ? 'Aug/Sep 2026' : currentBsMonth === 6 ? 'Sep/Oct 2026' : '2026';
      return `${monthObj?.en} ${currentBsYear} BS (${monthObj?.np}) — ${approxAdMonth}`;
    } else {
      const d = new Date(currentAdYear, currentAdMonth, 1);
      const adName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const bsName = currentAdMonth === 8 ? 'Bhadra / Aswin 2083' : '2083 BS';
      return `${adName} — ${bsName}`;
    }
  };

  // Day click handler
  const handleDayClick = (dayNum: number) => {
    const matching = filteredEvents.filter((e) =>
      calendarMode === 'BS' ? e.dayNumberBs === dayNum : e.dayNumberAd === dayNum
    );
    setSelectedDayEvents(matching);
    setSelectedDateLabel(
      calendarMode === 'BS'
        ? `${NEPALI_MONTHS[currentBsMonth - 1]?.en} ${dayNum}, ${currentBsYear} BS`
        : `${new Date(currentAdYear, currentAdMonth, dayNum).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}`
    );
  };

  // 16c. Update Task Status
  const handleUpdateStatus = (taskId: string, newStatus: TaskStatus) => {
    db.updateTaskStatus(taskId, newStatus);
    triggerToast(`Task status updated to ${newStatus}`);
    refreshData();
    if (selectedDayEvents) {
      setSelectedDayEvents(
        selectedDayEvents.map((x) => (x.id === taskId ? { ...x, status: newStatus } : x))
      );
    }
  };

  // 16c. Open Modal for Create or Edit
  const handleOpenCreateModal = () => {
    setEditingTask(null);
    setModalTitle('');
    setModalDesc('');
    setModalAssigneeId(users[0]?.id || 'user_officer_ravi');
    setModalPriority('MEDIUM');
    setModalDateBs(getTodayBs());
    setModalDateAd(new Date().toISOString().split('T')[0]);
    setModalRelatedTo('');
    setModalEntityType('STORE');
    setModalStatus('OPEN');
    setShowTaskModal(true);
  };

  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setModalTitle(task.title);
    setModalDesc(task.description || '');
    setModalAssigneeId(task.assignedTo);
    setModalPriority(task.priority);
    setModalDateBs(task.dueDateBs);
    setModalDateAd(task.dueDateAd);
    setModalRelatedTo(task.relatedTo || '');
    setModalEntityType(task.relatedEntityType || 'STORE');
    setModalStatus(task.status);
    setShowTaskModal(true);
  };

  // 16c. Save Task Handler
  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTitle.trim()) {
      toast.error('Please enter a task title.');
      return;
    }

    const assignee = users.find((u) => u.id === modalAssigneeId);
    const assigneeName = assignee ? assignee.fullName : 'Sales Officer';

    if (editingTask) {
      db.updateTask(editingTask.id, {
        title: modalTitle,
        description: modalDesc,
        assignedTo: modalAssigneeId,
        assignedToName: assigneeName,
        priority: modalPriority,
        dueDateBs: modalDateBs,
        dueDateAd: modalDateAd,
        relatedTo: modalRelatedTo,
        relatedEntityType: modalEntityType,
        status: modalStatus,
      });
      triggerToast(`Task "${modalTitle}" updated successfully.`);
    } else {
      db.addTask({
        title: modalTitle,
        description: modalDesc,
        assignedTo: modalAssigneeId,
        assignedToName: assigneeName,
        createdBy: 'Admin Management',
        priority: modalPriority,
        dueDateBs: modalDateBs,
        dueDateAd: modalDateAd,
        relatedTo: modalRelatedTo,
        relatedEntityType: modalEntityType,
        status: modalStatus,
        autoCreated: false,
        autoTriggerType: 'MANUAL',
      });
      triggerToast(`Task "${modalTitle}" created and assigned to ${assigneeName}.`);
    }

    setShowTaskModal(false);
    refreshData();
  };

  // Count stats
  const autoTasksCount = allTasks.filter((t) => t.autoCreated).length;
  const overdueCount = allTasks.filter((t) => t.status === 'OVERDUE').length;
  const completedCount = allTasks.filter((t) => t.status === 'COMPLETED').length;

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'SALES_OFFICER']}>
      <div className="space-y-6 pb-12">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/dashboard" className="hover:text-slate-800 transition">
          Home
        </Link>
        <ChevronRightIcon className="h-3 w-3 text-slate-400" />
        <span className="text-slate-400">OpsCore</span>
        <ChevronRightIcon className="h-3 w-3 text-slate-400" />
        <span className="font-semibold text-slate-800">Calendar & Tasks Hub</span>
      </nav>

      {/* Top Header & View Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
              <CalendarIcon className="w-5 h-5" />
            </span>
            <span>Calendar-Based Operational To-Do List</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Dual BS/AD synchronized schedule tracking system auto-tasks, retail store beat visits, and cheque clearance deadlines.
          </p>
        </div>

        {/* Action Button: Create Task */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" />
            <span>+ Create New Task</span>
          </button>
        </div>
      </div>

      {/* Global Toast */}
      {successToast && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* KPI Overview Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">All Active Tasks</div>
          <div className="text-xl font-bold text-slate-900 mt-0.5">{allTasks.length} tasks</div>
          <div className="text-[10px] text-slate-400 mt-1">Assigned across field & office</div>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-3.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider flex items-center gap-1">
            <Zap className="h-3 w-3 text-purple-600" />
            System Auto-Tasks (16b)
          </div>
          <div className="text-xl font-bold text-purple-900 mt-0.5">{autoTasksCount} active</div>
          <div className="text-[10px] text-purple-600/90 mt-1">Cheques, dormancies, calls & complaints</div>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-rose-600" />
            Overdue Tasks
          </div>
          <div className="text-xl font-bold text-rose-900 mt-0.5">{overdueCount} items</div>
          <div className="text-[10px] text-rose-600 mt-1">Require immediate intervention</div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Completed
          </div>
          <div className="text-xl font-bold text-emerald-900 mt-0.5">{completedCount} tasks</div>
          <div className="text-[10px] text-emerald-600 mt-1">Resolved this period</div>
        </div>
      </div>

      {/* 16a. Filter and Switcher Control Bar (BS/AD Toggle & Navigation) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* 16a. BS/AD Calendar Mode Toggle */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold shadow-2xs">
              <button
                type="button"
                onClick={() => setCalendarMode('BS')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  calendarMode === 'BS'
                    ? 'bg-amber-500 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                नेपाली पात्रो (BS)
              </button>
              <button
                type="button"
                onClick={() => setCalendarMode('AD')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  calendarMode === 'AD'
                    ? 'bg-slate-900 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Gregorian (AD)
              </button>
            </div>

            {/* Month Navigation & Jump to Today */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-2xs">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 transition"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-xs sm:text-sm font-bold text-slate-800 min-w-[160px] sm:min-w-[220px] text-center">
                {getMonthTitle()}
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-700 transition"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentBsYear(2083);
                  setCurrentBsMonth(5);
                  setCurrentAdYear(2026);
                  setCurrentAdMonth(8);
                }}
                className="ml-1 px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition border-l border-slate-200"
              >
                Today (आज)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Staff Filter */}
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-slate-400" />
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              >
                <option value="ALL">All Assignees (Field & Office)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.role.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>

            {/* View Type Toggle */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold shadow-2xs">
              <button
                type="button"
                onClick={() => setViewType('MONTH')}
                className={`px-3 py-1 rounded-lg transition ${
                  viewType === 'MONTH' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Month Grid
              </button>
              <button
                type="button"
                onClick={() => setViewType('LIST')}
                className={`px-3 py-1 rounded-lg transition ${
                  viewType === 'LIST' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Agenda List
              </button>
            </div>
          </div>
        </div>

        {/* 16b. Category Tabs (Auto vs Manual vs Beats vs Cheques) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                selectedCategory === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Items ({events.length})
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('AUTO')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition ${
                selectedCategory === 'AUTO'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
              }`}
            >
              <Zap className="h-3 w-3" />
              ⚡ System Auto-Tasks ({autoTasksCount})
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('MANUAL')}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                selectedCategory === 'MANUAL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              👤 Manual Tasks
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('BEATS')}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                selectedCategory === 'BEATS'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🏪 Store Beats ({allBeats.length})
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('CHEQUES')}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                selectedCategory === 'CHEQUES'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              💳 Cheques Due ({allCheques.length})
            </button>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid or Agenda List */}
      {viewType === 'MONTH' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
          {/* Day Headers (Sun - Sat) */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-bold text-slate-600 py-2 sm:py-2.5 min-w-[420px] sm:min-w-0">
            <div>
              <span className="sm:hidden">Sun</span>
              <span className="hidden sm:inline">Sunday (आइत)</span>
            </div>
            <div>
              <span className="sm:hidden">Mon</span>
              <span className="hidden sm:inline">Monday (सोम)</span>
            </div>
            <div>
              <span className="sm:hidden">Tue</span>
              <span className="hidden sm:inline">Tuesday (मंगल)</span>
            </div>
            <div>
              <span className="sm:hidden">Wed</span>
              <span className="hidden sm:inline">Wednesday (बुध)</span>
            </div>
            <div>
              <span className="sm:hidden">Thu</span>
              <span className="hidden sm:inline">Thursday (बिही)</span>
            </div>
            <div>
              <span className="sm:hidden">Fri</span>
              <span className="hidden sm:inline">Friday (शुक्र)</span>
            </div>
            <div>
              <span className="sm:hidden text-rose-600">Sat</span>
              <span className="hidden sm:inline text-rose-600">Saturday (शनि)</span>
            </div>
          </div>

          {/* Days Cells Grid */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 min-h-[520px]">
            {/* Leading offset empty cells for day-of-week alignment */}
            {Array.from({ length: firstDayOfWeek }).map((_, offsetIdx) => (
              <div
                key={`offset-${offsetIdx}`}
                className="p-2 min-h-[70px] sm:min-h-[105px] bg-slate-50/40 border-r border-b border-slate-100"
              />
            ))}

            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNumber = idx + 1;
              const dayEvents = filteredEvents.filter((e) =>
                calendarMode === 'BS' ? e.dayNumberBs === dayNumber : e.dayNumberAd === dayNumber
              );
              const isToday =
                calendarMode === 'BS'
                  ? currentBsYear === 2083 && currentBsMonth === 5 && dayNumber === 24
                  : currentAdYear === 2026 && currentAdMonth === 8 && dayNumber === 9;

              return (
                <div
                  key={dayNumber}
                  onClick={() => handleDayClick(dayNumber)}
                  className={`p-2 min-h-[105px] flex flex-col justify-between hover:bg-blue-50/30 cursor-pointer transition ${
                    isToday ? 'bg-amber-50/50 ring-2 ring-inset ring-amber-400' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                        isToday ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-700'
                      }`}
                    >
                      {dayNumber}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {dayEvents.length} items
                      </span>
                    )}
                  </div>

                  {/* Event snippets in cell */}
                  <div className="space-y-1 mt-1 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`text-[10px] truncate px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${
                          ev.status === 'COMPLETED'
                            ? 'bg-slate-100 text-slate-400 line-through'
                            : ev.status === 'OVERDUE'
                            ? 'bg-rose-100 text-rose-800 font-bold border border-rose-200'
                            : ev.autoCreated
                            ? 'bg-purple-100 text-purple-900 font-semibold border border-purple-200'
                            : ev.type === 'CHEQUE_DUE'
                            ? 'bg-indigo-100 text-indigo-800'
                            : ev.type === 'STORE_VISIT'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {ev.autoCreated && <Zap className="h-2.5 w-2.5 text-purple-700 shrink-0" />}
                        <span className="truncate">{ev.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[9px] text-slate-400 font-bold px-1">
                        +{dayEvents.length - 2} more...
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Fix 65: Mobile & Desktop Agenda List View with Week Navigation & Day Grouping */
        <div className="space-y-4">
          {/* Week Navigation Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev - 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev Week</span>
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold hover:bg-blue-100 transition"
              >
                Today (आज)
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev + 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
              >
                <span>Next Week</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs font-bold text-slate-500">
              {weekOffset === 0 ? 'Current Week Schedule' : `Week offset: ${weekOffset > 0 ? `+${weekOffset}` : weekOffset}`}
            </span>
          </div>

          {/* Grouped Days Agenda Cards */}
          <div className="space-y-3">
            {getWeekDays().map((day) => {
              const dayEvents = filteredEvents.filter((ev) => {
                if (calendarMode === 'BS') {
                  const bsDayMatch = ev.dateBs?.match(/\d+/);
                  const targetDayMatch = day.dateBs?.match(/\d+/);
                  return (
                    ev.dateBs === day.dateBs ||
                    (bsDayMatch && targetDayMatch && bsDayMatch[0] === targetDayMatch[0])
                  );
                }
                return ev.dateAd === day.dateAd;
              });

              return (
                <div
                  key={day.dateAd}
                  className={`rounded-2xl border bg-white overflow-hidden shadow-2xs transition ${
                    day.isToday ? 'border-amber-300 ring-2 ring-amber-300/40' : 'border-slate-200'
                  }`}
                >
                  {/* Day Header */}
                  <div
                    className={`px-4 py-2.5 flex items-center justify-between border-b ${
                      day.isToday ? 'bg-amber-50/70 border-amber-200' : 'bg-slate-50 border-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          day.isToday ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {day.dayName}
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        {day.isToday && 'Today — '}
                        {calendarMode === 'BS' ? day.dateBs : `${day.dateAd} (${day.dateBs})`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500">
                        {dayEvents.length} {dayEvents.length === 1 ? 'item' : 'items'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          handleOpenCreateModal();
                          setModalDateBs(day.dateBs);
                          setModalDateAd(day.dateAd);
                        }}
                        className="p-1 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                        title="Add task for this day"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Day Events or Empty State */}
                  {dayEvents.length === 0 ? (
                    <div className="p-3 text-center text-slate-400 text-xs italic">
                      No scheduled tasks, visits or cheques for this day.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className={`p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition ${
                            ev.status === 'OVERDUE' ? 'bg-rose-50/20' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                ev.autoCreated
                                  ? 'bg-purple-100 text-purple-700'
                                  : ev.type === 'CHEQUE_DUE'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : ev.type === 'STORE_VISIT'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {ev.autoCreated ? (
                                <Zap className="w-4 h-4" />
                              ) : ev.type === 'CHEQUE_DUE' ? (
                                <CreditCard className="w-4 h-4" />
                              ) : ev.type === 'STORE_VISIT' ? (
                                <Building2 className="w-4 h-4" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                            </div>

                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h4
                                  className={`font-bold text-xs sm:text-sm text-slate-900 ${
                                    ev.status === 'COMPLETED' ? 'line-through text-slate-400' : ''
                                  }`}
                                >
                                  {ev.title}
                                </h4>

                                {ev.autoCreated ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800">
                                    <Zap className="h-2.5 w-2.5" /> Auto
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                                    Manual
                                  </span>
                                )}

                                <span
                                  className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full ${
                                    ev.status === 'COMPLETED'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : ev.status === 'IN_PROGRESS'
                                      ? 'bg-blue-100 text-blue-800'
                                      : ev.status === 'OVERDUE'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {ev.status}
                                </span>
                              </div>

                              {ev.description && (
                                <p className="text-[11px] text-slate-500 line-clamp-1">{ev.description}</p>
                              )}

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                                <span>
                                  Assignee: <strong className="text-slate-800">{ev.assignedToName}</strong>
                                </span>
                                {ev.storeName && (
                                  <span>
                                    Entity: <strong className="text-slate-800">{ev.storeName}</strong>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            {ev.taskRef && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(ev.taskRef!)}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                                title="Edit Task"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <select
                              value={ev.status}
                              onChange={(e) => handleUpdateStatus(ev.id, e.target.value as TaskStatus)}
                              className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 outline-none"
                            >
                              <option value="OPEN">Open</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="COMPLETED">Completed</option>
                              <option value="OVERDUE">Overdue</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fix 65: Mobile Floating Quick-Add Action Button */}
      <button
        type="button"
        onClick={handleOpenCreateModal}
        className="fixed bottom-20 right-4 sm:hidden z-30 p-3.5 bg-blue-600 text-white rounded-full shadow-xl hover:bg-blue-700 active:scale-95 transition flex items-center justify-center border-2 border-white"
        aria-label="Quick add task"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ======================================================== */}
      {/* DRAWER / MODAL: DAY AGENDA DETAIL */}
      {/* ======================================================== */}
      {selectedDayEvents && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-blue-600" />
                  Scheduled Agenda & Tasks
                </h3>
                <p className="text-xs font-semibold text-blue-700 mt-0.5">{selectedDateLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDayEvents(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {selectedDayEvents.length > 0 ? (
                selectedDayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ev.autoCreated ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                              <Zap className="h-2.5 w-2.5" />
                              Auto: {ev.autoTriggerType?.replace('_', ' ') || 'Trigger'}
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                              Manual
                            </span>
                          )}

                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              ev.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ev.status === 'OVERDUE'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {ev.status}
                          </span>
                        </div>

                        <h4
                          className={`font-bold text-xs sm:text-sm text-slate-900 mt-1 ${
                            ev.status === 'COMPLETED' ? 'line-through text-slate-400' : ''
                          }`}
                        >
                          {ev.title}
                        </h4>

                        {ev.description && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{ev.description}</p>
                        )}
                      </div>

                      {/* Status Dropdown */}
                      <select
                        value={ev.status}
                        onChange={(e) => handleUpdateStatus(ev.id, e.target.value as TaskStatus)}
                        className="text-[11px] font-semibold px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 shrink-0"
                      >
                        <option value="OPEN">Open</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="OVERDUE">Overdue</option>
                      </select>
                    </div>

                    <div className="text-[11px] text-slate-500 border-t border-slate-200/60 pt-2 flex flex-wrap justify-between gap-1">
                      <span>Assignee: <strong>{ev.assignedToName}</strong></span>
                      {ev.storeName && <span>Location: <strong>{ev.storeName}</strong></span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No scheduled items for this date.
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setSelectedDayEvents(null);
                  handleOpenCreateModal();
                }}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                + Add Task to this Date
              </button>
              <button
                type="button"
                onClick={() => setSelectedDayEvents(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 16c. TASK ASSIGNMENT & CREATION / EDIT MODAL */}
      {/* ======================================================== */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  {editingTask ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {editingTask ? 'Edit & Reassign Task' : 'Create Operational Task'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Assign task across field and office reps</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTaskModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-3.5 text-xs">
              {/* Task Title */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Task Title *</label>
                <input
                  type="text"
                  required
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  placeholder="e.g. Follow up on overdue cheque or inspect store shelf..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Description / Directive</label>
                <textarea
                  rows={2}
                  value={modalDesc}
                  onChange={(e) => setModalDesc(e.target.value)}
                  placeholder="Specific actions required by the assignee..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs bg-white outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Assign To & Priority Row (16c) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Assign To *</label>
                  <select
                    value={modalAssigneeId}
                    onChange={(e) => setModalAssigneeId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white font-semibold text-slate-800 outline-none"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.role.replace('_', ' ')})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Priority Level</label>
                  <select
                    value={modalPriority}
                    onChange={(e) => setModalPriority(e.target.value as Priority)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white font-semibold text-slate-800 outline-none"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent (Overdue Risk)</option>
                  </select>
                </div>
              </div>

              {/* Dual BS / AD Due Date (16a & 16c) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Due Date (BS) *</label>
                  <input
                    type="text"
                    required
                    value={modalDateBs}
                    onChange={(e) => setModalDateBs(e.target.value)}
                    placeholder="e.g. Bhadra 24, 2083"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs bg-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Due Date (AD) *</label>
                  <input
                    type="date"
                    required
                    value={modalDateAd}
                    onChange={(e) => setModalDateAd(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs bg-white font-mono"
                  />
                </div>
              </div>

              {/* Related Entity (16c) */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Entity Type</label>
                  <select
                    value={modalEntityType}
                    onChange={(e) => setModalEntityType(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs bg-white font-semibold"
                  >
                    <option value="STORE">Store / Retailer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="COMPLAINT">Complaint</option>
                    <option value="CALL">Call Follow-up</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="font-bold text-slate-700">Related Store / Entity Name</label>
                  <input
                    type="text"
                    value={modalRelatedTo}
                    onChange={(e) => setModalRelatedTo(e.target.value)}
                    placeholder="e.g. Annapurna GT or Cheque #CHQ-104"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs bg-white"
                  />
                </div>
              </div>

              {/* Status Selector (16c: Open → In Progress → Completed → Overdue) */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Task Status</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'] as TaskStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setModalStatus(st)}
                      className={`py-1.5 text-[11px] font-bold rounded-lg border transition ${
                        modalStatus === st
                          ? st === 'COMPLETED'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : st === 'OVERDUE'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : st === 'IN_PROGRESS'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {st.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                >
                  {editingTask ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </PageGuard>
  );
}
