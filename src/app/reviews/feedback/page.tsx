'use client';

import PagedList from '@/components/common/PagedList';
import Portal from '@/components/common/Portal';
import { confirmAction } from '@/components/common/confirm';
import DownloadButton from '@/components/common/DownloadButton';
import InfoTip from '@/components/common/InfoTip';
import React, { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { FeedbackEntry, FeedbackType, Sentiment, Priority, ComplaintStatus, BrandCode } from '@/lib/types';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import DynamicCheckboxes from '@/components/common/DynamicCheckboxes';
import CameraCapture from '@/components/common/CameraCapture';
import BulkActionBar from '@/components/common/BulkActionBar';
import { toast } from '@/components/common/Toast';
import { capturePhotos } from '@/lib/photo-capture';
import { validateRequired } from '@/lib/validation';
import CustomerLookup, { customerLookupError, EMPTY_CUSTOMER_LOOKUP, type CustomerLookupValue } from '@/components/common/CustomerLookup';
import OrderPicker from '@/components/common/OrderPicker';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { syncManager } from '@/lib/offline-sync';
import { displayDocumentId } from '@/lib/document-ids';
import { phoneDigits } from '@/lib/customer-lookup';
import { hasAccess } from '@/lib/permissions';
import type { Order } from '@/lib/types';
import { compressImage } from '@/lib/file-upload';
import ConfirmModal from '@/components/common/ConfirmModal';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  MessageSquareHeart,
  Plus,
  Search,
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
  Lightbulb,
  Share2,
  Globe,
  Camera,
  X,
  ExternalLink,
  ZoomIn,
  Maximize2,
  Image as ImageIcon,
  Upload,
  Trash2,
  Paperclip,
  UserCheck,
} from 'lucide-react';

function FeedbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialProductParam = searchParams.get('product') || searchParams.get('search') || '';

  const [feedbackList, setFeedbackList] = useState<FeedbackEntry[]>(db.getFeedback());
  const [searchTerm, setSearchTerm] = useState(initialProductParam);
  const [activeProductFilter, setActiveProductFilter] = useState(initialProductParam);
  const [typeFilter, setTypeFilter] = useState<'ALL' | FeedbackType>('ALL');
  const [filterWithImagesOnly, setFilterWithImagesOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Keep the list in step with the workspace: it may still be loading when the page opens.
  useEffect(() => {
    const refresh = () => setFeedbackList([...db.getFeedback()]);
    refresh();
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  useEffect(() => {
    const prod = searchParams.get('product') || searchParams.get('search') || '';
    if (prod) {
      setSearchTerm(prod);
      setActiveProductFilter(prod);
    }
  }, [searchParams]);

  // Selected item for detail modal
  const [selectedEntry, setSelectedEntry] = useState<FeedbackEntry | null>(null);

  // Lightbox zoom modal state
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // Modal to log new feedback
  const [showLogModal, setShowLogModal] = useState(false);

  // Form State
  const [entryType, setEntryType] = useState<FeedbackType>('REVIEW');
  const [lookup, setLookup] = useState<CustomerLookupValue>(EMPTY_CUSTOMER_LOOKUP);
  const [relatedOrder, setRelatedOrder] = useState<Order | null>(null);
  const [changeOrderDetails, setChangeOrderDetails] = useState(false);
  const [needsLinkingOnly, setNeedsLinkingOnly] = useState(false);
  const [linkLookup, setLinkLookup] = useState<CustomerLookupValue>(EMPTY_CUSTOMER_LOOKUP);
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const { formatDate } = useCalendarPreference();
  const [brandCode, setBrandCode] = useState<BrandCode>(() => db.getBrands('ACTIVE')[0]?.code || 'ALL');
  const products = db.getProducts();
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [channel, setChannel] = useState('Instagram DM');
  const [fullText, setFullText] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sentiment, setSentiment] = useState<Sentiment>('POSITIVE');
  const [rating, setRating] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [hasScreenshot, setHasScreenshot] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [proofPhotoUrl, setProofPhotoUrl] = useState('');
  const [usedInDesign, setUsedInDesign] = useState(false);
  const [postedOnWebsite, setPostedOnWebsite] = useState(false);
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [assignedTo, setAssignedTo] = useState(() => db.getCurrentUser()?.id || '');

  // Input refs for file upload & camera
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const detailFileInputRef = useRef<HTMLInputElement>(null);
  const detailCameraInputRef = useRef<HTMLInputElement>(null);

  // Resolution note state in detail modal
  const [resolutionNote, setResolutionNote] = useState('');
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateAssignee, setEscalateAssignee] = useState(() => db.getCurrentUser().fullName);
  const [escalateNote, setEscalateNote] = useState('');

  const handleConfirmEscalate = () => {
    if (!selectedEntry) return;
    db.escalateComplaint(selectedEntry.id, escalateAssignee, escalateNote);
    setShowEscalateModal(false);
    setEscalateNote('');
    refreshList();
    toast.error(
      'Complaint Escalated to URGENT',
      `Assigned to ${escalateAssignee}. 24-hour resolution SLA activated.`
    );
  };

  const refreshList = () => {
    setFeedbackList([...db.getFeedback()]);
    if (selectedEntry) {
      const updated = db.getFeedback().find((f) => f.id === selectedEntry.id);
      setSelectedEntry(updated || null);
    }
  };

  const handleDetailFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedEntry) return;

    const entryId = selectedEntry.id;
    void capturePhotos(files, 'reviews', (url) => { db.attachPhotoToFeedback(entryId, url); refreshList(); });
    e.target.value = '';
  };

  const handleAddProofUrl = () => {
    if (!proofPhotoUrl.trim()) return;
    setUploadedPhotos((prev) => [...prev, proofPhotoUrl.trim()]);
    setProofPhotoUrl('');
    setHasScreenshot(true);
  };

  const handleRemovePhoto = (index: number) => {
    setUploadedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  /** Choosing a related order fills brand, product, date and source channel from it. */
  const handleSelectOrder = (order: Order | null) => {
    setRelatedOrder(order); setChangeOrderDetails(false);
    if (!order) return;
    setBrandCode(order.brandCode);
    const firstProduct = order.items.map((item) => products.find((product) => product.id === item.productId)).find(Boolean);
    if (firstProduct) setProductId(firstProduct.id);
    // An order found by its ID also identifies the customer.
    if (lookup.link !== 'LINKED') {
      const owner = db.getCustomerByPhone(order.customerPhone);
      setLookup(owner ? { phone: phoneDigits(owner.phone), name: owner.name, link: 'LINKED', customer: owner } : { phone: phoneDigits(order.customerPhone), name: order.customerName, link: 'NEW' });
    }
  };

  const handleSaveFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    void guardedSubmit(async () => {
      const errors: Record<string, string> = {};
      const lookupErr = customerLookupError(lookup, { allowNoPhone: true });
      if (lookupErr) errors.customer = lookupErr;

      const textErr = validateRequired(fullText, 'Review or feedback text');
      if (textErr) errors.fullText = textErr;

      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        toast.error('Please fix the highlighted fields', Object.values(errors)[0]);
        return;
      }

      const prod = products.find((p) => p.id === productId);
      const photosToSave = hasScreenshot ? [...uploadedPhotos] : [];
      const assignee = db.getUsers().find((entry) => entry.id === assignedTo);
      const unlinked = lookup.link === 'UNLINKED';
      const phone = unlinked ? '' : phoneDigits(lookup.phone);
      const name = (unlinked ? lookup.handle || lookup.name : lookup.name).trim() || lookup.customer?.name || '';

      db.addFeedback({
        customerName: name,
        customerPhone: phone,
        customerLink: lookup.link || 'LINKED',
        ...(unlinked ? { customerHandle: name } : {}),
        brandCode,
        productId,
        productName: prod?.name || '',
        type: entryType,
        channel,
        ...(relatedOrder ? { orderId: relatedOrder.id, orderNumber: relatedOrder.orderNumber } : {}),
        dateReceivedAd: getTodayAd(),
        dateReceivedBs: getTodayBs(),
        fullText: fullText.trim(),
        screenshotUrls: photosToSave,
        issueCategories: selectedCategories,
        sentiment,
        ...(rating ? { rating } : {}),
        hasScreenshot: photosToSave.length > 0,
        usedInDesign,
        postedOnWebsite,
        priority: entryType === 'COMPLAINT' ? priority : undefined,
        assignedTo: entryType === 'COMPLAINT' ? assignedTo : undefined,
        assignedToName: entryType === 'COMPLAINT' ? assignee?.fullName : undefined,
        complaintStatus: entryType === 'COMPLAINT' ? 'OPEN' : undefined,
      });
      try { await syncManager.forceSyncNow(); } catch { /* The entry stays in the sync queue. */ }

      refreshList();
      setShowLogModal(false);
      setFormErrors({});
      const label = entryType === 'REVIEW' ? 'Review' : entryType === 'COMPLAINT' ? 'Complaint' : 'Feedback';
      if (unlinked) toast.info(`${label} saved as Unlinked`, 'Find it under Needs linking to attach a customer later.');
      else toast.success(`${label} saved`, lookup.link === 'NEW' ? `A customer profile was created for ${phone}.` : `Added to ${name}’s timeline.`,
        hasAccess(db.getCurrentUser(), 'customers') ? { label: 'View customer', onClick: () => router.push(`/customers/${phone}`) } : undefined);

      // Reset
      setLookup(EMPTY_CUSTOMER_LOOKUP);
      setRelatedOrder(null);
      setChangeOrderDetails(false);
      setFullText('');
      setSelectedCategories([]);
      setUploadedPhotos([]);
      setRating(0);
    });
  };

  const handleAttachCustomer = () => {
    if (!selectedEntry) return;
    const problem = customerLookupError(linkLookup);
    if (problem) { toast.error(problem); return; }
    void guardedSubmit(async () => {
      db.linkFeedbackCustomer(selectedEntry.id, { phone: linkLookup.phone, name: linkLookup.name, isNew: linkLookup.link === 'NEW' });
      try { await syncManager.forceSyncNow(); } catch { /* Stays queued. */ }
      setLinkLookup(EMPTY_CUSTOMER_LOOKUP);
      refreshList();
      toast.success('Customer attached', 'The entry now appears on their Customer 360 timeline.');
    });
  };

  const handleStatusChange = (status: ComplaintStatus) => {
    if (!selectedEntry) return;
    db.updateComplaintStatus(selectedEntry.id, status, resolutionNote);
    setResolutionNote('');
    refreshList();
  };

  const handleToggleFlag = (id: string, flag: 'usedInDesign' | 'postedOnWebsite') => {
    db.toggleFeedbackFlag(id, flag);
    refreshList();
  };

  const withImagesCount = feedbackList.filter(
    (f) => f.screenshotUrls && f.screenshotUrls.length > 0
  ).length;

  const filtered = feedbackList.filter((f) => {
    const matchesSearch =
      f.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.fullText.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'ALL' || f.type === typeFilter;
    const matchesImage = !filterWithImagesOnly || (f.screenshotUrls && f.screenshotUrls.length > 0);
    const matchesLinking = !needsLinkingOnly || f.customerLink === 'UNLINKED';
    return matchesSearch && matchesType && matchesImage && matchesLinking;
  });

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
      setSelectedIds(filtered.map((f) => f.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleBulkSetStatus = async (newStatus: ComplaintStatus) => {
    if (!(await confirmAction({ title: `Change status of ${selectedIds.length} entr${selectedIds.length === 1 ? 'y' : 'ies'} to ${newStatus.replace('_', ' ').toLowerCase()}?`, confirmLabel: 'Change status' }))) return;
    if (selectedIds.length === 0) return;
    selectedIds.forEach((id) => {
      db.updateComplaintStatus(id, newStatus, 'Bulk status update');
    });
    toast.success(`Updated status of ${selectedIds.length} feedback items to ${newStatus}.`);
    setSelectedIds([]);
    refreshList();
  };

  const handleBulkAssign = async (officerId: string) => {
    if (!(await confirmAction({ title: `Assign ${selectedIds.length} entr${selectedIds.length === 1 ? 'y' : 'ies'}?`, consequences: ['The assignee is notified.'], confirmLabel: 'Assign' }))) return;
    if (selectedIds.length === 0) return;
    const user = db.getUsers().find((u) => u.id === officerId);
    const officerName = user?.fullName || 'Assigned Officer';
    selectedIds.forEach((id) => {
      db.assignFeedback(id, officerId, officerName);
    });
    toast.success(`Assigned ${selectedIds.length} feedback items to ${officerName}.`);
    setSelectedIds([]);
    refreshList();
  };

  return (
    <PageGuard feature="reviews">
      <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Reviews & feedback', href: '/reviews/feedback' },
          { label: 'Customer reviews' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Feedback & complaints
<InfoTip label="About this page">Omnichannel feedback stream with dynamic issue classification, marketing design tagging, and complaint resolution tracking.</InfoTip></h1>
          
        </div>
          <DownloadButton datasets={['feedback']} records={{ feedback: filtered } as any} />

        <button
          onClick={() => setShowLogModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Log feedback / review
        </button>
      </div>

      {/* Type Filter Buttons & Photo Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTypeFilter('ALL')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            typeFilter === 'ALL'
              ? 'bg-slate-900 text-white shadow'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          All Entries ({feedbackList.length})
        </button>
        <button
          onClick={() => setTypeFilter('REVIEW')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            typeFilter === 'REVIEW'
              ? 'bg-emerald-600 text-white shadow'
              : 'border border-slate-200 bg-white text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          Customer Reviews ({feedbackList.filter((f) => f.type === 'REVIEW').length})
        </button>
        <button
          onClick={() => setTypeFilter('FEEDBACK')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            typeFilter === 'FEEDBACK'
              ? 'bg-blue-600 text-white shadow'
              : 'border border-slate-200 bg-white text-blue-700 hover:bg-blue-50'
          }`}
        >
          General Feedback ({feedbackList.filter((f) => f.type === 'FEEDBACK').length})
        </button>
        <button
          onClick={() => setTypeFilter('COMPLAINT')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            typeFilter === 'COMPLAINT'
              ? 'bg-rose-600 text-white shadow'
              : 'border border-slate-200 bg-white text-rose-700 hover:bg-rose-50'
          }`}
        >
          Active Complaints ({feedbackList.filter((f) => f.type === 'COMPLAINT').length})
        </button>

        <div className="h-4 w-px bg-slate-200 hidden sm:block" />

        {/* Filter for Proof Photos */}
        <button
          onClick={() => setFilterWithImagesOnly(!filterWithImagesOnly)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            filterWithImagesOnly
              ? 'bg-amber-600 text-white shadow ring-2 ring-amber-400/40'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Camera className="h-3.5 w-3.5 text-amber-500" />
          <span>With Proof Photos ({withImagesCount})</span>
        </button>

        {/* Entries saved with only a name or handle */}
        {(needsLinkingOnly || feedbackList.some((f) => f.customerLink === 'UNLINKED')) && (
          <button
            onClick={() => setNeedsLinkingOnly(!needsLinkingOnly)}
            aria-pressed={needsLinkingOnly}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              needsLinkingOnly
                ? 'bg-amber-600 text-white shadow ring-2 ring-amber-400/40'
                : 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
            }`}
          >
            <span>Needs linking ({feedbackList.filter((f) => f.customerLink === 'UNLINKED').length})</span>
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex items-center gap-3">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by customer name, product, or review text…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-xs outline-none"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setActiveProductFilter('');
              router.replace('/reviews/feedback');
            }}
            className="text-slate-500 hover:text-slate-600 p-1"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter indicator banner if pre-filtered by Product 360 */}
      {activeProductFilter && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 text-blue-900 px-4 py-2 rounded-xl text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold">Showing feedback for product:</span>
            <span className="bg-blue-200/70 text-blue-900 font-semibold px-2 py-0.5 rounded-md">
              {activeProductFilter}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setActiveProductFilter('');
              router.replace('/reviews/feedback');
            }}
            className="text-blue-700 hover:text-blue-900 font-bold hover:underline flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            Clear filter (show all)
          </button>
        </div>
      )}

      {/* Select All & Selection Count Bar */}
      <div className="flex items-center justify-between px-1 text-xs">
        <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700 select-none">
          <input
            type="checkbox"
            checked={filtered.length > 0 && selectedIds.length === filtered.length}
            onChange={handleSelectAll}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span>
            Select All ({filtered.length} {filtered.length === 1 ? 'entry' : 'entries'})
          </span>
        </label>
        {selectedIds.length > 0 && (
          <span className="text-blue-600 font-bold bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
            {selectedIds.length} of {filtered.length} selected
          </span>
        )}
      </div>

      {/* Grid of Feedbacks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {<PagedList items={filtered} label="entries" render={(pageRows) => pageRows.map((item) => {
          const isReview = item.type === 'REVIEW';
          const isComplaint = item.type === 'COMPLAINT';
          const isSelected = selectedIds.includes(item.id);

          return (
            <div
              key={item.id}
              onClick={() => setSelectedEntry(item)}
              className={`group cursor-pointer rounded-2xl border p-5 shadow-sm transition hover:shadow-md space-y-3 text-xs flex flex-col justify-between ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => handleToggleSelect(item.id, e)}
                      onChange={() => {}}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${isReview ? 'bg-emerald-500' : isComplaint ? 'bg-rose-500' : 'bg-blue-500'}`} />
                      {item.customerPhone ? (
                        <Link
                          href={`/customers/${encodeURIComponent(item.customerPhone)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-bold text-slate-900 text-sm hover:text-blue-600 hover:underline truncate"
                        >
                          {item.customerName}
                        </Link>
                      ) : (
                        <span className="font-bold text-slate-900 text-sm truncate">{item.customerName}</span>
                      )}
                      {item.customerLink === 'UNLINKED' && <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">Unlinked</span>}
                    </div>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 shrink-0">
                    {item.channel}
                  </span>
                </div>

                <div className="text-[11px] text-slate-500">
                  Product:{' '}
                  <Link
                    href={`/products/${item.productId || encodeURIComponent(item.productName)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-800 font-bold hover:text-blue-600 hover:underline"
                  >
                    {item.productName}
                  </Link>
                </div>

                <p className="text-slate-700 leading-relaxed line-clamp-3 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                  &quot;{item.fullText}&quot;
                </p>

                {/* Proof Photos Thumbnail Bar (PRD v2.2) */}
                {item.screenshotUrls && item.screenshotUrls.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    {item.screenshotUrls.map((url, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxImageUrl(url);
                        }}
                        className="relative group/img rounded-lg overflow-hidden border border-slate-200 h-12 w-16 shrink-0 shadow-2xs hover:ring-2 hover:ring-brand-500 transition"
                        title="Click to zoom proof screenshot"
                      >
                        <img
                          src={url}
                          alt="Customer proof"
                          className="h-full w-full object-cover group-hover/img:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity text-white text-[11px] font-bold gap-0.5">
                          <ZoomIn className="w-3 h-3" />
                          <span>Zoom</span>
                        </div>
                      </button>
                    ))}
                    <span className="text-[11px] text-slate-500 font-medium">Proof attached</span>
                  </div>
                )}

                {/* Issue tags */}
                {item.issueCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.issueCategories.map((cat, i) => (
                      <span
                        key={i}
                        className="rounded bg-rose-50 border border-rose-200 text-rose-800 px-2 py-0.5 text-[11px] font-medium"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Badges & Actions */}
              <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {item.usedInDesign && (
                    <span
                      title="Used in social media marketing design"
                      className="rounded bg-purple-100 text-purple-800 font-bold px-2 py-0.5 text-[11px] flex items-center gap-1"
                    >
                      <Share2 className="h-3 w-3" />
                      Design
                    </span>
                  )}
                  {item.postedOnWebsite && (
                    <span
                      title="Published on website for SEO"
                      className="rounded bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 text-[11px] flex items-center gap-1"
                    >
                      <Globe className="h-3 w-3" />
                      Website
                    </span>
                  )}
                  {item.complaintStatus && (
                    <span className="rounded-full bg-rose-100 text-rose-800 font-bold px-2 py-0.5 text-[11px]">
                      {item.complaintStatus}
                    </span>
                  )}
                </div>

                <span className="text-blue-600 font-semibold group-hover:underline text-[11px]">
                  View details →
                </span>
              </div>
            </div>
          );
        })} />}
      </div>

      {/* Feedback Detail & Complaint Resolution Modal */}
      {selectedEntry && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {selectedEntry.type === 'REVIEW'
                    ? ''
                    : selectedEntry.type === 'COMPLAINT'
                    ? ''
                    : ''}
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {selectedEntry.customerPhone ? (
                      <Link
                        href={`/customers/${encodeURIComponent(selectedEntry.customerPhone)}`}
                        className="hover:text-blue-600 hover:underline"
                      >
                        {selectedEntry.customerName}
                      </Link>
                    ) : (
                      selectedEntry.customerName
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedEntry.customerPhone ? <>Phone: {selectedEntry.customerPhone}</> : <span className="font-semibold text-amber-700">No customer linked</span>}{selectedEntry.orderNumber ? <> • Order {displayDocumentId(selectedEntry.orderNumber)}</> : null} • Product:{' '}
                    <Link
                      href={`/products/${selectedEntry.productId || encodeURIComponent(selectedEntry.productName)}`}
                      className="font-bold text-slate-700 hover:text-blue-600 hover:underline"
                    >
                      {selectedEntry.productName}
                    </Link>{' '}
                    • Channel: {selectedEntry.channel}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {selectedEntry.customerLink === 'UNLINKED' && (
                <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/60 p-4">
                  <p className="font-bold text-amber-900">Needs linking</p>
                  <p className="text-amber-800">This entry was saved with only a name or handle{selectedEntry.customerHandle ? <> (<strong>{selectedEntry.customerHandle}</strong>)</> : null}. Attach the customer once you have their number.</p>
                  <CustomerLookup value={linkLookup} onChange={setLinkLookup} />
                  <div className="flex justify-end">
                    <button type="button" onClick={handleAttachCustomer} disabled={isSubmitting || !linkLookup.link} className="btn btn-primary disabled:bg-blue-300 disabled:cursor-not-allowed">
                      {isSubmitting ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Saving…</> : 'Attach customer'}
                    </button>
                  </div>
                </div>
              )}
              {/* Full Text Quote */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-800 leading-relaxed text-sm">
                &quot;{selectedEntry.fullText}&quot;
              </div>

              {/* Proof Photos Gallery with Click-to-Zoom (PRD v2.2) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-[11px]  flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-blue-600" />
                    <span>Customer Proof &amp; Chat Evidence ({selectedEntry.screenshotUrls.length})</span>
                  </span>

                  {/* Add Photo triggers */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="file"
                      ref={detailFileInputRef}
                      accept="image/*"
                      onChange={handleDetailFileUpload}
                      className="hidden"
                    />
                    <input
                      type="file"
                      ref={detailCameraInputRef}
                      accept="image/*"
                      capture="environment"
                      onChange={handleDetailFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => detailFileInputRef.current?.click()}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 flex items-center gap-1 shadow-2xs"
                    >
                      <Upload className="w-3 h-3 text-blue-600" />
                      <span>Attach photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => detailCameraInputRef.current?.click()}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 flex items-center gap-1 shadow-2xs"
                    >
                      <Camera className="w-3 h-3 text-emerald-600" />
                      <span>Take photo</span>
                    </button>
                  </div>
                </div>

                {selectedEntry.screenshotUrls.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {selectedEntry.screenshotUrls.map((url, idx) => (
                      <div
                        key={idx}
                        onClick={() => setLightboxImageUrl(url)}
                        className="group relative h-28 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 cursor-zoom-in shadow-2xs"
                      >
                        <img
                          src={url}
                          alt={`Proof photo ${idx + 1}`}
                          className="h-full w-full object-cover transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full bg-white/90 text-slate-800 shadow transition-opacity">
                            <Maximize2 className="w-3.5 h-3.5" />
                          </span>
                        </div>
                        <span className="absolute bottom-1 left-1.5 text-[11px] bg-black/60 text-white px-1.5 py-0.5 rounded font-mono">
                          Photo #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-slate-500 bg-white rounded-lg border border-dashed border-slate-200">
                    <ImageIcon className="w-6 h-6 mx-auto text-slate-300 mb-1" />
                    <span>No proof photos attached yet. Click &ldquo;Attach Photo&rdquo; to add proof.</span>
                  </div>
                )}
              </div>

              {/* Marketing Toggles */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="font-bold text-slate-800 text-[11px] ">
                  Marketing & brand intelligence flags:
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedEntry.usedInDesign}
                      onChange={() => handleToggleFlag(selectedEntry.id, 'usedInDesign')}
                      className="h-4 w-4 rounded text-blue-600"
                    />
                    Used in social media design
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedEntry.postedOnWebsite}
                      onChange={() => handleToggleFlag(selectedEntry.id, 'postedOnWebsite')}
                      className="h-4 w-4 rounded text-blue-600"
                    />
                    Posted on website (SEO review)
                  </label>
                </div>
              </div>

              {/* Complaint Resolution Workflow */}
              {selectedEntry.type === 'COMPLAINT' && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-950 text-xs ">
                      Complaint resolution workflow
                    </span>
                    <span className="rounded-full bg-rose-200 px-2.5 py-0.5 text-[11px] font-bold text-rose-900">
                      Current: {selectedEntry.complaintStatus}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as ComplaintStatus[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => handleStatusChange(st)}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                          selectedEntry.complaintStatus === st
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'bg-white border border-rose-200 text-rose-800 hover:bg-rose-100'
                        }`}
                      >
                        {st.replace('_', ' ')}
                      </button>
                    ))}
                    {selectedEntry.priority !== 'URGENT' && (
                      <button
                        type="button"
                        onClick={() => setShowEscalateModal(true)}
                        className="rounded-lg bg-rose-700 hover:bg-rose-800 text-white px-3 py-1 text-xs font-bold shadow-xs transition flex items-center gap-1"
                      >
                        Escalate to urgent
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-rose-900 font-bold mb-1">Add resolution note:</label>
                    <input aria-label="Add resolution note:"
                      type="text"
                      placeholder="e.g. Replacement unit sent via Pathao, customer satisfied"
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      className="w-full rounded-lg border border-rose-200 px-3 py-2 bg-white outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Timeline */}
              {selectedEntry.history && selectedEntry.history.length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="font-bold text-slate-500 text-[11px]">
                    Status history
                  </div>
                  {selectedEntry.history.map((h) => (
                    <div key={h.id} className="text-[11px] text-slate-600">
                      • Status changed to <strong>{h.newStatus}</strong> by {h.changedBy}: &quot;{h.notes}&quot;
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 px-6 py-3 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div></Portal>
      )}

      {/* Log Feedback Modal */}
      {showLogModal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Log customer feedback / review</h3>
                <p className="text-xs text-slate-500">Captures customer sentiment and issue tags</p>
              </div>
              <button onClick={() => setShowLogModal(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFeedback} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {/* Type Selector (PRD 6.2 Step 2) */}
              <div>
                <label className="block font-bold text-slate-700 mb-2">Entry type *</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEntryType('REVIEW');
                      setSentiment('POSITIVE');
                    }}
                    className={`flex flex-col items-center justify-center rounded-xl border p-3 font-semibold transition ${
                      entryType === 'REVIEW'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    
                    Review (positive)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEntryType('FEEDBACK');
                      setSentiment('NEUTRAL');
                    }}
                    className={`flex flex-col items-center justify-center rounded-xl border p-3 font-semibold transition ${
                      entryType === 'FEEDBACK'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    
                    Feedback (suggestion)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEntryType('COMPLAINT');
                      setSentiment('NEGATIVE');
                    }}
                    className={`flex flex-col items-center justify-center rounded-xl border p-3 font-semibold transition ${
                      entryType === 'COMPLAINT'
                        ? 'border-rose-600 bg-rose-50 text-rose-900 font-bold shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    
                    Complaint (action req.)
                  </button>
                </div>
              </div>

              <fieldset>
                <legend className="mb-1.5 font-bold text-slate-700">Customer’s rating (optional)</legend>
                <div className="flex items-center gap-1" role="radiogroup">
                  {([1, 2, 3, 4, 5] as const).map((star) => (
                    <button key={star} type="button" role="radio" aria-checked={rating === star} aria-label={`${star} star${star === 1 ? '' : 's'}`}
                      onClick={() => setRating(rating === star ? 0 : star)}
                      className={`h-8 w-8 rounded-lg border text-base leading-none ${rating >= star ? 'border-amber-400 bg-amber-50 text-amber-500' : 'border-slate-200 text-slate-300 hover:text-amber-400'}`}>★</button>
                  ))}
                  <span className="ml-2 text-slate-500">{rating ? `${rating} of 5` : 'Leave blank if they didn’t rate'}</span>
                </div>
              </fieldset>

              {/* Customer: phone first, so it is clear who this entry attaches to */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <CustomerLookup value={lookup} onChange={(next) => { setLookup(next); if (next.link !== 'LINKED') setRelatedOrder(null); if (formErrors.customer) setFormErrors((p) => ({ ...p, customer: '' })); }}
                  allowNoPhone autoFocus error={formErrors.customer} />
              </div>

              {/* Related order (optional) */}
              {lookup.link === 'LINKED' && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <OrderPicker compact label="Related order (optional)" customerPhone={lookup.phone} selectedId={relatedOrder?.id || ''} onSelect={handleSelectOrder} />
                </div>
              )}

              {relatedOrder && !changeOrderDetails ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-700">Filled from order {displayDocumentId(relatedOrder.orderNumber)}</span>
                    <button type="button" onClick={() => setChangeOrderDetails(true)} className="font-bold text-blue-700 hover:underline">Change</button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[['Brand', db.getBrands('ALL').find((brand) => brand.code === brandCode)?.name || brandCode], ['Product', products.find((p) => p.id === productId)?.name || relatedOrder.items[0]?.productName || '—'],
                      ['Order date', formatDate(relatedOrder.orderDateAd, relatedOrder.orderDateBs)], ['Ordered via', relatedOrder.platform]].map(([term, detail]) => (
                      <span key={term} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1"><span className="text-slate-500">{term}:</span> <strong className="text-slate-900">{detail}</strong></span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                {(!relatedOrder || changeOrderDetails) && (
                  <div>
                    <label htmlFor="feedback-product" className="block font-bold text-slate-700 mb-1">Product *</label>
                    {products.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-slate-500">No products are saved yet.</p> : (
                      <select
                        id="feedback-product"
                        value={productId}
                        onChange={(e) => {
                          setProductId(e.target.value);
                          const p = products.find((x) => x.id === e.target.value);
                          if (p) setBrandCode(p.brandCode);
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none"
                      >
                        {(relatedOrder ? products.filter((p) => relatedOrder.items.some((item) => item.productId === p.id)).concat(products.filter((p) => !relatedOrder.items.some((item) => item.productId === p.id))) : products).map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.brandCode}] {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <div>
                  <label htmlFor="feedback-channel" className="block font-bold text-slate-700 mb-1">Received through *</label>
                  <select
                    id="feedback-channel"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none"
                  >
                    <option>Instagram DM</option>
                    <option>Instagram comment</option>
                    <option>WhatsApp</option>
                    <option>Messenger</option>
                    <option>TikTok comment</option>
                    <option>Website review</option>
                    <option>Daraz review</option>
                    <option>Google review</option>
                    <option>In-Store</option>
                    <option>Phone call</option>
                  </select>
                </div>
              </div>

              {/* Exact Text */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full text (exact message) *</label>
                <textarea aria-label="Full text (exact message)"
                  rows={3}
                  required
                  placeholder="Paste the exact review or complaint received from the customer…"
                  value={fullText}
                  onChange={(e) => {
                    setFullText(e.target.value);
                    if (formErrors.fullText) setFormErrors((p) => ({ ...p, fullText: '' }));
                  }}
                  className={`w-full rounded-lg border p-3 outline-none transition ${
                    formErrors.fullText
                      ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                />
                {formErrors.fullText && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.fullText}</p>
                )}
              </div>

              {/* Dynamic Checkbox System (PRD 6.1) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <DynamicCheckboxes
                  selectedCategories={selectedCategories}
                  onChange={setSelectedCategories}
                />
              </div>

              {/* Screenshot & Proof Photo Upload (PRD v2.2) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold text-xs">
                    <input
                      type="checkbox"
                      checked={hasScreenshot}
                      onChange={(e) => setHasScreenshot(e.target.checked)}
                      className="h-4 w-4 rounded text-blue-600"
                    />
                    <span>Attach Review / Complaint Proof Photos ({uploadedPhotos.length})</span>
                  </label>

                  {hasScreenshot && (
                    <span className="text-[11px] font-medium text-slate-500">
                      Camera / photo / screenshot
                    </span>
                  )}
                </div>

                {hasScreenshot && (
                  <div className="space-y-3 pt-1">
                    <CameraCapture
                      folder="reviews"
                      label="Capture / attach proof photos"
                      sublabel="Photograph defect, chat screenshots, or damaged packaging"
                      maxFiles={6}
                      existingUrls={uploadedPhotos}
                      onRemoveExisting={(idx) => handleRemovePhoto(idx)}
                      onUpload={(results) => {
                        setUploadedPhotos((prev) => [...prev, ...results.map((r) => r.url)]);
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Marketing tracking flags */}
              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium text-xs">
                  <input
                    type="checkbox"
                    checked={usedInDesign}
                    onChange={(e) => setUsedInDesign(e.target.checked)}
                    className="h-4 w-4 rounded text-blue-600"
                  />
                  Used in design
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium text-xs">
                  <input
                    type="checkbox"
                    checked={postedOnWebsite}
                    onChange={(e) => setPostedOnWebsite(e.target.checked)}
                    className="h-4 w-4 rounded text-blue-600"
                  />
                  Posted on website
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Saving…</> : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div></Portal>
      )}

      {/* Full-Resolution Lightbox Zoom Modal (PRD v2.2) */}
      {lightboxImageUrl && (
        <Portal><div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in cursor-zoom-out"
          onClick={() => setLightboxImageUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white pb-3 px-1">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-emerald-400" />
                Customer review proof evidence &bull; full resolution zoom
              </span>
              <button
                type="button"
                onClick={() => setLightboxImageUrl(null)}
                className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors"
                title="Close lightbox"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={lightboxImageUrl}
              alt="Full Resolution Proof"
              className="max-h-[80vh] max-w-full rounded-2xl shadow-2xl object-contain border border-white/10"
            />
          </div>
        </div></Portal>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        totalCount={filtered.length}
        onClearSelection={handleClearSelection}
        onSelectAll={handleSelectAll}
      >
        {/* Set Status dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-300 font-medium">Status:</span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleBulkSetStatus(e.target.value as ComplaintStatus);
                e.target.value = '';
              }
            }}
            className="rounded-lg bg-slate-800 border border-slate-700 text-white text-xs px-2.5 py-1.5 outline-none font-medium cursor-pointer"
          >
            <option value="" disabled>Set status…</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {/* Assign to Officer dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-300 font-medium">Assign:</span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleBulkAssign(e.target.value);
                e.target.value = '';
              }
            }}
            className="rounded-lg bg-slate-800 border border-slate-700 text-white text-xs px-2.5 py-1.5 outline-none font-medium cursor-pointer"
          >
            <option value="" disabled>Assign to…</option>
            {db.getUsers().map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} {u.role ? `(${u.role.replace('_', ' ')})` : ''}
              </option>
            ))}
          </select>
        </div>
      </BulkActionBar>

      {/* FIX 50c: Context-Rich Complaint Escalation Modal */}
      <ConfirmModal
        isOpen={showEscalateModal}
        title="Escalate complaint to urgent priority?"
        variant="danger"
        confirmLabel="Escalate now"
        cancelLabel="Cancel"
        details={selectedEntry ? [
          { label: 'Customer', value: `${selectedEntry.customerName} (${selectedEntry.customerPhone})` },
          { label: 'Product', value: selectedEntry.productName },
          { label: 'Issue category', value: selectedEntry.issueCategories?.join(', ') || 'Quality / Delivery Issue' },
          { label: 'Current priority', value: `${selectedEntry.priority || 'MEDIUM'} → URGENT` },
        ] : []}
        consequences={[
          'Dispatch high-priority push notification to all Operations Admins',
          'Move this complaint to the top of the command center resolution queue',
          'Start strict 24-hour resolution SLA resolution timer',
        ]}
        onConfirm={handleConfirmEscalate}
        onCancel={() => setShowEscalateModal(false)}
      >
        <div className="space-y-2 pt-1 text-xs">
          <label className="block font-bold text-slate-700">Assign operations staff:</label>
          <select aria-label="Assign operations staff:"
            value={escalateAssignee}
            onChange={(e) => setEscalateAssignee(e.target.value)}
            className="w-full rounded-xl border border-slate-300 p-2.5 bg-white text-xs font-medium outline-none"
          >
            {db.getUsers().map((u) => (
              <option key={u.id} value={u.fullName}>
                {u.fullName} {u.role ? `(${u.role.replace('_', ' ')})` : ''}
              </option>
            ))}
          </select>

          <label className="block font-bold text-slate-700 pt-1">Escalation rationale / action directives:</label>
          <input aria-label="Escalation rationale / action directives:"
            type="text"
            placeholder="e.g. Broken seal spilled on customer dress, immediate replacement required"
            value={escalateNote}
            onChange={(e) => setEscalateNote(e.target.value)}
            className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none"
          />
        </div>
      </ConfirmModal>
      </div>
    </PageGuard>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-500">
          Loading feedback and reviews stream…
        </div>
      }
    >
      <FeedbackContent />
    </Suspense>
  );
}
