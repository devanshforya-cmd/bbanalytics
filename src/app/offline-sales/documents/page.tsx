'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import CameraCapture from '@/components/common/CameraCapture';
import { HandoverDocument, CustodyEvent, Branch, Retailer } from '@/lib/types';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { toast } from '@/components/common/Toast';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Camera,
  CheckCircle2,
  Clock,
  Building2,
  X,
  UserCheck,
  AlertTriangle,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  ExternalLink,
  Archive,
  ShieldAlert,
  Eye,
  ArrowRight,
  Calendar,
  ChevronRight,
  Download,
  Sparkles,
  RefreshCw,
  FolderCheck,
  Check,
  ArrowUpRight,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import { getScope } from '@/lib/permissions';

const SAMPLE_DOC_IMAGES = [
  {
    label: 'Delivery Challan',
    url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Purchase Order',
    url: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=1200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Tax Invoice',
    url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Stock Audit Sheet',
    url: 'https://images.unsplash.com/photo-1568234928966-359c35dd8327?w=1200&auto=format&fit=crop&q=80',
  },
];

export default function DocumentsPage() {
  const [currentUser] = useState(() => db.getCurrentUser());
  const isSalesOfficer = getScope(currentUser, 'document_handover') === 'OWN';
  const [documents, setDocuments] = useState<HandoverDocument[]>(() => db.getDocuments());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStore, setFilterStore] = useState('ALL');
  const [filterDocType, setFilterDocType] = useState('ALL');
  const [filterOfficer, setFilterOfficer] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDateRange, setFilterDateRange] = useState('ALL');
  const [filterHolder, setFilterHolder] = useState('ALL');
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [lightboxDoc, setLightboxDoc] = useState<HandoverDocument | null>(null);
  const [lightboxImgIndex, setLightboxImgIndex] = useState(0);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxRotation, setLightboxRotation] = useState(0);

  // Master lists
  const allStaff = useMemo(() => db.getUsers(), []);
  const configuredDocTypes = useMemo(() => db.getDocumentTypes().filter((t) => t.isActive), []);
  const branches: Branch[] = useMemo(() => db.getBranches(), []);
  const retailers: Retailer[] = useMemo(() => db.getRetailers(), []);

  // Status Action Modals
  const [handoverModalDoc, setHandoverModalDoc] = useState<HandoverDocument | null>(null);
  const [handoverRecipient, setHandoverRecipient] = useState(allStaff[0]?.fullName || 'Operations Desk');
  const [handoverNotes, setHandoverNotes] = useState('');

  const [filingModalDoc, setFilingModalDoc] = useState<HandoverDocument | null>(null);
  const [filingFolder, setFilingFolder] = useState('Accounts Archive / Current Period');
  const [filingNotes, setFilingNotes] = useState('');

  const [missingModalDoc, setMissingModalDoc] = useState<HandoverDocument | null>(null);
  const [missingReason, setMissingReason] = useState('');

  // Upload Form State (Clean by default)
  const [formStoreId, setFormStoreId] = useState('');
  const [formStoreName, setFormStoreName] = useState('');
  const [formStoreSearch, setFormStoreSearch] = useState('');
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [formDocType, setFormDocType] = useState('Purchase Order');
  const [formRefNumber, setFormRefNumber] = useState('');
  const [formOfficerName, setFormOfficerName] = useState(
    allStaff.find((u) => u.role === 'SALES_OFFICER' || u.permissions?.beat_plans?.access === 'FULL' || u.id.startsWith('user_'))?.fullName ||
      allStaff[0]?.fullName ||
      'Field Officer'
  );
  const [formInitialHolder, setFormInitialHolder] = useState('FIELD');
  const [formHandedTo, setFormHandedTo] = useState(allStaff[0]?.fullName || 'Operations Desk');
  const [formNotes, setFormNotes] = useState('');
  const [formPhotoUrls, setFormPhotoUrls] = useState<string[]>([]);

  const allStores = useMemo(() => {
    const list: { id: string; name: string; type: 'BRANCH' | 'RETAILER'; area?: string }[] = [];
    branches.forEach((b) => list.push({ id: b.id, name: b.name, type: 'BRANCH', area: b.address }));
    retailers.forEach((r) => list.push({ id: r.id, name: r.name, type: 'RETAILER', area: r.address }));
    return list;
  }, [branches, retailers]);

  // Helper for overdue calculation (> 2 days old with status COLLECTED)
  const getDaysSinceDoc = (docDateAd: string) => {
    try {
      const docDate = new Date(docDateAd).getTime();
      const today = new Date().getTime();
      const diffMs = Math.max(0, today - docDate);
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  };

  const isDocOverdue = (doc: HandoverDocument) => {
    if (doc.status !== 'COLLECTED') return false;
    return getDaysSinceDoc(doc.docDateAd) >= 2;
  };

  // Overdue documents for alert banner (5f)
  const overdueDocs = useMemo(() => {
    return documents.filter(isDocOverdue);
  }, [documents]);

  const missingDocsCount = useMemo(() => {
    return documents.filter((d) => d.status === 'MISSING').length;
  }, [documents]);

  // Custodians list
  const uniqueHolders = useMemo(() => {
    const holders = new Set<string>();
    documents.forEach((d) => {
      if (d.currentHolder) holders.add(d.currentHolder);
    });
    return Array.from(holders);
  }, [documents]);

  // Filtered documents (5a)
  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      if (isSalesOfficer && doc.officerId !== currentUser.id && doc.officerName !== currentUser.fullName) {
        return false;
      }
      if (onlyOverdue && !isDocOverdue(doc)) return false;

      // Text search
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matches =
          doc.storeName.toLowerCase().includes(q) ||
          doc.documentType.toLowerCase().includes(q) ||
          (doc.referenceNumber && doc.referenceNumber.toLowerCase().includes(q)) ||
          doc.officerName.toLowerCase().includes(q) ||
          (doc.currentHolder && doc.currentHolder.toLowerCase().includes(q)) ||
          (doc.notes && doc.notes.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Store filter
      if (filterStore !== 'ALL' && doc.storeName !== filterStore) return false;

      // Document Type
      if (filterDocType !== 'ALL' && doc.documentType !== filterDocType) return false;

      // Officer
      if (filterOfficer !== 'ALL' && doc.officerName !== filterOfficer) return false;

      // Status
      if (filterStatus !== 'ALL' && doc.status !== filterStatus) return false;

      // Current Holder
      if (filterHolder !== 'ALL' && doc.currentHolder !== filterHolder) return false;

      // Date Range
      if (filterDateRange === 'TODAY') {
        if (doc.docDateAd !== getTodayAd()) return false;
      } else if (filterDateRange === 'LAST_7_DAYS') {
        if (getDaysSinceDoc(doc.docDateAd) > 7) return false;
      } else if (filterDateRange === 'LAST_30_DAYS') {
        if (getDaysSinceDoc(doc.docDateAd) > 30) return false;
      }

      return true;
    });
  }, [
    documents,
    onlyOverdue,
    searchTerm,
    filterStore,
    filterDocType,
    filterOfficer,
    filterStatus,
    filterHolder,
    filterDateRange,
  ]);

  // Active filters count
  const activeFiltersCount =
    (filterStore !== 'ALL' ? 1 : 0) +
    (filterDocType !== 'ALL' ? 1 : 0) +
    (filterOfficer !== 'ALL' ? 1 : 0) +
    (filterStatus !== 'ALL' ? 1 : 0) +
    (filterHolder !== 'ALL' ? 1 : 0) +
    (filterDateRange !== 'ALL' ? 1 : 0) +
    (onlyOverdue ? 1 : 0) +
    (searchTerm ? 1 : 0);

  const handleResetFilters = () => {
    setFilterStore('ALL');
    setFilterDocType('ALL');
    setFilterOfficer('ALL');
    setFilterStatus('ALL');
    setFilterHolder('ALL');
    setFilterDateRange('ALL');
    setOnlyOverdue(false);
    setSearchTerm('');
  };

  // Lightbox Handlers (5b)
  const openLightbox = (doc: HandoverDocument, initialIdx = 0) => {
    setLightboxDoc(doc);
    setLightboxImgIndex(initialIdx);
    setLightboxZoom(1);
    setLightboxRotation(0);
  };

  const closeLightbox = () => {
    setLightboxDoc(null);
  };

  // Status Handlers (5c)
  const handleConfirmHandover = () => {
    if (!handoverModalDoc) return;
    db.updateDocumentStatus(handoverModalDoc.id, 'HANDED_OVER', {
      handedToUserName: handoverRecipient,
      notes: handoverNotes.trim() || undefined,
    });
    setDocuments([...db.getDocuments()]);
    setHandoverModalDoc(null);
    setHandoverNotes('');
  };

  const handleConfirmFiling = () => {
    if (!filingModalDoc) return;
    db.updateDocumentStatus(filingModalDoc.id, 'FILED', {
      filedLocation: filingFolder,
      notes: filingNotes.trim() || undefined,
    });
    setDocuments([...db.getDocuments()]);
    setFilingModalDoc(null);
    setFilingNotes('');
  };

  const handleConfirmMissing = () => {
    if (!missingModalDoc) return;
    db.updateDocumentStatus(missingModalDoc.id, 'MISSING', {
      notes: missingReason.trim() || 'Reported missing during audit verification.',
    });
    setDocuments([...db.getDocuments()]);
    setMissingModalDoc(null);
    setMissingReason('');
  };

  const handleRecoverDocument = (doc: HandoverDocument) => {
    db.updateDocumentStatus(doc.id, 'HANDED_OVER', {
      handedToUserName: 'Sita Gurung (Ops Desk)',
      notes: 'Document recovered and accounted for in office custody.',
    });
    setDocuments([...db.getDocuments()]);
  };

  // Upload Form Handlers (5e)
  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStoreName.trim()) {
      toast.error('Please select a store or distributor.');
      return;
    }
    if (formPhotoUrls.length === 0) {
      toast.error('Please capture or select at least one document photo.');
      return;
    }

    const isImmediateOffice = formInitialHolder === 'OFFICE';
    const newStatus = isImmediateOffice ? 'HANDED_OVER' : 'COLLECTED';
    const currentHolder = isImmediateOffice
      ? formHandedTo
      : `${formOfficerName} (Field)`;

    const initialTimeline: CustodyEvent[] = [
      {
        id: `ce_${Date.now()}_1`,
        action: 'COLLECTED',
        actorName: formOfficerName,
        locationOrFolder: formStoreName,
        timestamp: new Date().toISOString(),
        formattedTime: 'Just now',
        notes: formNotes || 'Physical document collected from vendor.',
      },
    ];

    if (isImmediateOffice) {
      initialTimeline.push({
        id: `ce_${Date.now()}_2`,
        action: 'HANDED_OVER',
        actorName: formOfficerName,
        recipientName: formHandedTo,
        locationOrFolder: 'Brand Bucket Head Office',
        timestamp: new Date().toISOString(),
        formattedTime: 'Just now',
        notes: `Direct handover to ${formHandedTo}`,
      });
    }

    db.addDocument({
      entityType: 'BRANCH',
      entityId: formStoreId || 'store_custom',
      storeName: formStoreName,
      documentType: formDocType,
      docDateAd: getTodayAd(),
      docDateBs: getTodayBs(),
      referenceNumber: formRefNumber.trim() || undefined,
      photoUrls: formPhotoUrls,
      officerId: 'user_officer_ravi',
      officerName: formOfficerName,
      currentHolder,
      status: newStatus,
      handedToUserName: isImmediateOffice ? formHandedTo : undefined,
      handoverDate: isImmediateOffice ? getTodayAd() : undefined,
      notes: formNotes.trim() || undefined,
      timeline: initialTimeline,
    });

    setDocuments([...db.getDocuments()]);
    setShowUploadModal(false);
    toast.success('Document uploaded successfully with custody tracking.');

    // Reset form
    setFormStoreId('');
    setFormStoreName('');
    setFormStoreSearch('');
    setFormRefNumber('');
    setFormNotes('');
    setFormPhotoUrls([SAMPLE_DOC_IMAGES[0].url]);
  };

  const handleRemovePhoto = (index: number) => {
    setFormPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <PageGuard feature="document_handover">
      <div className="space-y-6 pb-20">
      <Breadcrumbs
        items={[
          { label: 'Offline Sales', href: '/offline-sales/stores' },
          { label: 'Physical Document Handover' },
        ]}
      />

      {/* 5f. Missing / Overdue Document Alert Banner */}
      {overdueDocs.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-200/70 p-2 text-amber-800">
                <AlertTriangle className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900 text-sm flex items-center gap-2">
                  ⚠️ {overdueDocs.length} document{overdueDocs.length > 1 ? 's' : ''} collected in field but not yet handed to office
                </h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  These documents were collected over 2 days ago and remain in officer field custody. Physical handover is required for accounting audit compliance.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <button
                onClick={() => setOnlyOverdue(!onlyOverdue)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition-all ${
                  onlyOverdue
                    ? 'bg-amber-800 text-white hover:bg-amber-900'
                    : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-100'
                }`}
              >
                {onlyOverdue ? 'Showing Overdue (Clear Filter)' : `Review Overdue (${overdueDocs.length}) →`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Document Handover & Chain of Custody
            </h1>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
              {documents.length} Tracked
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Physical custody trail for purchase orders, signed delivery challans, tax invoices, and stock audit sheets.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => {
              setFormStoreId('');
              setFormStoreName('');
              setFormStoreSearch('');
              setFormRefNumber('');
              setFormNotes('');
              setFormPhotoUrls([SAMPLE_DOC_IMAGES[0].url]);
              setShowUploadModal(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Upload Document
          </button>
        </div>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="text-[11px] font-semibold uppercase text-slate-500">Field Custody</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-amber-600">
              {documents.filter((d) => d.status === 'COLLECTED').length}
            </span>
            {overdueDocs.length > 0 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                {overdueDocs.length} overdue
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="text-[11px] font-semibold uppercase text-slate-500">Handed to Office</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-blue-600">
              {documents.filter((d) => d.status === 'HANDED_OVER').length}
            </span>
            <span className="text-[11px] text-slate-400">Pending filing</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="text-[11px] font-semibold uppercase text-slate-500">Filed in Archive</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-emerald-600">
              {documents.filter((d) => d.status === 'FILED').length}
            </span>
            <span className="text-[11px] text-emerald-700 font-medium">Archived ✓</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="text-[11px] font-semibold uppercase text-slate-500">Missing / Audit</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className={`text-2xl font-bold ${missingDocsCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
              {missingDocsCount}
            </span>
            {missingDocsCount > 0 ? (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                Action required
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">0 issues</span>
            )}
          </div>
        </div>
      </div>

      {/* 5a. Filter Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-blue-600" />
            <h2 className="font-bold text-slate-900 text-xs">Filter Document Archive</h2>
            {activeFiltersCount > 0 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                {activeFiltersCount} active
              </span>
            )}
          </div>
          {activeFiltersCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
            >
              Reset All
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search store, ref #, type, officer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Store / Distributor */}
          <div>
            <select
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white outline-none focus:border-blue-500"
            >
              <option value="ALL">All Stores / Accounts</option>
              {Array.from(new Set(documents.map((d) => d.storeName))).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Document Type */}
          <div>
            <select
              value={filterDocType}
              onChange={(e) => setFilterDocType(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white outline-none focus:border-blue-500"
            >
              <option value="ALL">All Document Types</option>
              <option value="Purchase Order">Purchase Order</option>
              <option value="Signed Delivery Challan">Signed Delivery Challan</option>
              <option value="Tax Invoice Copy">Tax Invoice Copy</option>
              <option value="Stock Acknowledgment">Stock Acknowledgment</option>
              <option value="Return Authorization (RMA)">Return Authorization (RMA)</option>
              <option value="Credit Note">Credit Note</option>
              <option value="Store Agreement">Store Agreement</option>
            </select>
          </div>

          {/* Officer */}
          <div>
            <select
              value={filterOfficer}
              onChange={(e) => setFilterOfficer(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white outline-none focus:border-blue-500"
            >
              <option value="ALL">All Officers</option>
              {allStaff.map((u) => (
                <option key={u.id} value={u.fullName}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white outline-none focus:border-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="COLLECTED">Collected in Field</option>
              <option value="HANDED_OVER">Handed Over to Office</option>
              <option value="FILED">Filed in Archive</option>
              <option value="MISSING">Flagged Missing</option>
            </select>
          </div>
        </div>

        {/* Second row of filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Who Holds It Now */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
              Who Holds It Now (Custodian)
            </label>
            <select
              value={filterHolder}
              onChange={(e) => setFilterHolder(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white outline-none focus:border-blue-500"
            >
              <option value="ALL">All Current Holders</option>
              {uniqueHolders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Preset */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Date Range</label>
            <select
              value={filterDateRange}
              onChange={(e) => setFilterDateRange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white outline-none focus:border-blue-500"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today (Bhadra 26, 2083)</option>
              <option value="LAST_7_DAYS">Last 7 Days</option>
              <option value="LAST_30_DAYS">Last 30 Days</option>
            </select>
          </div>

          {/* Quick Overdue Toggle */}
          <div className="flex items-end">
            <button
              onClick={() => setOnlyOverdue(!onlyOverdue)}
              className={`w-full flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                onlyOverdue
                  ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              {onlyOverdue ? 'Filtered: Overdue Only' : 'Filter Overdue (>2 Days)'}
            </button>
          </div>

          {/* Records summary */}
          <div className="flex items-end justify-end text-xs text-slate-500 pb-1 font-medium">
            Showing {filteredDocs.length} of {documents.length} records
          </div>
        </div>
      </div>

      {/* Documents List */}
      <div className="space-y-4">
        {filteredDocs.length === 0 ? (
          <EmptyState
            type="documents"
            title="No Documents Found"
            description="No physical custody documents match your filter criteria or officer assignment."
            action={{
              label: 'Reset Filters',
              onClick: handleResetFilters,
            }}
          />
        ) : (
          filteredDocs.map((doc) => {
            const isOverdue = isDocOverdue(doc);
            const daysAgo = getDaysSinceDoc(doc.docDateAd);

            return (
              <div
                key={doc.id}
                className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-sm transition-all space-y-4 ${
                  doc.status === 'MISSING'
                    ? 'border-rose-300 bg-rose-50/20'
                    : isOverdue
                    ? 'border-amber-300 ring-1 ring-amber-200'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Top row: Store, Doc Type, Ref, Status Pill */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                      <Link
                        href={`/offline-sales/stores/${doc.entityId || encodeURIComponent(doc.storeName)}`}
                        className="font-bold text-slate-900 text-base hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        {doc.storeName}
                      </Link>
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200">
                        {doc.documentType}
                      </span>
                      {doc.referenceNumber && (
                        <span className="font-mono text-slate-600 text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          Ref: {doc.referenceNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>
                        Date: <strong className="text-slate-700">{doc.docDateBs}</strong> ({doc.docDateAd})
                      </span>
                      <span>•</span>
                      <span>
                        Collected by:{' '}
                        <Link
                          href={`/offline-sales/scorecard?officer=${encodeURIComponent(doc.officerName)}`}
                          className="text-slate-800 font-bold hover:text-blue-600 hover:underline"
                        >
                          {doc.officerName}
                        </Link>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    {/* Overdue Badge */}
                    {isOverdue && (
                      <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {daysAgo}d Overdue in Field
                      </span>
                    )}

                    {/* Status Badge */}
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase flex items-center gap-1.5 ${
                        doc.status === 'FILED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : doc.status === 'HANDED_OVER'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : doc.status === 'MISSING'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200 animate-pulse'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {doc.status === 'FILED' && <FolderCheck className="h-3 w-3" />}
                      {doc.status === 'HANDED_OVER' && <UserCheck className="h-3 w-3" />}
                      {doc.status === 'COLLECTED' && <Clock className="h-3 w-3" />}
                      {doc.status === 'MISSING' && <ShieldAlert className="h-3 w-3" />}
                      {doc.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Middle Grid: Photo Preview (5b) + Current Custodian + Notes */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2 border-t border-slate-100">
                  {/* 5b. Document Photo Thumbnail */}
                  <div className="md:col-span-3 flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
                      <Camera className="h-3 w-3" />
                      Document Photo ({doc.photoUrls?.length || 0})
                    </span>

                    {doc.photoUrls && doc.photoUrls.length > 0 ? (
                      <div
                        onClick={() => openLightbox(doc, 0)}
                        className="group relative h-28 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 cursor-pointer shadow-sm hover:shadow-md transition-all"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={doc.photoUrls[0]}
                          alt={doc.documentType}
                          className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold backdrop-blur-[1px]">
                          <Eye className="h-4 w-4" />
                          <span>View Full Res</span>
                        </div>
                        {doc.photoUrls.length > 1 && (
                          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                            +{doc.photoUrls.length - 1} page{doc.photoUrls.length > 2 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="h-28 w-full rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 text-xs">
                        No photo attached
                      </div>
                    )}
                  </div>

                  {/* 5d. Chain of Custody Timeline & Details */}
                  <div className="md:col-span-6 space-y-2">
                    <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-500 font-medium">Current Custody:</span>
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          👤 {doc.currentHolder || doc.handedToUserName || `${doc.officerName} (Field)`}
                        </span>
                      </div>
                      {doc.notes && (
                        <div className="text-[11px] text-slate-600 italic bg-white p-2 rounded border border-slate-200/60 mt-1">
                          &quot;{doc.notes}&quot;
                        </div>
                      )}
                    </div>

                    {/* Custody Timeline (5d) */}
                    <div className="pt-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                        Chain of Custody Timeline:
                      </span>
                      <div className="relative pl-5 space-y-2.5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                        {doc.timeline && doc.timeline.length > 0 ? (
                          doc.timeline.map((evt) => (
                            <div key={evt.id} className="relative text-xs">
                              {/* Dot */}
                              <div
                                className={`absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white ${
                                  evt.action === 'FILED'
                                    ? 'bg-emerald-500'
                                    : evt.action === 'HANDED_OVER'
                                    ? 'bg-blue-500'
                                    : evt.action === 'MISSING'
                                    ? 'bg-rose-500'
                                    : 'bg-amber-500'
                                }`}
                              />
                              <div className="font-medium text-slate-800">
                                <span className="text-slate-500 text-[11px] font-mono mr-1.5">
                                  {evt.formattedTime || evt.timestamp.slice(0, 10)} —
                                </span>
                                {evt.action === 'COLLECTED' && (
                                  <span>Collected by <strong>{evt.actorName}</strong> at {evt.locationOrFolder || doc.storeName}</span>
                                )}
                                {evt.action === 'HANDED_OVER' && (
                                  <span>Handed over to <strong>{evt.recipientName || 'office desk'}</strong> by {evt.actorName}</span>
                                )}
                                {evt.action === 'FILED' && (
                                  <span>Permanently filed in <strong>{evt.locationOrFolder || 'accounts archive'}</strong></span>
                                )}
                                {evt.action === 'MISSING' && (
                                  <span className="text-rose-700 font-bold">Flagged MISSING by {evt.actorName}</span>
                                )}
                              </div>
                              {evt.notes && (
                                <p className="text-[11px] text-slate-500 mt-0.5">{evt.notes}</p>
                              )}
                            </div>
                          ))
                        ) : (
                          // Fallback timeline from top-level fields
                          <>
                            <div className="relative text-xs">
                              <div className="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-4 ring-white" />
                              <div className="text-slate-800 font-medium">
                                <span className="text-slate-500 text-[11px] font-mono mr-1.5">{doc.docDateBs} —</span>
                                Collected by <strong>{doc.officerName}</strong> at {doc.storeName}
                              </div>
                            </div>
                            {doc.handedToUserName && (
                              <div className="relative text-xs">
                                <div className="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full bg-blue-500 ring-4 ring-white" />
                                <div className="text-slate-800 font-medium">
                                  <span className="text-slate-500 text-[11px] font-mono mr-1.5">{doc.handoverDate || 'Handed over'} —</span>
                                  Handed over to <strong>{doc.handedToUserName}</strong> at office
                                </div>
                              </div>
                            )}
                            {doc.status === 'FILED' && (
                              <div className="relative text-xs">
                                <div className="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-white" />
                                <div className="text-slate-800 font-medium">
                                  Filed permanently in <strong>{doc.filedLocation || 'accounts cabinet'}</strong>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 5c. Status Change Action Controls */}
                  <div className="md:col-span-3 flex flex-col justify-between gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Custody Actions
                      </span>

                      <div className="space-y-2 mt-2">
                        {/* COLLECTED ACTIONS */}
                        {doc.status === 'COLLECTED' && (
                          <button
                            onClick={() => {
                              setHandoverModalDoc(doc);
                              setHandoverRecipient('Sita Gurung (Ops Desk)');
                              setHandoverNotes('');
                            }}
                            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            Handover to Office Now
                          </button>
                        )}

                        {/* HANDED OVER ACTIONS */}
                        {doc.status === 'HANDED_OVER' && (
                          <button
                            onClick={() => {
                              setFilingModalDoc(doc);
                              setFilingFolder('Accounts Cabinet B-12 / Sep 2026');
                              setFilingNotes('');
                            }}
                            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Mark as Filed
                          </button>
                        )}

                        {/* FILED ACTIONS */}
                        {doc.status === 'FILED' && (
                          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-center text-xs">
                            <span className="text-emerald-800 font-bold flex items-center justify-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Permanently Filed
                            </span>
                            <span className="text-[11px] text-emerald-700 block mt-0.5 font-mono">
                              {doc.filedLocation || 'Central Archive'}
                            </span>
                          </div>
                        )}

                        {/* MISSING ACTIONS */}
                        {doc.status === 'MISSING' && (
                          <button
                            onClick={() => handleRecoverDocument(doc)}
                            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Recover / Accounted For
                          </button>
                        )}

                        {/* Mark as Missing (Any status can be marked as missing if lost) */}
                        {doc.status !== 'MISSING' && (
                          <button
                            onClick={() => {
                              setMissingModalDoc(doc);
                              setMissingReason('');
                            }}
                            className="w-full flex items-center justify-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <ShieldAlert className="h-3 w-3" />
                            Mark as Missing
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Doc ID: {doc.id.slice(0, 10)}</span>
                      {doc.photoUrls && doc.photoUrls.length > 0 && (
                        <button
                          onClick={() => openLightbox(doc, 0)}
                          className="font-semibold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" /> View Photo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5b. Zoomable Full-Resolution Lightbox Modal */}
      {lightboxDoc && lightboxDoc.photoUrls && lightboxDoc.photoUrls.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="relative flex flex-col h-[92vh] w-full max-w-5xl rounded-2xl bg-slate-900 border border-slate-700 overflow-hidden shadow-2xl text-white">
            {/* Lightbox Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/80 border-b border-slate-700 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-sm">{lightboxDoc.storeName}</h3>
                  <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">
                    {lightboxDoc.documentType}
                  </span>
                  {lightboxDoc.referenceNumber && (
                    <span className="font-mono text-xs text-slate-400">
                      Ref: {lightboxDoc.referenceNumber}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Captured by {lightboxDoc.officerName} on {lightboxDoc.docDateBs} ({lightboxDoc.docDateAd})
                </p>
              </div>

              {/* Lightbox Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLightboxZoom((z) => Math.max(0.5, z - 0.25))}
                  title="Zoom Out"
                  className="rounded-lg bg-slate-700 p-1.5 text-slate-200 hover:bg-slate-600 hover:text-white transition-colors"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="font-mono text-xs text-slate-300 w-12 text-center">
                  {Math.round(lightboxZoom * 100)}%
                </span>
                <button
                  onClick={() => setLightboxZoom((z) => Math.min(3, z + 0.25))}
                  title="Zoom In"
                  className="rounded-lg bg-slate-700 p-1.5 text-slate-200 hover:bg-slate-600 hover:text-white transition-colors"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setLightboxZoom(1);
                    setLightboxRotation(0);
                  }}
                  title="Reset Zoom"
                  className="rounded-lg bg-slate-700 px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-600 hover:text-white transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={() => setLightboxRotation((r) => (r + 90) % 360)}
                  title="Rotate"
                  className="rounded-lg bg-slate-700 p-1.5 text-slate-200 hover:bg-slate-600 hover:text-white transition-colors"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
                <a
                  href={lightboxDoc.photoUrls[lightboxImgIndex]}
                  target="_blank"
                  rel="noreferrer"
                  title="Open Original in New Tab"
                  className="rounded-lg bg-slate-700 p-1.5 text-slate-200 hover:bg-slate-600 hover:text-white transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  onClick={closeLightbox}
                  title="Close Modal"
                  className="rounded-lg bg-rose-600/80 p-1.5 text-white hover:bg-rose-600 transition-colors ml-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Lightbox Body (Zoomable Image Canvas) */}
            <div className="relative flex-1 overflow-auto bg-slate-950 p-4 flex items-center justify-center select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxDoc.photoUrls[lightboxImgIndex]}
                alt="Full resolution document view"
                style={{
                  transform: `scale(${lightboxZoom}) rotate(${lightboxRotation}deg)`,
                  transition: 'transform 0.2s ease-out',
                }}
                className="max-h-full max-w-full object-contain rounded shadow-2xl"
              />
            </div>

            {/* Lightbox Footer with multi-page navigation */}
            <div className="flex items-center justify-between px-5 py-3 bg-slate-800/80 border-t border-slate-700 shrink-0 text-xs">
              <div className="text-slate-400">
                Holder: <span className="text-white font-semibold">{lightboxDoc.currentHolder || lightboxDoc.officerName}</span>
                {lightboxDoc.filedLocation && (
                  <span className="ml-3 text-emerald-400 font-mono">📁 {lightboxDoc.filedLocation}</span>
                )}
              </div>

              {lightboxDoc.photoUrls.length > 1 && (
                <div className="flex items-center gap-3">
                  <button
                    disabled={lightboxImgIndex === 0}
                    onClick={() => {
                      setLightboxImgIndex((i) => Math.max(0, i - 1));
                      setLightboxZoom(1);
                    }}
                    className="rounded bg-slate-700 px-2.5 py-1 text-xs font-semibold disabled:opacity-30 hover:bg-slate-600"
                  >
                    ← Previous Page
                  </button>
                  <span className="text-slate-300 font-mono">
                    Page {lightboxImgIndex + 1} of {lightboxDoc.photoUrls.length}
                  </span>
                  <button
                    disabled={lightboxImgIndex === lightboxDoc.photoUrls.length - 1}
                    onClick={() => {
                      setLightboxImgIndex((i) => Math.min(lightboxDoc.photoUrls.length - 1, i + 1));
                      setLightboxZoom(1);
                    }}
                    className="rounded bg-slate-700 px-2.5 py-1 text-xs font-semibold disabled:opacity-30 hover:bg-slate-600"
                  >
                    Next Page →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5c. Handover Action Modal */}
      {handoverModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-blue-600" />
                  Confirm Office Handover
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Transfer document custody from field officer to office reception.
                </p>
              </div>
              <button
                onClick={() => setHandoverModalDoc(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 space-y-1">
              <div className="font-bold text-slate-900">{handoverModalDoc.storeName}</div>
              <div className="text-slate-600">
                Document: <span className="font-semibold">{handoverModalDoc.documentType}</span>{' '}
                {handoverModalDoc.referenceNumber && `(${handoverModalDoc.referenceNumber})`}
              </div>
              <div className="text-slate-500 text-[11px]">
                Collected by: <strong>{handoverModalDoc.officerName}</strong> on {handoverModalDoc.docDateBs}
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Who Received It at Office? *
              </label>
              <select
                value={handoverRecipient}
                onChange={(e) => setHandoverRecipient(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none focus:border-blue-500 font-medium"
              >
                {allStaff.length > 0 ? (
                  allStaff.map((u) => (
                    <option key={u.id} value={u.fullName}>
                      {u.fullName} {u.role ? `(${u.role.replace('_', ' ')})` : ''}
                    </option>
                  ))
                ) : (
                  <option value="Operations Desk">Operations Desk</option>
                )}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Handover Notes / Verification Remarks
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Physical store stamp and signature verified. Retained for invoice reconciliation."
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-blue-500 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setHandoverModalDoc(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHandover}
                className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 shadow-sm"
              >
                Confirm Handover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5c. Permanent Filing Action Modal */}
      {filingModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Archive className="h-5 w-5 text-emerald-600" />
                  Permanently File Document
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Record permanent physical archive location in office folders.
                </p>
              </div>
              <button
                onClick={() => setFilingModalDoc(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 space-y-1">
              <div className="font-bold text-slate-900">{filingModalDoc.storeName}</div>
              <div className="text-slate-600">
                {filingModalDoc.documentType} • Ref: {filingModalDoc.referenceNumber || 'N/A'}
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Filing Cabinet / Archive Folder *
              </label>
              <select
                value={filingFolder}
                onChange={(e) => setFilingFolder(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none focus:border-emerald-500 font-medium"
              >
                <option value="Accounts Cabinet B-12 / Sep 2026">Accounts Cabinet B-12 / Sep 2026</option>
                <option value="VAT Invoices Binder 2083/84 (Q2)">VAT Invoices Binder 2083/84 (Q2)</option>
                <option value="Signed Challan Archival Box #4">Signed Challan Archival Box #4</option>
                <option value="Store Agreements Safe Drawer #1">Store Agreements Safe Drawer #1</option>
                <option value="Audit Compliance Binder - North Zone">Audit Compliance Binder - North Zone</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Filing Notes</label>
              <textarea
                rows={2}
                placeholder="e.g. Scanned into ERP and filed in alphabetical index."
                value={filingNotes}
                onChange={(e) => setFilingNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-emerald-500 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setFilingModalDoc(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFiling}
                className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-700 shadow-sm"
              >
                Confirm Permanent Filing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5c. Mark as Missing Modal */}
      {missingModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-rose-700 text-base flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-600" />
                  Flag Document as MISSING
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Triggers immediate admin alert and compliance investigation.
                </p>
              </div>
              <button
                onClick={() => setMissingModalDoc(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl bg-rose-50 p-3 border border-rose-200 text-rose-900 space-y-1">
              <div className="font-bold">{missingModalDoc.storeName}</div>
              <div>
                {missingModalDoc.documentType} • Ref: {missingModalDoc.referenceNumber || 'N/A'}
              </div>
              <div className="text-[11px] text-rose-700">
                Last known custody: {missingModalDoc.currentHolder || missingModalDoc.officerName}
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Reason / Discrepancy Circumstances *
              </label>
              <textarea
                rows={3}
                placeholder="Explain why this document cannot be accounted for (e.g. lost in courier pouch, not received from officer, lost during beat transition)..."
                value={missingReason}
                onChange={(e) => setMissingReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-rose-500 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setMissingModalDoc(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMissing}
                className="rounded-lg bg-rose-600 px-5 py-2 font-semibold text-white hover:bg-rose-700 shadow-sm"
              >
                Flag as Missing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5e. Upload Document Modal with Searchable Store Dropdown & Clean Form */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleUploadSubmit}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Upload Vendor Document
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Record physical document collection into the verified custody trail.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 5e: Searchable Store Dropdown */}
            <div className="relative">
              <label className="block font-bold text-slate-700 mb-1">
                Store / Retailer / Branch *
              </label>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Type to search stores, branches, or supermarkets..."
                  value={formStoreName || formStoreSearch}
                  onChange={(e) => {
                    setFormStoreSearch(e.target.value);
                    setFormStoreName(e.target.value);
                    setShowStoreDropdown(true);
                  }}
                  onFocus={() => setShowStoreDropdown(true)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-8 outline-none focus:border-blue-500 text-xs font-medium"
                  required
                />
                <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>

              {/* Autocomplete suggestions */}
              {showStoreDropdown && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  {allStores
                    .filter((s) =>
                      s.name.toLowerCase().includes((formStoreSearch || formStoreName).toLowerCase())
                    )
                    .slice(0, 10)
                    .map((store) => (
                      <div
                        key={store.id}
                        onClick={() => {
                          setFormStoreId(store.id);
                          setFormStoreName(store.name);
                          setFormStoreSearch('');
                          setShowStoreDropdown(false);
                        }}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-blue-50 cursor-pointer text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">{store.name}</div>
                          {store.area && <div className="text-[10px] text-slate-500">{store.area}</div>}
                        </div>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600">
                          {store.type}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Document Type and Ref Number (5e: clean refNumber) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Document Type *</label>
                <select
                  value={formDocType}
                  onChange={(e) => setFormDocType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none focus:border-blue-500"
                >
                  {configuredDocTypes.length > 0 ? (
                    configuredDocTypes.map((dt) => (
                      <option key={dt.id} value={dt.name}>
                        {dt.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Purchase Order">Purchase Order</option>
                      <option value="Signed Delivery Challan">Signed Delivery Challan</option>
                      <option value="Tax Invoice Copy">Tax Invoice Copy</option>
                      <option value="Stock Acknowledgment">Stock Acknowledgment</option>
                      <option value="Return Authorization (RMA)">Return Authorization (RMA)</option>
                      <option value="Credit Note">Credit Note</option>
                      <option value="Store Agreement">Store Agreement</option>
                      <option value="Other">Other Document</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reference Number</label>
                <input
                  type="text"
                  placeholder="e.g. PO-2083-9941, DC-8841"
                  value={formRefNumber}
                  onChange={(e) => setFormRefNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Officer and Custody Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Collected By (Officer) *</label>
                <select
                  value={formOfficerName}
                  onChange={(e) => setFormOfficerName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none focus:border-blue-500"
                >
                  {allStaff.length > 0 ? (
                    allStaff.map((u) => (
                      <option key={u.id} value={u.fullName}>
                        {u.fullName} {u.role ? `(${u.role.replace('_', ' ')})` : ''}
                      </option>
                    ))
                  ) : (
                    <option value="Field Representative">Field Representative</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Initial Custody Status *</label>
                <select
                  value={formInitialHolder}
                  onChange={(e) => setFormInitialHolder(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none focus:border-blue-500 font-medium"
                >
                  <option value="FIELD">Collected in Field (Pending Office Handover)</option>
                  <option value="OFFICE">Immediate Office Handover</option>
                </select>
              </div>
            </div>

            {/* If direct office handover */}
            {formInitialHolder === 'OFFICE' && (
              <div>
                <label className="block font-bold text-slate-700 mb-1">Handed Over To</label>
                <select
                  value={formHandedTo}
                  onChange={(e) => setFormHandedTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none focus:border-blue-500 font-medium"
                >
                  {allStaff.length > 0 ? (
                    allStaff.map((u) => (
                      <option key={u.id} value={u.fullName}>
                        {u.fullName} {u.role ? `(${u.role.replace('_', ' ')})` : ''}
                      </option>
                    ))
                  ) : (
                    <option value="Operations Desk">Operations Desk</option>
                  )}
                </select>
              </div>
            )}

            {/* Document Photo Upload & Quick Sample Selector (5b) */}
            <div className="space-y-3">
              <CameraCapture
                label="Photograph Document Pages"
                sublabel="Capture tax invoices, delivery challans, receipt vouchers, or stamped agreements"
                maxFiles={8}
                existingUrls={formPhotoUrls}
                onRemoveExisting={(idx) => handleRemovePhoto(idx)}
                onUpload={(results) => {
                  setFormPhotoUrls((prev) => [...prev, ...results.map((r) => r.url)]);
                }}
              />

              {/* Quick Sample Selector */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                <span className="text-[10px] font-semibold uppercase text-slate-500 block">
                  Or Quick Select Preset Sample Document Photo:
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {SAMPLE_DOC_IMAGES.map((sample) => {
                    const isSelected = formPhotoUrls.includes(sample.url);
                    return (
                      <button
                        key={sample.label}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            if (formPhotoUrls.length > 1) {
                              setFormPhotoUrls(formPhotoUrls.filter((u) => u !== sample.url));
                            }
                          } else {
                            setFormPhotoUrls([...formPhotoUrls, sample.url]);
                          }
                        }}
                        className={`relative rounded-lg border p-1 text-center transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={sample.url}
                          alt={sample.label}
                          className="h-12 w-full object-cover rounded"
                        />
                        <span className="text-[9px] font-medium text-slate-700 block mt-1 truncate">
                          {sample.label}
                        </span>
                        {isSelected && (
                          <div className="absolute top-1 right-1 rounded-full bg-blue-600 text-white p-0.5">
                            <Check className="h-2 w-2" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Notes / Verification Remarks</label>
              <textarea
                rows={2}
                placeholder="Add any specific context or remarks regarding this document..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-blue-500 text-xs"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 shadow-sm"
              >
                Save Document to Custody Trail
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
    </PageGuard>
  );
}
