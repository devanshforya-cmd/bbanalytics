'use client';

import React, { useState, useMemo } from 'react';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { ActivityLog } from '@/lib/types';
import { formatBsDateOnly } from '@/lib/nepali-calendar';
import {
  History,
  Search,
  Filter,
  ShieldCheck,
  UserCheck,
  Download,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Clock,
  User as UserIcon,
  Tag,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  X,
} from 'lucide-react';

type ViewMode = 'FLAT' | 'BY_DAY' | 'BY_USER';

// Action Color Mapping per PRD Part 4.7
type ActionCategory = 'GREEN' | 'BLUE' | 'AMBER' | 'RED';

function getActionCategory(action: string): ActionCategory {
  const upper = action.toUpperCase();

  // Red: Cheque Bounced, Complaint Escalated, GPS Override
  if (
    upper.includes('BOUNCE') ||
    upper.includes('ESCALAT') ||
    upper.includes('OVERRIDE') ||
    upper.includes('OUT_OF_RADIUS') ||
    upper.includes('FAIL')
  ) {
    return 'RED';
  }

  // Amber: Task Created, Skip Logged
  if (
    upper.includes('SKIP') ||
    upper === 'TASK_CREATED' ||
    upper.includes('ACCOUNT_CREATED')
  ) {
    return 'AMBER';
  }

  // Blue: Cheque Status Change, Setting Changed, Login
  if (
    upper.includes('CHEQUE') ||
    upper.includes('SETTING') ||
    upper.includes('LOGIN') ||
    upper.includes('STATUS')
  ) {
    return 'BLUE';
  }

  // Green: Check-in, Order Created, Task Completed, Document Uploaded
  return 'GREEN';
}

function getActionBadgeStyle(cat: ActionCategory) {
  switch (cat) {
    case 'GREEN':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'BLUE':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    case 'AMBER':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'RED':
      return 'bg-rose-50 text-rose-800 border-rose-200 font-black';
  }
}

function formatActionLabel(action: string): string {
  switch (action) {
    case 'CHECKED_IN_STORE':
      return 'Check-in';
    case 'CHECKED_OUT_STORE':
      return 'Check-out';
    case 'ORDER_CREATED':
    case 'EXTRACTED_ORDER':
      return 'Order Created';
    case 'TASK_COMPLETED':
      return 'Task Completed';
    case 'DOCUMENT_UPLOADED':
      return 'Document Uploaded';
    case 'UPDATED_CHEQUE_STATUS':
      return 'Cheque Status Change';
    case 'SETTING_CHANGED':
      return 'Setting Changed';
    case 'USER_LOGIN':
      return 'Login';
    case 'TASK_CREATED':
      return 'Task Created';
    case 'STORE_SKIPPED':
      return 'Skip Logged';
    case 'ACCOUNT_CREATED':
      return 'Account Created';
    case 'CHEQUE_BOUNCED':
      return 'Cheque Bounced';
    case 'COMPLAINT_ESCALATED':
      return 'Complaint Escalated';
    case 'GPS_OVERRIDE':
      return 'GPS Override';
    default:
      return action.replace(/_/g, ' ');
  }
}

