'use client';

import PagedList from '@/components/common/PagedList';
import Portal from '@/components/common/Portal';
import Money, { nprText } from '@/components/common/Money';
import DownloadButton from '@/components/common/DownloadButton';
import { confirmAction } from '@/components/common/confirm';
import InfoTip from '@/components/common/InfoTip';
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { Cheque, ChequeStatus } from '@/lib/types';
import { formatDualDate, getTodayAd, formatBsDateOnly, getTodayBs } from '@/lib/nepali-calendar';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import CameraCapture from '@/components/common/CameraCapture';
import BulkActionBar from '@/components/common/BulkActionBar';
import { generateCSV, downloadCSV } from '@/lib/csv';
import { toast } from '@/components/common/Toast';
import { validateRequired, validateQuantity, validateUniqueChequeNumber } from '@/lib/validation';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  UserCheck,
  Building2,
  Calendar,
  X,
  ExternalLink,
  ShieldAlert,
  ArrowUpRight,
  Download,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import ConfirmModal from '@/components/common/ConfirmModal';
import { getScope } from '@/lib/permissions';
import StatusBadge from '@/components/common/StatusBadge';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';

function ChequesContent() {
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const searchParams = useSearchParams();
  const searchParam = searchParams?.get('search') || searchParams?.get('id') || searchParams?.get('chequeNumber');

  const [cheques, setCheques] = useState<Cheque[]>(() => db.getCheques());
  // The workspace may still be loading when the page opens; follow it as it arrives and changes.
  useEffect(() => { const refresh = () => setCheques([...db.getCheques()]); refresh(); window.addEventListener('bb-db-updated', refresh); return () => window.removeEventListener('bb-db-updated', refresh); }, []);
  const [currentUser, setCurrentUser] = useState(() => db.getCurrentUser());
  const [searchTerm, setSearchTerm] = useState(searchParam || '');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Selected Cheque for detail modal
  const [selectedCheque, setSelectedCheque] = useState<Cheque | null>(null);

  // Cross-module query param listener
  useEffect(() => {
    if (searchParam) {
      setSearchTerm(searchParam);
      const match = cheques.find(
        (c) =>
          c.chequeNumber.toLowerCase().includes(searchParam.toLowerCase()) ||
          c.id.toLowerCase() === searchParam.toLowerCase() ||
          c.storeName.toLowerCase().includes(searchParam.toLowerCase())
      );
      if (match) {
        setSelectedCheque(match);
      }
    }
  }, [searchParam, cheques]);

  // Status Action Modals
  const [actionType, setActionType] = useState<
    'NONE' | 'HANDOVER' | 'CASHED' | 'DELAY' | 'BOUNCE' | 'LOST'
  >('NONE');
  const [handoverTo, setHandoverTo] = useState('');
  const [delayReason, setDelayReason] = useState('Vendor requested delay');
  const [newDelayDate, setNewDelayDate] = useState(getTodayAd());
  const [actionNotes, setActionNotes] = useState('');
  const [showCashedConfirm, setShowCashedConfirm] = useState(false);
  const [recentCashedId, setRecentCashedId] = useState<string | null>(null);

  // Add Cheque Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newChequeNumber, setNewChequeNumber] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newBank, setNewBank] = useState('Nabil Bank Ltd');
  const [newCashDate, setNewCashDate] = useState(getTodayAd());
  const [newChequePhoto, setNewChequePhoto] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const refreshCheques = () => {
    setCheques([...db.getCheques()]);
    if (selectedCheque) {
      const updated = db.getCheques().find((c) => c.id === selectedCheque.id);
      setSelectedCheque(updated || null);
    }
  };

  const handleUpdateStatus = (status: ChequeStatus) => {
    if (!selectedCheque) return;
    guardedSubmit(async () => {
      db.updateChequeStatus(selectedCheque.id, status, {
        handedOverTo: status === 'HANDED_OVER_AT_OFFICE' ? handoverTo : undefined,
        delayedReason: status === 'DELAYED' ? delayReason : undefined,
        newExpectedDate: status === 'DELAYED' ? newDelayDate : undefined,
        notes: actionNotes,
      });
      setActionType('NONE');
      setActionNotes('');
      refreshCheques();
      toast.success(`Cheque status updated to ${status}.`);
    });
  };

  const handleConfirmCashCheque = () => {
    if (!selectedCheque) return;
    guardedSubmit(async () => {
      db.updateChequeStatus(selectedCheque.id, 'CASHED', {
        notes: actionNotes || 'Marked as cashed by ' + currentUser.fullName,
      });
      setRecentCashedId(selectedCheque.id);
      setTimeout(() => setRecentCashedId(null), 3000);
      setShowCashedConfirm(false);
      setActionType('NONE');
      setActionNotes('');
      refreshCheques();
      toast.success(
        `Cheque ₹${selectedCheque.amount.toLocaleString()} cashed`,
        `${selectedCheque.storeName} payment updated`
      );
    });
  };

  const handleCreateCheque = () => {
    const errors: Record<string, string> = {};
    const storeErr = validateRequired(newStoreName, 'Store name');
    if (storeErr) errors.storeName = storeErr;

    const chequeNumErr =
      validateRequired(newChequeNumber, 'Cheque number') ||
      validateUniqueChequeNumber(newChequeNumber, cheques);
    if (chequeNumErr) errors.chequeNumber = chequeNumErr;

    const amountErr = validateQuantity(newAmount, 'Amount');
    if (amountErr) errors.amount = amountErr;

    const dateErr = validateRequired(newCashDate, 'Cash date');
    if (dateErr) errors.cashDate = dateErr;

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error('Please fix the highlighted errors before saving.');
      return;
    }

    const matchedStore = db.getStores().find(
      (s) => s.name.toLowerCase() === newStoreName.trim().toLowerCase()
    );

    guardedSubmit(async () => {
      db.addCheque({
        entityType: (matchedStore?.entityType as any) || 'RETAILER',
        entityId: matchedStore?.id || `store_${Date.now()}`,
        storeName: newStoreName.trim(),
        chequeNumber: newChequeNumber.trim(),
        amount: parseFloat(newAmount),
        bankName: newBank,
        receivedDateAd: getTodayAd(),
        receivedDateBs: getTodayBs(),
        cashDateAd: newCashDate,
        cashDateBs: newCashDate ? formatBsDateOnly(newCashDate) : getTodayBs(),
        photoUrl: newChequePhoto || '',
        status: 'COLLECTED_IN_FIELD',
        notes: 'Collected directly during visit.',
      });
      setShowAddModal(false);
      setNewChequeNumber('');
      setNewAmount('');
      setNewChequePhoto('');
      setFormErrors({});
      refreshCheques();
      toast.success('Cheque logged');
    });
  };

  const isSalesOfficer = getScope(currentUser, 'cheque_tracker') === 'OWN';

  const filteredCheques = cheques.filter((c) => {
    if (isSalesOfficer && c.officerId !== currentUser.id && c.officerName !== currentUser.fullName) {
      return false;
    }
    const matchesSearch =
      c.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.chequeNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.bankName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredCheques.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCheques.map((c) => c.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleBulkMarkCashed = async () => {
    if (!(await confirmAction({ title: `Mark ${selectedIds.length} cheque${selectedIds.length === 1 ? '' : 's'} as cashed?`, consequences: ['Each cheque leaves the pending list and counts as collected.'], confirmLabel: 'Mark cashed' }))) return;
    if (selectedIds.length === 0) return;
    guardedSubmit(async () => {
      selectedIds.forEach((id) => {
        db.updateChequeStatus(id, 'CASHED', {
          notes: 'Bulk marked as cashed by ' + currentUser.fullName,
        });
      });
      toast.success(`Marked ${selectedIds.length} cheques as Cashed.`);
      handleClearSelection();
      refreshCheques();
    });
  };

  const handleBulkEscalate = async () => {
    if (!(await confirmAction({ title: `Mark ${selectedIds.length} cheque${selectedIds.length === 1 ? '' : 's'} as bounced?`, consequences: ['Each store is flagged and the cheques move to incidents.'], confirmLabel: 'Mark bounced', destructive: true }))) return;
    if (selectedIds.length === 0) return;
    guardedSubmit(async () => {
      selectedIds.forEach((id) => {
        db.updateChequeStatus(id, 'BOUNCED', {
          notes: 'Bulk escalation / flagged by ' + currentUser.fullName,
        });
      });
      toast.error(`Escalated ${selectedIds.length} cheques as Bounced / Incident.`);
      handleClearSelection();
      refreshCheques();
    });
  };

  const handleBulkExportCSV = () => {
    const selectedChequesData = cheques.filter((c) => selectedIds.includes(c.id));
    if (selectedChequesData.length === 0) return;

    const columns = [
      { key: 'chequeNumber', label: 'Cheque number' },
      { key: 'storeName', label: 'Store name' },
      { key: 'bankName', label: 'Bank name' },
      { key: 'amount', label: 'Amount (NPR)' },
      { key: 'status', label: 'Status' },
      { key: 'officerName', label: 'Collector officer' },
      { key: 'receivedDateBs', label: 'Received date (BS)' },
      { key: 'receivedDateAd', label: 'Received date (AD)' },
      { key: 'cashDateBs', label: 'Cash date (BS)' },
      { key: 'cashDateAd', label: 'Cash date (AD)' },
      { key: 'handedOverTo', label: 'Office custody' },
    ];

    const csv = generateCSV(columns, selectedChequesData);
    downloadCSV(csv, `cheques_export_${getTodayAd()}`);
  };

  // KPI calculations
  const totalAmount = cheques.reduce((s, c) => s + c.amount, 0);
  const pendingHandover = cheques.filter((c) => c.status === 'COLLECTED_IN_FIELD');
  const delayedCount = cheques.filter((c) => c.status === 'DELAYED').length;
  const bouncedCount = cheques.filter((c) => c.status === 'BOUNCED').length;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Offline sales', href: '/offline-sales/stores' },
          { label: 'Cheque tracker' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Cheque tracker
<InfoTip label="About this page">Tracks physical custody: Field Collection → Office Handover → Bank Clearing with overdue alerts.</InfoTip></h1>
          
        </div>
          <DownloadButton datasets={['cheques']} records={{ cheques: filteredCheques } as any} />

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Add cheque
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500">Total pipeline</div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
            <Money>{totalAmount.toLocaleString()}</Money>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{cheques.length} cheques logged</div>
        </div>

        <div className="rounded-xl border border-black/[0.08] bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold text-amber-800">
            Pending office handover
          </div>
          <div className="text-lg sm:text-xl font-bold text-amber-900 mt-1">
            {pendingHandover.length} Cheques
          </div>
          <div className="text-xs text-amber-700 mt-0.5">Physical cheque with officer</div>
        </div>

        <div className="rounded-xl border border-black/[0.08] bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold text-blue-800">Delayed deposit</div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 mt-1">{delayedCount} Cheques</div>
          <div className="text-xs text-blue-700 mt-0.5">Grace period agreed</div>
        </div>

        <div className="rounded-xl border border-black/[0.08] bg-white p-4 shadow-sm">
          <div className="text-[11px] font-bold text-rose-800">Bounced / incident</div>
          <div className="text-lg sm:text-xl font-bold text-rose-900 mt-1">{bouncedCount} Cheques</div>
          <div className="text-xs text-rose-700 mt-0.5">Vendor flagged</div>
        </div>
      </div>

      {/* Overdue Warning Alert (PRD: >2 days gap between collection and office handover) */}
      {pendingHandover.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-3 shadow-sm">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="font-bold">Physical cheque handover alert:</strong>
            <p>
              {pendingHandover[0].officerName} has <strong><Money>{pendingHandover[0].amount.toLocaleString()}</Money></strong> ({pendingHandover[0].storeName}) marked &quot;Collected in Field&quot; for more than 2 days. Physical custody must be transferred to the office person to prevent lost cheques.
            </p>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search cheque #, store, bank…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-2 text-xs outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          <span className="text-xs text-slate-500 whitespace-nowrap">Filter status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs bg-white outline-none"
          >
            <option value="ALL">All statuses</option>
            <option value="COLLECTED_IN_FIELD">Collected in field</option>
            <option value="HANDED_OVER_AT_OFFICE">Handed over at office</option>
            <option value="PENDING">Pending cash date</option>
            <option value="CASHED">Cashed ✓</option>
            <option value="DELAYED">Delayed</option>
            <option value="BOUNCED">Bounced </option>
            <option value="LOST">Lost</option>
          </select>
        </div>
      </div>

      {/* Select All & Selection Count Bar */}
      <div className="flex items-center justify-between px-1 text-xs">
        <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700 select-none">
          <input
            type="checkbox"
            checked={filteredCheques.length > 0 && selectedIds.length === filteredCheques.length}
            onChange={handleSelectAll}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span>
            Select All ({filteredCheques.length} {filteredCheques.length === 1 ? 'cheque' : 'cheques'})
          </span>
        </label>
        {selectedIds.length > 0 && (
          <span className="text-blue-600 font-bold bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
            {selectedIds.length} of {filteredCheques.length} selected
          </span>
        )}
      </div>

      {/* Cheques Grid */}
      {filteredCheques.length === 0 ? (
        <EmptyState
          type="cheques"
          title="No cheques found"
          description="No cheques match your filter criteria or officer assignment."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {<PagedList items={filteredCheques} label="cheques" render={(pageRows) => pageRows.map((chq) => {
          const isFieldHeld = chq.status === 'COLLECTED_IN_FIELD';
          const isCashed = chq.status === 'CASHED';
          const isBounced = chq.status === 'BOUNCED';
          const isDelayed = chq.status === 'DELAYED';
          const isSelected = selectedIds.includes(chq.id);

          return (
            <div
              key={chq.id}
              onClick={() => setSelectedCheque(chq)}
              className={`group cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md space-y-3 ${
                recentCashedId === chq.id ? 'flash-green ring-2 ring-emerald-500' : ''
              } ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10'
                  : 'border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onClick={(e) => handleToggleSelect(chq.id, e)}
                    onChange={() => {}}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                  />
                  <div className="min-w-0">
                    <Link
                      href={`/offline-sales/stores/${chq.entityId || encodeURIComponent(chq.storeName)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-bold text-slate-900 text-sm hover:text-blue-600 hover:underline transition inline-flex items-center gap-1 truncate max-w-full"
                    >
                      {chq.storeName}
                      <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition shrink-0" />
                    </Link>
                    <div className="text-xs text-slate-500 truncate">{chq.bankName}</div>
                  </div>
                </div>
                <StatusBadge status={chq.status} />
              </div>

              <div className="rounded-lg bg-slate-50 p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Cheque number:</span>
                  <strong className="font-mono font-bold text-slate-800">{chq.chequeNumber}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount:</span>
                  <strong className="font-bold text-slate-900 text-sm">
                    <Money>{chq.amount.toLocaleString()}</Money>
                  </strong>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Agreed cash date:</span>
                  <span className="font-medium text-slate-700">{chq.cashDateBs}</span>
                </div>
              </div>

              {/* Custody Info */}
              <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
                <span>
                  Collector:{' '}
                  <Link
                    href={`/offline-sales/scorecard?officer=${encodeURIComponent(chq.officerName)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-700 font-bold hover:text-blue-600 hover:underline"
                  >
                    {chq.officerName}
                  </Link>
                </span>
                <span className="text-blue-600 font-semibold flex items-center gap-1 group-hover:underline">
                  View timeline & handover →
                </span>
              </div>
            </div>
          );
        })} />}
      </div>
      )}

      {/* Cheque Detail & Two-Step Handover Modal */}
      {selectedCheque && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Cheque lifecycle details</h3>
                <p className="text-xs text-slate-500">
                  Cheque #{selectedCheque.chequeNumber} —{' '}
                  <Link
                    href={`/offline-sales/stores/${selectedCheque.entityId || encodeURIComponent(selectedCheque.storeName)}`}
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    {selectedCheque.storeName}
                  </Link>
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedCheque(null);
                  setActionType('NONE');
                }}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Image Preview */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <img
                  src={selectedCheque.photoUrl}
                  alt="Cheque photo"
                  className="h-44 w-full object-cover"
                />
              </div>

              {/* Information Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3 space-y-1">
                  <div className="text-[11px] font-bold text-slate-500">Amount & bank</div>
                  <div className="text-base font-bold text-slate-900">
                    <Money>{selectedCheque.amount.toLocaleString()}</Money>
                  </div>
                  <div className="text-slate-600 font-medium">{selectedCheque.bankName}</div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 space-y-1">
                  <div className="text-[11px] font-bold text-slate-500">Current custody status</div>
                  <div className="font-bold text-blue-700 text-sm">
                    {selectedCheque.status.replace(/_/g, ' ')}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    {selectedCheque.handedOverTo ? (
                      `In office with ${selectedCheque.handedOverTo}`
                    ) : (
                      <>
                        In field with{' '}
                        <Link
                          href={`/offline-sales/scorecard?officer=${encodeURIComponent(selectedCheque.officerName)}`}
                          className="font-semibold text-blue-600 hover:underline"
                        >
                          {selectedCheque.officerName}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <div className="font-bold text-slate-800 text-[11px] ">
                  Update cheque lifecycle step:
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedCheque.status === 'COLLECTED_IN_FIELD' && (
                    <button
                      onClick={() => setActionType('HANDOVER')}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700"
                    >
                      Hand over at office
                    </button>
                  )}

                  <button
                    onClick={() => setShowCashedConfirm(true)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700"
                  >
                    Mark as cashed ✓
                  </button>

                  <button
                    onClick={() => setActionType('DELAY')}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    Mark delayed
                  </button>

                  <button
                    onClick={() => handleUpdateStatus('BOUNCED')}
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 font-semibold text-rose-800 hover:bg-rose-100"
                  >
                    Mark bounced 
                  </button>
                </div>
              </div>

              {/* Handover Dialog */}
              {actionType === 'HANDOVER' && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                  <div className="font-bold text-blue-900">Physically hand over cheque at office</div>
                  <p className="text-blue-800 text-[11px]">
                    Select the office staff member receiving this physical paper cheque:
                  </p>
                  <div>
                    <label htmlFor="cheques-received-by" className="block font-bold text-blue-900 mb-1">Received by:</label>
                    <select id="cheques-received-by"
                      value={handoverTo}
                      onChange={(e) => setHandoverTo(e.target.value)}
                      className="w-full rounded-lg border border-blue-300 px-3 py-2 bg-white outline-none"
                    >
                      <option value="">Select office staff member…</option>
                      {db.getUsers().map((u) => (
                        <option key={u.id} value={u.fullName}>
                          {u.fullName} {u.role ? `(${u.role.replace('_', ' ')})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setActionType('NONE')}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 bg-white text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdateStatus('HANDED_OVER_AT_OFFICE')}
                      className="rounded-lg bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700"
                    >
                      Confirm handover
                    </button>
                  </div>
                </div>
              )}

              {/* Delayed Dialog */}
              {actionType === 'DELAY' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                  <div className="font-bold text-amber-900">Record agreed payment delay</div>
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">Reason for Delay:</label>
                    <select aria-label="Reason for Delay:"
                      value={delayReason}
                      onChange={(e) => setDelayReason(e.target.value)}
                      className="w-full rounded-lg border border-amber-300 px-3 py-2 bg-white outline-none"
                    >
                      <option>Vendor requested delay</option>
                      <option>Insufficient funds reported</option>
                      <option>Bank processing holiday</option>
                      <option>Other commercial grace period</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="cheques-new-expected-cash-date" className="block font-bold text-amber-900 mb-1">New expected cash date:</label>
                    <input id="cheques-new-expected-cash-date"
                      type="date"
                      value={newDelayDate}
                      onChange={(e) => setNewDelayDate(e.target.value)}
                      className="w-full rounded-lg border border-amber-300 px-3 py-2 bg-white outline-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setActionType('NONE')}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 bg-white text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdateStatus('DELAYED')}
                      className="rounded-lg bg-amber-600 px-4 py-1.5 font-semibold text-white hover:bg-amber-700"
                    >
                      Save delay
                    </button>
                  </div>
                </div>
              )}

              {/* Status Timeline */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="font-bold text-slate-500 text-[11px]">
                  Custody & status history (audit trail)
                </div>
                <div className="space-y-3">
                  {selectedCheque.history.map((h, idx) => (
                    <div key={h.id} className="flex items-start gap-3">
                      <div className="h-2 w-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-800">
                          {h.newStatus.replace(/_/g, ' ')}
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          By {h.changedBy} on {new Date(h.timestamp).toLocaleDateString()} at{' '}
                          {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {h.notes && <div className="text-slate-600 mt-0.5">&quot;{h.notes}&quot;</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 px-6 py-3 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setSelectedCheque(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* Add Cheque Modal */}
      {showAddModal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Add new cheque entry</h3>
              <button onClick={() => setShowAddModal(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label htmlFor="cheques-store-distributor" className="block font-bold text-slate-700 mb-1">Store / distributor *</label>
              <input id="cheques-store-distributor"
                type="text"
                value={newStoreName}
                onChange={(e) => {
                  setNewStoreName(e.target.value);
                  if (formErrors.storeName) setFormErrors((prev) => ({ ...prev, storeName: '' }));
                }}
                className={`w-full rounded-lg border px-3 py-2 outline-none transition ${
                  formErrors.storeName
                    ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                    : 'border-slate-300 focus:border-blue-500'
                }`}
              />
              {formErrors.storeName && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.storeName}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cheques-cheque-number" className="block font-bold text-slate-700 mb-1">Cheque number *</label>
                <input id="cheques-cheque-number"
                  type="text"
                  placeholder="e.g. NIBL-99824"
                  value={newChequeNumber}
                  onChange={(e) => {
                    setNewChequeNumber(e.target.value);
                    if (formErrors.chequeNumber) setFormErrors((prev) => ({ ...prev, chequeNumber: '' }));
                  }}
                  className={`w-full rounded-lg border px-3 py-2 outline-none transition font-mono ${
                    formErrors.chequeNumber
                      ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                />
                {formErrors.chequeNumber && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.chequeNumber}</p>
                )}
              </div>
              <div>
                <label htmlFor="cheques-amount-npr" className="block font-bold text-slate-700 mb-1">Amount (NPR) *</label>
                <input id="cheques-amount-npr"
                  type="number"
                  placeholder="35000"
                  value={newAmount}
                  onChange={(e) => {
                    setNewAmount(e.target.value);
                    if (formErrors.amount) setFormErrors((prev) => ({ ...prev, amount: '' }));
                  }}
                  className={`w-full rounded-lg border px-3 py-2 outline-none transition ${
                    formErrors.amount
                      ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                />
                {formErrors.amount && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.amount}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cheques-bank-name" className="block font-bold text-slate-700 mb-1">Bank name</label>
                <select id="cheques-bank-name"
                  value={newBank}
                  onChange={(e) => setNewBank(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none"
                >
                  <option>Nabil bank ltd</option>
                  <option>Nepal investment mega bank</option>
                  <option>Standard chartered bank</option>
                  <option>Global IME bank</option>
                </select>
              </div>
              <div>
                <label htmlFor="cheques-cash-date" className="block font-bold text-slate-700 mb-1">Cash date *</label>
                <input id="cheques-cash-date"
                  type="date"
                  value={newCashDate}
                  onChange={(e) => {
                    setNewCashDate(e.target.value);
                    if (formErrors.cashDate) setFormErrors((prev) => ({ ...prev, cashDate: '' }));
                  }}
                  className={`w-full rounded-lg border px-3 py-2 bg-white outline-none transition ${
                    formErrors.cashDate
                      ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                />
                {formErrors.cashDate && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.cashDate}</p>
                )}
              </div>
            </div>

            {/* Photo Capture */}
            <CameraCapture
                folder="cheque_tracker"
              label="Photograph cheque leaf"
              sublabel="Capture front face of cheque showing cheque #, amount, and signature"
              maxFiles={1}
              existingUrls={newChequePhoto ? [newChequePhoto] : []}
              onRemoveExisting={() => setNewChequePhoto('')}
              onUpload={(results) => setNewChequePhoto(results[0]?.url || '')}
            />

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCheque}
                disabled={isSubmitting || !newChequeNumber || !newAmount}
                className="btn btn-primary disabled:opacity-50"
              >
                {isSubmitting && (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                )}
                {isSubmitting ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Saving…</> : 'Save Cheque'}
              </button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        totalCount={filteredCheques.length}
        onClearSelection={handleClearSelection}
        onSelectAll={handleSelectAll}
      >
        <button
          type="button"
          onClick={handleBulkMarkCashed}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow transition cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Mark all as cashed</span>
        </button>

        <button
          type="button"
          onClick={handleBulkEscalate}
          className="flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-bold text-white shadow transition cursor-pointer"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Escalate selected</span>
        </button>

        <button
          type="button"
          onClick={handleBulkExportCSV}
          className="flex items-center gap-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs font-bold text-white shadow transition cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export selected (CSV)</span>
        </button>
      </BulkActionBar>

      {/* FIX 50a: Context-Rich Cheque Cashed Confirmation Modal */}
      <ConfirmModal
        isOpen={showCashedConfirm}
        title="Mark cheque as cashed?"
        variant="success"
        confirmLabel="Confirm cashed"
        cancelLabel="Cancel"
        details={selectedCheque ? [
          { label: 'Cheque #', value: selectedCheque.chequeNumber },
          { label: 'Vendor', value: selectedCheque.storeName },
          { label: 'Amount', value: `${nprText(selectedCheque.amount.toLocaleString())}` },
          { label: 'Bank', value: selectedCheque.bankName },
          { label: 'Collected', value: `${selectedCheque.receivedDateBs} by ${selectedCheque.officerName}` },
          { label: 'Cash date', value: `${selectedCheque.cashDateBs} (Clearing date)` },
        ] : []}
        consequences={[
          'Close this cheque permanently from pending custody register',
          `Update ${selectedCheque?.storeName}'s payment ledger & vendor health score`,
          'Notify Admin & Finance team of successful collection clearing',
        ]}
        onConfirm={handleConfirmCashCheque}
        onCancel={() => setShowCashedConfirm(false)}
      />
    </div>
  );
}

export default function ChequesPage() {
  return (
    <PageGuard feature="cheque_tracker">
      <Suspense
        fallback={
          <div className="p-8 text-center text-slate-500 font-medium">
            Loading cheque register…
          </div>
        }
      >
        <ChequesContent />
      </Suspense>
    </PageGuard>
  );
}

