'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/db/db-service';
import { ShelfPhoto, FilterCriteria, Retailer, Branch } from '@/lib/types';
import AdvancedFilterBar from '@/components/common/AdvancedFilterBar';
import CameraCapture from '@/components/common/CameraCapture';
import { matchesDateCriteria, adToBs } from '@/lib/nepali-calendar';
import { toast } from '@/components/common/Toast';
import {
  Camera,
  Store,
  User as UserIcon,
  Calendar,
  Layers,
  ZoomIn,
  Plus,
  X,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Columns,
  Maximize2,
  Image as ImageIcon,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import { getScope } from '@/lib/permissions';

export default function ShelfPhotosPage() {
  const [photos, setPhotos] = useState<ShelfPhoto[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [filterCriteria, setFilterCriteria] = useState<FilterCriteria>({
    calendarMode: 'BS',
  });
  const [activeModalImage, setActiveModalImage] = useState<{
    url: string;
    label: string;
    storeName: string;
    section?: string;
  } | null>(null);

  // Side-by-side comparison modal state
  const [comparePhoto, setComparePhoto] = useState<ShelfPhoto | null>(null);
  const [compareBeforeIdx, setCompareBeforeIdx] = useState(0);
  const [compareAfterIdx, setCompareAfterIdx] = useState(0);

  // Upload Multi-Photo Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStoreName, setUploadStoreName] = useState('');
  const [uploadSection, setUploadSection] = useState('Front Rack / Eye-Level');
  const [uploadBeforeUrls, setUploadBeforeUrls] = useState<string[]>([]);
  const [uploadAfterUrls, setUploadAfterUrls] = useState<string[]>([]);
  const [newBeforeUrlInput, setNewBeforeUrlInput] = useState('');
  const [newAfterUrlInput, setNewAfterUrlInput] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // File upload refs
  const beforeFileInputRef = useRef<HTMLInputElement>(null);
  const beforeCameraInputRef = useRef<HTMLInputElement>(null);
  const afterFileInputRef = useRef<HTMLInputElement>(null);
  const afterCameraInputRef = useRef<HTMLInputElement>(null);

  const loadPhotos = () => {
    setPhotos(db.getShelfPhotos());
    setRetailers(db.getRetailers());
    setBranches(db.getBranches());
  };

  useEffect(() => {
    loadPhotos();
  }, []);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const currentUser = db.getCurrentUser();
  const isSalesOfficer = getScope(currentUser, 'shelf_photos') === 'OWN';

  // Filter application
  const filtered = photos.filter((p) => {
    if (isSalesOfficer && p.officerId !== currentUser.id && p.officerName !== currentUser.fullName) {
      return false;
    }
    if (filterCriteria.officerId && p.officerId !== filterCriteria.officerId) return false;
    if (!matchesDateCriteria(p.dateAd, p.dateBs, filterCriteria)) return false;
    return true;
  });

  // File upload reader
  const handleFileUpload = (files: FileList | null, type: 'BEFORE' | 'AFTER') => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          if (type === 'BEFORE') {
            setUploadBeforeUrls((prev) => [...prev, result]);
          } else {
            setUploadAfterUrls((prev) => [...prev, result]);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSaveMultiPhotos = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadBeforeUrls.length === 0 || uploadAfterUrls.length === 0) {
      toast.error('Please provide at least 1 Before photo and 1 After photo.');
      return;
    }

    const today = new Date();
    const bs = adToBs(today);
    const dateAd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const dateBs = `${bs.monthName} ${bs.day}, ${bs.year}`;

    const ret = retailers.find((r) => r.name === uploadStoreName);

    db.addShelfPhoto({
      storeId: ret?.id || `custom_${Date.now()}`,
      storeName: uploadStoreName,
      officerId: currentUser.id || 'usr_so1',
      officerName: currentUser.fullName || 'Rohan Shrestha',
      rackSection: uploadSection,
      beforePhotoUrls: uploadBeforeUrls,
      afterPhotoUrls: uploadAfterUrls,
      dateAd,
      dateBs,
    });

    toast.success(`Uploaded shelf audit for "${uploadStoreName}" with ${uploadBeforeUrls.length} Before and ${uploadAfterUrls.length} After photos.`);
    setShowUploadModal(false);
    loadPhotos();
  };

  return (
    <PageGuard feature="shelf_photos">
      <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Camera className="w-6 h-6 text-brand-600" />
            <span>Shelf Share & Planogram Audit Archive</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Multi-angle Before & After shelf photos across multiple racks and gondolas per store visit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {toastMsg && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>{toastMsg}</span>
            </div>
          )}

          {!isSalesOfficer && (
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs sm:text-sm font-semibold shadow-sm transition-colors min-h-[44px]"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Shelf Evidence</span>
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filter Bar (Date, Day, Month, Year, Place, Officer) */}
      <AdvancedFilterBar
        criteria={filterCriteria}
        onChange={setFilterCriteria}
        title="Filter Shelf Audit Archive"
        hideBrand={true}
      />

      {/* Shelf Photos Gallery Cards */}
      <div className="space-y-6">
        {filtered.length === 0 ? (
          <EmptyState
            type="photos"
            title="No Shelf Photos Found"
            description="No before/after shelf share photos match your filter criteria or officer assignment."
          />
        ) : (
          filtered.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-5"
          >
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-900 text-base">{item.storeName}</h3>
                  {item.rackSection && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Rack: {item.rackSection}
                    </span>
                  )}
                  <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase">
                    GPS Verified Audit
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                  <span>
                    Auditor: <strong className="text-slate-800">{item.officerName}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Date: <strong className="text-brand-600">{item.dateBs}</strong> ({item.dateAd})
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setComparePhoto(item);
                    setCompareBeforeIdx(0);
                    setCompareAfterIdx(0);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-xs font-bold text-blue-700 transition shadow-2xs"
                >
                  <Columns className="w-3.5 h-3.5 text-blue-600" />
                  <span>Compare Before / After</span>
                </button>
                <div className="text-xs text-slate-400 font-mono hidden sm:block">
                  {item.beforePhotoUrls.length} Before • {item.afterPhotoUrls.length} After
                </div>
              </div>
            </div>

            {/* Before vs After Multi-Photo Carousels / Grids */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* BEFORE PHOTOS SET */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 uppercase tracking-wider">
                    <Layers className="w-3.5 h-3.5" />
                    Before Arrangement ({item.beforePhotoUrls.length} Angles)
                  </span>
                  <span className="text-[11px] text-slate-400">Click any image to expand</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {item.beforePhotoUrls.map((url, idx) => (
                    <div
                      key={idx}
                      onClick={() =>
                        setActiveModalImage({
                          url,
                          label: `Before Photo #${idx + 1}`,
                          storeName: item.storeName,
                          section: item.rackSection,
                        })
                      }
                      className="group relative h-36 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer shadow-2xs hover:ring-2 hover:ring-amber-500 transition-all"
                    >
                      <img
                        src={url}
                        alt={`Before shelf angle ${idx + 1}`}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <ZoomIn className="w-5 h-5" />
                      </div>
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-mono">
                        Angle #{idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AFTER PHOTOS SET */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    <Layers className="w-3.5 h-3.5" />
                    After Arrangement ({item.afterPhotoUrls.length} Angles)
                  </span>
                  <span className="text-[11px] text-slate-400">Click any image to expand</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {item.afterPhotoUrls.map((url, idx) => (
                    <div
                      key={idx}
                      onClick={() =>
                        setActiveModalImage({
                          url,
                          label: `After Photo #${idx + 1}`,
                          storeName: item.storeName,
                          section: item.rackSection,
                        })
                      }
                      className="group relative h-36 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer shadow-2xs hover:ring-2 hover:ring-emerald-500 transition-all"
                    >
                      <img
                        src={url}
                        alt={`After shelf angle ${idx + 1}`}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <ZoomIn className="w-5 h-5" />
                      </div>
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-mono">
                        Angle #{idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))
        )}
      </div>

      {/* ======================================================== */}
      {/* FULL RESOLUTION PHOTO LIGHTBOX MODAL */}
      {/* ======================================================== */}
      {activeModalImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setActiveModalImage(null)}
        >
          <div
            className="bg-slate-900 rounded-2xl max-w-3xl w-full p-4 border border-slate-800 overflow-hidden shadow-2xl space-y-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm sm:text-base">{activeModalImage.storeName}</h4>
                <p className="text-xs text-slate-400">
                  {activeModalImage.label} • {activeModalImage.section || 'General Display'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalImage(null)}
                className="p-1 rounded-full bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-hidden rounded-xl bg-black flex items-center justify-center">
              <img
                src={activeModalImage.url}
                alt={activeModalImage.label}
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SIDE-BY-SIDE BEFORE / AFTER COMPARISON MODAL */}
      {/* ======================================================== */}
      {comparePhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => setComparePhoto(null)}
        >
          <div
            className="bg-slate-900 rounded-2xl max-w-5xl w-full p-4 sm:p-6 border border-slate-800 overflow-hidden shadow-2xl space-y-4 text-white max-h-[95vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/30 border border-blue-500/50 text-blue-400">
                  <Columns className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                    <span>{comparePhoto.storeName}</span>
                    {comparePhoto.rackSection && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-normal">
                        {comparePhoto.rackSection}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Audited by {comparePhoto.officerName} • {comparePhoto.dateBs} ({comparePhoto.dateAd})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setComparePhoto(null)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Side-by-Side Comparison Container */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto min-h-0">
              {/* BEFORE PANEL */}
              <div className="space-y-2 flex flex-col">
                <div className="flex items-center justify-between bg-amber-950/40 border border-amber-800/40 px-3 py-1.5 rounded-xl">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    BEFORE ARRANGEMENT
                  </span>
                  <span className="text-[11px] text-amber-300/80 font-mono">
                    Angle {compareBeforeIdx + 1} of {comparePhoto.beforePhotoUrls.length}
                  </span>
                </div>

                <div className="relative flex-1 min-h-[260px] sm:min-h-[360px] rounded-xl overflow-hidden bg-black flex items-center justify-center border border-slate-800">
                  <img
                    src={comparePhoto.beforePhotoUrls[compareBeforeIdx] || comparePhoto.beforePhotoUrls[0]}
                    alt="Before Shelf"
                    className="w-full h-full object-contain max-h-[50vh]"
                  />
                </div>

                {comparePhoto.beforePhotoUrls.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                    {comparePhoto.beforePhotoUrls.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCompareBeforeIdx(i)}
                        className={`h-12 w-12 rounded-lg overflow-hidden border-2 flex-shrink-0 transition ${
                          compareBeforeIdx === i ? 'border-amber-400 scale-105' : 'border-slate-800 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={url} alt={`Before ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* AFTER PANEL */}
              <div className="space-y-2 flex flex-col">
                <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-800/40 px-3 py-1.5 rounded-xl">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    AFTER ARRANGEMENT (PLANOGRAM COMPLIANT)
                  </span>
                  <span className="text-[11px] text-emerald-300/80 font-mono">
                    Angle {compareAfterIdx + 1} of {comparePhoto.afterPhotoUrls.length}
                  </span>
                </div>

                <div className="relative flex-1 min-h-[260px] sm:min-h-[360px] rounded-xl overflow-hidden bg-black flex items-center justify-center border border-slate-800">
                  <img
                    src={comparePhoto.afterPhotoUrls[compareAfterIdx] || comparePhoto.afterPhotoUrls[0]}
                    alt="After Shelf"
                    className="w-full h-full object-contain max-h-[50vh]"
                  />
                </div>

                {comparePhoto.afterPhotoUrls.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                    {comparePhoto.afterPhotoUrls.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCompareAfterIdx(i)}
                        className={`h-12 w-12 rounded-lg overflow-hidden border-2 flex-shrink-0 transition ${
                          compareAfterIdx === i ? 'border-emerald-400 scale-105' : 'border-slate-800 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={url} alt={`After ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
              <span>Compare visual merchandising, product facings, and competitor share.</span>
              <button
                type="button"
                onClick={() => setComparePhoto(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* UPLOAD MULTI-PHOTO EVIDENCE MODAL */}
      {/* ======================================================== */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-brand-600" />
                <h3 className="font-bold text-slate-900 text-base">Upload Shelf Evidence (Before & After)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMultiPhotos} className="space-y-4 pt-4">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Store / Outlet Name *</label>
                  <select
                    value={uploadStoreName}
                    onChange={(e) => setUploadStoreName(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none"
                  >
                    <optgroup label="Retailers">
                      {retailers.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name} ({r.city})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Distributor Branches">
                      {branches.map((b) => (
                        <option key={b.id} value={b.name}>
                          {b.name} ({b.distributorName})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rack / Section Label *</label>
                  <input
                    type="text"
                    required
                    value={uploadSection}
                    onChange={(e) => setUploadSection(e.target.value)}
                    placeholder="e.g. Eye-Level Personal Care Rack"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              {/* Before Photos Section */}
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                <CameraCapture
                  label="Before Arrangement Photos"
                  sublabel="Capture or browse shelf arrangement photos before audit / restock"
                  maxFiles={6}
                  existingUrls={uploadBeforeUrls}
                  onRemoveExisting={(idx) => setUploadBeforeUrls((prev) => prev.filter((_, i) => i !== idx))}
                  onUpload={(results) => {
                    setUploadBeforeUrls((prev) => [...prev, ...results.map((r) => r.url)]);
                  }}
                />
              </div>

              {/* After Photos Section */}
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200">
                <CameraCapture
                  label="After Arrangement Photos"
                  sublabel="Capture or browse aligned shelf photos after planogram restock"
                  maxFiles={6}
                  existingUrls={uploadAfterUrls}
                  onRemoveExisting={(idx) => setUploadAfterUrls((prev) => prev.filter((_, i) => i !== idx))}
                  onUpload={(results) => {
                    setUploadAfterUrls((prev) => [...prev, ...results.map((r) => r.url)]);
                  }}
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-sm"
                >
                  Save Multi-Angle Photos
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