export default function ActivityTrailPage() {
  const [logs] = useState<ActivityLog[]>(() => db.getActivityLogs());

  // 4a. Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // 4b. Grouped View Mode
  const [viewMode, setViewMode] = useState<ViewMode>('FLAT');

  // 4e. Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // Extract unique filter options from logs
  const userOptions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.userName) set.add(l.userName);
    });
    return Array.from(set).sort();
  }, [logs]);

  const actionOptions = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((l) => {
      if (l.action) map.set(l.action, formatActionLabel(l.action));
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [logs]);

  const entityOptions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.entityType) set.add(l.entityType);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Filtered dataset
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // User filter
      if (selectedUser !== 'ALL' && log.userName !== selectedUser) return false;

      // Action filter
      if (selectedAction !== 'ALL' && log.action !== selectedAction) return false;

      // Entity filter
      if (selectedEntity !== 'ALL' && log.entityType.toLowerCase() !== selectedEntity.toLowerCase())
        return false;

      // Date preset filter
      const logDate = log.createdAt ? log.createdAt.substring(0, 10) : '';
      if (selectedDateFilter === 'TODAY' && logDate !== '2026-09-08') return false;
      if (selectedDateFilter === 'YESTERDAY' && logDate !== '2026-09-07') return false;
      if (selectedDateFilter === 'THIS_WEEK') {
        if (logDate < '2026-09-02' || logDate > '2026-09-08') return false;
      }
      if (selectedDateFilter === 'CUSTOM') {
        if (customStartDate && logDate < customStartDate) return false;
        if (customEndDate && logDate > customEndDate) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const detailsStr = log.details ? JSON.stringify(log.details).toLowerCase() : '';
        const matchUser = log.userName.toLowerCase().includes(query);
        const matchAction = log.action.toLowerCase().includes(query);
        const matchEntity = log.entityType.toLowerCase().includes(query);
        const matchDetails = detailsStr.includes(query);
        if (!matchUser && !matchAction && !matchEntity && !matchDetails) return false;
      }

      return true;
    });
  }, [logs, selectedUser, selectedAction, selectedEntity, selectedDateFilter, customStartDate, customEndDate, searchTerm]);

  // Reset pagination when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedUser, selectedAction, selectedEntity, selectedDateFilter, customStartDate, customEndDate, viewMode]);

  // 4e. Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, currentPage, PAGE_SIZE]);

  // 4b. Groupings
  const logsGroupedByDay = useMemo(() => {
    const groups: Record<string, { bsDate: string; items: ActivityLog[] }> = {};
    filteredLogs.forEach((log) => {
      const dateKey = log.createdAt ? log.createdAt.substring(0, 10) : '2026-09-08';
      if (!groups[dateKey]) {
        const bsFormatted = formatBsDateOnly(new Date(log.createdAt));
        groups[dateKey] = {
          bsDate: bsFormatted,
          items: [],
        };
      }
      groups[dateKey].items.push(log);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredLogs]);

  const logsGroupedByUser = useMemo(() => {
    const groups: Record<string, { role: string; items: ActivityLog[] }> = {};
    filteredLogs.forEach((log) => {
      const user = log.userName || 'System';
      if (!groups[user]) {
        groups[user] = {
          role: log.userRole || 'STAFF',
          items: [],
        };
      }
      groups[user].items.push(log);
    });
    return Object.entries(groups).sort((a, b) => b[1].items.length - a[1].items.length);
  }, [filteredLogs]);

  // 4d. Export to CSV
  const handleExportCsv = () => {
    if (filteredLogs.length === 0) return;

    const headers = [
      'Timestamp (ISO)',
      'Date (BS)',
      'User Name',
      'User Role',
      'Action Code',
      'Action Name',
      'Entity Type',
      'Entity ID',
      'Details Summary',
    ];

    const rows = filteredLogs.map((l) => {
      const bsDate = formatBsDateOnly(new Date(l.createdAt));
      const detailsClean = l.details ? JSON.stringify(l.details).replace(/"/g, '""') : '';
      return [
        `"${l.createdAt}"`,
        `"${bsDate}"`,
        `"${l.userName}"`,
        `"${l.userRole}"`,
        `"${l.action}"`,
        `"${formatActionLabel(l.action)}"`,
        `"${l.entityType}"`,
        `"${l.entityId || ''}"`,
        `"${detailsClean}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bb_audit_trail_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasActiveFilters =
    selectedUser !== 'ALL' ||
    selectedAction !== 'ALL' ||
    selectedEntity !== 'ALL' ||
    selectedDateFilter !== 'ALL' ||
    searchTerm.trim() !== '';

  const resetFilters = () => {
    setSelectedUser('ALL');
    setSelectedAction('ALL');
    setSelectedEntity('ALL');
    setSelectedDateFilter('ALL');
    setCustomStartDate('');
    setCustomEndDate('');
    setSearchTerm('');
  };

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
      <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'OpsCore', href: '/opscore/activity' },
          { label: 'Activity Trail' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              System Activity Trail &amp; Audit Log
            </h1>
            <span className="rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold px-2.5 py-0.5 border border-blue-200">
              Immutable Log
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time chronological audit trail of all store visits, cheque custody transitions, order creations, and system overrides.
          </p>
        </div>

        {/* 4d. Export Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export to CSV</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-300">
              {filteredLogs.length}
            </span>
          </button>
        </div>
      </div>

      {/* 4a. Filter Bar Panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search audit trail by user, action, entity, store name, or metadata payload..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
          {/* By User */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              By Team Member:
            </label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Team Members ({userOptions.length})</option>
              {userOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* By Action Type */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              By Action Type:
            </label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Action Types</option>
              {actionOptions.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* By Entity Type */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              By Entity Type:
            </label>
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Entities</option>
              {entityOptions.map((ent) => (
                <option key={ent} value={ent}>
                  {ent}
                </option>
              ))}
            </select>
          </div>

          {/* By Date Range */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              By Date Range:
            </label>
            <select
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Time History</option>
              <option value="TODAY">Today (Bhadra 23, 2083 / Sep 8)</option>
              <option value="YESTERDAY">Yesterday (Bhadra 22, 2083 / Sep 7)</option>
              <option value="THIS_WEEK">This Week (Bhadra 18 - 24)</option>
              <option value="CUSTOM">Custom Date Range (BS/AD)</option>
            </select>
          </div>
        </div>

        {/* Custom Date Inputs (if selected) */}
        {selectedDateFilter === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="font-bold text-slate-600">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="rounded-lg border border-slate-200 p-1.5 text-xs font-medium"
            />
            <span className="font-bold text-slate-600">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="rounded-lg border border-slate-200 p-1.5 text-xs font-medium"
            />
          </div>
        )}

        {/* Filter Feedback Strip */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div>
            <span>Found </span>
            <strong className="text-slate-900 font-bold">{filteredLogs.length}</strong>
            <span> audit events matching criteria</span>
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" /> Reset All Filters
            </button>
          )}
        </div>
      </div>

      {/* 4b. Grouped View Toggle Strip & Pagination Top */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Toggle Pills */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200 w-fit">
          {[
            { key: 'FLAT', label: 'Flat List' },
            { key: 'BY_DAY', label: 'Grouped by Day' },
            { key: 'BY_USER', label: 'Grouped by User' },
          ].map((mode) => (
            <button
              key={mode.key}
              onClick={() => setViewMode(mode.key as ViewMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === mode.key
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* 4e. Pagination Summary & Quick Controls */}
        {viewMode === 'FLAT' && filteredLogs.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              Showing <strong className="text-slate-900">{(currentPage - 1) * PAGE_SIZE + 1}</strong> to{' '}
              <strong className="text-slate-900">
                {Math.min(currentPage * PAGE_SIZE, filteredLogs.length)}
              </strong>{' '}
              of <strong className="text-slate-900">{filteredLogs.length}</strong>
            </span>
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-bold text-slate-900 px-1">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4b. FLAT LIST VIEW                                                       */}
      {/* ========================================================================= */}
      {viewMode === 'FLAT' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden text-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="py-3 px-4">User &amp; Role</th>
                  <th className="py-3 px-4">Action Badge</th>
                  <th className="py-3 px-4">Entity Type</th>
                  <th className="py-3 px-4">Details / Metadata Payload</th>
                  <th className="py-3 px-4 text-right">Timestamp (BS &amp; AD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      No activity logs match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => {
                    const actionCat = getActionCategory(log.action);
                    const actionBadge = getActionBadgeStyle(actionCat);
                    const bsDate = formatBsDateOnly(new Date(log.createdAt));
                    const timeStr = new Date(log.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{log.userName}</div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {log.userRole ? log.userRole.replace(/_/g, ' ') : 'STAFF'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {/* 4c. Action Color Coding & Fix 38c: Daily Report Badge */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold border ${actionBadge}`}
                            >
                              {formatActionLabel(log.action)}
                            </span>
                            {(log.action.includes('Summary') || log.entityType === 'STAFF_DUTY' || log.entityType === 'DAILY_REPORT') && (
                              <span className="rounded-full bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                                Daily Report
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {log.entityType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px] max-w-sm truncate">
                          {log.details ? (
                            <span>{JSON.stringify(log.details)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600 text-[11px]">
                          <div className="font-bold text-slate-900">{bsDate}</div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {new Date(log.createdAt).toLocaleDateString()} at {timeStr}
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
      )}

      {/* ========================================================================= */}
      {/* 4b. GROUPED BY DAY VIEW                                                  */}
      {/* ========================================================================= */}
      {viewMode === 'BY_DAY' && (
        <div className="space-y-6">
          {logsGroupedByDay.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-xs">
              No activity logs match your filter criteria.
            </div>
          ) : (
            logsGroupedByDay.map(([dateKey, group]) => (
              <div
                key={dateKey}
                className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
              >
                {/* Day Header */}
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <h3 className="font-black text-slate-900 text-sm">
                      {group.bsDate} ({dateKey})
                    </h3>
                  </div>
                  <span className="rounded-full bg-blue-100 text-blue-800 font-black px-2.5 py-0.5 text-[10px] border border-blue-200">
                    {group.items.length} actions logged
                  </span>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  {group.items.map((log) => {
                    const actionCat = getActionCategory(log.action);
                    const actionBadge = getActionBadgeStyle(actionCat);
                    const timeStr = new Date(log.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={log.id}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 transition"
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold border shrink-0 ${actionBadge}`}
                          >
                            {formatActionLabel(log.action)}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{log.userName}</span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                ({log.userRole ? log.userRole.replace(/_/g, ' ') : 'Staff'})
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-slate-600">
                                {log.entityType}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-xl">
                              {log.details ? JSON.stringify(log.details) : '—'}
                            </div>
                          </div>
                        </div>

                        <div className="text-right text-[11px] text-slate-400 font-medium whitespace-nowrap">
                          {timeStr}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4b. GROUPED BY USER VIEW                                                 */}
      {/* ========================================================================= */}
      {viewMode === 'BY_USER' && (
        <div className="space-y-6">
          {logsGroupedByUser.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-xs">
              No activity logs match your filter criteria.
            </div>
          ) : (
            logsGroupedByUser.map(([userName, group]) => (
              <div
                key={userName}
                className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
              >
                {/* User Header */}
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 font-black text-white text-xs">
                      {userName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm">{userName}</h3>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase">
                        {group.role.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-200 text-slate-800 font-black px-2.5 py-0.5 text-[10px]">
                    {group.items.length} total actions
                  </span>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  {group.items.map((log) => {
                    const actionCat = getActionCategory(log.action);
                    const actionBadge = getActionBadgeStyle(actionCat);
                    const bsDate = formatBsDateOnly(new Date(log.createdAt));
                    const timeStr = new Date(log.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={log.id}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 transition"
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold border shrink-0 ${actionBadge}`}
                          >
                            {formatActionLabel(log.action)}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-slate-600">
                                {log.entityType}
                              </span>
                              <span className="font-medium text-slate-700 font-mono text-[11px] truncate max-w-xl">
                                {log.details ? JSON.stringify(log.details) : '—'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right text-[11px] text-slate-400 font-medium whitespace-nowrap">
                          {bsDate} at {timeStr}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 4e. Pagination Bottom Controls (Flat View) */}
      {viewMode === 'FLAT' && filteredLogs.length > PAGE_SIZE && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="text-xs text-slate-500">
            Showing Page <strong className="text-slate-900 font-bold">{currentPage}</strong> of{' '}
            <strong className="text-slate-900 font-bold">{totalPages}</strong> ({filteredLogs.length}{' '}
            total audit events)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                onClick={() => setCurrentPage(num)}
                className={`h-8 w-8 rounded-xl text-xs font-bold transition ${
                  currentPage === num
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {num}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
      </div>
    </PageGuard>
  );
}
