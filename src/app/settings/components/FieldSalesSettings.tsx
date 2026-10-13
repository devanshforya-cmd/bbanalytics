'use client';

import React, { useState } from 'react';
import {
  Camera,
  FileText,
  Layers,
  Calendar,
  Plus,
  Trash2,
  Check,
  X,
  UserCheck,
  AlertCircle,
  Clock,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { db } from '@/lib/db/db-service';
import {
  DocumentTypeConfig,
  StoreCategoryConfig,
  RecurringScheduleEntry,
} from '@/lib/types';
import { toast } from '@/components/common/Toast';

export default function FieldSalesSettings() {
  const [photoRequired, setPhotoRequired] = useState(() => db.getRequireStorePhotoAtCheckIn());
  const [docTypes, setDocTypes] = useState<DocumentTypeConfig[]>(() => db.getDocumentTypes());
  const [newDocTypeName, setNewDocTypeName] = useState('');

  const [categories, setCategories] = useState<StoreCategoryConfig[]>(() => db.getStoreCategories());
  const [newCategoryName, setNewCategoryName] = useState('');

  const [schedules, setSchedules] = useState<RecurringScheduleEntry[]>(() => db.getRecurringSchedules());
  const officers = db.getUsers().filter(
    (u) =>
      u.role === 'SALES_OFFICER' ||
      (u.permissions?.beat_plans && u.permissions.beat_plans.access !== 'HIDDEN') ||
      u.id.startsWith('user_')
  );
  const unifiedStores = db.getStoresUnified();

  // Override Modal
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideOfficerId, setOverrideOfficerId] = useState(officers[0]?.id || '');
  const [overrideStoreId, setOverrideStoreId] = useState(unifiedStores[0]?.id || '');
  const [overrideDate, setOverrideDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [overridePriority, setOverridePriority] = useState<'HIGH' | 'MEDIUM' | 'ROUTINE'>('HIGH');
  const [overrideNote, setOverrideNote] = useState('');

  // Leave Modal
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveOfficerId, setLeaveOfficerId] = useState(officers[0]?.id || '');
  const [leaveCoveringId, setLeaveCoveringId] = useState(officers[1]?.id || officers[0]?.id || '');
  const [leaveStartDate, setLeaveStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [leaveEndDate, setLeaveEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Handle Photo Requirement Toggle
  const handleTogglePhotoRequired = () => {
    const nextVal = !photoRequired;
    db.setRequireStorePhotoAtCheckIn(nextVal);
    setPhotoRequired(nextVal);
    toast.success(
      nextVal
        ? 'Store entrance photo is now required before check-in.'
        : 'Store entrance photo requirement disabled.'
    );
  };

  // Handle Document Types
  const handleAddDocType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTypeName.trim()) return;
    db.addDocumentType(newDocTypeName.trim());
    setDocTypes([...db.getDocumentTypes()]);
    setNewDocTypeName('');
    toast.success('New document type added.');
  };

  const handleToggleDocType = (id: string) => {
    db.toggleDocumentType(id);
    setDocTypes([...db.getDocumentTypes()]);
    toast.info('Document type status updated.');
  };

  // Handle Store Categories
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    db.addStoreCategory(newCategoryName.trim());
    setCategories([...db.getStoreCategories()]);
    setNewCategoryName('');
    toast.success('Store category added.');
  };

  const handleToggleCategory = (id: string) => {
    db.toggleStoreCategory(id);
    setCategories([...db.getStoreCategories()]);
    toast.info('Store category status updated.');
  };

  // Submit Override
  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    db.addOneTimeBeatOverride(
      overrideOfficerId,
      overrideStoreId,
      overrideDate,
      overridePriority,
      overrideNote || undefined
    );
    setShowOverrideModal(false);
    setOverrideNote('');
    toast.success('One-time beat override added. Officer will see the prioritized store in their beat plan.');
  };

  // Submit Leave
  const handleSaveLeave = (e: React.FormEvent) => {
    e.preventDefault();
    db.setOfficerLeave(
      leaveOfficerId,
      leaveStartDate,
      leaveEndDate,
      leaveCoveringId,
      []
    );
    setShowLeaveModal(false);
    toast.success('Officer leave registered. Routes successfully assigned to covering officer.');
  };

  return (
    <div className="space-y-6">
      {/* 1. Mandatory Store Photo Check-In Switch (Section 10) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-600">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Mandatory Store Photo at Check-In (Section 10)
              </h3>
              <p className="text-xs text-slate-500">
                Require field sales officers to snap a photo of the store front/counter before GPS check-in is confirmed.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={photoRequired}
              onChange={handleTogglePhotoRequired}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
          </label>
        </div>
      </div>

      {/* 2. Document Types Management (Section 8) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-50 text-purple-600">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Document Types &amp; Handover Receipts (Section 8)
              </h3>
              <p className="text-xs text-slate-500">
                Configure document categories collected in the field (e.g. Purchase Orders, Invoices, Agreements).
              </p>
            </div>
          </div>
        </div>

        {/* Add Type Form */}
        <form onSubmit={handleAddDocType} className="flex gap-2">
          <input
            type="text"
            value={newDocTypeName}
            onChange={(e) => setNewDocTypeName(e.target.value)}
            placeholder="e.g. Distributor Tax Clearance Certificate, Credit Note..."
            className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Type</span>
          </button>
        </form>

        {/* Existing Document Types List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
          {docTypes.map((dt) => (
            <div
              key={dt.id}
              className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition ${
                dt.isActive ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-900 block truncate">{dt.name}</span>
                <span className="text-[10px] text-slate-400">
                  {dt.isActive ? 'Active in mobile app' : 'Deactivated'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleDocType(dt.id)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                  dt.isActive
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                }`}
              >
                {dt.isActive ? 'Active' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Store Categories & Frequency (Section 11) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Retail Store Classification Categories (Section 11)
              </h3>
              <p className="text-xs text-slate-500">
                Classify retail accounts into tiers (e.g. Tier-A High Volume, Pharmacy, Supermarket) with target visit rhythms.
              </p>
            </div>
          </div>
        </div>

        {/* Add Category Form */}
        <form onSubmit={handleAddCategory} className="flex gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="e.g. Category A (Weekly), Category B (Bi-Weekly), Cosmetic Store..."
            className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Category</span>
          </button>
        </form>

        {/* Existing Categories */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition ${
                cat.isActive ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-900 block truncate">{cat.name}</span>
                <span className="text-[10px] text-slate-400">
                  {cat.isActive ? 'Active on store forms' : 'Archived'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleCategory(cat.id)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                  cat.isActive
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                }`}
              >
                {cat.isActive ? 'Active' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Recurring Beat Schedules & Leave Management (Section 7) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Beat Management, Overrides &amp; Leave Coverage (Section 7)
              </h3>
              <p className="text-xs text-slate-500">
                Configure weekly recurring route assignments, insert one-time store overrides, and reassign visits during officer leave.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOverrideModal(true)}
              className="px-3.5 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs transition flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>+ One-Time Beat Override</span>
            </button>
            <button
              type="button"
              onClick={() => setShowLeaveModal(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold text-xs transition flex items-center gap-1.5 shadow-2xs"
            >
              <UserCheck className="w-4 h-4 text-amber-600" />
              <span>Leave &amp; Coverage</span>
            </button>
          </div>
        </div>

        {/* Schedules Table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Field Sales Officer</th>
                  <th className="p-3">Weekday</th>
                  <th className="p-3">Assigned Stores Route</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schedules.map((entry) => {
                  const officer = officers.find((o) => o.id === entry.officerId);
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900">
                        {officer?.fullName || entry.officerId}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10px]">
                          {entry.daysOfWeek?.join(', ') || 'Mon-Fri'}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-slate-800">
                        {entry.storeName}
                        {entry.managerNote && (
                          <span className="text-[10px] text-slate-500 block">
                            Directive: &ldquo;{entry.managerNote}&rdquo;
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                          {entry.priority} Priority
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* One-Time Beat Override Modal (Section 7) */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Add One-Time Beat Override</h3>
              <button
                onClick={() => setShowOverrideModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOverride} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Sales Officer</label>
                <select
                  value={overrideOfficerId}
                  onChange={(e) => setOverrideOfficerId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Store</label>
                <select
                  value={overrideStoreId}
                  onChange={(e) => setOverrideStoreId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  {unifiedStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.address})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Visit Date</label>
                  <input
                    type="date"
                    value={overrideDate}
                    onChange={(e) => setOverrideDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={overridePriority}
                    onChange={(e) => setOverridePriority(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="HIGH">★★★ High Priority</option>
                    <option value="MEDIUM">★★ Medium</option>
                    <option value="ROUTINE">★ Routine</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Manager Note / Directive</label>
                <input
                  type="text"
                  placeholder="e.g. Urgent stock delivery, collect pending payment..."
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
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
                  Add to Beat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave Coverage Modal (Section 7) */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Officer Leave &amp; Route Coverage</h3>
              <button
                onClick={() => setShowLeaveModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLeave} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Officer Going on Leave</label>
                <select
                  value={leaveOfficerId}
                  onChange={(e) => setLeaveOfficerId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Covering Officer</label>
                <select
                  value={leaveCoveringId}
                  onChange={(e) => setLeaveCoveringId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  {officers
                    .filter((o) => o.id !== leaveOfficerId)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.fullName}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Leave Start Date</label>
                  <input
                    type="date"
                    value={leaveStartDate}
                    onChange={(e) => setLeaveStartDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Leave End Date</label>
                  <input
                    type="date"
                    value={leaveEndDate}
                    onChange={(e) => setLeaveEndDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900">
                Scheduled beat stops for this period will automatically appear in the covering officer&apos;s daily beat plan with a coverage tag.
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
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-2xs"
                >
                  Confirm Coverage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
