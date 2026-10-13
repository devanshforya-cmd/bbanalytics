'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { Influencer, InfluencerQualityRating, InfluencerPlatform, InfluencerPlatformType, InfluencerCategory } from '@/lib/types';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { toast } from '@/components/common/Toast';
import {
  Users,
  Plus,
  Search,
  Filter,
  Sparkles,
  ExternalLink,
  Star,
  Gift,
  Video,
  Send,
  Calendar,
  X,
  ChevronRight,
  TrendingUp,
  Instagram,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpDown,
} from 'lucide-react';

export default function InfluencerDirectoryPage() {
  const router = useRouter();
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('ALL');
  const [selectedRating, setSelectedRating] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [sortBy, setSortBy] = useState<'RATING' | 'LAST_SEND' | 'CONTENT' | 'NAME'>('RATING');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // New Influencer Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Kathmandu');
  const [category, setCategory] = useState<InfluencerCategory>('Beauty');
  const [qualityRating, setQualityRating] = useState<InfluencerQualityRating>('NOT_RATED');
  const [notes, setNotes] = useState('');
  const [platforms, setPlatforms] = useState<Array<{ platform: InfluencerPlatformType; handle: string; followers?: number }>>([
    { platform: 'Instagram', handle: '@', followers: 10000 },
  ]);

  const loadData = () => {
    setInfluencers(db.getInfluencers());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddPlatformRow = () => {
    setPlatforms((prev) => [...prev, { platform: 'TikTok', handle: '@' }]);
  };

  const handleRemovePlatformRow = (idx: number) => {
    setPlatforms((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePlatformChange = (idx: number, field: string, val: any) => {
    setPlatforms((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleSaveInfluencer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Validation Error', 'Influencer name is required.');
      return;
    }

    const cleanPlatforms: InfluencerPlatform[] = platforms
      .filter((p) => p.handle.trim() && p.handle.trim() !== '@')
      .map((p) => ({
        ...p,
        handle: p.handle.startsWith('@') ? p.handle : `@${p.handle}`,
        followers: p.followers ? Number(p.followers) : undefined,
      }));

    if (cleanPlatforms.length === 0) {
      cleanPlatforms.push({
        platform: 'Instagram',
        handle: `@${name.toLowerCase().replace(/\s+/g, '')}`,
        followers: undefined,
      });
    }

    const created = db.createInfluencer({
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      city: city.trim() || 'Kathmandu',
      category,
      qualityRating,
      platforms: cleanPlatforms,
      notes: notes.trim() || undefined,
      isActive: true,
    });

    toast.success('Influencer Added', `${created.name} added to Directory.`);
    setShowAddModal(false);
    resetForm();
    loadData();
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setCity('Kathmandu');
    setCategory('Beauty');
    setQualityRating('NOT_RATED');
    setNotes('');
    setPlatforms([{ platform: 'Instagram', handle: '@', followers: 10000 }]);
  };

  // Filter & Sort
  const filteredInfluencers = useMemo(() => {
    let list = [...influencers];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (inf) =>
          inf.name.toLowerCase().includes(q) ||
          inf.platforms.some((p) => p.handle.toLowerCase().includes(q)) ||
          (inf.city && inf.city.toLowerCase().includes(q))
      );
    }

    if (selectedPlatform !== 'ALL') {
      list = list.filter((inf) =>
        inf.platforms.some((p) => p.platform.toLowerCase() === selectedPlatform.toLowerCase())
      );
    }

    if (selectedRating !== 'ALL') {
      list = list.filter((inf) => inf.qualityRating === selectedRating);
    }

    if (selectedCategory !== 'ALL') {
      list = list.filter((inf) => inf.category === selectedCategory);
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'RATING') {
        const score = { GREAT: 3, AVERAGE: 2, POOR: 1, NOT_RATED: 0 };
        return score[b.qualityRating] - score[a.qualityRating];
      }
      if (sortBy === 'CONTENT') {
        return (b.totalContent || 0) - (a.totalContent || 0);
      }
      if (sortBy === 'LAST_SEND') {
        return (b.lastSendDate || '').localeCompare(a.lastSendDate || '');
      }
      if (sortBy === 'NAME') {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });

    return list;
  }, [influencers, searchQuery, selectedPlatform, selectedRating, selectedCategory, sortBy]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredInfluencers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredInfluencers.map((i) => i.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleBulkCreateSends = () => {
    if (selectedIds.length === 0) return;
    const firstSelected = influencers.find((i) => i.id === selectedIds[0]);
    if (firstSelected) {
      router.push(
        `/orderflow/manual-entry?marketing=1&influencerId=${firstSelected.id}&influencerName=${encodeURIComponent(
          firstSelected.name
        )}`
      );
    }
  };

  const renderQualityBadge = (rating: InfluencerQualityRating) => {
    switch (rating) {
      case 'GREAT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
            <span>⭐⭐⭐ Great</span>
          </span>
        );
      case 'AVERAGE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Star className="w-3 h-3 fill-amber-600 text-amber-600" />
            <span>⭐⭐ Average</span>
          </span>
        );
      case 'POOR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <Star className="w-3 h-3 fill-rose-600 text-rose-600" />
            <span>⭐ Poor</span>
          </span>
        );
      case 'NOT_RATED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            <span>Not Rated</span>
          </span>
        );
    }
  };

  const totalSendsAll = influencers.reduce((acc, i) => acc + (i.totalSends || 0), 0);
  const totalContentAll = influencers.reduce((acc, i) => acc + (i.totalContent || 0), 0);
  const greatCount = influencers.filter((i) => i.qualityRating === 'GREAT').length;

  return (
    <PageGuard feature="marketing">
      <div className="space-y-6 pb-24 max-w-7xl mx-auto">
        <Breadcrumbs items={[{ label: 'Marketing' }, { label: 'Influencer Directory' }]} />

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Influencer Directory
              </h1>
              <span className="rounded-full bg-purple-100 px-3 py-0.5 text-xs font-bold text-purple-700">
                Fix 61 &bull; PR Seeding Hub
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Track creator seeding packages, content turnaround, video links &amp; quality assessments.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBulkCreateSends}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Create Marketing Sends ({selectedIds.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add Influencer</span>
            </button>
          </div>
        </div>

        {/* KPI Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <p className="text-xs text-slate-500 font-medium">Tracked Creators</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{influencers.length}</p>
            <p className="text-[11px] text-purple-600 font-semibold mt-0.5">{greatCount} top tier (⭐⭐⭐)</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <p className="text-xs text-slate-500 font-medium">Products Sent (Seeding)</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{totalSendsAll}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Non-commercial PR</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <p className="text-xs text-slate-500 font-medium">Content Pieces Logged</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{totalContentAll}</p>
            <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Reels, Shorts &amp; TikToks</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <p className="text-xs text-slate-500 font-medium">Content Delivery Ratio</p>
            <p className="text-xl sm:text-2xl font-black text-blue-700 mt-1">
              {totalSendsAll > 0 ? `${((totalContentAll / totalSendsAll) * 100).toFixed(0)}%` : '0%'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Content vs Packages</p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search creator name, @handle, or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 bg-slate-50 focus:bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Slicers */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="ALL">All Platforms</option>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="YouTube">YouTube</option>
                <option value="Facebook">Facebook</option>
              </select>

              <select
                value={selectedRating}
                onChange={(e) => setSelectedRating(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="ALL">All Ratings</option>
                <option value="GREAT">⭐⭐⭐ Great</option>
                <option value="AVERAGE">⭐⭐ Average</option>
                <option value="POOR">⭐ Poor</option>
                <option value="NOT_RATED">Not Rated</option>
              </select>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="ALL">All Categories</option>
                <option value="Beauty">Beauty</option>
                <option value="Lifestyle">Lifestyle</option>
                <option value="Health">Health</option>
                <option value="Tech">Tech</option>
                <option value="General">General</option>
              </select>

              <div className="flex items-center gap-1.5 text-xs text-slate-500 border-l border-slate-200 pl-2">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-2 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="RATING">Sort: Quality Rating</option>
                  <option value="CONTENT">Sort: Most Content</option>
                  <option value="LAST_SEND">Sort: Last Send Date</option>
                  <option value="NAME">Sort: Name (A-Z)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Influencers Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredInfluencers.length > 0 &&
                        selectedIds.length === filteredInfluencers.length
                      }
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300"
                    />
                  </th>
                  <th className="p-3">Influencer</th>
                  <th className="p-3">Platform &amp; Handle</th>
                  <th className="p-3">Quality Rating</th>
                  <th className="p-3 text-center">Packages Sent</th>
                  <th className="p-3 text-center">Content Pieces</th>
                  <th className="p-3">Last Send</th>
                  <th className="p-3">Last Content</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInfluencers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="w-8 h-8 text-slate-300" />
                        <p className="font-semibold text-sm text-slate-700">No influencers found</p>
                        <p className="text-xs text-slate-400">
                          Try adjusting your filters or click "+ Add Influencer" to create a new profile.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredInfluencers.map((inf) => {
                    const isSelected = selectedIds.includes(inf.id);
                    return (
                      <tr
                        key={inf.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isSelected ? 'bg-purple-50/30' : ''
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(inf.id)}
                            className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300"
                          />
                        </td>

                        {/* Name & City */}
                        <td className="p-3 whitespace-nowrap">
                          <Link
                            href={`/marketing/influencers/${inf.id}`}
                            className="font-bold text-slate-900 hover:text-blue-600 flex items-center gap-1.5 group"
                          >
                            <span>{inf.name}</span>
                            <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-600" />
                          </Link>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>{inf.city || 'Kathmandu'}</span>
                            <span>&bull;</span>
                            <span className="font-medium text-purple-700">{inf.category}</span>
                          </div>
                        </td>

                        {/* Platforms */}
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {inf.platforms.map((p, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10px] border border-slate-200"
                              >
                                <span className="font-bold text-blue-600">{p.platform}:</span>
                                <span>{p.handle}</span>
                                {p.followers && (
                                  <span className="text-slate-400 text-[9px]">
                                    ({(p.followers / 1000).toFixed(0)}k)
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Quality Rating */}
                        <td className="p-3 whitespace-nowrap">{renderQualityBadge(inf.qualityRating)}</td>

                        {/* Products Sent */}
                        <td className="p-3 whitespace-nowrap text-center">
                          <span className="font-bold text-slate-800 text-xs px-2 py-0.5 rounded-full bg-slate-100">
                            {inf.totalSends || 0}
                          </span>
                        </td>

                        {/* Content Delivered */}
                        <td className="p-3 whitespace-nowrap text-center">
                          <span
                            className={`font-bold text-xs px-2 py-0.5 rounded-full ${
                              (inf.totalContent || 0) > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {inf.totalContent || 0}
                          </span>
                        </td>

                        {/* Last Send */}
                        <td className="p-3 whitespace-nowrap text-slate-600 text-[11px]">
                          {inf.lastSendDateBs || inf.lastSendDate || '—'}
                        </td>

                        {/* Last Content */}
                        <td className="p-3 whitespace-nowrap text-[11px]">
                          {inf.lastContentDateBs || inf.lastContentDate ? (
                            <span className="text-emerald-700 font-medium">
                              {inf.lastContentDateBs || inf.lastContentDate}
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3 whitespace-nowrap text-right">
                          <Link
                            href={`/marketing/influencers/${inf.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold transition-all"
                          >
                            <span>Profile</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Influencer Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900">Add New Influencer</h3>
                    <p className="text-xs text-slate-500">Create profile for PR seeding &amp; tracking</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveInfluencer} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Creator Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shristi Vaidya"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Phone (Optional)</label>
                    <input
                      type="tel"
                      placeholder="98XXXXXXXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Email (Optional)</label>
                    <input
                      type="email"
                      placeholder="creator@collab.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Platforms Repeater */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-bold text-slate-700">
                      Platforms &amp; Handles <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleAddPlatformRow}
                      className="text-blue-600 hover:text-blue-800 text-[11px] font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add Platform
                    </button>
                  </div>

                  <div className="space-y-2">
                    {platforms.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={p.platform}
                          onChange={(e) => handlePlatformChange(idx, 'platform', e.target.value)}
                          className="w-28 px-2 py-1.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-semibold"
                        >
                          <option value="Instagram">Instagram</option>
                          <option value="TikTok">TikTok</option>
                          <option value="YouTube">YouTube</option>
                          <option value="Facebook">Facebook</option>
                          <option value="Other">Other</option>
                        </select>
                        <input
                          type="text"
                          placeholder="@handle"
                          value={p.handle}
                          onChange={(e) => handlePlatformChange(idx, 'handle', e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-slate-900"
                        />
                        <input
                          type="number"
                          placeholder="Followers"
                          value={p.followers || ''}
                          onChange={(e) => handlePlatformChange(idx, 'followers', e.target.value)}
                          className="w-24 px-2 py-1.5 rounded-xl border border-slate-300 text-slate-900"
                        />
                        {platforms.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePlatformRow(idx)}
                            className="text-rose-500 hover:text-rose-700 p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">City / Region</label>
                    <input
                      type="text"
                      placeholder="Kathmandu"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Niche Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 outline-none focus:border-blue-500"
                    >
                      <option value="Beauty">Beauty &amp; Cosmetics</option>
                      <option value="Lifestyle">Lifestyle</option>
                      <option value="Health">Health &amp; Wellness</option>
                      <option value="Food">Food</option>
                      <option value="Tech">Tech</option>
                      <option value="General">General</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Initial Quality Rating</label>
                  <select
                    value={qualityRating}
                    onChange={(e) => setQualityRating(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="NOT_RATED">⚫ Not Yet Rated (New Contact)</option>
                    <option value="GREAT">⭐⭐⭐ Great (Reliable, high engagement)</option>
                    <option value="AVERAGE">⭐⭐ Average (Delivered content)</option>
                    <option value="POOR">⭐ Poor (Late or poor content)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Manager Notes</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Recommended by Brand Manager for Forya serum launch..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-300 text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20"
                  >
                    Save Influencer
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
