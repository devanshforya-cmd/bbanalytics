'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import {
  Influencer,
  InfluencerContent,
  InfluencerContentType,
  InfluencerQualityRating,
  Order,
  BrandCode,
} from '@/lib/types';
import { getBrands } from '@/lib/db/brands-service';
import { getTodayAd, getTodayBs, adToBs } from '@/lib/nepali-calendar';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import { toast } from '@/components/common/Toast';
import {
  Users,
  Star,
  Gift,
  ExternalLink,
  Plus,
  Trash2,
  Edit3,
  Calendar,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Video,
  Send,
  Link as LinkIcon,
  Tag,
  MapPin,
  Phone,
  Mail,
  Instagram,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';

export default function InfluencerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const influencerId = params?.id as string;

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [contentLinks, setContentLinks] = useState<InfluencerContent[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Scorecard Notes Edit
  const [managerNotes, setManagerNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  // Add Content Link Form
  const [showAddContentForm, setShowAddContentForm] = useState(false);
  const [contentUrl, setContentUrl] = useState('');
  const [contentPlatform, setContentPlatform] = useState('Instagram');
  const [contentType, setContentType] = useState<InfluencerContentType>('REEL');
  const [contentBrand, setContentBrand] = useState<BrandCode>('FORYA');
  const [contentProduct, setContentProduct] = useState('');
  const [contentDateAd, setContentDateAd] = useState(getTodayAd());
  const [contentDateBs, setContentDateBs] = useState(getTodayBs());
  const [contentNotes, setContentNotes] = useState('');

  const loadAll = () => {
    if (!influencerId) return;
    const inf = db.getInfluencerById(influencerId);
    if (!inf) {
      setLoading(false);
      return;
    }
    setInfluencer(inf);
    setManagerNotes(inf.notes || '');
    setContentLinks(db.getInfluencerContent(influencerId));

    // Find orders sent to this influencer
    const allOrders = db.getOrders();
    const matchedOrders = allOrders.filter(
      (o) => o.isMarketing && (o.influencerId === influencerId || o.customerName.includes(inf.name))
    );
    setOrders(matchedOrders);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [influencerId]);

  // URL auto-detect helper
  const handleUrlChange = (urlVal: string) => {
    setContentUrl(urlVal);
    const low = urlVal.toLowerCase();
    if (low.includes('instagram.com') || low.includes('instagr.am')) {
      setContentPlatform('Instagram');
      if (low.includes('/reel')) setContentType('REEL');
      else if (low.includes('/story')) setContentType('STORY');
      else setContentType('POST');
    } else if (low.includes('tiktok.com')) {
      setContentPlatform('TikTok');
      setContentType('VIDEO');
    } else if (low.includes('youtube.com') || low.includes('youtu.be')) {
      setContentPlatform('YouTube');
      if (low.includes('/shorts')) setContentType('SHORT');
      else setContentType('VIDEO');
    } else if (low.includes('facebook.com') || low.includes('fb.watch')) {
      setContentPlatform('Facebook');
      setContentType('VIDEO');
    }
  };

  const handleSaveContentLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contentUrl.trim()) {
      toast.error('Validation Error', 'Content URL is required.');
      return;
    }

    db.addInfluencerContent({
      influencerId,
      url: contentUrl.trim(),
      platform: contentPlatform,
      contentType,
      brandCode: contentBrand,
      productName: contentProduct.trim() || undefined,
      datePostedAd: contentDateAd,
      datePostedBs: contentDateBs,
      notes: contentNotes.trim() || undefined,
    });

    toast.success('Content Link Added', 'New influencer media link logged.');
    setShowAddContentForm(false);
    setContentUrl('');
    setContentNotes('');
    setContentProduct('');
    loadAll();
  };

  const handleDeleteContentLink = (contentId: string) => {
    if (confirm('Remove this content link?')) {
      db.deleteInfluencerContent(contentId);
      toast.info('Deleted', 'Content link removed.');
      loadAll();
    }
  };

  const handleRatingChange = (newRating: InfluencerQualityRating) => {
    if (!influencer) return;
    db.updateInfluencer(influencer.id, { qualityRating: newRating });
    setInfluencer((prev) => (prev ? { ...prev, qualityRating: newRating } : null));
    toast.success('Rating Updated', `Quality rating updated to ${newRating}.`);
  };

  const handleSaveManagerNotes = () => {
    if (!influencer) return;
    db.updateInfluencer(influencer.id, { notes: managerNotes.trim() });
    setInfluencer((prev) => (prev ? { ...prev, notes: managerNotes.trim() } : null));
    setIsEditingNotes(false);
    toast.success('Saved', 'Manager notes updated.');
  };

  const handleToggleContentReceived = (orderId: string, currentVal: boolean) => {
    db.toggleOrderContentReceived(orderId, !currentVal);
    toast.success('Updated', `Content receipt marked as ${!currentVal ? 'Yes' : 'No'}.`);
    loadAll();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!influencer) {
    return (
      <div className="max-w-md mx-auto my-12 text-center space-y-4 p-8 bg-white rounded-3xl border border-slate-200 shadow-sm">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Influencer Not Found</h2>
        <p className="text-xs text-slate-500">The profile you requested does not exist or has been deleted.</p>
        <Link
          href="/marketing/influencers"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Directory
        </Link>
      </div>
    );
  }

  const sendsCount = orders.length || influencer.totalSends || 0;
  const contentCount = contentLinks.length;
  const ratioPct = sendsCount > 0 ? ((contentCount / sendsCount) * 100).toFixed(0) : '0';

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER']}>
      <div className="space-y-6 pb-24 max-w-6xl mx-auto">
        <Breadcrumbs
          items={[
            { label: 'Marketing', href: '/marketing/influencers' },
            { label: 'Influencer Directory', href: '/marketing/influencers' },
            { label: influencer.name },
          ]}
        />

        {/* Back link */}
        <div>
          <Link
            href="/marketing/influencers"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Influencers</span>
          </Link>
        </div>

        {/* Profile Header Card */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-slate-100 pb-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-2xl shrink-0 shadow-2xs">
                {influencer.name.charAt(0)}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {influencer.name}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    {influencer.category}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-0.5">
                  {influencer.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {influencer.city}
                    </span>
                  )}
                  {influencer.phone && (
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {influencer.phone}
                    </span>
                  )}
                  {influencer.email && (
                    <span className="flex items-center gap-1 font-mono">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {influencer.email}
                    </span>
                  )}
                </div>

                {/* Platforms list */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {influencer.platforms.map((p, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-mono font-medium border border-slate-200"
                    >
                      <span className="font-bold text-blue-600">{p.platform}:</span>
                      <span>{p.handle}</span>
                      {p.followers && (
                        <span className="text-slate-400 text-[10px]">
                          ({(p.followers / 1000).toFixed(0)}k)
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Actions & Rating Selector */}
            <div className="flex flex-col sm:items-end gap-3 shrink-0">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Quality Rating
                </label>
                <select
                  value={influencer.qualityRating}
                  onChange={(e) => handleRatingChange(e.target.value as InfluencerQualityRating)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                >
                  <option value="GREAT">⭐⭐⭐ Great (Prioritize for launches)</option>
                  <option value="AVERAGE">⭐⭐ Average (Content delivered)</option>
                  <option value="POOR">⭐ Poor (Late / Ghosted)</option>
                  <option value="NOT_RATED">⚫ Not Yet Rated</option>
                </select>
              </div>

              <Link
                href={`/orderflow/manual-entry?marketing=1&influencerId=${influencer.id}&influencerName=${encodeURIComponent(
                  influencer.name
                )}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition-all active:scale-95"
              >
                <Gift className="w-3.5 h-3.5" />
                <span>Send Marketing Package</span>
              </Link>
            </div>
          </div>

          {/* Header Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[11px] text-slate-500 font-medium">Packages Sent</p>
              <p className="text-xl font-black text-slate-900 mt-0.5">{sendsCount}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[11px] text-slate-500 font-medium">Content Pieces Logged</p>
              <p className="text-xl font-black text-slate-900 mt-0.5">{contentCount}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[11px] text-slate-500 font-medium">Content-to-Send Ratio</p>
              <p className="text-xl font-black text-blue-600 mt-0.5">{ratioPct}%</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[11px] text-slate-500 font-medium">Last Active Date</p>
              <p className="text-xs font-bold text-slate-800 mt-1">
                {influencer.lastContentDateBs || influencer.lastSendDateBs || 'Recent'}
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Products Sent History */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Gift className="w-4 h-4 text-purple-600" />
                <span>Products Sent History</span>
              </h2>
              <p className="text-xs text-slate-500">
                All marketing and seeding packages dispatched to this creator.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full self-start sm:self-center">
              {orders.length} Dispatches on Record
            </span>
          </div>

          {orders.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-xs font-medium">No marketing orders dispatched to this influencer yet.</p>
              <Link
                href={`/orderflow/manual-entry?marketing=1&influencerId=${influencer.id}&influencerName=${encodeURIComponent(
                  influencer.name
                )}`}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-purple-700 font-bold hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                Dispatch first package now
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold text-[11px]">
                    <th className="p-2.5">Date (BS/AD)</th>
                    <th className="p-2.5">Brand</th>
                    <th className="p-2.5">Products Included</th>
                    <th className="p-2.5 text-center">Total Qty</th>
                    <th className="p-2.5">Order ID</th>
                    <th className="p-2.5 text-center">Content Received?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((ord) => {
                    const totalQty = ord.items.reduce((acc, i) => acc + i.quantity, 0);
                    return (
                      <tr key={ord.id} className="hover:bg-slate-50/70">
                        <td className="p-2.5 whitespace-nowrap">
                          <p className="font-semibold text-slate-900 font-mono text-xs">{ord.orderDateAd}</p>
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            {ord.brandCode}
                          </span>
                        </td>
                        <td className="p-2.5">
                          {ord.items.map((i, idx) => (
                            <div key={idx} className="text-slate-700 font-medium">
                              {i.productName} <span className="text-slate-400">({i.quantity}x)</span>
                            </div>
                          ))}
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-800">{totalQty} pcs</td>
                        <td className="p-2.5 font-mono text-[11px] text-slate-500">{ord.orderNumber}</td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleContentReceived(ord.id, ord.contentReceived || false)}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                              ord.contentReceived
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {ord.contentReceived ? '✓ Yes, Delivered' : '⏳ Pending'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 2: Content Links (The URL Tracker) */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Video className="w-4 h-4 text-blue-600" />
                <span>Content Links Tracker</span>
              </h2>
              <p className="text-xs text-slate-500">
                Live URL links to Reels, TikToks, YouTube reviews and social posts.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddContentForm((prev) => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm self-start sm:self-center"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddContentForm ? 'Close Form' : 'Add Content Link'}</span>
            </button>
          </div>

          {/* Add Content Link Form Modal/Drawer */}
          {showAddContentForm && (
            <form
              onSubmit={handleSaveContentLink}
              className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-3 animate-in fade-in slide-in-from-top-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>Log New Content Link</span>
                </span>
                <span className="text-[10px] text-blue-700 font-semibold bg-white px-2 py-0.5 rounded-full border border-blue-200">
                  Auto-Detects Platform
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Content URL <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="url"
                    required
                    placeholder="https://instagram.com/reel/... or https://tiktok.com/@..."
                    value={contentUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Platform</label>
                  <select
                    value={contentPlatform}
                    onChange={(e) => setContentPlatform(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs outline-none"
                  >
                    <option value="Instagram">Instagram</option>
                    <option value="TikTok">TikTok</option>
                    <option value="YouTube">YouTube</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Content Type</label>
                  <select
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs outline-none"
                  >
                    <option value="REEL">Instagram Reel</option>
                    <option value="STORY">Instagram Story</option>
                    <option value="POST">Feed Post</option>
                    <option value="VIDEO">Full Video</option>
                    <option value="SHORT">YouTube Short / TikTok</option>
                    <option value="BLOG">Blog / Article</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Brand Featured</label>
                  <select
                    value={contentBrand}
                    onChange={(e) => setContentBrand(e.target.value as BrandCode)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs outline-none"
                  >
                    {getBrands('ACTIVE').map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Product Featured (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Natural Underarm Roll-On (Peach)"
                    value={contentProduct}
                    onChange={(e) => setContentProduct(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date Posted</label>
                  <input
                    type="date"
                    value={contentDateAd}
                    onChange={(e) => {
                      const newAd = e.target.value;
                      setContentDateAd(newAd);
                      if (newAd) {
                        const [y, m, d] = newAd.split('-').map(Number);
                        const bs = adToBs(new Date(y, m - 1, d));
                        setContentDateBs(`${bs.monthName} ${bs.day}, ${bs.year}`);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Highlights</label>
                <input
                  type="text"
                  placeholder="e.g. Morning routine before/after hair transformation, 12K views in 24h"
                  value={contentNotes}
                  onChange={(e) => setContentNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddContentForm(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-xs font-bold text-white shadow-sm flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Save Content Link
                </button>
              </div>
            </form>
          )}

        {/* Deliverables List */}
        {contentLinks.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Video className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs font-medium">No content deliverables logged yet.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Track Instagram Reels, YouTube Shorts, or TikTok videos posted by this influencer.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {contentLinks.map((cnt) => (
              <div key={cnt.id} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                      {cnt.platform}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                      {cnt.contentType}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {cnt.brandCode}
                    </span>
                    {cnt.productName && (
                      <span className="text-xs font-semibold text-slate-800">
                        {cnt.productName}
                      </span>
                    )}
                  </div>

                  <a
                    href={cnt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-blue-600 hover:underline flex items-center gap-1 truncate max-w-xl block"
                  >
                    <span className="truncate">{cnt.url}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pt-0.5">
                    <span>Posted: <strong className="font-mono text-slate-700">{cnt.datePostedAd}</strong></span>
                      {cnt.notes && (
                        <>
                          <span>&bull;</span>
                          <span className="italic text-slate-600">"{cnt.notes}"</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={cnt.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 text-xs font-bold transition-colors"
                    >
                      Watch Video
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteContentLink(cnt.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete link"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 3: Assessment Summary & Scorecard */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Influencer Scorecard &amp; Assessment</span>
            </h2>
            <p className="text-xs text-slate-500">
              Evaluation of creator reliability, turnaround velocity &amp; campaign notes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Stats Breakdown */}
            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Products Sent:</span>
                <span className="font-bold text-slate-900">{sendsCount} packages</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Content Delivered:</span>
                <span className="font-bold text-slate-900">{contentCount} pieces</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Content-to-Send Ratio:</span>
                <span className="font-bold text-blue-700">{ratioPct}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Estimated Turnaround:</span>
                <span className="font-bold text-emerald-700">~5-7 days after delivery</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Overall Quality Tier:</span>
                <span className="font-bold text-slate-900">{influencer.qualityRating}</span>
              </div>
            </div>

            {/* Manager Notes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Manager Assessment Notes</span>
                {!isEditingNotes ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingNotes(true)}
                    className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Notes
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingNotes(false)}
                      className="text-slate-500 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveManagerNotes}
                      className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>

              {isEditingNotes ? (
                <textarea
                  rows={5}
                  value={managerNotes}
                  onChange={(e) => setManagerNotes(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-slate-300 text-xs text-slate-900 outline-none focus:border-blue-500"
                  placeholder="Enter strategic feedback, engagement quality notes, or reminders..."
                />
              ) : (
                <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/80 text-xs text-slate-700 leading-relaxed min-h-[110px]">
                  {managerNotes ? (
                    <p className="whitespace-pre-line">{managerNotes}</p>
                  ) : (
                    <p className="text-slate-400 italic">
                      No notes recorded yet. Click "Edit Notes" to write assessment feedback.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageGuard>
  );
}
