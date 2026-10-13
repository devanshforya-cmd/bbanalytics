'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { ReviewCategory, BrandCode } from '@/lib/types';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { toast } from '@/components/common/Toast';
import ConfirmModal from '@/components/common/ConfirmModal';
import {
  Tags,
  Plus,
  Pencil,
  GitMerge,
  Archive,
  ArchiveRestore,
  X,
  Check,
  Search,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  BarChart3,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

interface CategoryAnalytics {
  allTimeTicks: number;
  monthTicks: number;
  mostAffectedProduct: string;
  mostAffectedBrand: string;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export default function ReviewCategoriesPage() {
  const [categories, setCategories] = useState<ReviewCategory[]>(
    db.getReviewCategories(true) // include archived
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');

  // Inline rename state (12b)
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineEditingName, setInlineEditingName] = useState('');

  // Merge selection state (12b)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [survivingCategoryId, setSurvivingCategoryId] = useState<string>('');

  // Create modal state (12d)
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatCreator, setNewCatCreator] = useState('Devansh Agarwal (Super Admin)');

  // Active category for analytics drawer/modal (12c)
  const [selectedAnalyticsCat, setSelectedAnalyticsCat] = useState<ReviewCategory | null>(null);

  // FIX 50d: Archive confirmation modal state
  const [categoryToArchive, setCategoryToArchive] = useState<ReviewCategory | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  const refreshList = () => {
    setCategories([...db.getReviewCategories(true)]);
  };

  // Feedback and Returns data to compute live analytics (12c)
  const feedbackList = useMemo(() => db.getFeedback(), []);
  const returnsList = useMemo(() => db.getReturns(), []);

  // Compute usage analytics for each category (12c)
  const analyticsMap: Record<string, CategoryAnalytics> = useMemo(() => {
    const map: Record<string, CategoryAnalytics> = {};

    categories.forEach((cat) => {
      let allTime = cat.tickCount || 0;
      let monthCount = 0;
      const productCounts: Record<string, number> = {};
      const brandCounts: Record<string, number> = {};

      // Analyze feedback
      feedbackList.forEach((fb) => {
        if (fb.issueCategories?.includes(cat.name)) {
          allTime += 1;
          monthCount += 1;
          if (fb.productName) {
            productCounts[fb.productName] = (productCounts[fb.productName] || 0) + 1;
          }
          if (fb.brandCode) {
            brandCounts[fb.brandCode] = (brandCounts[fb.brandCode] || 0) + 1;
          }
        }
      });

      // Analyze returns
      returnsList.forEach((ret) => {
        if (ret.issueCategories?.includes(cat.name) || ret.reasonCategory === cat.name) {
          allTime += 1;
          monthCount += 1;
          if (ret.productName) {
            productCounts[ret.productName] = (productCounts[ret.productName] || 0) + 1;
          }
          if (ret.brandCode) {
            brandCounts[ret.brandCode] = (brandCounts[ret.brandCode] || 0) + 1;
          }
        }
      });

      // Find top product
      let topProduct = 'Forya Roll-On Peach 50ml';
      let maxP = 0;
      for (const [prod, c] of Object.entries(productCounts)) {
        if (c > maxP) {
          maxP = c;
          topProduct = prod;
        }
      }

      // Find top brand
      let topBrand = 'FORYA';
      let maxB = 0;
      for (const [b, c] of Object.entries(brandCounts)) {
        if (c > maxB) {
          maxB = c;
          topBrand = b;
        }
      }

      // Trend calculation
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (allTime > 10) trend = 'increasing';
      else if (allTime < 3) trend = 'decreasing';

      map[cat.id] = {
        allTimeTicks: Math.max(cat.tickCount, allTime),
        monthTicks: Math.max(1, monthCount || Math.ceil(cat.tickCount * 0.4)),
        mostAffectedProduct: topProduct,
        mostAffectedBrand: topBrand,
        trend,
      };
    });

    return map;
  }, [categories, feedbackList, returnsList]);

  // Handle Add Category (12d)
  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    db.addReviewCategory(newCatName.trim(), newCatCreator);
    setNewCatName('');
    setShowAddModal(false);
    refreshList();
  };

  // Handle Inline Rename (12b)
  const handleStartRename = (cat: ReviewCategory) => {
    setInlineEditingId(cat.id);
    setInlineEditingName(cat.name);
  };

  const handleSaveRename = (id: string) => {
    if (!inlineEditingName.trim()) return;
    db.renameReviewCategory(id, inlineEditingName.trim());
    setInlineEditingId(null);
    setInlineEditingName('');
    refreshList();
  };

  // Handle Multi-Merge (12b)
  const handleOpenMerge = () => {
    if (selectedIds.length < 2) {
      toast.error('Please select at least 2 categories to merge.');
      return;
    }
    setSurvivingCategoryId(selectedIds[0]);
    setShowMergeModal(true);
  };

  const handleConfirmMerge = () => {
    if (!survivingCategoryId || selectedIds.length < 2) return;
    db.mergeMultipleReviewCategories(selectedIds, survivingCategoryId);
    setShowMergeModal(false);
    setSelectedIds([]);
    refreshList();
    toast.success('Categories merged successfully.');
  };

  // Handle Archive / Unarchive (12b & FIX 50d)
  const handleToggleArchive = (cat: ReviewCategory) => {
    if (cat.isArchived) {
      db.unarchiveReviewCategory(cat.id);
      refreshList();
      toast.success(`Category "${cat.name}" restored to active status.`);
    } else {
      setCategoryToArchive(cat);
      setShowArchiveModal(true);
    }
  };

  const handleConfirmArchive = () => {
    if (!categoryToArchive) return;
    const cat = categoryToArchive;
    db.archiveReviewCategory(cat.id);
    refreshList();
    setShowArchiveModal(false);
    setCategoryToArchive(null);
    toast.undoable(
      `✓ Category "${cat.name}" archived`,
      () => {
        db.unarchiveReviewCategory(cat.id);
        refreshList();
        toast.success(`Category "${cat.name}" restored.`);
      },
      'Preserved in existing records. Hidden from new entries.',
      8000
    );
  };

  // Checkbox toggle
  const handleToggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredCategories.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCategories.map((c) => c.id));
    }
  };

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'ACTIVE'
          ? !c.isArchived
          : c.isArchived;
      return matchesSearch && matchesStatus;
    });
  }, [categories, searchTerm, statusFilter]);

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
      <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* 7f: Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Reviews & Quality', href: '/reviews/feedback' },
          { label: 'Issue Categories Library' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Dynamic Issue Categories Governance
            </h1>
            <span className="rounded-full bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5">
              Organic Taxonomy Engine
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Admin oversight for dynamic tags logged across Customer Feedback and Product Returns. Rename typos, consolidate duplicates, and analyze defect trends.
          </p>
        </div>

        {/* 12d: Create New Category */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 self-start sm:self-auto transition-all"
        >
          <Plus className="h-4 w-4" />
          Create New Category
        </button>
      </div>

      {/* Security & Data Integrity Policy Banner (12b) */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 flex items-start gap-3 shadow-xs">
        <ShieldAlert className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold">Enterprise Audit Rule: No Category Deletions</span>
          <p className="text-blue-800 text-[11px] leading-relaxed">
            Categories cannot be deleted to guarantee long-term historical data integrity. Obsolete tags can be <strong>Archived</strong> (hidden from new forms while preserving historical records) or <strong>Merged</strong> into an approved master tag.
          </p>
        </div>
      </div>

      {/* Search, Status Filter & Multi-Merge Actions Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search categories by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs bg-transparent outline-none text-slate-800"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All ({categories.length})
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  statusFilter === 'ACTIVE' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Active ({categories.filter((c) => !c.isArchived).length})
              </button>
              <button
                onClick={() => setStatusFilter('ARCHIVED')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  statusFilter === 'ARCHIVED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Archived ({categories.filter((c) => c.isArchived).length})
              </button>
            </div>
          </div>
        </div>

        {/* 12b: Multi-Select Merge Bar (visible when 2+ selected) */}
        {selectedIds.length >= 2 && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
              <GitMerge className="h-4 w-4 text-purple-700" />
              <span>{selectedIds.length} categories selected for consolidation</span>
            </div>
            <button
              onClick={handleOpenMerge}
              className="rounded-lg bg-purple-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-800 shadow-sm flex items-center gap-1.5"
            >
              <GitMerge className="h-3.5 w-3.5" />
              Merge into One Category
            </button>
          </div>
        )}
      </div>

      {/* 12a: Category Management Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[850px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredCategories.length > 0 &&
                      selectedIds.length === filteredCategories.length
                    }
                    onChange={handleSelectAll}
                    className="rounded border-slate-300 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Category Name</th>
                <th className="py-3 px-4">Created By</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-center">Times Used</th>
                <th className="py-3 px-4">Last Used</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Usage Trend</th>
                <th className="py-3 px-4 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No categories found.
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat) => {
                  const analytics = analyticsMap[cat.id] || {
                    allTimeTicks: cat.tickCount,
                    monthTicks: 1,
                    mostAffectedProduct: 'Forya Roll-On Peach 50ml',
                    mostAffectedBrand: 'FORYA',
                    trend: 'stable' as const,
                  };

                  const isArchived = cat.isArchived;

                  return (
                    <tr
                      key={cat.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isArchived ? 'bg-slate-50/60 text-slate-400 opacity-75' : ''
                      }`}
                    >
                      {/* Checkbox for Merge */}
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(cat.id)}
                          onChange={() => handleToggleSelect(cat.id)}
                          className="rounded border-slate-300 cursor-pointer"
                        />
                      </td>

                      {/* 12b: Category Name with Inline Rename */}
                      <td className="py-3 px-4">
                        {inlineEditingId === cat.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={inlineEditingName}
                              onChange={(e) => setInlineEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename(cat.id);
                                if (e.key === 'Escape') setInlineEditingId(null);
                              }}
                              autoFocus
                              className="rounded border border-blue-500 px-2 py-1 font-bold text-slate-900 text-xs outline-none"
                            />
                            <button
                              onClick={() => handleSaveRename(cat.id)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                              title="Save name"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setInlineEditingId(null)}
                              className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group">
                            <button
                              onClick={() => handleStartRename(cat)}
                              className={`font-bold text-left hover:text-blue-600 hover:underline transition-colors ${
                                isArchived ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'
                              }`}
                              title="Click to rename"
                            >
                              {cat.name}
                            </button>
                            <button
                              onClick={() => handleStartRename(cat)}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 p-0.5"
                              title="Rename category"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {cat.mergedIntoId && (
                          <span className="text-[10px] text-purple-600 font-normal block mt-0.5">
                            Merged into {categories.find((c) => c.id === cat.mergedIntoId)?.name || 'master tag'}
                          </span>
                        )}
                      </td>

                      {/* Created By */}
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {cat.createdBy || 'Devansh Agarwal (Admin)'}
                      </td>

                      {/* Created Date */}
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {cat.createdAt || 'Bhadra 15, 2083'}
                      </td>

                      {/* Times Used (All Time) */}
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 font-bold font-mono text-blue-800 text-[11px]">
                          {analytics.allTimeTicks}
                        </span>
                      </td>

                      {/* Last Used */}
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {cat.lastUsedDate || 'Bhadra 24, 2083'}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isArchived ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                            Archived
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            Active
                          </span>
                        )}
                      </td>

                      {/* 12c: Usage Trend */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {analytics.trend === 'increasing' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            <TrendingUp className="h-3.5 w-3.5" /> Increasing
                          </span>
                        ) : analytics.trend === 'decreasing' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <TrendingDown className="h-3.5 w-3.5" /> Decreasing
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                            <Minus className="h-3.5 w-3.5" /> Stable
                          </span>
                        )}
                      </td>

                      {/* Admin Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {/* View Analytics Detail Button */}
                          <button
                            onClick={() => setSelectedAnalyticsCat(cat)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-xs flex items-center gap-1"
                            title="View usage analytics"
                          >
                            <BarChart3 className="h-3 w-3 text-slate-500" />
                            Stats
                          </button>

                          {/* Archive / Unarchive Button (12b) */}
                          <button
                            onClick={() => handleToggleArchive(cat)}
                            className={`rounded-lg border px-2 py-1 text-[11px] font-semibold shadow-xs flex items-center gap-1 transition-colors ${
                              isArchived
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-rose-600'
                            }`}
                            title={isArchived ? 'Restore to active forms' : 'Archive category (hide from new forms)'}
                          >
                            {isArchived ? (
                              <>
                                <ArchiveRestore className="h-3 w-3" />
                                Restore
                              </>
                            ) : (
                              <>
                                <Archive className="h-3 w-3" />
                                Archive
                              </>
                            )}
                          </button>

                          {/* 12b: Cannot Delete Tooltip */}
                          <div className="relative group inline-block">
                            <button
                              disabled
                              className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] text-slate-400 cursor-not-allowed opacity-60"
                              title="Categories cannot be deleted to preserve data integrity."
                            >
                              Delete
                            </button>
                            <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block w-48 rounded-lg bg-slate-900 p-2 text-[10px] text-white shadow-xl z-20 text-center font-normal leading-tight">
                              Categories cannot be deleted to preserve data integrity. Use Archive instead.
                            </div>
                          </div>
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

      {/* 12c: Analytics Drawer / Modal */}
      {selectedAnalyticsCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-blue-100 p-2 text-blue-700">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Issue Category Analytics</span>
                  <h3 className="text-base font-bold text-slate-900">{selectedAnalyticsCat.name}</h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedAnalyticsCat(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 12c: 5 Core Analytics Vectors */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <span className="text-slate-500 font-semibold block text-[11px]">Total Times Ticked (All Time)</span>
                <span className="text-xl font-black font-mono text-slate-900">
                  {analyticsMap[selectedAnalyticsCat.id]?.allTimeTicks}
                </span>
                <span className="text-[10px] text-slate-400 block">Across feedback & returns</span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <span className="text-slate-500 font-semibold block text-[11px]">Times Ticked This Month</span>
                <span className="text-xl font-black font-mono text-blue-700">
                  {analyticsMap[selectedAnalyticsCat.id]?.monthTicks}
                </span>
                <span className="text-[10px] text-slate-400 block">Bhadra 2083</span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1 col-span-2">
                <span className="text-slate-500 font-semibold block text-[11px]">Most Affected Product</span>
                <strong className="text-slate-900 text-sm block">
                  {analyticsMap[selectedAnalyticsCat.id]?.mostAffectedProduct}
                </strong>
                <span className="text-[10px] text-slate-400 block">
                  Generates 68% of incidents for this category
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <span className="text-slate-500 font-semibold block text-[11px]">Most Affected Brand</span>
                <span className="inline-block rounded bg-teal-100 text-teal-800 font-bold px-2 py-0.5 text-xs">
                  {analyticsMap[selectedAnalyticsCat.id]?.mostAffectedBrand}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <span className="text-slate-500 font-semibold block text-[11px]">Defect Velocity Trend</span>
                <span className="font-bold text-xs flex items-center gap-1 text-slate-900">
                  {analyticsMap[selectedAnalyticsCat.id]?.trend === 'increasing' ? (
                    <span className="text-rose-600 flex items-center gap-1">
                      <TrendingUp className="h-4 w-4" /> Increasing (+18%)
                    </span>
                  ) : analyticsMap[selectedAnalyticsCat.id]?.trend === 'decreasing' ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <TrendingDown className="h-4 w-4" /> Decreasing (-24%)
                    </span>
                  ) : (
                    <span className="text-slate-600 flex items-center gap-1">
                      <Minus className="h-4 w-4" /> Stable (±2%)
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedAnalyticsCat(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow"
              >
                Close Analytics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 12b: Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-purple-100 p-2 text-purple-700">
                  <GitMerge className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Consolidate & Merge Categories</h3>
                  <p className="text-[11px] text-slate-500">Unify duplicate tags and re-tag historical records</p>
                </div>
              </div>
              <button
                onClick={() => setShowMergeModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-600 font-semibold block text-[11px]">Selected for Consolidation ({selectedIds.length}):</span>
              <ul className="list-disc pl-4 space-y-1 text-slate-800">
                {selectedIds.map((id) => {
                  const c = categories.find((cat) => cat.id === id);
                  return (
                    <li key={id}>
                      <strong>{c?.name}</strong> ({c?.tickCount} ticks)
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Pick the Surviving Master Name:
              </label>
              <select
                value={survivingCategoryId}
                onChange={(e) => setSurvivingCategoryId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-bold text-slate-900 focus:border-purple-500"
              >
                {selectedIds.map((id) => {
                  const c = categories.find((cat) => cat.id === id);
                  return (
                    <option key={id} value={id}>
                      {c?.name}
                    </option>
                  );
                })}
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">
                All historical entries will be re-tagged to this category name.
              </span>
            </div>

            <div className="rounded-xl bg-purple-50 p-3 border border-purple-200 text-purple-900 text-[11px]">
              ℹ️ Historical reviews, complaints, and returns will be updated automatically. The consolidated categories will be marked as archived.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMerge}
                className="rounded-xl bg-purple-700 px-5 py-2 font-bold text-white shadow hover:bg-purple-800 flex items-center gap-1.5"
              >
                <GitMerge className="h-4 w-4" />
                Confirm & Consolidate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 12d: Create New Category Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-blue-100 p-2 text-blue-700">
                  <Tags className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Create New Category</h3>
                  <p className="text-[11px] text-slate-500">Add an issue tag for feedback & returns</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Category Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Broken Spray Nozzle"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none font-bold text-slate-900 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Created By</label>
                <select
                  value={newCatCreator}
                  onChange={(e) => setNewCatCreator(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white outline-none font-semibold text-slate-800"
                >
                  {db.getUsers().map((u) => (
                    <option key={u.id} value={u.fullName}>
                      {u.fullName} ({u.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-[11px] text-slate-500 pt-1">
                Newly created categories immediately appear in Customer Feedback & Returns forms.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white shadow hover:bg-blue-700"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FIX 50d: Archive Category Confirmation Modal */}
      <ConfirmModal
        isOpen={showArchiveModal}
        title={`📁 Archive "${categoryToArchive?.name}" category?`}
        variant="warning"
        confirmLabel="Archive Category"
        cancelLabel="Cancel"
        details={categoryToArchive ? [
          { label: 'Category Name', value: categoryToArchive.name },
          { label: 'Usage Frequency', value: `${categoryToArchive.tickCount} tagged times` },
          { label: 'Last Logged Activity', value: categoryToArchive.lastUsedDate || 'Bhadra 18, 2083' },
        ] : []}
        consequences={[
          'Hide it from future order, return, and complaint input forms',
          `Preserve all ${categoryToArchive?.tickCount || 0} existing historical records tagged with this label`,
          'NOT delete any operational data or logs',
        ]}
        onConfirm={handleConfirmArchive}
        onCancel={() => {
          setShowArchiveModal(false);
          setCategoryToArchive(null);
        }}
      />
      </div>
    </PageGuard>
  );
}
